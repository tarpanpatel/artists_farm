<#
.SYNOPSIS
  Pull the live production database down and overwrite local dev with it.

.DESCRIPTION
  Since you're now testing directly on the live site, local's database will
  drift out of sync with whatever real data ends up on production (new
  tenants/properties/guests you add through the live UI). There's no live
  connection from your machine to the production DB (it only listens on
  localhost inside the server), so this has to be a pull, not a live sync.

  This script dumps the ENTIRE production database (groundcode - structure
  + data) over SSH, downloads it, and replaces local's artists_farm_resort
  database with it. Local becomes an exact mirror of production. Run this
  whenever you want local to reflect the latest real state.

  WARNING: this REPLACES local data entirely. Any local-only test data you
  added directly to the local DB (not through the live site) will be lost.

.EXAMPLE
  .\deploy\pull-live-data.ps1
#>

$ErrorActionPreference = "Stop"
$sshKey = "$env:USERPROFILE\Documents\Downloads\github_cpanel"   # passphrase-protected - ssh will prompt you
$sshTarget = "apartment@artistic-sthan.com"
$sshPort = 88
$dumpPath = Join-Path $env:TEMP "live_dump.sql"

Write-Host "==> Dumping production database (groundcode) on the server..." -ForegroundColor Cyan
# Password is read from php/config/db_pass.php server-side via a tiny inline
# PHP snippet, so it's never typed here or shown in shell history.
ssh -i $sshKey -p $sshPort $sshTarget @'
DB_PASS=$(php -r "echo file_exists('/home/apartment/public_html/php/config/db_pass.php') ? require('/home/apartment/public_html/php/config/db_pass.php') : '';")
mysqldump -u groundcode -p"$DB_PASS" --routines --triggers groundcode > /tmp/live_dump.sql
echo "Dump size:"
ls -la /tmp/live_dump.sql
'@

Write-Host "==> Downloading dump..." -ForegroundColor Cyan
scp -i $sshKey -P $sshPort "${sshTarget}:/tmp/live_dump.sql" $dumpPath
ssh -i $sshKey -p $sshPort $sshTarget "rm -f /tmp/live_dump.sql"

$size = (Get-Item $dumpPath).Length
Write-Host "==> Downloaded $([math]::Round($size/1MB, 2)) MB" -ForegroundColor Cyan
if ($size -lt 1000) {
    throw "Dump looks suspiciously small ($size bytes) - aborting before touching local DB. Check the SSH output above for errors."
}

Write-Host "==> Replacing local database (artists_farm_resort)..." -ForegroundColor Yellow
& "C:\xampp\mysql\bin\mysql.exe" -u root -e "DROP DATABASE IF EXISTS artists_farm_resort; CREATE DATABASE artists_farm_resort CHARACTER SET utf8mb4;"
Get-Content $dumpPath -Raw | & "C:\xampp\mysql\bin\mysql.exe" -u root artists_farm_resort
Remove-Item $dumpPath -Force

Write-Host "==> Done. Local now mirrors production." -ForegroundColor Green
