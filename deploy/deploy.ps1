<#
.SYNOPSIS
  Push local code changes to the live production site (ground-code.com).
  NOTE: superseded by the root-level deploy.ps1 (used by deploy-panel/) - this standalone
  script is kept for manual one-off use, e.g. when deploy-panel isn't available.

.DESCRIPTION
  1. Builds the React app locally (npm run build).
  2. Commits + pushes to GitHub (multi-tenant branch) - you'll be prompted
     for a commit message if you don't pass -Message.
  3. SSHes into the server and pulls the latest code (updates all PHP files).
  4. Zips the freshly-built dist/ folder and uploads+extracts it into
     public_html/dist/ on the server (this part is NOT tracked by git,
     so it has to be pushed separately every time the frontend changes).

.PARAMETER Message
  Git commit message. If omitted, you'll be prompted.

.PARAMETER SkipBuild
  Skip the npm build + dist upload step (use when you only changed PHP files).

.EXAMPLE
  .\deploy\deploy.ps1 -Message "fix: guest checkout rounding"
#>
param(
    [string]$Message,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$sshKey = "$env:USERPROFILE\Documents\Downloads\github_cpanel"   # passphrase-protected - ssh will prompt you
$sshTarget = "apartment@91.238.163.173"   # raw IP, not the domain - SSH connects to the server, not a vhost
$sshPort = 88
$remotePath = "/home/apartment/ground-code.com"

Set-Location $repoRoot

# --- 1. Build (unless skipped) ---
if (-not $SkipBuild) {
    Write-Host "==> Building frontend..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed - aborting deploy." }
}

# --- 2. Commit + push ---
git add -A
$hasChanges = (git status --porcelain)
if ($hasChanges) {
    if (-not $Message) {
        $Message = Read-Host "Commit message"
    }
    git commit -m $Message
} else {
    Write-Host "==> No code changes to commit (working tree clean)." -ForegroundColor Yellow
}

Write-Host "==> Pushing to GitHub..." -ForegroundColor Cyan
git push origin multi-tenant

# --- 3. Pull on server ---
Write-Host "==> Pulling latest code on the server..." -ForegroundColor Cyan
ssh -i $sshKey -p $sshPort $sshTarget "cd $remotePath && git pull origin multi-tenant"

# --- 4. Upload built frontend (unless skipped) ---
if (-not $SkipBuild) {
    Write-Host "==> Packaging and uploading dist/..." -ForegroundColor Cyan
    $zipPath = Join-Path $env:TEMP "artists_farm_dist.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $repoRoot "dist\*") -DestinationPath $zipPath -Force

    scp -i $sshKey -P $sshPort $zipPath "${sshTarget}:/tmp/dist.zip"
    ssh -i $sshKey -p $sshPort $sshTarget @"
cd $remotePath
mkdir -p dist_new
cd dist_new
unzip -oq /tmp/dist.zip
cd ..
rm -rf dist_old
mv dist dist_old 2>/dev/null || true
mv dist_new dist
rm -rf dist_old
rm -f /tmp/dist.zip
"@
    Remove-Item $zipPath -Force
}

Write-Host "==> Done. Check https://ground-code.com" -ForegroundColor Green
