param(
    [switch]$Repair,
    [switch]$Json
)

$ErrorActionPreference = "Stop"

function New-Check {
    param(
        [string]$Name,
        [bool]$Ok,
        [string]$Message,
        [object]$Data = $null
    )

    [PSCustomObject]@{
        name = $Name
        ok = $Ok
        message = $Message
        data = $Data
    }
}

function Get-LatestVersionDirectory {
    param([string]$ChromeCache)

    if (-not (Test-Path -LiteralPath $ChromeCache)) {
        return $null
    }

    Get-ChildItem -LiteralPath $ChromeCache -Directory -Force |
        Where-Object { $_.Name -match '^\d+\.\d+\.\d+$' } |
        Sort-Object { [version]$_.Name } -Descending |
        Select-Object -First 1
}

function Get-FirstExistingExecutable {
    param(
        [string]$Root,
        [string]$Name
    )

    if (-not (Test-Path -LiteralPath $Root)) {
        return $null
    }

    Get-ChildItem -LiteralPath $Root -Recurse -Filter $Name -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

function Test-PathString {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    Test-Path -LiteralPath $Path
}

function Invoke-NodeJsonScript {
    param(
        [string]$NodePath,
        [string]$ScriptPath
    )

    if (-not (Test-PathString $NodePath) -or -not (Test-PathString $ScriptPath)) {
        return $null
    }

    $output = & $NodePath $ScriptPath --json 2>&1
    $exitCode = $LASTEXITCODE
    [PSCustomObject]@{
        exitCode = $exitCode
        output = ($output -join "`n")
        json = if ($exitCode -eq 0) { ($output -join "`n" | ConvertFrom-Json) } else { $null }
    }
}

function Backup-IfPresent {
    param(
        [string]$Path,
        [string]$BackupDir
    )

    if (Test-Path -LiteralPath $Path) {
        Copy-Item -LiteralPath $Path -Destination (Join-Path $BackupDir (Split-Path -Leaf $Path)) -Force
    }
}

function Copy-DocsIfMissing {
    param(
        [System.IO.DirectoryInfo]$ChromeVersionDirectory,
        [System.IO.DirectoryInfo]$BrowserVersionDirectory
    )

    if ($null -eq $BrowserVersionDirectory) {
        throw "Missing bundled browser plugin version directory"
    }

    $chromeDocs = Join-Path $ChromeVersionDirectory.FullName "docs"
    $browserDocs = Join-Path $BrowserVersionDirectory.FullName "docs"
    if (Test-PathString $chromeDocs) {
        return $false
    }
    if (-not (Test-PathString $browserDocs)) {
        throw "Missing browser docs source: $browserDocs"
    }

    Copy-Item -LiteralPath $browserDocs -Destination $chromeDocs -Recurse -Force
    return $true
}

function Update-NativeHostsConfigFile {
    param(
        [string]$NativeHostsConfig,
        [string]$LatestPath,
        [System.IO.DirectoryInfo]$VersionDirectory,
        [string]$NodePath,
        [string]$CodexCliPath,
        [string]$NodeReplPath
    )

    $existingHost = $null
    if (Test-Path -LiteralPath $NativeHostsConfig) {
        $existing = Get-Content -LiteralPath $NativeHostsConfig -Raw | ConvertFrom-Json
        if ($existing.chromeNativeHosts -and $existing.chromeNativeHosts.Count -gt 0) {
            $existingHost = $existing.chromeNativeHosts[0]
        }
    }

    $hostConfigEntry = [ordered]@{
        schemaVersion = 1
        browserClientPath = Join-Path $LatestPath "scripts\browser-client.mjs"
        codexCliPath = $CodexCliPath
        codexHome = Join-Path $env:USERPROFILE ".codex"
        extensionHostPath = Join-Path $LatestPath "extension-host\windows\x64\extension-host.exe"
        extensionIds = @("hehggadaopoacecdllhhajmbjkdcmajg")
        nativeHostName = "com.openai.codexextension"
        nodePath = $NodePath
        nodeReplPath = $NodeReplPath
        pluginVersion = $VersionDirectory.Name
        proxyHost = if ($existingHost -and $existingHost.proxyHost) { $existingHost.proxyHost } else { "127.0.0.1" }
        proxyPort = if ($existingHost -and $null -ne $existingHost.proxyPort) { [int]$existingHost.proxyPort } else { 0 }
        resourcesPath = if ($existingHost -and $existingHost.resourcesPath) { $existingHost.resourcesPath } else { "" }
        updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    }

    $payload = [ordered]@{
        schemaVersion = 1
        chromeNativeHosts = @($hostConfigEntry)
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $NativeHostsConfig) -Force | Out-Null
    $payload | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $NativeHostsConfig -Encoding UTF8
}

function Invoke-Repair {
    param(
        [string]$ChromeCache,
        [System.IO.DirectoryInfo]$VersionDirectory,
        [System.IO.DirectoryInfo]$BrowserVersionDirectory,
        [string]$NodePath,
        [string]$CodexCliPath,
        [string]$NodeReplPath
    )

    $latestPath = Join-Path $ChromeCache "latest"
    $installManifest = Join-Path $VersionDirectory.FullName "scripts\installManifest.mjs"
    $browserClient = Join-Path $VersionDirectory.FullName "scripts\browser-client.mjs"

    if (-not (Test-PathString $installManifest)) {
        throw "Missing installManifest.mjs: $installManifest"
    }
    if (-not (Test-PathString $browserClient)) {
        throw "Missing browser-client.mjs: $browserClient"
    }
    foreach ($runtimePath in @($NodePath, $CodexCliPath, $NodeReplPath)) {
        if (-not (Test-PathString $runtimePath)) {
            throw "Missing runtime executable: $runtimePath"
        }
    }

    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\repair-backups\chrome-$timestamp"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

    Backup-IfPresent (Join-Path $env:LOCALAPPDATA "OpenAI\Codex\chrome-native-hosts.json") $backupDir
    Backup-IfPresent (Join-Path $env:LOCALAPPDATA "OpenAI\extension\com.openai.codexextension.json") $backupDir

    $docsCopied = Copy-DocsIfMissing $VersionDirectory $BrowserVersionDirectory

    $latestBefore = $null
    if (Test-Path -LiteralPath $latestPath) {
        $latestBefore = Get-Item -LiteralPath $latestPath -Force
        [PSCustomObject]@{
            path = $latestBefore.FullName
            mode = $latestBefore.Mode
            linkType = $latestBefore.LinkType
            target = ($latestBefore.Target -join "; ")
        } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $backupDir "latest-before.json") -Encoding UTF8

        if ($latestBefore.LinkType -ne "Junction") {
            throw "Refusing to replace chrome latest because it is not a junction: $latestPath"
        }
        [System.IO.Directory]::Delete($latestPath, $false)
    }

    New-Item -ItemType Junction -Path $latestPath -Target $VersionDirectory.FullName | Out-Null

    $installUri = ([System.Uri]::new($installManifest)).AbsoluteUri
    $payloadJson = @{
        appServerRuntimePaths = @{
            codexCliPath = $CodexCliPath
            nodePath = $NodePath
            nodeReplPath = $NodeReplPath
        }
    } | ConvertTo-Json -Compress -Depth 5
    $payloadBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($payloadJson))
    $js = "const payload = JSON.parse(Buffer.from('$payloadBase64', 'base64').toString('utf8')); import('$installUri').then(m => m.install(payload))"
    & $NodePath --input-type=module -e $js
    if ($LASTEXITCODE -ne 0) {
        throw "installManifest.mjs failed with exit code $LASTEXITCODE"
    }

    $nativeHostsConfig = Join-Path $env:LOCALAPPDATA "OpenAI\Codex\chrome-native-hosts.json"
    Update-NativeHostsConfigFile $nativeHostsConfig $latestPath $VersionDirectory $NodePath $CodexCliPath $NodeReplPath

    [PSCustomObject]@{
        backupDir = $backupDir
        versionDirectory = $VersionDirectory.FullName
        docsCopied = $docsCopied
        latestPath = $latestPath
        latestTarget = (Get-Item -LiteralPath $latestPath -Force).Target -join "; "
    }
}

