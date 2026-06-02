#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import readline from "node:readline";

const require = createRequire(import.meta.url);
const moduleRoots = [process.env.DEX_REMOTE_NODE_MODULES, process.cwd()].filter(Boolean);
const requireFromRoots = (name) => {
  for (const root of moduleRoots) {
    const base = path.basename(root).toLowerCase() === "node_modules" ? path.dirname(root) : root;
    try {
      return createRequire(path.join(base, "dex-remote-bridge.cjs"))(name);
    } catch {
      // Keep trying configured roots before falling back to the script location.
    }
  }
  return require(name);
};
const maybeRequire = (name) => {
  try {
    return requireFromRoots(name);
  } catch {
    return null;
  }
};
const wsModule = maybeRequire("ws");
const larkSdk = maybeRequire("@larksuiteoapi/node-sdk");

const args = parseArgs(process.argv.slice(2));
const configPath = args.config || process.env.DEX_REMOTE_CONFIG;
const statePath = args.state || process.env.DEX_REMOTE_BOT_STATE;
const logPath = args.log || process.env.DEX_REMOTE_BRIDGE_LOG;
const inventoryPath = args.inventory || siblingPath(configPath, "remote-inventory.json");

if (!configPath || !statePath || !logPath) {
  throw new Error("missing --config, --state, or --log");
}

const runLog = fs.createWriteStream(logPath, { flags: "a" });
const log = (...parts) => {
  const line = `[${new Date().toISOString()}] ${parts.map((part) => sanitize(String(part))).join(" ")}\n`;
  runLog.write(line);
  process.stdout.write(line);
};

const config = readJson(configPath, {});
assertSafeConfig(config);
const inventory = readJson(inventoryPath, { projects: [], threads: [] });
let state = readJson(statePath, { bindings: {} });
let processedIds = new Set(Array.isArray(state.processedMessageIds) ? state.processedMessageIds : []);
seedInitialBinding(state, config);
const WebSocketImpl = wsModule?.WebSocket || globalThis.WebSocket;
let codex = null;
let larkRuntime = null;
const activeChildren = [];

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function handleMessageEvent(data) {
  const message = data?.message || {};
  const sender = data?.sender || {};
  const messageId = message.message_id || data?.event_id || "";
  if (messageId && processedIds.has(messageId)) return;
  const chatId = message.chat_id || "";
  const userId = sender?.sender_id?.user_id || sender?.sender_id?.open_id || sender?.sender_id?.union_id || "";
  if (!allowed(chatId, userId, config, message.chat_type)) return;
  const text = parseMessageText(message);
  if (!text.trim()) return;
  markProcessed(messageId);
  log("message", messageId || "-", "chat", Boolean(chatId), "user", Boolean(userId), "command", commandName(text));
  await routeAndReply({ chatId, userId, messageId, text });
}

async function handleNormalizedMessage(event) {
  if (event.messageId && processedIds.has(event.messageId)) return;
  if (!allowed(event.chatId, event.userId, config, event.chatType)) return;
  const text = String(event.text || "").trim();
  if (!text) return;
  markProcessed(event.messageId);
  log("message", event.messageId || "-", "chat", Boolean(event.chatId), "user", Boolean(event.userId), "command", commandName(text));
  await routeAndReply({
    chatId: event.chatId,
    userId: event.userId,
    messageId: event.messageId,
    text,
  });
}

async function handleCardAction(data) {
  const action = data?.action || {};
  const value = action.value || {};
  const chatId = data?.open_chat_id || data?.context?.open_chat_id || value.chatId || "";
  const userId = data?.operator?.open_id || data?.operator?.user_id || value.userId || "";
  if (!allowed(chatId, userId, config, "")) return;
  const text = actionText(value);
  if (!text) return;
  log("card_action", "chat", Boolean(chatId), "user", Boolean(userId), "text", text);
  await routeAndReply({ chatId, userId, messageId: "", text });
}

async function routeAndReply(message) {
  const response = handleBotMessage(state, message, inventory);
  saveState();
  if (response.forwardToCodex) {
    await replyText(message, "已收到，我会转发给 Codex。");
    try {
      const answer = await codex.runTurn(response.forwardToCodex);
      await replyText(message, answer || "Codex 已完成，但没有返回可发送文本。");
    } catch (error) {
      log("codex_forward_failed", error?.message || error);
      await replyText(message, `转发 Codex 失败：${error?.message || error}`);
    }
    return;
  }
  if (response.choices.length) {
    await replyCard(message, cardFor(response, message));
    return;
  }
  await replyText(message, response.reply);
}

