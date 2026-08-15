<#
.SYNOPSIS
  Commit-and-deploy pipeline for Artists Farm Staging Environment (staging.artistic-sthan.com).

.DESCRIPTION
  Builds the React frontend and updates the PHP backend on the staging subdomain, from the SAME
  committed source as production - but independently, so staging can get AHEAD of production for
  testing before you promote (see deploy.ps1's "Promote to Live" - same script, no -Target
  needed, since GitHub already has the commits pushed here).
  1. Pushes local commits to GitHub (multi-tenant branch).
  2. `git pull`s on ~/staging.artistic-sthan.com directly (own git checkout, independent of
     ~/public_html - NOT an rsync mirror of whatever's already live on production. This was the
     bug in the original version of this script: rsyncing FROM public_html meant staging could
     only ever mirror production, never get ahead of it, defeating the entire point of a staging
     environment. Fixed 15 Aug 2026.
  3. Stashes any uncommitted local changes.
  4. Runs `npm run build` from clean state.
  5. Restores working tree stash.
  6. Packages dist/, uploads, and swaps into place at ~/staging.artistic-sthan.com/dist/.
  7. Verifies live staging bundle response.

.ONE-TIME SERVER SETUP REQUIRED
  ~/staging.artistic-sthan.com must be its own git checkout of this repo (branch multi-tenant)
  before step 2 above will work - it currently is NOT (confirmed 15 Aug 2026: plain rsync'd
  files, `git status` reports "not a git repository"). Someone with server access needs to run,
  once:
    cd ~/staging.artistic-sthan.com
    # back up anything not in git first (uploaded images/documents, db_pass.php, .env) -
    # `git clone` into a non-empty directory will fail, so those need moving aside and back.
    git clone -b multi-tenant https://github.com/tarpanpatel/artists_farm.git .
    # then restore db_pass.php / .env / php/uploads/* into place - these are gitignored on
    # purpose (secrets, tenant files) and a fresh clone won't have them.

.USAGE
  .\deploy-staging.ps1
#>

param(
    [switch]$SkipPhpSync,
    [switch]$DryRun
)

$ErrorActionPreference = 'Continue'

# Configuration for Staging
$SshKey      = "C:\Users\Tarpan Patel\Documents\Downloads\github_cpanel"
$SshHost     = "artistic-sthan.com"
$SshPort     = 88
$SshUser     = "apartment"
$RemoteDir   = "~/staging.artistic-sthan.com"
$LiveUrl     = "https://staging.artistic-sthan.com/dist/"
$ProjectRoot = $PSScriptRoot

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> [STAGING] $msg" -ForegroundColor Cyan
}
function Write-Ok($msg) {
    Write-Host "    OK: $msg" -ForegroundColor Green
}
function Write-Warn($msg) {
    Write-Host "    WARNING: $msg" -ForegroundColor Yellow
}
function Write-Err($msg) {
    Write-Host "    FAILED: $msg" -ForegroundColor Red
}

function Invoke-Ssh([string]$Command) {
    & ssh -p $SshPort -i $SshKey "$SshUser@$SshHost" $Command
    if ($LASTEXITCODE -ne 0) {
        throw "SSH command failed (exit $LASTEXITCODE): $Command"
    }
}

Set-Location $ProjectRoot

$CustomCssFile = "assets/css/custom_css_override.css"