$homeDir = $env:USERPROFILE
$localAppData = $env:LOCALAPPDATA
$chromeCache = Join-Path $homeDir ".codex\plugins\cache\openai-bundled\chrome"
$browserCache = Join-Path $homeDir ".codex\plugins\cache\openai-bundled\browser"
$latestPath = Join-Path $chromeCache "latest"
$binRoot = Join-Path $localAppData "OpenAI\Codex\bin"
$nativeHostsConfig = Join-Path $localAppData "OpenAI\Codex\chrome-native-hosts.json"
$nativeManifest = Join-Path $localAppData "OpenAI\extension\com.openai.codexextension.json"

$checks = New-Object System.Collections.Generic.List[object]
$versionDirectory = Get-LatestVersionDirectory $chromeCache
$browserVersionDirectory = Get-LatestVersionDirectory $browserCache
$versionPath = if ($versionDirectory) { $versionDirectory.FullName } else { $null }
$browserVersionPath = if ($browserVersionDirectory) { $browserVersionDirectory.FullName } else { $null }
$scriptDir = if ($versionPath) { Join-Path $versionPath "scripts" } else { $null }
$nodePath = Get-FirstExistingExecutable $binRoot "node.exe"
$codexCliPath = Get-FirstExistingExecutable $binRoot "codex.exe"
$nodeReplPath = Get-FirstExistingExecutable $binRoot "node_repl.exe"

