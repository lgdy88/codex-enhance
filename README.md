# Codex++

<p align="center">
  <img src="docs/images/codex-plus-plus.png" alt="Codex++ 图标" width="160">
</p>

<p align="center">
  中文 | [English](README_EN.md)
</p>

<p align="center">
  <img alt="Release" src="https://img.shields.io/github/v/release/lgdy88/codex-enhance">
  <img alt="License" src="https://img.shields.io/github/license/lgdy88/codex-enhance">
  <img alt="Python" src="https://img.shields.io/badge/python-3.11%2B-blue">
</p>

Codex++ 是面向 Codex App 的外部增强启动器。它通过外部 launcher 启动 Codex，并使用 Chromium DevTools Protocol 注入增强脚本；不修改 Codex App 的 `app.asar`，也不向 Codex 安装目录写入 DLL。

维护者：`lgdy88`
项目地址：[https://github.com/lgdy88/codex-enhance](https://github.com/lgdy88/codex-enhance)

## 目录

- [适用场景](#适用场景)
- [安装](#安装)
- [使用](#使用)
- [功能](#功能)
- [界面预览](#界面预览)
- [工作方式与风险边界](#工作方式与风险边界)
- [数据与备份](#数据与备份)
- [常见问题](#常见问题)
- [开发](#开发)

## 适用场景

- 需要从外部启动 Codex，并在桌面端增加本地增强菜单。
- 需要在 API Key 模式下恢复插件入口的可见性。
- 需要删除、导出或移动本地会话。
- 切换 `model_provider` 后，希望旧会话仍能在原项目下可见。
- 需要快速写入 Chrome DevTools MCP / Playwright MCP 配置。

## 安装

### Windows 推荐方式

从 [Releases](https://github.com/lgdy88/codex-enhance/releases) 下载 Windows 安装包：

```text
CodexPlusPlus-<version>-windows-x64-setup.exe
```

安装后会生成两个入口：

```text
Codex++.lnk
Codex++ 管理工具.lnk
```

双击 `Codex++.lnk` 启动带增强功能的 Codex。双击 `Codex++ 管理工具.lnk` 可以检查状态、修复入口、管理设置和执行更新。

### macOS

从 [Releases](https://github.com/lgdy88/codex-enhance/releases) 下载：

```text
CodexPlusPlus-<version>-macos-universal.dmg
```

安装后会提供 `Codex++` 和 `Codex++ 管理工具` 两个应用入口。

### 源码安装

源码安装主要用于开发或调试：

```bash
python -m pip install -e .
python -m codex_session_delete setup
```

Windows 也可以双击项目根目录的 `setup.bat` 创建虚拟环境并安装源码版本。公开使用优先选择 Release 安装包。

## 使用

直接启动：

```bash
python -m codex_session_delete launch
```

手动指定 Codex 应用路径：

```bash
python -m codex_session_delete launch \
  --app-dir "C:/Program Files/WindowsApps/OpenAI.Codex_xxx/app" \
  --debug-port 9229 \
  --helper-port 57321
```

检查和更新：

```bash
python -m codex_session_delete check-update
python -m codex_session_delete update
```

卸载源码安装入口：

```bash
python -m codex_session_delete remove
```

同时删除 Codex++ 自己的日志和备份数据：

```bash
python -m codex_session_delete remove --remove-data
```

## 功能

- 顶部 `Codex++` 菜单：集中管理增强功能和本地状态。
- 插件入口解锁：让 API Key 模式显示并启用插件入口。
- 会话删除：在会话列表悬停显示删除按钮，删除前确认并支持撤销。
- Markdown 导出：按本地 rollout 导出带时间戳的会话 Markdown。
- 会话项目移动：把会话移动到普通对话或其他本地项目。
- 对话 Timeline：在对话右侧显示用户提问时间线，支持快速跳转。
- Provider History Manager：通过本地 SQLite bridge 处理跨 provider 历史可见性。
- Browser MCP：写入 Chrome DevTools MCP 和 Playwright MCP 配置。
- Windows 入口安装/修复、可选 watcher、GitHub Release 更新。

## 界面预览

API Key 登录模式下，Codex 原生插件入口可能要求登录 ChatGPT：

![API Key 模式下插件入口不可用](docs/images/pain-plugin-disabled.png)

Codex 原生会话列表只有归档入口，没有真正的删除按钮：

![原生会话列表缺少删除能力](docs/images/pain-no-delete-button.png)

Codex++ 启动后会解锁插件入口，并在会话列表悬停时显示删除按钮：

![Codex++ 解锁插件入口并添加删除按钮](docs/images/solution-plugin-and-delete.png)

管理工具用于检查入口、启动状态、Browser MCP、Provider History 和日志：

![Codex++ 设置面板](docs/images/settings-panel.png)

## 工作方式与风险边界

Codex++ 使用外部启动方式运行 Codex：

1. 启动 Codex App，并附加 `--remote-debugging-port=9229`。
2. 启动本地 helper 服务，用于健康检查和本地操作。
3. 通过 CDP 注入 `renderer-inject.js`。
4. 渲染端通过私有 CDP bridge 调用本地服务。

边界说明：

- 不修改 Codex App 原始安装文件。
- 不绕过官方账号、地区、灰度或后端权限限制。
- Browser MCP 只写入本机 Codex 配置，不读取或展示 token、DSN、完整命令参数。
- 删除、路径修复、provider metadata 收敛等写操作会先备份相关本地数据。
- 可选 watcher 默认只记录状态；只有设置 `CODEX_PLUS_ALLOW_FORCE_TAKEOVER=1` 后才会尝试接管原生启动。

## Provider History Manager

启用后，Codex++ 优先通过 `~/.codex/state_5.sqlite` 查询项目历史，不按当前 provider 过滤，并兼容 Windows `\\?\` 路径变体。

适合这些场景：

- 从 OpenAI 切换到第三方 provider 后，旧会话在 Desktop 或 `/resume` 中不可见。
- 切回其他 provider 后，希望历史对话继续出现在原项目下。
- Windows 路径带有 `\\?\` 前缀导致 Desktop 项目列表匹配不到旧会话。

路径修复只处理等价路径格式，例如 `\\?\D:\...` / `D:/...` 到 `D:\...`。它不切换 provider，也不移动会话所属项目。

手动执行路径修复：

```bash
python -m codex_session_delete provider-repair-paths
```

兼容模式的“收敛到当前 provider”会先备份，再把历史 metadata 收敛到当前 `model_provider`。这只保证列表可见，不保证跨账号或跨 provider 的 `encrypted_content` 能续聊。

## Browser MCP

安装、查看、移除浏览器 MCP：

```bash
python -m codex_session_delete mcp-install all
python -m codex_session_delete mcp-status
python -m codex_session_delete mcp-remove all
```

管理的条目：

- `chrome-devtools`：使用 `chrome-devtools-mcp@latest`，用于查看 Chrome 页面、Console、Network、DOM 和性能信息。
- `playwright`：使用 `@playwright/mcp@latest --browser=chrome --caps=devtools`，用于浏览器自动化和页面状态采集。

如果 Chrome 不支持默认 `--autoConnect`，可以指定远程调试端口：

```bash
python -m codex_session_delete mcp-install chrome-devtools --chrome-mode browser-url --browser-url http://127.0.0.1:9222
```

这不会绕过官方 Computer Use 的账号、地区、灰度或后端限制。

## 数据与备份

Codex++ 默认读取：

```text
~/.codex/state_5.sqlite
```

删除前备份目录：

```text
~/.codex-session-delete/backups
```

Provider History Manager 路径修复和 metadata 收敛备份目录：

```text
~/.codex/backups_state/provider-sync
```

隐藏启动失败日志：

```text
~/.codex-session-delete/launcher.log
```

## 常见问题

### 双击 Codex++ 没反应

先查看日志：

```text
%USERPROFILE%\.codex-session-delete\launcher.log
```

常见原因：

- Codex App 没有安装或路径变化。
- 9229 端口被占用。
- 快捷方式指向的 `codex-plus-plus.exe` 不存在。

### Codex++ 菜单没出现

确认是从 `Codex++` 快捷方式启动，而不是直接启动原版 Codex。

也可以检查 Codex 是否带了 CDP 参数：

```text
--remote-debugging-port=9229
```

### Chrome Computer Use 连接异常

修复本机 Chrome 扩展和 Codex Native Host 连接：

```bash
python -m codex_session_delete chrome-repair
```

该命令不会伪造官方后端，也不会绕过账号、地区或功能灰度限制。执行后请重启 Chrome 和 Codex。

### 技能或 GitHub 资源加载失败

Codex++ 启动时会继承现有代理环境变量。也可以手动指定：

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
python -m codex_session_delete launch
```

## 开发

安装测试依赖：

```bash
python -m pip install -e .[test]
```

常用检查：

```bash
python -m pytest -q
node --check codex_session_delete/inject/renderer-inject.js
python scripts/disposable_cdp_smoke.py
```

修改注入脚本时先改 `codex_session_delete/inject_src/*.js`，再生成单文件产物：

```bash
python scripts/build_renderer_inject.py
```

桌面管理器相关命令：

```bash
cd apps/codex-plus-manager
npm install
npm run check
npm run build
```

Windows 安装包由 release workflow 构建，产物命名为：

```text
CodexPlusPlus-<version>-windows-x64-setup.exe
```