try {
    # 0. Auto-commit Custom CSS override if changed
    $cssChanged = git status --porcelain -- $CustomCssFile
    if ($cssChanged -and -not $DryRun) {
        Write-Step "Custom CSS override changed - committing it"
        git add -- $CustomCssFile
        git commit -m "chore: sync custom CSS override" -- $CustomCssFile | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "git commit failed for $CustomCssFile" }
        Write-Ok "Committed."
    }

    # 1. Push commits
    Write-Step "Pushing commits to GitHub (multi-tenant)"
    $ahead = git log origin/multi-tenant..HEAD --oneline 2>$null
    if (-not $ahead) {
        git fetch origin multi-tenant | Out-Null
        $ahead = git log origin/multi-tenant..HEAD --oneline 2>$null
    }
    if ($ahead) {
        Write-Host $ahead
        if (-not $DryRun) {
            git push origin multi-tenant
            if ($LASTEXITCODE -ne 0) { throw "git push failed" }
            Write-Ok "Pushed."
        }
    } else {
        Write-Ok "Nothing to push - already up to date with origin."
    }

    # 2. Update PHP backend on staging via its own git pull - NOT synced from production.
    #    Staging is meant to run ahead of production for testing, so it needs its own
    #    independent checkout of the same branch. See .ONE-TIME SERVER SETUP REQUIRED above -
    #    this step fails loudly (not silently) if that hasn't been done yet.
    if (-not $SkipPhpSync -and -not $DryRun) {
        Write-Step "Syncing PHP backend on staging (git pull)"
        Invoke-Ssh "cd $RemoteDir && git pull origin multi-tenant"
        Write-Ok "Staging PHP backend is in sync."
    }

    # 3. Stash uncommitted local changes
    Write-Step "Checking for uncommitted local changes"
    $dirty = git status --porcelain
    $stashed = $false
    if ($dirty) {
        $stashLabel = "staging-deploy-isolation-$(Get-Date -Format yyyyMMdd-HHmmss)"
        Write-Warn "Uncommitted changes found - stashing them for clean build:"
        git stash push -u -m $stashLabel | Out-Null
        $stashed = $true
        Write-Ok "Stashed as '$stashLabel'."
    } else {
        Write-Ok "Working tree is clean."
    }

    # 4. Build
    Write-Step "Building (npm run build)"
    npm run build
    $buildExitCode = $LASTEXITCODE

    # 5. Restore stash
    if ($stashed) {
        Write-Step "Restoring stashed changes"
        git stash pop
        Write-Ok "Restored."
    }

    if ($buildExitCode -ne 0) {
        throw "npm run build failed (exit $buildExitCode)"
    }
    Write-Ok "Build succeeded."

    if ($DryRun) {
        Write-Step "Dry run complete - build is clean."
        exit 0
    }

    # 6. Package & upload dist to staging
    Write-Step "Packaging dist/"
    $tarExe = "$env:WINDIR\System32\tar.exe"
    if (-not (Test-Path $tarExe)) { $tarExe = "tar" }
    $tarPath = Join-Path $env:TEMP "staging_dist_deploy.tar.gz"
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    Push-Location (Join-Path $ProjectRoot "dist")
    try {
        & $tarExe -czf $tarPath .
        if ($LASTEXITCODE -ne 0) { throw "tar failed" }
    } finally {
        Pop-Location
    }
    Write-Ok "Packaged to $tarPath"

    Write-Step "Uploading to staging environment"
    & scp -P $SshPort -i $SshKey $tarPath "${SshUser}@${SshHost}:~/staging_dist_deploy.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "scp upload failed" }
    Write-Ok "Uploaded."

    Write-Step "Swapping dist into place on staging server"
    Invoke-Ssh "cd $RemoteDir && rm -rf dist_deploy_new && mkdir dist_deploy_new && tar -xzf ~/staging_dist_deploy.tar.gz -C dist_deploy_new && rsync -a --delete dist_deploy_new/ dist/ && rm -rf dist_deploy_new ~/staging_dist_deploy.tar.gz"
    Write-Ok "Staging dist/ updated."
    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    # 7. Verification
    Write-Step "Verifying Staging Deployment"
    $localBundle = @(Select-String -Path (Join-Path $ProjectRoot "dist\index.html") -Pattern 'index-[A-Za-z0-9_-]+\.(js|css)' -AllMatches |
        ForEach-Object { $_.Matches.Value })
    $liveHtml = Invoke-WebRequest -Uri $LiveUrl -UseBasicParsing -ErrorAction Stop
    $liveBundle = @([regex]::Matches($liveHtml.Content, 'index-[A-Za-z0-9_-]+\.(js|css)') | ForEach-Object { $_.Value })

    if ($localBundle.Count -eq 0 -or $liveBundle.Count -eq 0) {
        Write-Err "Could not verify bundle hashes automatically. Check $LiveUrl manually."
        exit 1
    }

    $mismatch = Compare-Object $localBundle $liveBundle
    if ($mismatch) {
        Write-Err "Staging bundle mismatch!"
        exit 1
    }
    Write-Ok "Staging site verified serving the new bundle: $($liveBundle -join ', ')"
    Write-Host ""
    Write-Host "Staging Deploy Complete: https://staging.artistic-sthan.com/dist/" -ForegroundColor Green

} catch {
    Write-Err $_.Exception.Message
    exit 1
}