$checks.Add((New-Check "chrome-cache" (Test-PathString $chromeCache) "Chrome plugin cache directory" @{ path = $chromeCache }))
$checks.Add((New-Check "version-directory" ($null -ne $versionDirectory) "Latest versioned chrome plugin directory" @{ path = $versionPath }))
$checks.Add((New-Check "browser-docs-source" ($browserVersionDirectory -and (Test-PathString (Join-Path $browserVersionDirectory.FullName "docs"))) "Bundled browser docs source for Chrome browser-client" @{ path = $browserVersionPath }))

$latestInfo = $null
if (Test-Path -LiteralPath $latestPath) {
    $latestItem = Get-Item -LiteralPath $latestPath -Force
    $latestInfo = [PSCustomObject]@{
        path = $latestItem.FullName
        mode = $latestItem.Mode
        linkType = $latestItem.LinkType
        target = ($latestItem.Target -join "; ")
        scriptsExists = Test-PathString (Join-Path $latestPath "scripts")
        browserClientExists = Test-PathString (Join-Path $latestPath "scripts\browser-client.mjs")
        extensionHostExists = Test-PathString (Join-Path $latestPath "extension-host\windows\x64\extension-host.exe")
        docsExists = Test-PathString (Join-Path $latestPath "docs")
    }
}
$checks.Add((New-Check "latest-link" ($latestInfo -and $latestInfo.browserClientExists -and $latestInfo.extensionHostExists -and $latestInfo.docsExists) "chrome latest should expose scripts, extension-host, and docs" $latestInfo))

$chromeDocsInfo = $null
if ($versionDirectory) {
    $chromeDocsInfo = [PSCustomObject]@{
        path = Join-Path $versionDirectory.FullName "docs"
        exists = Test-PathString (Join-Path $versionDirectory.FullName "docs")
    }
}
$checks.Add((New-Check "chrome-docs" ($chromeDocsInfo -and $chromeDocsInfo.exists) "Versioned Chrome plugin should include packaged browser docs" $chromeDocsInfo))

$runtimePaths = [PSCustomObject]@{
    nodePath = $nodePath
    codexCliPath = $codexCliPath
    nodeReplPath = $nodeReplPath
}
$checks.Add((New-Check "runtime-paths" ((Test-PathString $nodePath) -and (Test-PathString $codexCliPath) -and (Test-PathString $nodeReplPath)) "Codex app runtime executables" $runtimePaths))