async function replyText(message, text) {
  await larkRuntime.sendText(message, truncate(text, 1800));
}

async function replyCard(message, card) {
  await larkRuntime.sendCard(message, card);
}

function createSdkRuntime(Lark, remoteConfig) {
  const client = new Lark.Client({
    appId: remoteConfig.larkAppId,
    appSecret: remoteConfig.larkAppSecret,
  });
  const eventDispatcher = new Lark.EventDispatcher({
    encryptKey: remoteConfig.larkEncryptKey || undefined,
    verificationToken: remoteConfig.larkVerificationToken || undefined,
  }).register({
    "im.message.receive_v1": async (data) => {
      await handleMessageEvent(data);
    },
    "card.action.trigger": async (data) => {
      await handleCardAction(data);
    },
  });
  const wsClient = new Lark.WSClient({
    appId: remoteConfig.larkAppId,
    appSecret: remoteConfig.larkAppSecret,
    loggerLevel: Lark.LoggerLevel?.info,
  });
  return {
    name: "node-sdk",
    start: () => wsClient.start({ eventDispatcher }),
    stop: () => wsClient.close?.({ force: true }),
    sendText: (message, text) =>
      client.im.v1.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: message.chatId,
          msg_type: "text",
          content: JSON.stringify({ text }),
        },
      }),
    sendCard: (message, card) =>
      client.im.v1.message.create({
        params: { receive_id_type: "chat_id" },
        data: {
          receive_id: message.chatId,
          msg_type: "interactive",
          content: JSON.stringify(card),
        },
      }),
  };
}

function createCliRuntime(remoteConfig) {
  const profile = remoteConfig.larkProfile || process.env.FEISHU_LARK_PROFILE || "codex-x";
  return {
    name: "lark-cli",
    start: async () => {
      const child = spawn("lark-cli", ["events", "subscribe", "--profile", profile, "--event-types", "im.message.receive_v1"], {
        stdio: ["ignore", "pipe", "pipe"],
      });
      activeChildren.push(child);
      child.stderr.on("data", (chunk) => log("lark-cli stderr", chunk.toString().trim()));
      child.on("exit", (code, signal) => log("lark-cli events exited", code ?? "-", signal ?? "-"));
      const rl = readline.createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        const event = normalizeCliEvent(line, remoteConfig);
        if (event) {
          handleNormalizedMessage(event).catch((error) => log("message_failed", error?.message || error));
        }
      });
      await sleep(250);
      if (child.exitCode !== null) throw new Error("lark-cli event subscriber exited immediately");
    },
    stop: () => {
      for (const child of activeChildren) child.kill("SIGTERM");
    },
    sendText: async (message, text) => {
      await runLarkCli(["messages", "reply", "--profile", profile, "--message-id", message.messageId || "", "--text", text]);
    },
    sendCard: async (message, card) => {
      await runLarkCli(["messages", "reply", "--profile", profile, "--message-id", message.messageId || "", "--text", cardToText(card)]);
    },
  };
}

function normalizeCliEvent(line, remoteConfig) {
  if (!line.trim().startsWith("{")) return null;
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (event.type !== "im.message.receive_v1") return null;
  const text = parseCliContent(event.message_type, event.content);
  if (!text) return null;
  if (!remoteConfig.feishuChatId && remoteConfig.autoBindP2p && event.chat_type && event.chat_type !== "p2p") return null;
  return {
    text,
    messageId: event.message_id || event.id || "",
    chatId: event.chat_id || "",
    userId: event.sender_id || event.user_id || "",
    chatType: event.chat_type || "",
  };
}

function parseCliContent(messageType, content) {
  if (messageType !== "text") return "";
  try {
    return String(JSON.parse(content || "{}").text || "").trim();
  } catch {
    return "";
  }
}

async function runLarkCli(args) {
  const child = spawn("lark-cli", args, { stdio: ["ignore", "pipe", "pipe"] });
  activeChildren.push(child);
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `lark-cli exited ${code}`));
    });
  });
}

function cardToText(card) {
  const lines = [];
  const title = card?.header?.title?.content;
  if (title) lines.push(title);
  for (const element of card?.elements || []) {
    if (element.tag === "markdown" && element.content) lines.push(element.content);
  }
  return lines.join("\n\n") || "请选择编号继续。";
}

