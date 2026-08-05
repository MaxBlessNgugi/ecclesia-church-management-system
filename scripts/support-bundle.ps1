# =============================================================================
# Support bundle — collect everything an engineer needs to debug a deployment
# Usage:  powershell -ExecutionPolicy Bypass -File scripts/support-bundle.ps1
# Output: support-bundles\ecclesia-support-<timestamp>.zip
# The bundle contains: versions, redacted .env, server logs, error log, a
# listing + copy of the newest backup, and (optionally) a diagnostics snapshot
# from the running API when an admin token is provided.
# =============================================================================
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$outDir = Join-Path $root 'support-bundles'
$stage = Join-Path $env:TEMP "ecclesia-support-$stamp"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Write-Host 'Collecting versions...'
"node: $(node --version 2>$null)"
"npm:  $(npm --version 2>$null)"
"cwd:  $root"
git -C $root rev-parse HEAD 2>$null | ForEach-Object { "git: $_" }
(Get-Item (Join-Path $root 'backend\package.json')).Version | ForEach-Object { "backend pkg: $_" }
(Get-Content (Join-Path $root 'backend\package.json') -Raw | ConvertFrom-Json).version | ForEach-Object { "backend appVersion: $_" }

Write-Host 'Collecting redacted .env...'
foreach ($f in @((Join-Path $root 'backend\.env'), (Join-Path $root 'backend\.env.example'))) {
  if (Test-Path $f) {
    $dest = Join-Path $stage ("redacted-" + (Split-Path $f -Leaf))
    Get-Content $f | ForEach-Object {
      if ($_ -match '^\s*(JWT_SECRET|SUPER_ADMIN_PASSWORD|consumerKey|consumerSecret|PASSWORD)\s*=') { 'REDACTED' } else { $_ }
    } | Set-Content $dest
  }
}

Write-Host 'Collecting logs...'
$logFiles = @()
$logFiles += Get-ChildItem (Join-Path $root 'backend\logs') -Filter '*.log' -ErrorAction SilentlyContinue
$logFiles += Get-ChildItem $root -Filter '*.log' -ErrorAction SilentlyContinue
$logFiles += Get-ChildItem (Join-Path $root 'backend') -Filter '*.log' -ErrorAction SilentlyContinue
foreach ($l in $logFiles | Select-Object -Unique) { Copy-Item $l.FullName $stage -ErrorAction SilentlyContinue }

Write-Host 'Collecting backup info...'
$bkDir = Join-Path $root 'backend\backups'
if (Test-Path $bkDir) {
  Get-ChildItem $bkDir -Filter '*.db' | Select-Object Name, Length, LastWriteTime | Out-File (Join-Path $stage 'backups.txt')
  $latest = Get-ChildItem $bkDir -Filter '*.db' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($latest) { Copy-Item $latest.FullName (Join-Path $stage 'latest-backup.db') }
}

Write-Host 'Optional: paste an admin JWT to include a diagnostics snapshot (blank to skip):'
$token = Read-Host 'JWT'
if ($token) {
  try {
    $diag = Invoke-RestMethod -Uri 'http://localhost:5000/api/admin/diagnostics' -Headers @{ Authorization = "Bearer $token" }
    $diag | ConvertTo-Json -Depth 6 | Out-File (Join-Path $stage 'diagnostics.json')
  } catch {
    Write-Warning "Diagnostics fetch failed: $($_.Exception.Message)"
  }
}

$zip = Join-Path $outDir "ecclesia-support-$stamp.zip"
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Write-Host "Support bundle created: $zip"
