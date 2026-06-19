param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^\d+\.\d+\.\d+$')]
  [string]$Version,

  [string]$Repo = "lgdy88/codex-enhance",

  [switch]$VerifyOnly,
  [switch]$SkipLocalChecks,
  [switch]$SkipLocalBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Tag = "v$Version"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [string]$WorkingDirectory = $Root
  )

  Write-Host "+ $FilePath $($ArgumentList -join ' ')"
  Push-Location $WorkingDirectory
  try {
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
    }
  } finally {
    Pop-Location
  }
}

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Get-JsonCommand {
  param([string]$FilePath, [string[]]$ArgumentList)
  $output = & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $FilePath $($ArgumentList -join ' ')"
  }
  return ($output | Out-String | ConvertFrom-Json)
}

function Assert-VersionSources {
  Write-Step "Checking version sources"

  $checks = @(
    @{ path = "Cargo.toml"; pattern = 'version = "' + $Version + '"' },
    @{ path = "apps/codex-plus-manager/package.json"; pattern = '"version": "' + $Version + '"' },
    @{ path = "apps/codex-plus-manager/package-lock.json"; pattern = '"version": "' + $Version + '"' },
    @{ path = "apps/codex-plus-manager/src-tauri/tauri.conf.json"; pattern = '"version": "' + $Version + '"' }
  )

  foreach ($check in $checks) {
    $absolutePath = Join-Path $Root $check.path
    $content = Get-Content -LiteralPath $absolutePath -Raw
    if (-not $content.Contains($check.pattern)) {
      throw "Version source mismatch: $($check.path) does not contain $($check.pattern)"
    }
    Write-Host "ok $($check.path)"
  }
}

function Clear-StaleLocalArtifacts {
  Write-Step "Removing stale local Dex artifacts"

  $stalePatterns = @(
    "desktop-dist/Dex-*-windows-x64.msi",
    "target/release/bundle/msi/Dex_*_x64_*.msi",
    "dist/release"
  )

  foreach ($pattern in $stalePatterns) {
    $absolutePattern = Join-Path $Root $pattern
    $items = Get-ChildItem -Path $absolutePattern -Force -ErrorAction SilentlyContinue
    foreach ($item in $items) {
      $isCurrentWindowsMsi =
        $item.Name -eq "Dex-$Version-windows-x64.msi" -or
        $item.Name -like "Dex_$($Version)_x64_*.msi"
      if ($isCurrentWindowsMsi) {
        Write-Host "keep $($item.FullName)"
        continue
      }

      Write-Host "remove $($item.FullName)"
      Remove-Item -LiteralPath $item.FullName -Recurse -Force
    }
  }
}

function Invoke-LocalChecks {
  if ($SkipLocalChecks) {
    Write-Step "Skipping local checks"
    return
  }

  Write-Step "Running local checks"
  Invoke-Checked "cargo" @("fmt", "--all", "--", "--check")
  Invoke-Checked "cargo" @("test", "-p", "codex-plus-core", "--test", "updater")
  Invoke-Checked "cargo" @("test", "-p", "codex-plus-manager", "--test", "windows_subsystem")
  Invoke-Checked "npm" @("run", "check") (Join-Path $Root "apps/codex-plus-manager")
}

function Invoke-LocalBuild {
  if ($SkipLocalBuild) {
    Write-Step "Skipping local build"
    return
  }

  Write-Step "Building local Windows launcher and frontend"
  Invoke-Checked "cargo" @("build", "--release", "-p", "codex-plus-launcher")
  Invoke-Checked "npm" @("run", "vite:build") (Join-Path $Root "apps/codex-plus-manager")
}

function Publish-Release {
  if ($VerifyOnly) {
    Write-Step "Verify-only mode: not creating tag or release"
    return
  }

  Write-Step "Publishing GitHub release"
  $status = (& git -C $Root status --porcelain)
  if ($status) {
    throw "Worktree must be clean before publishing a release."
  }

  $existingTag = (& git -C $Root tag --list $Tag)
  if (-not $existingTag) {
    Invoke-Checked "git" @("-C", $Root, "tag", "-a", $Tag, "-m", "Dex $Version")
  }

  Invoke-Checked "git" @("-C", $Root, "push", "origin", $Tag)

  $releaseExists = $true
  & gh release view $Tag --repo $Repo *> $null
  if ($LASTEXITCODE -ne 0) {
    $releaseExists = $false
  }

  if (-not $releaseExists) {
    Invoke-Checked "gh" @(
      "release", "create", $Tag,
      "--repo", $Repo,
      "--title", "Dex $Version",
      "--notes", "Dex $Version release."
    )
  }

  $runs = Get-JsonCommand "gh" @(
    "run", "list",
    "--repo", $Repo,
    "--workflow", "release-assets.yml",
    "--event", "release",
    "--limit", "10",
    "--json", "databaseId,headSha,status,conclusion,displayTitle,createdAt"
  )
  $run = $runs | Where-Object { $_.displayTitle -eq "Dex $Version" } | Select-Object -First 1
  if (-not $run) {
    throw "Could not find release-assets workflow run for Dex $Version"
  }

  Invoke-Checked "gh" @("run", "watch", [string]$run.databaseId, "--repo", $Repo, "--exit-status")
}