function handleBotMessage(currentState, message, currentInventory) {
  const text = message.text.trim();
  const key = bindingKey(message);
  if (!text || text === "/帮助" || text === "/help") {
    return response("ok", helpText(selection(currentState, key)), "help", selection(currentState, key));
  }
  if (text === "/当前") {
    const current = selection(currentState, key);
    return current
      ? response("ok", `当前项目：${current.workspaceName}\n当前对话：${current.threadId ? current.threadName : "新对话"}\n时间：${relativeTime(current.updatedAtMs)}`, "current", current)
      : response("failed", "当前还没有选择项目。发送 /项目 查看项目列表。", "error");
  }
  if (text.startsWith("/项目")) return projectCommand(currentState, key, text, currentInventory);
  if (text.startsWith("/对话")) return threadCommand(currentState, key, text, currentInventory);
  if (text.startsWith("/新建对话")) return newThreadCommand(currentState, key, text);
  const current = selection(currentState, key);
  if (!current) return response("failed", "请先发送 /项目 选择项目，再发送 /对话 选择对话。", "error");
  return {
    ...response("ok", "已转发到当前 Codex 对话。", "forward", current),
    forwardToCodex: {
      workspacePath: current.workspacePath,
      threadId: current.threadId || null,
      threadName: current.threadName,
      prompt: text,
      createNewThread: !current.threadId,
    },
  };
}

function projectCommand(currentState, key, text, currentInventory) {
  const arg = commandArg(text, "/项目");
  if (!arg) {
    const choices = (currentInventory.projects || []).slice(0, 30).map((project, index) => ({
      index: index + 1,
      title: project.name,
      subtitle: `${project.threadCount || 0} 个对话 · ${relativeTime(project.latestUpdatedAtMs)}`,
      value: project.cwd,
    }));
    return { ...response("ok", formatChoices("请选择项目：", "/项目", choices), "list_projects", selection(currentState, key)), choices };
  }
  const project = chooseProject(arg, currentInventory);
  if (!project) return response("failed", "未找到项目。请发送 /项目 查看可选项目。", "error");
  const firstThread = (currentInventory.threads || []).find((thread) => thread.cwd === project.cwd);
  currentState.bindings[key] = {
    workspaceName: project.name,
    workspacePath: project.cwd,
    threadId: firstThread?.id || "",
    threadName: firstThread?.title || config.threadName || "Feishu - Dex",
    updatedAtMs: firstThread?.updatedAtMs || null,
  };
  return response("ok", `已选择项目：${project.name}\n继续发送 /对话 查看该项目下的旧对话，或发送 /新建对话。`, "select_project", selection(currentState, key));
}

function threadCommand(currentState, key, text, currentInventory) {
  const current = selection(currentState, key);
  if (!current) return response("failed", "请先发送 /项目 选择项目。", "error");
  const threads = (currentInventory.threads || []).filter((thread) => thread.cwd === current.workspacePath);
  const arg = commandArg(text, "/对话");
  if (!arg) {
    const choices = threads.slice(0, 30).map((thread, index) => ({
      index: index + 1,
      title: thread.title,
      subtitle: `${relativeTime(thread.updatedAtMs)}${thread.archived ? " · 归档" : ""}`,
      value: thread.id,
    }));
    return { ...response("ok", formatChoices("请选择对话：", "/对话", choices), "list_threads", current), choices };
  }
  const thread = chooseThread(arg, threads);
  if (!thread) return response("failed", "未找到对话。请发送 /对话 查看可选对话。", "error");
  currentState.bindings[key] = {
    workspaceName: current.workspaceName,
    workspacePath: thread.cwd,
    threadId: thread.id,
    threadName: thread.title,
    updatedAtMs: thread.updatedAtMs || null,
  };
  return response("ok", `已选择对话：${thread.title}\n时间：${relativeTime(thread.updatedAtMs)}\n之后的普通消息会继续这个对话。`, "select_thread", selection(currentState, key));
}

function newThreadCommand(currentState, key, text) {
  const current = selection(currentState, key);
  if (!current) return response("failed", "请先发送 /项目 选择项目。", "error");
  const name = commandArg(text, "/新建对话") || config.threadName || "Feishu - Dex";
  currentState.bindings[key] = {
    workspaceName: current.workspaceName,
    workspacePath: current.workspacePath,
    threadId: "",
    threadName: name,
    updatedAtMs: null,
  };
  return response("ok", `已准备新建对话：${name}\n下一条普通消息会在当前项目下创建新 Codex thread。`, "new_thread", selection(currentState, key));
}

