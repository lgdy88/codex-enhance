# Dex update stall fix

## User Intent

彻底修复 Dex 更新时卡住的问题，重点修复 fallback MSI 更新启动时旧 Dex 进程仍占用安装目录的问题。

## Bugfix Packet

| Field | Content |
| --- | --- |
| symptom | 应用内更新 fallback 到 GitHub MSI 后，安装器启动但旧 `codex-plus-plus-manager.exe` / launcher 仍运行，MSI 替换安装目录文件时容易卡住或要求关闭应用。 |
| reproduction | 静态复现链路：签名 updater 失败 -> `installUpdateFallback` -> `installReleaseUpdate` -> Rust `perform_update` -> `launch_installer` -> `msiexec /i <msi>`，期间没有退出 manager。 |
| rootCause | fallback MSI 安装链路只下载并启动安装器，没有先释放 Dex 自身二进制文件锁；Manager 也没有托盘/单实例/update close hook 兜底。 |
| impact | 影响 Dex 应用内 fallback MSI 更新；不应影响 Codex 主程序、provider sync、插件修复、普通启动。 |
| minimalFix | 在 fallback MSI 更新成功启动安装器后触发受控退出；启动安装器前停止 Dex launcher 进程，但不终止 Codex 主进程；测试覆盖命令返回和进程行为边界。 |
| regressionEvidence | Rust updater tests + manager command tests + targeted cargo test。 |
| failedOutputLoop | 若测试失败，按失败名称和断言回到最小修复点。 |
| rollbackBoundary | 可回滚更新 fallback 退出策略相关改动，不触及安装器产物、发布流程或 Codex 注入链路。 |

## Verification Plan

- Add/adjust unit tests around `perform_update` and installer launch behavior.
- Run targeted Rust tests for updater and manager commands.
- Run `cargo fmt` and targeted `cargo test`.
- Do not run the actual MSI installer in this workspace.
