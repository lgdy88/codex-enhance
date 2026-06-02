# Dex

<p align="center">
  <img src="docs/images/dex.png" alt="Dex 图标" width="160">
</p>

<p align="center">
  中文 | [English](README_EN.md)
</p>

<p align="center">
  <img alt="Release" src="https://img.shields.io/github/v/release/lgdy88/codex-enhance">
  <img alt="License" src="https://img.shields.io/github/license/lgdy88/codex-enhance">
  <img alt="Rust" src="https://img.shields.io/badge/rust-1.85%2B-orange">
  <img alt="Tauri" src="https://img.shields.io/badge/tauri-2.x-24C8DB">
</p>

Dex 是面向 Codex App 的外部增强启动器和桌面管理工具。它通过独立 launcher 启动 Codex，并使用 Chromium DevTools Protocol 注入增强脚本；不修改 Codex App 的 `app.asar`，也不向 Codex 安装目录写入 DLL。

维护者：`lgdy88`
项目地址：[https://github.com/lgdy88/codex-enhance](https://github.com/lgdy88/codex-enhance)

## 目录

- [适用场景](#适用场景)
- [安装](#安装)
- [使用](#使用)
- [功能](#功能)
- [界面预览](#界面预览)
- [工作方式与风险边界](#工作方式与风险边界)
- [Provider History Manager](#provider-history-manager)
- [数据与备份](#数据与备份)
- [常见问题](#常见问题)
- [开发](#开发)

## 适用场景

- 需要从外部启动 Codex，并在桌面端增加本地增强菜单。
- 需要在 API Key 模式下恢复插件入口的可见性。
- 需要删除、导出或移动本地会话。
- 切换 `model_provider` 后，希望旧会话仍能在原项目下可见。

## 安装

### Windows

从 [Releases](https://github.com/lgdy88/codex-enhance/releases) 下载 Windows 安装包：

```text
Dex-<version>-windows-x64.msi
```

MSI 使用用户级安装，不需要管理员权限，默认安装到 `%LocalAppData%\Programs\Dex`。未签名版本可能出现 SmartScreen 提示，请核对 Release 中的 `SHA256SUMS-windows-latest`。

安装后会生成入口：

```text
Dex.lnk
```

双击 `Dex.lnk` 打开 Dex 管理器，可在管理界面启动带增强功能的 Codex、检查状态、修复入口、管理设置和执行更新。

### macOS

从 [Releases](https://github.com/lgdy88/codex-enhance/releases) 下载：

```text
Dex-<version>-macos-universal.dmg
```

安装后会提供 `Dex` 和 `Dex Manager` 应用入口。

### 源码运行

源码运行用于开发或调试。当前仓库已经迁移为 Rust/Tauri-only，不再提供 Python 包、`setup.bat` 或 `pytest` 入口。

```bash
cd apps/codex-plus-manager
npm install
npm run build

cd ../..
cargo build --release
```

构建后可直接运行静默启动器：

```bash
target/release/codex-plus-plus
```

也可以运行桌面管理工具：

```bash
cd apps/codex-plus-manager
npm run dev
```

## 使用

常规使用优先从安装包生成的 `Dex` 启动。静默启动器支持少量调试参数：

```bash
target/release/codex-plus-plus \
  --app-path "C:/Program Files/WindowsApps/OpenAI.Codex_xxx/app" \
  --debug-port 9229 \
  --helper-port 57321 \
  --codex-arg "--some-codex-flag"
```

管理工具提供这些入口：

- 启动或重启 Dex。
- 检查并修复静默启动入口和管理工具入口。
- 配置 Codex App 路径、启动参数、增强开关和 Provider 自动同步。
- 管理用户脚本。
- 执行 Provider History 路径修复和 metadata 收敛。
- 查看日志、诊断信息和 GitHub Release 更新。

## 功能

- 顶部 `Dex` 菜单：集中管理增强功能和本地状态。
- 插件入口解锁：让 API Key 模式显示并启用插件入口。
- 会话删除：在会话列表悬停显示删除按钮，删除前确认并支持撤销。
- Markdown 导出：按本地 rollout 导出带时间戳的会话 Markdown。
- 会话项目移动：把会话移动到普通对话或其他本地项目。
- 对话 Timeline：在对话右侧显示用户提问时间线，支持快速跳转。
- Provider History Manager：通过本地 SQLite bridge 处理跨 provider 历史可见性。
- Windows 入口安装/修复、可选 watcher、GitHub Release 更新。
- 用户脚本管理：独立扫描、开关、删除并在启动时注入。
- 移动/远程控制中心：配置 Lark / 飞书 Channel，保存飞书 App 凭据、Codex 项目、旧对话和安全策略路由，生成本地 app-server 与 bridge 参数，检查 `codex` / `node` / `lark-cli` 依赖，并提供 `/项目`、`/对话`、`/新建对话` 的命令路由预览和本地桥接启动/停止。

## 界面预览

API Key 登录模式下，Codex 原生插件入口可能要求登录 ChatGPT：

![API Key 模式下插件入口不可用](docs/images/pain-plugin-disabled.png)

Codex 原生会话列表只有归档入口，没有真正的删除按钮：

![原生会话列表缺少删除能力](docs/images/pain-no-delete-button.png)

Dex 启动后会解锁插件入口，并在会话列表悬停时显示删除按钮：

![Dex 解锁插件入口并添加删除按钮](docs/images/solution-plugin-and-delete.png)

管理工具用于检查入口、启动状态、Provider History 和日志：

![Dex 设置面板](docs/images/settings-panel.png)

## 工作方式与风险边界

Dex 使用外部启动方式运行 Codex：

1. 启动 Codex App，并附加 `--remote-debugging-port=9229`。
2. 启动本地 helper 服务，用于健康检查和本地操作。
3. 通过 CDP 注入 `assets/inject/renderer-inject.js`。
4. 渲染端通过私有 CDP bridge 调用本地服务。

边界说明：

- 不修改 Codex App 原始安装文件。
- 不绕过官方账号、地区、灰度或后端权限限制。
- 删除、路径修复、provider metadata 收敛等写操作会先备份相关本地数据。
- 可选 watcher 默认只记录状态；只有设置 `CODEX_PLUS_ALLOW_FORCE_TAKEOVER=1` 后才会尝试接管原生启动。
- 飞书远程入口是消息桥接路由，不是飞书扫码直连 Codex。Dex 会把 Lark App ID/App Secret、项目路径、Codex thread、飞书 chat/user 绑定和安全策略保存到本地远程配置；诊断和审计日志只记录是否已设置，不输出 secret 原文。
- 飞书桥接优先使用官方 Node SDK 长连接接收 `im.message.receive_v1` 和 `card.action.trigger`；缺少 SDK 运行依赖时可退回 `lark-cli` 文本事件链路。
- 远程桥接默认要求 Codex app-server 只监听 `127.0.0.1` / `::1`，并把 `approvalPolicy=never`、`danger-full-access` 标记为风险状态；不要把 app-server 直接暴露到局域网或公网。

## Provider History Manager

启用后，Dex 优先通过 `~/.codex/state_5.sqlite` 查询项目历史，不按当前 provider 过滤，并兼容 Windows `\\?\` 路径变体。

适合这些场景：

- 从 OpenAI 切换到第三方 provider 后，旧会话在 Desktop 或 `/resume` 中不可见。
- 切回其他 provider 后，希望历史对话继续出现在原项目下。
- Windows 路径带有 `\\?\` 前缀导致 Desktop 项目列表匹配不到旧会话。

路径修复只处理等价路径格式，例如 `\\?\D:\...` / `D:/...` 到 `D:\...`。它不切换 provider，也不移动会话所属项目。

兼容模式的“收敛到当前 provider”会先备份，再把历史 metadata 收敛到当前 `model_provider`。这只保证列表可见，不保证跨账号或跨 provider 的 `encrypted_content` 能续聊。

## 数据与备份

Dex 默认读取：

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

### 双击 Dex 没反应

先查看日志：

```text
%USERPROFILE%\.codex-session-delete\launcher.log
```

常见原因：

- Codex App 没有安装或路径变化。
- 9229 端口被占用。
- 快捷方式指向的 `codex-plus-plus.exe` 不存在。

### Dex 菜单没出现

确认是从 `Dex` 快捷方式启动，而不是直接启动原版 Codex。

也可以检查 Codex 是否带了 CDP 参数：

```text
--remote-debugging-port=9229
```

### 技能或 GitHub 资源加载失败

Dex 启动时会继承现有代理环境变量。也可以手动设置后再启动静默入口：

```powershell
$env:HTTP_PROXY="http://127.0.0.1:7897"
$env:HTTPS_PROXY="http://127.0.0.1:7897"
target/release/codex-plus-plus
```

## 开发

常用检查：

```bash
cargo fmt --all -- --check
cargo test --workspace

cd apps/codex-plus-manager
npm install
npm run check
npm run vite:build
```

项目结构：

```text
apps/
  codex-plus-launcher/          静默启动入口
  codex-plus-manager/           Tauri 管理工具
assets/inject/
  renderer-inject.js            注入到 Codex 渲染端的增强脚本
crates/
  codex-plus-core/              启动、注入、配置、更新、安装、桥接等核心逻辑
  codex-plus-data/              会话数据、导出、Provider 同步
scripts/installer/
  macos/package-dmg.sh          macOS DMG 打包
apps/codex-plus-manager/src-tauri/wix/
  per-user-main.wxs             Windows Tauri WiX/MSI 用户级安装模板
```

Windows 安装包由 release workflow 构建，产物命名为：

```text
Dex-<version>-windows-x64.msi
```
