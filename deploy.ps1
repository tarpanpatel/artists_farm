# Artists Farm Deploy Script
# Uploads dist/ and php/ to production via SCP (port 88)
# Usage: .\deploy.ps1

param(
    [switch]$SkipBuild
)

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  ARTISTS FARM - DEPLOY TO PRODUCTION" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Production SFTP settings
$deployHost = "91.238.163.173"
$deployUser = "apartment"
$deployPort = "88"
$deployPath = "/home/apartment/artistsfarmjaipur.com/artist_farm"

Write-Host "  Host: ${deployHost}:${deployPort}" -ForegroundColor Gray
Write-Host "  User: $deployUser" -ForegroundColor Gray
Write-Host "  Path: $deployPath" -ForegroundColor Gray
Write-Host ""

# Step 1: Build (unless skipped)
if (-not $SkipBuild) {
    Write-Host "[1/3] Building project..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "BUILD FAILED. Aborting deploy." -ForegroundColor Red
        exit 1
    }
    Write-Host "Build successful!" -ForegroundColor Green
} else {
    Write-Host "[1/3] Build skipped (-SkipBuild flag)." -ForegroundColor Yellow
}
Write-Host ""

# Step 2: Confirm
Write-Host "[2/3] Ready to upload:" -ForegroundColor Yellow
Write-Host "  dist/  -->  ${deployPath}/dist/" -ForegroundColor Gray
Write-Host "  php/   -->  ${deployPath}/php/" -ForegroundColor Gray
Write-Host "  index.php, index.html  -->  ${deployPath}/" -ForegroundColor Gray
Write-Host ""
$confirm = Read-Host "Proceed? (y/n)"
if ($confirm -ne 'y' -and $confirm -ne 'Y') {
    Write-Host "Deploy cancelled." -ForegroundColor Red
    exit 0
}
Write-Host ""

# Step 3: Upload via SCP (recursive)
Write-Host "[3/3] Uploading files (you will be prompted for password)..." -ForegroundColor Yellow
Write-Host ""

# Upload dist/ folder
Write-Host "  Uploading dist/..." -ForegroundColor Gray
scp -P $deployPort -r "dist\*" "$($deployUser)@$($deployHost):$($deployPath)/dist/"
if ($LASTEXITCODE -ne 0) { Write-Host "  WARN: dist/ upload had issues" -ForegroundColor DarkYellow }

# Upload php/ folder
Write-Host "  Uploading php/..." -ForegroundColor Gray
scp -P $deployPort -r "php\*" "$($deployUser)@$($deployHost):$($deployPath)/php/"
if ($LASTEXITCODE -ne 0) { Write-Host "  WARN: php/ upload had issues" -ForegroundColor DarkYellow }

# Upload root files
Write-Host "  Uploading index.php + index.html..." -ForegroundColor Gray
scp -P $deployPort "index.php" "$($deployUser)@$($deployHost):$($deployPath)/"
scp -P $deployPort "index.html" "$($deployUser)@$($deployHost):$($deployPath)/"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host "  DEPLOY COMPLETE!" -ForegroundColor Green
Write-Host "  Live: https://artistsfarmjaipur.com/artist_farm/" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
