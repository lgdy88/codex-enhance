# Codex Env Doctor

Windows-only helper for diagnosing Codex Chrome extension native-host drift.

The default mode is read-only:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\codex-env-doctor\codex-env-doctor.ps1
```

JSON output is available for support bundles:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\codex-env-doctor\codex-env-doctor.ps1 -Json
```

Use repair mode only after the read-only report shows missing `latest\scripts`,
missing `browser-client.mjs`, missing bundled `docs`, or stale native-host
runtime paths:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\codex-env-doctor\codex-env-doctor.ps1 -Repair
```

Repair mode only performs these actions:

- backs up `%LOCALAPPDATA%\OpenAI\Codex\chrome-native-hosts.json`
- backs up `%LOCALAPPDATA%\OpenAI\extension\com.openai.codexextension.json`
- restores missing Chrome plugin `docs` from the bundled Browser plugin docs
- repoints `%USERPROFILE%\.codex\plugins\cache\openai-bundled\chrome\latest`
  to the newest versioned bundled Chrome plugin directory
- runs the bundled `installManifest.mjs` with the detected `codex.exe`,
  `node.exe`, and `node_repl.exe`
- reruns the bundled native-host and Chrome extension checks

It does not edit `~\.codex\config.toml`, clear the whole plugin cache, register a
scheduled task, change system environment variables, or stop Chrome/Codex
processes.
