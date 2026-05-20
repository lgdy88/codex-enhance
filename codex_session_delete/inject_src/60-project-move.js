  async function codexStateApi() {
    codexStateApiPromise = codexStateApiPromise || import("./assets/vscode-api-Dc9pX2Bc.js");
    const api = await codexStateApiPromise;
    if (typeof api.n !== "function") throw new Error("Codex 状态 API 不可用");
    return api.n;
  }

  async function codexStateCall(method, params) {
    const call = await codexStateApi();
    return await call(method, params);
  }

  async function getCodexGlobalState(key) {
    const result = await codexStateCall("get-global-state", { params: { key } });
    return result && Object.prototype.hasOwnProperty.call(result, "value") ? result.value : result;
  }

  async function setCodexGlobalState(key, value) {
    return await codexStateCall("set-global-state", { params: { key, value } });
  }

  function objectGlobalState(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  }

  function uniqueValues(values) {
    return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim().length > 0)));
  }

  function threadIdVariants(sessionId) {
    if (typeof sessionId !== "string" || !sessionId.trim()) return [];
    const id = sessionId.trim();
    const bareId = id.startsWith("local:") ? id.slice("local:".length) : id;
    return uniqueValues([id, bareId, `local:${bareId}`]);
  }

  function projectMoveSessionKey(sessionId) {
    const variants = threadIdVariants(sessionId);
    const bareId = variants.find((id) => !id.startsWith("local:"));
    return bareId || variants[0] || "";
  }

  function uuidV7TimestampMs(sessionId) {
    const id = projectMoveSessionKey(sessionId).replaceAll("-", "");
    if (!/^[0-9a-fA-F]{12}/.test(id)) return 0;
    const timestamp = Number.parseInt(id.slice(0, 12), 16);
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function numericTimestamp(value) {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : 0;
  }

  function timestampValueToMs(value) {
    const timestamp = numericTimestamp(value);
    if (!timestamp) return 0;
    return timestamp < 1000000000000 ? timestamp * 1000 : timestamp;
  }

  function sortMsForSession(sessionId, preferredValue) {
    return numericTimestamp(preferredValue) || uuidV7TimestampMs(sessionId);
  }

  function timestampMsFromPayload(payload) {
    return numericTimestamp(payload?.updated_at_ms) || timestampValueToMs(payload?.updated_at) || numericTimestamp(payload?.created_at_ms);
  }

  function relativeTimeLabel(timestampMs, nowMs = Date.now()) {
    const timestamp = numericTimestamp(timestampMs);
    if (!timestamp) return "";
    const elapsedSeconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
    if (elapsedSeconds < 60) return "刚刚";
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) return `${elapsedMinutes} 分`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours} 小时`;
    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 7) return `${elapsedDays} 天`;
    const elapsedWeeks = Math.floor(elapsedDays / 7);
    if (elapsedWeeks < 5) return `${elapsedWeeks} 周`;
    const elapsedMonths = Math.floor(elapsedDays / 30);
    if (elapsedMonths < 12) return `${Math.max(1, elapsedMonths)} 月`;
    return `${Math.floor(elapsedDays / 365)} 年`;
  }

  function normalizeWorkspacePath(path) {
    const normalized = String(path || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    return normalized || String(path || "").trim();
  }

  function sameWorkspacePath(left, right) {
    const leftPath = normalizeWorkspacePath(left);
    const rightPath = normalizeWorkspacePath(right);
    return !!leftPath && !!rightPath && leftPath === rightPath;
  }

  function displayProjectName(path) {
    const trimmed = String(path || "").replace(/\/+$/, "");
    return trimmed.split(/[\\/]+/).filter(Boolean).pop() || trimmed || "未命名项目";
  }

  function normalizeProjectLabel(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function projectsSection() {
    return document.querySelector('[data-app-action-sidebar-section-heading="Projects"]');
  }

  function chatsSection() {
    return document.querySelector('[data-app-action-sidebar-section-heading="Chats"]');
  }

  function activeProjectPath() {
    const activeProject = Array.from(document.querySelectorAll('[data-app-action-sidebar-project-row]')).find((row) => row.getAttribute("aria-current") === "page" || row.dataset.active === "true");
    return activeProject?.getAttribute("data-app-action-sidebar-project-id") || nativeProjectTargets()[0]?.path || "";
  }

  function projectRowListItem(projectRow) {
    return projectRow.closest?.('[role="listitem"][aria-label]') || projectRow.closest?.('[role="listitem"]') || projectRow;
  }

  function nativeProjectTargets() {
    const section = projectsSection();
    const seen = new Set();
    const targets = [];
    Array.from(document.querySelectorAll('[data-app-action-sidebar-project-row]')).forEach((row) => {
      if (section && !section.contains(row)) return;
      const path = row.getAttribute("data-app-action-sidebar-project-id") || "";
      const normalizedPath = normalizeWorkspacePath(path);
      if (!normalizedPath || seen.has(normalizedPath)) return;
      const label = row.getAttribute("data-app-action-sidebar-project-label") || row.getAttribute("aria-label") || displayProjectName(path);
      seen.add(normalizedPath);
      targets.push({ kind: "project", label: String(label || displayProjectName(path)), description: path, path, normalizedPath, row, listItem: projectRowListItem(row) });
    });
    return targets;
  }

  function serializableProjectTarget(target) {
    return { kind: target.kind, label: target.label, description: target.description, path: target.path, normalizedPath: target.normalizedPath || normalizeWorkspacePath(target.path) };
  }

  function projectMoveTargets() {
    return [
      { kind: "projectless", label: "普通对话", description: "不属于任何项目", path: "", normalizedPath: "" },
      ...nativeProjectTargets().map(serializableProjectTarget),
    ];
  }

  function readLegacyProjectMoveProjection() {
    try {
      const parsed = JSON.parse(localStorage.getItem(legacyProjectMoveOverridesKey) || "{}");
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
      const now = Date.now();
      const next = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (!value || typeof value !== "object" || !value.targetCwd) continue;
        const sessionId = projectMoveSessionKey(value.sessionId || key);
        if (!sessionId) continue;
        next[sessionId] = {
          sessionId,
          targetKind: "project",
          targetCwd: String(value.targetCwd),
          targetLabel: String(value.targetLabel || displayProjectName(value.targetCwd)),
          title: String(value.title || ""),
          sortMs: sortMsForSession(sessionId, value.sortMs || value.updatedAtMs || value.updated_at_ms),
          sortMsTrusted: false,
          at: typeof value.at === "number" ? value.at : now,
        };
      }
      return next;
    } catch {
      return {};
    }
  }

  function readProjectMoveProjection() {
    try {
      const parsed = JSON.parse(localStorage.getItem(projectMoveProjectionKey) || "{}");
      const raw = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      const merged = { ...readLegacyProjectMoveProjection(), ...raw };
      const now = Date.now();
      const projection = {};
      for (const [key, value] of Object.entries(merged)) {
        if (!value || typeof value !== "object") continue;
        const sessionId = projectMoveSessionKey(value.sessionId || key);
        if (!sessionId) continue;
        if (typeof value.at === "number" && now - value.at > projectMoveProjectionTtlMs) continue;
        const targetKind = value.targetKind === "projectless" ? "projectless" : "project";
        const targetCwd = String(value.targetCwd || value.path || "");
        if (targetKind === "project" && !targetCwd) continue;
        projection[sessionId] = {
          sessionId,
          targetKind,
          targetCwd,
          targetLabel: String(value.targetLabel || value.label || (targetKind === "projectless" ? "普通对话" : displayProjectName(targetCwd))),
          title: String(value.title || ""),
          sortMs: sortMsForSession(sessionId, value.sortMs || value.updatedAtMs || value.updated_at_ms),
          sortMsTrusted: value.sortMsTrusted === true,
          at: typeof value.at === "number" ? value.at : now,
        };
      }
      return projection;
    } catch {
      return readLegacyProjectMoveProjection();
    }
  }

  function writeProjectMoveProjection(projection) {
    try {
      localStorage.setItem(projectMoveProjectionKey, JSON.stringify(projection || {}));
      localStorage.removeItem(legacyProjectMoveOverridesKey);
    } catch (error) {
      window.__codexProjectMoveProjectionFailures = window.__codexProjectMoveProjectionFailures || [];
      window.__codexProjectMoveProjectionFailures.push(String(error?.stack || error));
    }
  }

  function saveProjectMoveProjection(ref, target, sortMs) {
    const id = projectMoveSessionKey(ref.session_id);
    if (!id || !target) return;
    const projection = readProjectMoveProjection();
    projection[id] = {
      sessionId: id,
      targetKind: target.kind === "projectless" ? "projectless" : "project",
      targetCwd: target.path || "",
      targetLabel: target.label || (target.kind === "projectless" ? "普通对话" : displayProjectName(target.path)),
      title: ref.title || "",
      sortMs: sortMsForSession(ref.session_id, sortMs || target.sortMs),
      sortMsTrusted: target.sortMsTrusted === true,
      at: Date.now(),
    };
    writeProjectMoveProjection(projection);
  }

  function clearProjectMoveProjection(ref) {
    const projection = readProjectMoveProjection();
    const keys = threadIdVariants(ref.session_id).map(projectMoveSessionKey).filter(Boolean);
    let changed = false;
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(projection, key)) {
        delete projection[key];
        changed = true;
      }
    });
    if (changed) writeProjectMoveProjection(projection);
  }

  function removeProjectThreadStateSession(ref) {
    const keys = new Set(threadIdVariants(ref?.session_id || "").map(projectMoveSessionKey).filter(Boolean));
    if (!keys.size) return;
    Object.values(window.__codexProjectThreadsState || {}).forEach((state) => {
      if (!Array.isArray(state?.threads)) return;
      state.threads = state.threads.filter((thread) => !keys.has(projectMoveSessionKey(thread?.session_id || "")));
    });
  }

  async function clearDeletedSessionGlobalState(ref) {
    const variants = threadIdVariants(ref?.session_id || "");
    if (!variants.length) return;
    const variantSet = new Set(variants);
    const existingIds = await getCodexGlobalState("projectless-thread-ids").catch(() => []);
    if (Array.isArray(existingIds)) {
      const nextIds = existingIds.filter((id) => !variantSet.has(String(id || "")));
      if (nextIds.length !== existingIds.length) await setCodexGlobalState("projectless-thread-ids", nextIds);
    }
    const hints = objectGlobalState(await getCodexGlobalState("thread-workspace-root-hints").catch(() => ({})));
    let changed = false;
    variants.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(hints, id)) {
        delete hints[id];
        changed = true;
      }
    });
    if (changed) await setCodexGlobalState("thread-workspace-root-hints", hints);
  }

  async function cleanupDeletedSessionState(ref) {
    clearProjectMoveProjection(ref);
    removeProjectThreadStateSession(ref);
    try {
      await clearDeletedSessionGlobalState(ref);
    } catch (error) {
      window.__codexSessionDeleteCleanupFailures = window.__codexSessionDeleteCleanupFailures || [];
      window.__codexSessionDeleteCleanupFailures.push(String(error?.stack || error));
    }
  }

  function refreshAfterSessionDelete(ref) {
    resetProjectThreadState();
    scheduleChatsSortCorrection(0);
    refreshProjectThreadFallbacks();
    refreshRecentConversationsForHost().finally(() => {
      projectMoveRefreshDelaysMs.forEach((delay) => setTimeout(() => {
        scheduleChatsSortCorrection(0);
        refreshProjectThreadFallbacks();
      }, delay));
    });
  }

  function projectionForSessionId(sessionId, projection = readProjectMoveProjection()) {
    const key = projectMoveSessionKey(sessionId);
    return key ? projection[key] || null : null;
  }

  function projectRowFromListItem(projectItem) {
    if (!projectItem) return null;
    if (projectItem.matches?.("[data-app-action-sidebar-project-row]")) return projectItem;
    return projectItem.querySelector?.("[data-app-action-sidebar-project-row]") || null;
  }

  function targetPath(target) {
    return target?.path || target?.targetCwd || "";
  }

  function targetLabel(target) {
    return target?.label || target?.targetLabel || displayProjectName(targetPath(target));
  }

  function projectItemMatchesTarget(projectItem, target) {
    const projectRow = projectRowFromListItem(projectItem);
    const projectPath = projectRow?.getAttribute?.("data-app-action-sidebar-project-id") || "";
    if (projectPath && sameWorkspacePath(projectPath, targetPath(target))) return true;
    const actual = normalizeProjectLabel(projectRow?.getAttribute?.("data-app-action-sidebar-project-label") || projectItem?.getAttribute?.("aria-label"));
    const labels = uniqueValues([targetLabel(target), displayProjectName(targetPath(target))]).map(normalizeProjectLabel).filter(Boolean);
    return !!actual && labels.includes(actual);
  }

  function findProjectListItem(target) {
    const nativeTarget = nativeProjectTargets().find((project) => sameWorkspacePath(project.path, targetPath(target)));
    if (nativeTarget?.listItem) return nativeTarget.listItem;
    const section = projectsSection();
    if (!section) return null;
    return Array.from(section.querySelectorAll('[role="listitem"][aria-label]')).find((item) => projectItemMatchesTarget(item, target)) || null;
  }

  async function writeClipboardText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  function closestProjectListItem(row) {
    const item = row.closest?.('[role="listitem"][aria-label]');
    return item?.closest?.('[data-app-action-sidebar-section-heading="Projects"]') ? item : null;
  }

  function rowIsInChats(row) {
    return !!row.closest?.('[data-app-action-sidebar-section-heading="Chats"]');
  }

  function chatsThreadList() {
    return chatsSection()?.querySelector?.('[role="list"][aria-label="对话"], [role="list"]') || null;
  }

  function rowIsUnderTargetProject(row, target) {
    const item = closestProjectListItem(row);
    return !!item && projectItemMatchesTarget(item, target);
  }

  function rowIsUnderTarget(row, target) {
    return target?.targetKind === "projectless" || target?.kind === "projectless" ? rowIsInChats(row) : rowIsUnderTargetProject(row, target);
  }

  function rowListItem(row) {
    return row.closest?.('[role="listitem"]') || row;
  }

  function rowContentRoot(row) {
    return Array.from(row?.children || []).find((child) => String(child.className || "").includes("h-full w-full items-center")) || null;
  }

  function normalizedText(node) {
    return String(node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function classNameText(node) {
    return String(node?.className || "");
  }

  function isRelativeTimeText(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return /^(刚刚|just now|\d+\s*(秒|秒钟|分|分钟|小时|天|日|周|星期|个月|月|年|sec|secs|second|seconds|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks|mo|mos|month|months|y|yr|yrs|year|years))$/i.test(value);
  }

  function nodeIsThreadTitle(row, node) {
    return Array.from(row?.querySelectorAll?.('[data-thread-title], .truncate.select-none, .truncate.text-base') || [])
      .some((titleNode) => titleNode === node || titleNode.contains(node));
  }

  function closestTimeWrapper(row, node) {
    const root = rowContentRoot(row) || row;
    let current = node?.parentElement || null;
    while (current && current !== root && current !== row) {
      const className = classNameText(current);
      if (current.dataset?.codexProjectMoveTimeWrapper === "true" || (className.includes("ml-[3px]") && className.includes("min-w-[26px]"))) return current;
      current = current.parentElement;
    }
    return null;
  }

  function nodeInsideStatusIcon(row, node) {
    const stop = closestTimeWrapper(row, node) || rowContentRoot(row) || row;
    let current = node || null;
    while (current && current !== stop && current !== row) {
      const className = classNameText(current);
      if (className.includes("animate-spin")) return true;
      if (className.includes("size-5") && className.includes("shrink-0")) return true;
      if (className.includes("contain-paint") && className.includes("contain-layout")) return true;
      current = current.parentElement;
    }
    return false;
  }

  function cleanupManagedStatusIconTimeNodes(row) {
    Array.from(row?.querySelectorAll?.('[data-codex-project-move-time="true"]') || []).forEach((node) => {
      if (!nodeInsideStatusIcon(row, node)) return;
      const text = normalizedText(node);
      delete node.dataset.codexProjectMoveTime;
      delete node.dataset.codexProjectMoveTimeMs;
      if (node.children.length === 0 && isRelativeTimeText(text)) node.textContent = "";
    });
  }

  function nodeLooksLikeTimeLabel(row, node) {
    if (nodeInsideStatusIcon(row, node)) return false;
    if (node?.dataset?.codexProjectMoveTime === "true") return true;
    if (node.children.length > 0) return false;
    const text = normalizedText(node);
    const className = classNameText(node);
    if ((className.includes("tabular-nums") || className.includes("text-token-description-foreground")) && text.length <= 24) return true;
    if (!isRelativeTimeText(text)) return false;
    const rowRect = row?.getBoundingClientRect?.();
    const nodeRect = node?.getBoundingClientRect?.();
    if (!rowRect || !nodeRect || rowRect.width <= 0 || nodeRect.width <= 0) return false;
    return nodeRect.left >= rowRect.left + rowRect.width * 0.45 || nodeRect.right >= rowRect.right - 96;
  }

  function rowTimeLabelCandidates(row) {
    cleanupManagedStatusIconTimeNodes(row);
    const root = rowContentRoot(row) || row;
    const raw = Array.from(root?.querySelectorAll?.("div, span, time, small") || []).filter((node) => {
      if (nodeIsThreadTitle(row, node)) return false;
      return nodeLooksLikeTimeLabel(row, node);
    });
    return raw.filter((node) => !raw.some((other) => other !== node && node.contains(other)));
  }

  function rowTimeLabelNode(row) {
    const candidates = rowTimeLabelCandidates(row);
    return candidates.find((node) => node.dataset?.codexProjectMoveTime !== "true" && !node.closest?.('[data-codex-project-move-time-wrapper="true"]')) || candidates[0] || null;
  }

  function removeTimeLabelNode(row, node) {
    if (!node || !row?.contains?.(node)) return;
    const wrapper = node.closest?.('[data-codex-project-move-time-wrapper="true"]') || closestTimeWrapper(row, node);
    if (wrapper && wrapper !== row && row.contains(wrapper)) {
      wrapper.remove();
      return;
    }
    node.remove();
  }

  function cleanupRowTimeLabels(row, keepNode) {
    if (!keepNode) return;
    rowTimeLabelCandidates(row).forEach((node) => {
      if (node === keepNode) return;
      if (node.dataset?.codexProjectMoveTime === "true" || node.closest?.('[data-codex-project-move-time-wrapper="true"]')) removeTimeLabelNode(row, node);
    });
  }

  function ensureRowTimeLabelNode(row) {
    const existing = rowTimeLabelNode(row);
    if (existing) {
      cleanupRowTimeLabels(row, existing);
      return existing;
    }
    const root = rowContentRoot(row);
    if (!root) return null;
    const wrapper = document.createElement("div");
    wrapper.className = "ml-[3px] flex items-center justify-end gap-1 min-w-[26px]";
    wrapper.dataset.codexProjectMoveTimeWrapper = "true";
    const inner = document.createElement("div");
    const label = document.createElement("div");
    label.className = "text-token-description-foreground text-sm leading-4 empty:hidden tabular-nums overflow-visible truncate text-right group-focus-within:opacity-0 group-hover:opacity-0";
    label.dataset.codexProjectMoveTime = "true";
    inner.appendChild(label);
    wrapper.appendChild(inner);
    root.appendChild(wrapper);
    return label;
  }

  function updateRowTimeLabel(row, sortMs) {
    const label = ensureRowTimeLabelNode(row);
    if (!label) return;
    const timestamp = numericTimestamp(sortMs);
    const text = relativeTimeLabel(timestamp);
    label.dataset.codexProjectMoveTime = "true";
    label.dataset.codexProjectMoveTimeMs = String(timestamp || 0);
    if (text && label.textContent !== text) label.textContent = text;
    cleanupRowTimeLabels(row, label);
  }

  function rowProjectionKind(row) {
    return row?.dataset?.codexProjectMoveTargetKind || rowListItem(row)?.dataset?.codexProjectMoveTargetKind || "";
  }

  function rowSortMs(row, ref = sessionRefFromRow(row), target = null) {
    return sortMsForSession(ref.session_id, target?.sortMs || row?.dataset?.codexProjectMoveSortMs || rowListItem(row)?.dataset?.codexProjectMoveSortMs);
  }

  function threadRowFromListItem(item) {
    if (!item) return null;
    if (item.matches?.("[data-app-action-sidebar-thread-id]")) return item;
    return item.querySelector?.("[data-app-action-sidebar-thread-id]") || null;
  }

  function rowPinned(row) {
    return row?.getAttribute?.("data-app-action-sidebar-thread-pinned") === "true" || rowListItem(row)?.getAttribute?.("data-app-action-sidebar-thread-pinned") === "true";
  }

  function insertRowItemByTime(list, item, row, target) {
    const ref = sessionRefFromRow(row);
    const sortMs = rowSortMs(row, ref, target);
    item.dataset.codexProjectMoveSortMs = String(sortMs || 0);
    row.dataset.codexProjectMoveSortMs = String(sortMs || 0);
    if (target?.sortMsTrusted) updateRowTimeLabel(row, sortMs);
    const pinned = rowPinned(row);
    const sessionKey = projectMoveSessionKey(ref.session_id);
    const existingItems = Array.from(list.children).filter((child) => child !== item);
    let firstNonThreadItem = null;
    for (const child of existingItems) {
      const childRow = threadRowFromListItem(child);
      if (!childRow) {
        firstNonThreadItem = firstNonThreadItem || child;
        continue;
      }
      const childPinned = rowPinned(childRow);
      if (childPinned && !pinned) continue;
      if (!childPinned && pinned) {
        list.insertBefore(item, child);
        return;
      }
      const childRef = sessionRefFromRow(childRow);
      const childSortMs = rowSortMs(childRow, childRef);
      const childKey = projectMoveSessionKey(childRef.session_id);
      if (sortMs > childSortMs || (sortMs === childSortMs && sessionKey > childKey)) {
        list.insertBefore(item, child);
        return;
      }
    }
    if (firstNonThreadItem) {
      list.insertBefore(item, firstNonThreadItem);
      return;
    }
    list.appendChild(item);
  }

  function projectMoveInjectedList(projectItem) {
    let list = projectItem.querySelector('[data-codex-project-move-injected-list="true"]');
    if (!list) {
      const body = Array.from(projectItem.children).find((child) => child.classList?.contains("overflow-hidden")) || projectItem;
      list = document.createElement("div");
      list.setAttribute("role", "list");
      list.setAttribute("data-codex-project-move-injected-list", "true");
      list.className = "flex flex-col";
      body.appendChild(list);
    }
    return list;
  }

  function projectThreadList(projectItem, target) {
    const targetCwd = targetPath(target);
    const projectLists = Array.from(projectItem.querySelectorAll("[data-app-action-sidebar-project-list-id]"));
    return projectLists.find((list) => sameWorkspacePath(list.getAttribute("data-app-action-sidebar-project-list-id"), targetCwd))
      || projectLists[0]
      || projectMoveInjectedList(projectItem);
  }

  function projectEmptyStateNodes(projectItem) {
    const emptyLabels = new Set(["暂无对话", "No conversations"]);
    return Array.from(projectItem.querySelectorAll("div, span")).filter((node) => {
      if (node.classList?.contains("overflow-hidden")) return false;
      if (node.closest('[data-app-action-sidebar-thread-id], [data-codex-project-move-injected-list="true"], [data-codex-project-thread-list="true"]')) return false;
      return emptyLabels.has(normalizeProjectLabel(node.textContent));
    });
  }

  function setProjectEmptyStateHidden(projectItem, hidden) {
    projectEmptyStateNodes(projectItem).forEach((node) => {
      if (hidden) {
        node.dataset.codexProjectMoveEmptyHidden = "true";
        node.classList.add("codex-project-move-hidden");
      } else if (node.dataset.codexProjectMoveEmptyHidden === "true") {
        delete node.dataset.codexProjectMoveEmptyHidden;
        node.classList.remove("codex-project-move-hidden");
      }
    });
  }

  function nativeProjectRows(projectItem) {
    if (!projectItem) return [];
    return Array.from(projectItem.querySelectorAll(selectors.sidebarThread))
      .filter((row) => row.dataset.codexProjectThreadInjected !== "true");
  }

  function visibleProjectThreadList(projectItem) {
    return Array.from(projectItem.querySelectorAll("[data-app-action-sidebar-project-list-id]"))
      .find((list) => list.offsetParent !== null) || null;
  }

  function projectThreadFallbackList(projectItem) {
    let list = projectItem.querySelector('[data-codex-project-thread-list="true"]');
    if (!list) {
      const body = Array.from(projectItem.children).find((child) => child.classList?.contains("overflow-hidden")) || projectItem;
      list = document.createElement("div");
      list.setAttribute("role", "list");
      list.setAttribute("data-codex-project-thread-list", "true");
      list.dataset.codexProjectThreadsVersion = codexProjectThreadsVersion;
      body.appendChild(list);
    }
    return list;
  }

  function projectThreadTitle(thread) {
    return String(thread?.title || "Untitled").replace(/\s+/g, " ").trim().slice(0, 180) || "Untitled";
  }

  function projectThreadRef(thread) {
    return { session_id: `local:${projectMoveSessionKey(thread?.session_id || "")}`, title: projectThreadTitle(thread) };
  }

  function projectThreadSortMs(thread) {
    return timestampMsFromPayload(thread) || sortMsForSession(thread?.session_id, thread?.updated_at_ms || thread?.updated_at);
  }

  function createProjectThreadRow(thread, projectPath) {
    const ref = projectThreadRef(thread);
    const row = document.createElement("div");
    row.className = "group relative h-token-nav-row cursor-interaction rounded-lg px-row-x py-row-y text-sm hover:bg-token-list-hover-background focus-visible:outline-offset-[-2px] codex-project-thread-row";
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    row.setAttribute("data-app-action-sidebar-thread-id", ref.session_id);
    row.setAttribute("data-app-action-sidebar-thread-kind", "local");
    row.setAttribute("data-app-action-sidebar-thread-pinned", "false");
    row.setAttribute("data-app-action-sidebar-thread-row", "");
    row.setAttribute("data-app-action-sidebar-thread-title", ref.title);
    row.dataset.codexProjectThreadInjected = "true";
    row.dataset.codexProjectMoveSortMs = String(projectThreadSortMs(thread) || 0);
    row.dataset.codexProjectThreadCwd = projectPath || String(thread?.cwd || "");
    row.innerHTML = `<div class="flex h-full w-full items-center text-sm leading-4"><span class="codex-project-thread-title truncate select-none" data-thread-title>${escapeHtml(ref.title)}</span></div>`;
    attachProjectThreadOpenHandlers(row, thread);
    updateRowTimeLabel(row, row.dataset.codexProjectMoveSortMs);
    tryAttachButton(row);
    return row;
  }

  function createProjectThreadRowItem(row) {
    const item = document.createElement("div");
    item.setAttribute("role", "listitem");
    item.className = "after:block after:h-px after:content-[''] last:after:hidden";
    item.dataset.codexProjectThreadItem = "true";
    item.appendChild(row);
    return item;
  }

  function projectThreadRowItem(row) {
    return row.closest?.('[data-codex-project-thread-item="true"]') || null;
  }

  function ensureProjectThreadRowItem(list, row) {
    const existingItem = projectThreadRowItem(row);
    if (existingItem) return existingItem;
    const item = createProjectThreadRowItem(row);
    if (!item.parentElement) list.appendChild(item);
    return item;
  }

  function attachProjectThreadOpenHandlers(row, thread) {
    row.addEventListener("click", (event) => openProjectThreadFromEvent(event, row, thread));
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openProjectThreadFromEvent(event, row, thread);
    });
  }

  function openProjectThreadFromEvent(event, row, thread) {
    if (event.defaultPrevented || event.target?.closest?.("button")) return;
    openProjectThread(row, thread).catch((error) => showToast(`打开会话失败：${String(error?.message || error)}`, null));
  }

  async function openProjectThread(row, thread) {
    const threadId = projectMoveSessionKey(thread?.session_id || sessionRefFromRow(row).session_id);
    if (!threadId) throw new Error("未找到会话 ID");
    await loadProjectThreadIntoCodex(threadId);
    window.location.assign(`/local/${encodeURIComponent(threadId)}?hostId=local`);
  }

  async function loadProjectThreadIntoCodex(threadId) {
    try {
      const signals = await import("./assets/app-server-manager-signals-C1h8B-R-.js");
      if (typeof signals.rn === "function") {
        await signals.rn("load-recent-conversation-ids-for-host", { hostId: "local", conversationIds: [threadId] });
        await signals.rn("prewarm-conversation-for-host", { hostId: "local", conversationId: threadId });
      }
    } catch (error) {
      window.__codexProjectThreadOpenFailures = window.__codexProjectThreadOpenFailures || [];
      window.__codexProjectThreadOpenFailures.push(String(error?.stack || error));
    }
  }

  async function appServerThreadList(projectCwd, limit = 30, cursor = "") {
    if (!providerHistoryEnabled()) return null;
    if (codexProviderHistoryTransport.appServer === "unavailable") return null;
    try {
      const signals = await import("./assets/app-server-manager-signals-C1h8B-R-.js");
      if (typeof signals.rn !== "function") {
        updateProviderHistoryTransport({ appServer: "unavailable", message: "app-server bridge 不可用" });
        return null;
      }
      const result = await signals.rn("thread/list", {
        modelProviders: [],
        cwd: workspacePathVariants(projectCwd),
        limit,
        cursor: cursor || undefined,
        sortKey: "updated_at",
      });
      updateProviderHistoryTransport({ mode: "app-server", appServer: "available", message: "app-server 查询成功" });
      return result;
    } catch (error) {
      window.__codexProviderHistoryAppServerFailures = window.__codexProviderHistoryAppServerFailures || [];
      window.__codexProviderHistoryAppServerFailures.push(String(error?.stack || error));
      updateProviderHistoryTransport({ appServer: "unavailable", message: providerHistoryErrorSummary(error) });
      return null;
    }
  }

  function providerHistoryErrorSummary(error) {
    return String(error?.message || error?.stack || error || "unknown").split("\n", 1)[0].slice(0, 160);
  }

  function workspacePathVariants(projectCwd) {
    const raw = String(projectCwd || "").trim();
    if (!raw) return [];
    const normalized = raw.replace(/\//g, "\\");
    const variants = [raw, normalized];
    if (normalized.startsWith("\\\\?\\")) variants.push(normalized.slice(4));
    else if (/^[A-Za-z]:\\/.test(normalized)) variants.push(`\\\\?\\${normalized}`);
    return uniqueValues(variants);
  }

  function normalizeThreadListResponse(result) {
    if (!result || typeof result !== "object") return null;
    const rawThreads = Array.isArray(result.threads) ? result.threads : Array.isArray(result.items) ? result.items : Array.isArray(result.conversations) ? result.conversations : [];
    if (!rawThreads.length && !result.next_cursor && !result.nextCursor && !result.cursor) return null;
    return {
      status: "ok",
      threads: rawThreads.map(normalizeAppServerThread).filter(Boolean),
      next_cursor: result.next_cursor || result.nextCursor || result.cursor || "",
      has_more: !!(result.has_more || result.hasMore || result.next_cursor || result.nextCursor),
    };
  }

  function normalizeAppServerThread(thread) {
    const id = thread?.id || thread?.thread_id || thread?.conversationId || thread?.conversation_id || thread?.session_id;
    if (!id) return null;
    return {
      session_id: id,
      title: thread.title || thread.name || "Untitled",
      cwd: thread.cwd || thread.workspace || thread.project_cwd || "",
      model_provider: thread.model_provider || thread.modelProvider || "",
      updated_at: thread.updated_at || thread.updatedAt || "",
      updated_at_ms: thread.updated_at_ms || thread.updatedAtMs || "",
      created_at_ms: thread.created_at_ms || thread.createdAtMs || "",
    };
  }

  async function fetchProjectThreads(projectPath, state) {
    const localResult = await postJson("/project-threads", { project_cwd: projectPath, limit: 30, cursor: state.cursor }).catch((error) => ({ status: "failed", message: providerHistoryErrorSummary(error), threads: [] }));
    if (localResult?.status === "ok") {
      updateProviderHistoryTransport({ mode: "local-sqlite", message: "本地 SQLite 查询成功" });
      return localResult;
    }
    const appServerResult = normalizeThreadListResponse(await appServerThreadList(projectPath, 30, state.cursor));
    if (appServerResult) return appServerResult;
    return localResult || { status: "failed", threads: [] };
  }

  function visibleProjectThreadRows(projectItem) {
    return nativeProjectRows(projectItem).filter((row) => row.offsetParent !== null);
  }

  function visibleProjectThreadFallbackRows(projectItem) {
    return Array.from(projectItem?.querySelectorAll?.('[data-codex-project-thread-list="true"] [data-app-action-sidebar-thread-id]') || [])
      .filter((row) => row.offsetParent !== null);
  }

  function renderedProjectThreadIds(projectItem) {
    return new Set(nativeProjectRows(projectItem).map((row) => projectMoveSessionKey(sessionRefFromRow(row).session_id)).filter(Boolean));
  }

  function projectThreadStateKey(projectPath) {
    return normalizeWorkspacePath(projectPath || "");
  }

  function projectThreadState(projectPath) {
    const key = projectThreadStateKey(projectPath);
    window.__codexProjectThreadsState[key] = window.__codexProjectThreadsState[key] || { visibleLimit: projectThreadVisibleLimit, cursor: "", hasMore: false, threads: [] };
    return window.__codexProjectThreadsState[key];
  }

  function resetProjectThreadState() {
    window.__codexProjectThreadsState = {};
  }

  function projectThreadCandidates(projectItem, threads) {
    const existingIds = renderedProjectThreadIds(projectItem);
    return threads.filter((thread) => !existingIds.has(projectMoveSessionKey(thread?.session_id || "")));
  }

  function projectCanRenderFallback(projectItem) {
    return !!projectItem && projectItem.offsetParent !== null && !!visibleProjectThreadList(projectItem);
  }

  function renderProjectThreadFallback(projectItem, projectPath, threads) {
    if (!projectCanRenderFallback(projectItem)) return;
    const state = projectThreadState(projectPath);
    const visibleSlots = Math.max(0, state.visibleLimit);
    const candidates = projectThreadCandidates(projectItem, threads).slice(0, visibleSlots);
    const list = projectThreadFallbackList(projectItem);
    const existing = new Map(Array.from(list.querySelectorAll("[data-app-action-sidebar-thread-id]")).map((row) => [projectMoveSessionKey(row.getAttribute("data-app-action-sidebar-thread-id")), row]));
    const nextIds = new Set();
    candidates.forEach((thread) => upsertProjectThreadFallbackRow(list, existing, nextIds, thread, projectPath));
    removeMissingProjectThreadRows(existing, nextIds);
    renderProjectThreadMoreButton(list, projectItem, projectPath, state, threads.length);
    setProjectEmptyStateHidden(projectItem, candidates.length > 0 || visibleProjectThreadRows(projectItem).length > 0);
  }

  function renderProjectThreadMoreButton(list, projectItem, projectPath, state, knownCount) {
    list.querySelector("[data-codex-project-thread-more]")?.remove();
    if (!state.hasMore && knownCount <= state.visibleLimit) return;
    const more = document.createElement("button");
    more.type = "button";
    more.className = "codex-project-thread-more";
    more.setAttribute("data-codex-project-thread-more", "true");
    more.textContent = state.hasMore ? "显示更多" : "显示更多已加载对话";
    more.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      loadMoreProjectThreads(projectItem, projectPath).catch((error) => showToast(`加载更多失败：${String(error?.message || error)}`, null));
    }, true);
    list.appendChild(more);
  }

  async function loadMoreProjectThreads(projectItem, projectPath) {
    const state = projectThreadState(projectPath);
    state.visibleLimit += projectThreadVisibleLimit;
    if (state.hasMore && state.cursor) {
      const result = await fetchProjectThreads(projectPath, state);
      if (result?.status === "ok" && Array.isArray(result.threads)) {
        mergeProjectThreadPage(state, result);
      }
    }
    renderProjectThreadFallback(projectItem, projectPath, state.threads || []);
  }

  function mergeProjectThreadPage(state, result) {
    const byId = new Map((state.threads || []).map((thread) => [projectMoveSessionKey(thread?.session_id || ""), thread]));
    result.threads.forEach((thread) => {
      const key = projectMoveSessionKey(thread?.session_id || "");
      if (key) byId.set(key, thread);
    });
    state.threads = Array.from(byId.values()).sort((left, right) => projectThreadSortMs(right) - projectThreadSortMs(left));
    state.cursor = result.next_cursor || "";
    state.hasMore = !!result.has_more || !!state.cursor;
  }

  function upsertProjectThreadFallbackRow(list, existing, nextIds, thread, projectPath) {
    const key = projectMoveSessionKey(thread?.session_id || "");
    if (!key) return;
    nextIds.add(key);
    const row = existing.get(key) || createProjectThreadRow(thread, projectPath);
    const item = ensureProjectThreadRowItem(list, row);
    const sortMs = projectThreadSortMs(thread);
    row.dataset.codexProjectMoveSortMs = String(sortMs || 0);
    row.setAttribute("data-app-action-sidebar-thread-title", projectThreadTitle(thread));
    const titleNode = row.querySelector("[data-thread-title]");
    if (titleNode) titleNode.textContent = projectThreadTitle(thread);
    insertRowItemByTime(list, item, row, { sortMs, sortMsTrusted: true });
  }

  function removeMissingProjectThreadRows(existing, nextIds) {
    existing.forEach((row, key) => {
      if (!nextIds.has(key)) (projectThreadRowItem(row) || row).remove();
    });
  }

  async function refreshProjectThreadFallbacks() {
    if (!codexPlusSettings().projectMove || !providerHistoryEnabled() || window.__codexProjectThreadsInFlight) return;
    const targets = nativeProjectTargets().filter((target) => projectCanRenderFallback(target.listItem));
    const incompleteTargets = targets.filter((target) => visibleProjectThreadFallbackRows(target.listItem).length < projectThreadState(target.path).visibleLimit);
    if (incompleteTargets.length === 0) return;
    window.__codexProjectThreadsInFlight = true;
    try {
      await Promise.all(incompleteTargets.map(async (target) => {
        const state = projectThreadState(target.path);
        if (!state.threads.length || (state.hasMore && state.threads.length < state.visibleLimit)) {
          const result = await fetchProjectThreads(target.path, state);
          if (result?.status === "ok" && Array.isArray(result.threads)) mergeProjectThreadPage(state, result);
        }
        renderProjectThreadFallback(target.listItem, target.path, state.threads || []);
      }));
    } finally {
      window.__codexProjectThreadsInFlight = false;
    }
  }

  function removeProjectThreadFallback(projectItem) {
    projectItem?.querySelector?.('[data-codex-project-thread-list="true"]')?.remove();
    setProjectEmptyStateHidden(projectItem, false);
  }

  function scheduleProjectThreadFallbacks(delay = 120) {
    if (!codexPlusSettings().projectMove || window.__codexProjectThreadsTimer) return;
    window.__codexProjectThreadsTimer = setTimeout(() => {
      if (window.__codexProjectMoveRuntimeId !== codexProjectMoveRuntimeId) return;
      window.__codexProjectThreadsTimer = null;
      refreshProjectThreadFallbacks().finally(() => scheduleProjectThreadFallbacks(projectThreadsRefreshIntervalMs));
    }, delay);
  }

  function updateProjectMoveEmptyStates() {
    document.querySelectorAll('[data-codex-project-move-injected-list="true"]').forEach((list) => {
      const projectItem = list.closest('[role="listitem"][aria-label]');
      const hasRows = Array.from(list.children).some((child) => child.querySelector?.("[data-app-action-sidebar-thread-id]") || child.matches?.("[data-app-action-sidebar-thread-id]"));
      if (!hasRows) list.remove();
      if (projectItem) setProjectEmptyStateHidden(projectItem, hasRows);
    });
    document.querySelectorAll('[data-codex-project-move-empty-hidden="true"]').forEach((node) => {
      const projectItem = node.closest('[role="listitem"][aria-label]');
      const list = projectItem?.querySelector?.('[data-codex-project-move-injected-list="true"]');
      if (!list || list.children.length === 0) {
        delete node.dataset.codexProjectMoveEmptyHidden;
        node.classList.remove("codex-project-move-hidden");
      }
    });
  }

  function moveRowToProjectList(row, target) {
    const projectItem = findProjectListItem(target);
    if (!projectItem) return false;
    const list = projectThreadList(projectItem, target);
    const item = rowListItem(row);
    if (!list) return false;
    insertRowItemByTime(list, item, row, target);
    cachedSessionRowsAt = 0;
    item.dataset.codexProjectMoveTargetKind = "project";
    item.dataset.codexProjectMoveTargetCwd = targetPath(target);
    row.dataset.codexProjectMoveTargetKind = "project";
    row.dataset.codexProjectMoveTargetCwd = targetPath(target);
    setProjectEmptyStateHidden(projectItem, true);
    return true;
  }

  function moveRowToChats(row, target = null) {
    const list = chatsThreadList();
    if (!list) return false;
    const item = rowListItem(row);
    insertRowItemByTime(list, item, row, target);
    cachedSessionRowsAt = 0;
    item.dataset.codexProjectMoveTargetKind = "projectless";
    row.dataset.codexProjectMoveTargetKind = "projectless";
    delete item.dataset.codexProjectMoveTargetCwd;
    delete row.dataset.codexProjectMoveTargetCwd;
    updateProjectMoveEmptyStates();
    return true;
  }

  function applyProjectMoveProjection() {
    if (!codexPlusSettings().projectMove) return;
    const projection = readProjectMoveProjection();
    const targetRowsById = new Map();
    const settledRefs = [];
    const now = Date.now();
    const rows = sessionRows(true);
    rows.forEach((row) => {
      const ref = sessionRefFromRow(row);
      const target = projectionForSessionId(ref.session_id, projection);
      if (target && rowIsUnderTarget(row, target)) {
        const rowId = projectMoveSessionKey(ref.session_id);
        const hadProjectionKind = !!rowProjectionKind(row);
        const existingRow = targetRowsById.get(rowId);
        if (existingRow && existingRow !== row) {
          const existingIsProjection = !!rowProjectionKind(existingRow);
          const currentIsProjection = !!rowProjectionKind(row);
          const rowToRemove = existingIsProjection && !currentIsProjection ? existingRow : row;
          rowListItem(rowToRemove).remove();
          if (rowToRemove === existingRow) targetRowsById.set(rowId, row);
          if (rowToRemove === row) return;
        } else {
          targetRowsById.set(rowId, row);
        }
        if (!hadProjectionKind && typeof target.at === "number" && now - target.at > projectMoveProjectionSettleMs) settledRefs.push(ref);
        const moved = target.targetKind === "projectless" ? moveRowToChats(row, target) : moveRowToProjectList(row, target);
        if (moved) targetRowsById.set(rowId, row);
        const projectItem = closestProjectListItem(row);
        if (projectItem) setProjectEmptyStateHidden(projectItem, true);
      }
    });
    rows.forEach((row) => {
      const ref = sessionRefFromRow(row);
      const rowId = projectMoveSessionKey(ref.session_id);
      const target = projectionForSessionId(ref.session_id, projection);
      if (!target) {
        const item = rowListItem(row);
        delete row.dataset.codexProjectMoveTargetKind;
        delete row.dataset.codexProjectMoveTargetCwd;
        delete item.dataset.codexProjectMoveTargetKind;
        delete item.dataset.codexProjectMoveTargetCwd;
        return;
      }
      if (rowIsUnderTarget(row, target)) return;
      if (targetRowsById.has(rowId)) {
        rowListItem(row).remove();
        return;
      }
      const moved = target.targetKind === "projectless" ? moveRowToChats(row, target) : moveRowToProjectList(row, target);
      if (moved) targetRowsById.set(rowId, row);
    });
    settledRefs.forEach(clearProjectMoveProjection);
    updateProjectMoveEmptyStates();
  }

  function scheduleProjectMoveProjection() {
    if (!codexPlusSettings().projectMove || window.__codexProjectMoveProjectionTimer) return;
    window.__codexProjectMoveProjectionTimer = setTimeout(() => {
      if (window.__codexProjectMoveRuntimeId !== codexProjectMoveRuntimeId) return;
      window.__codexProjectMoveProjectionTimer = null;
      applyProjectMoveProjection();
    }, 80);
  }

  async function refreshRecentConversationsForHost() {
    try {
      const signals = await import("./assets/app-server-manager-signals-C1h8B-R-.js");
      if (typeof signals.rn === "function") await signals.rn("refresh-recent-conversations-for-host", { hostId: "local", sortKey: "updated_at" });
    } catch (error) {
      window.__codexProjectMoveRefreshFailures = window.__codexProjectMoveRefreshFailures || [];
      window.__codexProjectMoveRefreshFailures.push(String(error?.stack || error));
    }
  }

  function refreshAfterProjectMove() {
    const refreshVisibleSidebar = () => {
      applyProjectMoveProjection();
      scheduleChatsSortCorrection(0);
    };
    refreshVisibleSidebar();
    refreshRecentConversationsForHost().finally(() => {
      projectMoveRefreshDelaysMs.forEach((delay) => setTimeout(refreshVisibleSidebar, delay));
    });
  }

  function refreshProviderHistoryUi() {
    resetProjectThreadState();
    refreshRecentConversationsForHost();
    scheduleChatsSortCorrection(0);
    refreshProjectThreadFallbacks();
    loadProviderDiagnostics();
  }

  function visibleChatsRows() {
    const list = chatsThreadList();
    if (!list) return [];
    return Array.from(list.children).map(threadRowFromListItem).filter(Boolean).filter((row) => rowIsInChats(row));
  }

  function chatsSortNeedsCorrection(rows) {
    let previousPinned = true;
    let previousSortMs = Infinity;
    let previousKey = "\uffff";
    for (const row of rows) {
      const pinned = rowPinned(row);
      const ref = sessionRefFromRow(row);
      const sortMs = rowSortMs(row, ref);
      const key = projectMoveSessionKey(ref.session_id);
      if (previousPinned && !pinned) {
        previousPinned = false;
        previousSortMs = sortMs;
        previousKey = key;
        continue;
      }
      if (!previousPinned && pinned) return true;
      if (sortMs > previousSortMs || (sortMs === previousSortMs && key > previousKey)) return true;
      previousSortMs = sortMs;
      previousKey = key;
    }
    return false;
  }

  function reorderChatsRows(rows) {
    const list = chatsThreadList();
    if (!list || rows.length < 2) return;
    const rowItems = new Set(rows.map(rowListItem));
    const firstNonThreadItem = Array.from(list.children).find((child) => !rowItems.has(child) && !threadRowFromListItem(child));
    const orderedRows = [...rows].sort((left, right) => {
      const leftPinned = rowPinned(left);
      const rightPinned = rowPinned(right);
      if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
      const leftRef = sessionRefFromRow(left);
      const rightRef = sessionRefFromRow(right);
      const leftSortMs = rowSortMs(left, leftRef);
      const rightSortMs = rowSortMs(right, rightRef);
      if (leftSortMs !== rightSortMs) return rightSortMs - leftSortMs;
      return projectMoveSessionKey(rightRef.session_id).localeCompare(projectMoveSessionKey(leftRef.session_id));
    });
    orderedRows.forEach((row) => list.insertBefore(rowListItem(row), firstNonThreadItem || null));
    cachedSessionRowsAt = 0;
  }

  async function applyChatsSortCorrection() {
    if (!codexPlusSettings().projectMove || chatsSortInFlight) return;
    const rows = visibleChatsRows();
    if (rows.length < 2) return;
    const refs = rows.map(sessionRefFromRow).filter((ref) => ref.session_id);
    const signature = refs.map((ref) => projectMoveSessionKey(ref.session_id)).join("|");
    const allRowsHaveSortMs = rows.every((row) => numericTimestamp(row.dataset.codexProjectMoveSortMs || rowListItem(row).dataset.codexProjectMoveSortMs));
    const shouldRefreshSortKeys = signature !== chatsSortSignature || !allRowsHaveSortMs || Date.now() - chatsSortLastFetchAt > chatsSortDbRefreshIntervalMs;
    if (!shouldRefreshSortKeys && !chatsSortNeedsCorrection(rows)) return;
    chatsSortInFlight = true;
    try {
      if (shouldRefreshSortKeys) {
        const result = await postJson("/thread-sort-keys", { sessions: refs }).catch(() => ({ status: "failed", sort_keys: [] }));
        chatsSortLastFetchAt = Date.now();
        const byId = new Map();
        if (result?.status === "ok" && Array.isArray(result?.sort_keys)) {
          result.sort_keys.forEach((item) => {
            const key = projectMoveSessionKey(String(item?.session_id || ""));
            if (key) byId.set(key, item);
          });
        }
        rows.forEach((row) => {
          const ref = sessionRefFromRow(row);
          const payload = byId.get(projectMoveSessionKey(ref.session_id));
          const trustedSortMs = timestampMsFromPayload(payload);
          const sortMs = trustedSortMs || sortMsForSession(ref.session_id, row.dataset.codexProjectMoveSortMs || rowListItem(row).dataset.codexProjectMoveSortMs);
          row.dataset.codexProjectMoveSortMs = String(sortMs || 0);
          rowListItem(row).dataset.codexProjectMoveSortMs = String(sortMs || 0);
          if (trustedSortMs) updateRowTimeLabel(row, trustedSortMs);
        });
      }
      if (chatsSortNeedsCorrection(rows)) reorderChatsRows(rows);
      chatsSortSignature = visibleChatsRows().map((row) => projectMoveSessionKey(sessionRefFromRow(row).session_id)).join("|");
    } finally {
      chatsSortInFlight = false;
    }
  }

  function scheduleChatsSortCorrection(delay = chatsSortRefreshIntervalMs) {
    if (!codexPlusSettings().projectMove || window.__codexProjectMoveChatsSortTimer) return;
    window.__codexProjectMoveChatsSortTimer = setTimeout(() => {
      if (window.__codexProjectMoveRuntimeId !== codexProjectMoveRuntimeId) return;
      window.__codexProjectMoveChatsSortTimer = null;
      applyChatsSortCorrection().catch((error) => {
        window.__codexProjectMoveSortFailures = window.__codexProjectMoveSortFailures || [];
        window.__codexProjectMoveSortFailures.push(String(error?.stack || error));
      }).finally(() => {
        if (codexPlusSettings().projectMove) scheduleChatsSortCorrection();
      });
    }, delay);
  }

  async function setProjectlessThreadIds(ref, mode) {
    const variants = threadIdVariants(ref.session_id);
    if (variants.length === 0) throw new Error("未找到会话 ID");
    const existingIds = await getCodexGlobalState("projectless-thread-ids").catch(() => []);
    const ids = Array.isArray(existingIds) ? existingIds : [];
    const variantSet = new Set(variants);
    const nextIds = mode === "add" ? uniqueValues([...ids, ...variants]) : ids.filter((id) => !variantSet.has(id));
    if (nextIds.length !== ids.length || nextIds.some((id, index) => id !== ids[index])) await setCodexGlobalState("projectless-thread-ids", nextIds);
  }

  async function clearThreadWorkspaceHints(ref) {
    const variants = threadIdVariants(ref.session_id);
    if (variants.length === 0) return;
    const hints = objectGlobalState(await getCodexGlobalState("thread-workspace-root-hints").catch(() => ({})));
    const hintKeys = variants.filter((id) => Object.prototype.hasOwnProperty.call(hints, id));
    if (hintKeys.length > 0) {
      hintKeys.forEach((id) => delete hints[id]);
      await setCodexGlobalState("thread-workspace-root-hints", hints);
    }
  }

  async function moveSessionToProjectless(ref) {
    if (!ref.session_id) throw new Error("未找到会话 ID");
    await setProjectlessThreadIds(ref, "add");
    await clearThreadWorkspaceHints(ref);
    const sortKey = await postJson("/thread-sort-key", ref).catch(() => ({}));
    return { status: "moved", session_id: ref.session_id, updated_at: sortKey?.updated_at, updated_at_ms: sortKey?.updated_at_ms, created_at_ms: sortKey?.created_at_ms };
  }

  function isNativeProjectTarget(target) {
    return target?.kind === "project" && nativeProjectTargets().some((project) => sameWorkspacePath(project.path, target.path));
  }

  async function moveSessionToProject(ref, target) {
    if (!ref.session_id) throw new Error("未找到会话 ID");
    if (!target?.path) throw new Error("目标项目路径为空");
    if (!isNativeProjectTarget(target)) throw new Error("目标项目不在 Codex 项目列表中");
    const result = await postJson("/move-thread-workspace", { ...ref, target_cwd: target.path });
    if (result.status !== "moved") throw new Error(result.message || "移动项目失败");
    await setProjectlessThreadIds(ref, "remove");
    await clearThreadWorkspaceHints(ref);
    return result;
  }