class CodexAppClient {
  constructor(url, remoteConfig) {
    this.url = url;
    this.config = remoteConfig;
    this.ws = null;
    this.seq = 1;
    this.pending = new Map();
    this.activeTurn = null;
  }

  async runTurn(turn) {
    await this.connect();
    const threadId = await this.ensureThread(turn);
    const started = await this.request("turn/start", withCwd(turn.workspacePath, {
      threadId,
      input: textInput(turn.prompt),
      approvalPolicy: this.config.approvalPolicy,
      sandboxPolicy: sandboxPolicy(this.config.sandbox),
    }));
    const turnId = started?.turn?.id;
    if (!turnId) return "Codex 已收到请求，但没有返回 turn id。";
    return await this.waitForTurn(turnId);
  }

  async connect() {
    if (!WebSocketImpl) throw new Error("missing WebSocket runtime; install ws or use Node.js with global WebSocket");
    if (this.ws?.readyState === WebSocketImpl.OPEN) return;
    this.ws = new WebSocketImpl(this.url);
    this.ws.on("message", (chunk) => this.onMessage(chunk));
    this.ws.on("close", () => {
      this.rejectPending(new Error("Codex app-server WebSocket closed"));
      this.ws = null;
    });
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    await this.request("initialize", {
      clientInfo: { name: "dex-feishu-bridge", version: "0.1.0", title: "Dex Feishu Bridge" },
      capabilities: { experimentalApi: true },
    });
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }));
  }

  async ensureThread(turn) {
    if (turn.threadId) {
      await this.request("thread/resume", withCwd(turn.workspacePath, {
        threadId: turn.threadId,
        approvalPolicy: this.config.approvalPolicy,
        sandbox: this.config.sandbox,
        persistExtendedHistory: true,
      }));
      return turn.threadId;
    }
    const started = await this.request("thread/start", withCwd(turn.workspacePath, {
      approvalPolicy: this.config.approvalPolicy,
      sandbox: this.config.sandbox,
      ephemeral: false,
      experimentalRawEvents: false,
      persistExtendedHistory: true,
      sessionStartSource: "startup",
    }));
    const threadId = started?.thread?.id;
    if (!threadId) throw new Error("thread/start did not return a thread id");
    if (turn.threadName) {
      await this.request("thread/name/set", { threadId, name: turn.threadName }).catch((error) => log("thread_name_set_failed", error.message));
    }
    updateCurrentBindingThread(turn, threadId);
    return threadId;
  }

  async waitForTurn(turnId) {
    return await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.activeTurn?.turnId !== turnId) return;
        this.activeTurn = null;
        reject(new Error("Codex turn timed out after 180s"));
      }, 180_000);
      this.activeTurn = {
        turnId,
        chunks: [],
        lastText: "",
        resolve,
        reject,
        timeout,
      };
    });
  }

  request(method, params) {
    if (!this.ws || this.ws.readyState !== WebSocketImpl.OPEN) throw new Error("Codex WebSocket is not connected");
    const id = this.seq++;
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        pending.reject(new Error(`${method} timed out`));
      }, 30_000);
    });
  }

  onMessage(chunk) {
    let payload;
    try {
      payload = JSON.parse(chunk.toString());
    } catch {
      return;
    }
    if (payload.id && this.pending.has(payload.id)) {
      const pending = this.pending.get(payload.id);
      this.pending.delete(payload.id);
      if (payload.error) pending.reject(new Error(payload.error.message || JSON.stringify(payload.error)));
      else pending.resolve(payload.result);
      return;
    }
    this.observeEvent(payload);
  }

  observeEvent(payload) {
    const turn = this.activeTurn;
    if (!turn) return;
    const event = payload.params || payload.result || payload;
    const text = extractCodexText(event);
    if (text) {
      turn.lastText = text;
      turn.chunks.push(text);
    }
    if (isTurnDone(event, turn.turnId)) {
      this.activeTurn = null;
      clearTimeout(turn.timeout);
      turn.resolve(turn.lastText || turn.chunks.join("").trim() || "Codex 已完成。");
    }
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    if (this.activeTurn) {
      clearTimeout(this.activeTurn.timeout);
      this.activeTurn.reject(error);
      this.activeTurn = null;
    }
  }
}

