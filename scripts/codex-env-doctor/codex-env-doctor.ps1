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

function Invoke-Repair {
    param(
        [string]$ChromeCache,
        [System.IO.DirectoryInfo]$VersionDirectory,
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
        Remove-Item -LiteralPath $latestPath -Force
    }

    New-Item -ItemType Junction -Path $latestPath -Target $VersionDirectory.FullName | Out-Null

    $installUri = ([System.Uri]::new($installManifest)).AbsoluteUri
    $payload = @{
        appServerRuntimePaths = @{
            codexCliPath = $CodexCliPath
            nodePath = $NodePath
            nodeReplPath = $NodeReplPath
        }
    } | ConvertTo-Json -Compress -Depth 5
    $js = "import('$installUri').then(m => m.install($payload))"
    & $NodePath --input-type=module -e $js
    if ($LASTEXITCODE -ne 0) {
        throw "installManifest.mjs failed with exit code $LASTEXITCODE"
    }

    [PSCustomObject]@{
        backupDir = $backupDir
        versionDirectory = $VersionDirectory.FullName
        latestPath = $latestPath
        latestTarget = (Get-Item -LiteralPath $latestPath -Force).Target -join "; "
    }
}

$homeDir = $env:USERPROFILE
$localAppData = $env:LOCALAPPDATA
$chromeCache = Join-Path $homeDir ".codex\plugins\cache\openai-bundled\chrome"
$latestPath = Join-Path $chromeCache "latest"
$binRoot = Join-Path $localAppData "OpenAI\Codex\bin"
$nativeHostsConfig = Join-Path $localAppData "OpenAI\Codex\chrome-native-hosts.json"
$nativeManifest = Join-Path $localAppData "OpenAI\extension\com.openai.codexextension.json"

$checks = New-Object System.Collections.Generic.List[object]
$versionDirectory = Get-LatestVersionDirectory $chromeCache
$versionPath = if ($versionDirectory) { $versionDirectory.FullName } else { $null }
$scriptDir = if ($versionPath) { Join-Path $versionPath "scripts" } else { $null }
$nodePath = Get-FirstExistingExecutable $binRoot "node.exe"
$codexCliPath = Get-FirstExistingExecutable $binRoot "codex.exe"
$nodeReplPath = Get-FirstExistingExecutable $binRoot "node_repl.exe"

$checks.Add((New-Check "chrome-cache" (Test-PathString $chromeCache) "Chrome plugin cache directory" @{ path = $chromeCache }))
$checks.Add((New-Check "version-directory" ($null -ne $versionDirectory) "Latest versioned chrome plugin directory" @{ path = $versionPath }))

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
    }
}
$checks.Add((New-Check "latest-link" ($latestInfo -and $latestInfo.browserClientExists -and $latestInfo.extensionHostExists) "chrome latest should expose scripts and extension-host" $latestInfo))

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
    $repairResult = Invoke-Repair $chromeCache $versionDirectory $nodePath $codexCliPath $nodeReplPath
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
    }
    $checks.Add((New-Check "latest-link" ($latestInfo.browserClientExists -and $latestInfo.extensionHostExists) "chrome latest should expose scripts and extension-host" $latestInfo))

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