function Assert-RemoteRelease {
  Write-Step "Checking remote release assets"

  $release = Get-JsonCommand "gh" @(
    "release", "view", $Tag,
    "--repo", $Repo,
    "--json", "assets,tagName,url,isDraft,isPrerelease,publishedAt"
  )

  if ($release.tagName -ne $Tag) {
    throw "Release tag mismatch: expected $Tag, got $($release.tagName)"
  }
  if ($release.isDraft -or $release.isPrerelease) {
    throw "Release must be published and non-prerelease."
  }

  $assetNames = @($release.assets | ForEach-Object { $_.name })
  $expected = @(
    "Dex-$Version-windows-x64.msi",
    "Dex-$Version-windows-x64.msi.sig",
    "Dex-$Version-macos-universal.dmg",
    "latest.json",
    "SHA256SUMS-windows-latest",
    "SHA256SUMS-macos-latest"
  )

  foreach ($name in $expected) {
    if ($assetNames -notcontains $name) {
      throw "Missing release asset: $name"
    }
  }

  $staleDexAssets = $assetNames | Where-Object {
    $_ -match '^Dex-\d+\.\d+\.\d+-' -and $_ -notmatch "^Dex-$([regex]::Escape($Version))-"
  }
  if ($staleDexAssets) {
    throw "Stale Dex assets found in $Tag`: $($staleDexAssets -join ', ')"
  }

  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) "dex-release-$Version-check"
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Path $tmp | Out-Null
  Invoke-Checked "gh" @(
    "release", "download", $Tag,
    "--repo", $Repo,
    "--pattern", "latest.json",
    "--pattern", "SHA256SUMS-windows-latest",
    "--dir", $tmp
  )

  $latestPath = Join-Path $tmp "latest.json"
  $latest = [System.IO.File]::ReadAllText(
    $latestPath,
    [System.Text.Encoding]::UTF8
  ) | ConvertFrom-Json
  if ($latest.version -ne $Version) {
    throw "latest.json version mismatch: expected $Version, got $($latest.version)"
  }
  $windows = $latest.platforms."windows-x86_64"
  if (-not $windows) {
    throw "latest.json missing windows-x86_64 platform"
  }
  if ($windows.url -notlike "*Dex-$Version-windows-x64.msi") {
    throw "latest.json Windows URL points at wrong asset: $($windows.url)"
  }
  if (-not $windows.signature) {
    throw "latest.json Windows signature is empty"
  }

  $sumsPath = Join-Path $tmp "SHA256SUMS-windows-latest"
  $sums = [System.IO.File]::ReadAllText(
    $sumsPath,
    [System.Text.Encoding]::UTF8
  )
  if (-not $sums.Contains("Dex-$Version-windows-x64.msi")) {
    throw "SHA256SUMS-windows-latest missing Dex-$Version-windows-x64.msi"
  }
  $sumDexAssets = [regex]::Matches($sums, 'Dex-\d+\.\d+\.\d+-windows-x64\.msi') |
    ForEach-Object { $_.Value } |
    Select-Object -Unique
  $staleSumAssets = $sumDexAssets | Where-Object { $_ -ne "Dex-$Version-windows-x64.msi" }
  if ($staleSumAssets) {
    throw "SHA256SUMS-windows-latest contains stale Windows MSI: $($staleSumAssets -join ', ')"
  }

  Write-Host "release ok $($release.url)"
}

Assert-Command "git"
Assert-Command "gh"
Assert-Command "cargo"
Assert-Command "npm"

Assert-VersionSources
Clear-StaleLocalArtifacts
Invoke-LocalChecks
Invoke-LocalBuild
Publish-Release
Assert-RemoteRelease

Write-Step "Done"