$hostConfigPaths = $null
if (Test-Path -LiteralPath $nativeHostsConfig) {
    $hostConfig = Get-Content -LiteralPath $nativeHostsConfig -Raw | ConvertFrom-Json
    $firstHost = if ($hostConfig.chromeNativeHosts -and $hostConfig.chromeNativeHosts.Count -gt 0) { $hostConfig.chromeNativeHosts[0] } else { $null }
    if ($firstHost) {
        $hostConfigPaths = @("browserClientPath", "codexCliPath", "extensionHostPath", "nodePath", "nodeReplPath") |
            ForEach-Object {
                $value = $firstHost.$_
                [PSCustomObject]@{
                    name = $_
                    path = $value
                    exists = Test-PathString $value
                }
            }
    }
}
$hostConfigOk = $hostConfigPaths -and -not (($hostConfigPaths | Where-Object { -not $_.exists }) | Select-Object -First 1)
$checks.Add((New-Check "chrome-native-hosts-json" ([bool]$hostConfigOk) "Runtime host config path references" @{ path = $nativeHostsConfig; paths = $hostConfigPaths }))

$manifestResult = $null
$extensionResult = $null
if ($scriptDir -and $nodePath) {
    $manifestResult = Invoke-NodeJsonScript $nodePath (Join-Path $scriptDir "check-native-host-manifest.js")
    $extensionResult = Invoke-NodeJsonScript $nodePath (Join-Path $scriptDir "check-extension-installed.js")
}
$checks.Add((New-Check "native-host-manifest" ($manifestResult -and $manifestResult.json.correct) "Official native host manifest check" $manifestResult))
$checks.Add((New-Check "chrome-extension-installed" ($extensionResult -and $extensionResult.json.installed -and $extensionResult.json.enabled) "Official Chrome extension install check" $extensionResult))

$repairResult = $null
if ($Repair) {
    $repairResult = Invoke-Repair $chromeCache $versionDirectory $browserVersionDirectory $nodePath $codexCliPath $nodeReplPath
    $checks = New-Object System.Collections.Generic.List[object]

    $latestItem = Get-Item -LiteralPath $latestPath -Force
    $latestInfo = [PSCustomObject]@{
        path = $latestItem.FullName
        mode = $latestItem.Mode
        linkType = $latestItem.LinkType
        target = ($latestItem.Target -join "; ")
        scriptsExists = Test-PathString (Join-Path $latestPath "scripts")
        browserClientExists = Test-PathString (Join-Path $latestPath "scripts\browser-client.mjs")
        extensionHostExists = Test-PathString (Join-Path $latestPath "extension-host\windows\x64\extension-host.exe")
        docsExists = Test-PathString (Join-Path $latestPath "docs")
    }
    $checks.Add((New-Check "latest-link" ($latestInfo.browserClientExists -and $latestInfo.extensionHostExists -and $latestInfo.docsExists) "chrome latest should expose scripts, extension-host, and docs" $latestInfo))

    $manifestResult = Invoke-NodeJsonScript $nodePath (Join-Path $scriptDir "check-native-host-manifest.js")
    $extensionResult = Invoke-NodeJsonScript $nodePath (Join-Path $scriptDir "check-extension-installed.js")
    $checks.Add((New-Check "native-host-manifest" ($manifestResult -and $manifestResult.json.correct) "Official native host manifest check" $manifestResult))
    $checks.Add((New-Check "chrome-extension-installed" ($extensionResult -and $extensionResult.json.installed -and $extensionResult.json.enabled) "Official Chrome extension install check" $extensionResult))
}

$failed = @($checks | Where-Object { -not $_.ok })
$report = [PSCustomObject]@{
    status = if ($failed.Count -eq 0) { "ok" } elseif ($Repair) { "repair_failed" } else { "needs_repair" }
    repaired = [bool]$Repair
    repairResult = $repairResult
    checks = $checks
}

if ($Json) {
    $report | ConvertTo-Json -Depth 12
    exit $(if ($failed.Count -eq 0) { 0 } else { 1 })
}

"Codex Env Doctor: $($report.status)"
if ($repairResult) {
    "Repair backup: $($repairResult.backupDir)"
}
foreach ($check in $checks) {
    $mark = if ($check.ok) { "OK" } else { "FAIL" }
    "$mark  $($check.name) - $($check.message)"
}

if ($failed.Count -gt 0 -and -not $Repair) {
    ""
    "Run with -Repair to refresh the chrome latest junction and reinstall the official native host manifest/config."
}

exit $(if ($failed.Count -eq 0) { 0 } else { 1 })