function textInput(text) {
  return [{ type: "text", text }];
}

function withCwd(cwd, params) {
  const trimmed = String(cwd || "").trim();
  return trimmed ? { ...params, cwd: trimmed } : params;
}

function sandboxPolicy(value) {
  if (value === "read-only") return { type: "readOnly" };
  return { type: "workspaceWrite" };
}

function extractCodexText(event) {
  const candidates = [
    event?.message,
    event?.text,
    event?.content,
    event?.delta,
    event?.item?.message,
    event?.item?.text,
    event?.item?.content,
    event?.turn?.message,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function isTurnDone(event, turnId) {
  const type = event?.type || event?.method || event?.msg || "";
  const status = event?.status || event?.turn?.status || "";
  return (
    type.includes("turn/completed") ||
    type.includes("turn.complete") ||
    type.includes("task_complete") ||
    status === "completed" ||
    status === "failed" ||
    event?.turnId === turnId && event?.completed
  );
}

function updateCurrentBindingThread(turn, threadId) {
  for (const binding of Object.values(state.bindings || {})) {
    if (binding.workspacePath !== turn.workspacePath) continue;
    if (binding.threadId) continue;
    binding.threadId = threadId;
    binding.threadName = turn.threadName || binding.threadName;
    binding.updatedAtMs = Date.now();
  }
  saveState();
}

function cardFor(response, message) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: response.action === "list_projects" ? "blue" : "green",
      title: { tag: "plain_text", content: response.action === "list_projects" ? "选择 Codex 项目" : "选择 Codex 对话" },
    },
    elements: [
      { tag: "markdown", content: response.reply.split("\n").slice(0, 16).join("\n") },
      ...response.choices.slice(0, 8).map((choice) => ({
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: `${choice.index}. ${truncate(choice.title, 28)}` },
            type: "primary",
            value: {
              command: response.action === "list_projects" ? "/项目" : "/对话",
              index: choice.index,
              chatId: message.chatId,
              userId: message.userId,
            },
          },
        ],
      })),
    ],
  };
}

function actionText(value) {
  const command = value.command || "";
  const index = value.index || "";
  if (command === "/项目" && index) return `/项目 ${index}`;
  if (command === "/对话" && index) return `/对话 ${index}`;
  if (value.text) return String(value.text);
  return "";
}

function allowed(chatId, userId, remoteConfig, chatType) {
  if (remoteConfig.feishuChatId && chatId !== remoteConfig.feishuChatId) return false;
  if (remoteConfig.feishuUserId && userId !== remoteConfig.feishuUserId) return false;
  if (remoteConfig.feishuChatId || remoteConfig.feishuUserId) return true;
  if (!remoteConfig.autoBindP2p || !chatId || !userId) return false;
  const bound = state.autoBoundRoute;
  if (bound) return bound.chatId === chatId && bound.userId === userId;
  if (chatType && chatType !== "p2p") return false;
  state.autoBoundRoute = { chatId, userId, boundAtMs: Date.now() };
  saveState();
  return true;
}

function parseMessageText(message) {
  if (message.msg_type !== "text" && message.message_type !== "text") return "";
  try {
    const content = JSON.parse(message.content || "{}");
    return String(content.text || "").trim();
  } catch {
    return "";
  }
}

function selection(currentState, key) {
  const binding = currentState.bindings?.[key];
  if (!binding) return null;
  return {
    workspaceName: binding.workspaceName || "",
    workspacePath: binding.workspacePath || "",
    threadId: binding.threadId || "",
    threadName: binding.threadName || "",
    updatedAtMs: binding.updatedAtMs || null,
  };
}

function seedInitialBinding(currentState, remoteConfig) {
  if (!remoteConfig.workspacePath) return;
  const key = bindingKey({
    chatId: remoteConfig.feishuChatId || "default",
    userId: remoteConfig.feishuUserId || "",
  });
  currentState.bindings ||= {};
  if (currentState.bindings[key]) return;
  currentState.bindings[key] = {
    workspaceName: remoteConfig.workspaceName || path.basename(remoteConfig.workspacePath),
    workspacePath: remoteConfig.workspacePath,
    threadId: remoteConfig.threadId || "",
    threadName: remoteConfig.threadName || "Feishu - Dex",
    updatedAtMs: null,
  };
  saveState();
}

function response(status, reply, action, currentSelection = null) {
  return { status, reply, action, selection: currentSelection, choices: [], forwardToCodex: null };
}

function chooseProject(arg, currentInventory) {
  const projects = currentInventory.projects || [];
  const index = Number.parseInt(arg, 10);
  if (Number.isFinite(index) && index > 0) return projects[index - 1];
  return projects.find((project) => project.name === arg || project.cwd === arg);
}

function chooseThread(arg, threads) {
  const index = Number.parseInt(arg, 10);
  if (Number.isFinite(index) && index > 0) return threads[index - 1];
  return threads.find((thread) => thread.id === arg || thread.title === arg);
}

function formatChoices(title, command, choices) {
  if (!choices.length) return `${title}\n暂无可选项。`;
  return `${title}\n${choices.map((choice) => `${choice.index}. ${choice.title} - ${choice.subtitle}\n   选择：${command} ${choice.index}`).join("\n")}`;
}

function helpText(current) {
  const lines = [
    "可用命令：",
    "/项目 - 查看项目列表",
    "/项目 2 - 选择第 2 个项目",
    "/对话 - 查看当前项目的旧对话",
    "/对话 3 - 选择第 3 个对话",
    "/新建对话 [名称] - 在当前项目下新建对话",
    "/当前 - 查看当前绑定",
  ];
  if (current) lines.push("", `当前：${current.workspaceName} / ${current.threadName}`);
  return lines.join("\n");
}

function bindingKey(message) {
  if (message.chatId && message.userId) return `${message.chatId}:${message.userId}`;
  return message.chatId || message.userId || "default";
}

function commandArg(text, command) {
  return text.slice(command.length).trim();
}

function commandName(text) {
  return text.split(/\s+/)[0] || "message";
}

function relativeTime(value) {
  if (!value) return "未知时间";
  const diff = Math.max(0, Date.now() - Math.max(0, Number(value)));
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  return `${Math.floor(diff / day)} 天前`;
}

function appServerUrl(remoteConfig) {
  return `ws://${remoteConfig.bindHost || "127.0.0.1"}:${remoteConfig.appServerPort || 54322}`;
}

function assertSafeConfig(remoteConfig) {
  if (!remoteConfig.enabled) throw new Error("remote bridge is disabled");
  if (!remoteConfig.larkAppId || !remoteConfig.larkAppSecret) throw new Error("missing Lark App ID/App Secret");
  if (!remoteConfig.feishuChatId && !remoteConfig.feishuUserId && !remoteConfig.autoBindP2p) {
    throw new Error("missing Feishu route; bind chat/user or enable first private-chat auto bind");
  }
  if (remoteConfig.bindHost !== "127.0.0.1" && remoteConfig.bindHost !== "::1") {
    throw new Error("Codex app-server must stay on loopback");
  }
  if (remoteConfig.approvalPolicy === "never") throw new Error("approvalPolicy=never is rejected for remote bridge");
  if (remoteConfig.sandbox === "danger-full-access") throw new Error("danger-full-access is rejected for remote bridge");
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function saveState() {
  state.processedMessageIds = Array.from(processedIds).slice(-300);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function markProcessed(messageId) {
  if (!messageId) return;
  processedIds.add(messageId);
  saveState();
}

function truncate(text, limit) {
  const value = String(text || "");
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function sanitize(value) {
  return value
    .replace(/(app[_-]?secret["'\s:=]+)[^"',\s]+/gi, "$1***")
    .replace(/(token["'\s:=]+)[^"',\s]+/gi, "$1***")
    .replace(/(authorization["'\s:=]+bearer\s+)[^"',\s]+/gi, "$1***");
}

function siblingPath(filePath, name) {
  return filePath ? path.join(path.dirname(filePath), name) : "";
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index];
    if (!item.startsWith("--")) continue;
    result[item.slice(2)] = values[index + 1] || "";
    index += 1;
  }
  return result;
}

function shutdown() {
  log("feishu bridge stopping");
  larkRuntime?.stop?.();
  for (const child of activeChildren) child.kill("SIGTERM");
  runLog.end();
  process.exit(0);
}

codex = new CodexAppClient(appServerUrl(config), config);
larkRuntime = larkSdk ? createSdkRuntime(larkSdk, config) : createCliRuntime(config);

log("feishu bridge starting", "runtime", larkRuntime.name, "projects", inventory.projects?.length || 0, "threads", inventory.threads?.length || 0);
await larkRuntime.start();
log("feishu bridge connected", larkRuntime.name);
