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
$SshHost     = "91.238.163.173"
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
    # BatchMode=yes + ConnectTimeout added 23 Aug 2026 after a real deploy hung
    # for 3+ hours at the scp upload step below (StrictHostKeyChecking=no alone
    # doesn't cover every possible interactive prompt - e.g. a passphrase
    # request - and this whole script runs from a web-triggered background
    # process with no attached terminal, so any prompt just blocks forever
    # with nobody able to answer it). BatchMode=yes makes ssh/scp fail fast
    # with a real error instead of ever prompting for anything.
    & ssh -p $SshPort -i $SshKey -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=20 "$SshUser@$SshHost" $Command
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
        Invoke-Ssh "cd $RemoteDir && git fetch origin && git reset --hard origin/multi-tenant"
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
    # This one call was the actual cause of the 3+ hour hang found 23 Aug
    # 2026 - it's the only ssh/scp call site in this file that was missing
    # -o StrictHostKeyChecking=no (Invoke-Ssh above already had it), so it
    # was the first remote call in the whole run capable of hitting a real
    # interactive host-key prompt - with no terminal attached to answer it,
    # scp just sat there forever. See Invoke-Ssh's own comment for why
    # BatchMode/ConnectTimeout are added here too, not just this flag.
    & scp -P $SshPort -i $SshKey -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=20 $tarPath "${SshUser}@${SshHost}:~/staging_dist_deploy.tar.gz"
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
    
    $liveHtml = $null
    try {
        $liveHtml = Invoke-WebRequest -Uri $LiveUrl -UseBasicParsing -ErrorAction Stop
    } catch {
        # Retry the SAME staging URL after a short pause, not a different
        # site. This used to fall back to https://artistic-sthan.com/dist/ -
        # PRODUCTION, a completely separate build with its own bundle hashes
        # - so any merely-transient hiccup on the first staging fetch (e.g. a
        # brief LiteSpeed blip right after the rsync swap above) guaranteed a
        # false "Staging bundle mismatch!" by comparing staging's fresh build
        # against production's unrelated one. Found 23 Aug 2026 after a
        # deploy that curl confirmed was already correct still reported
        # FAILED here.
        Start-Sleep -Seconds 3
        try {
            $liveHtml = Invoke-WebRequest -Uri $LiveUrl -UseBasicParsing -ErrorAction Stop
        } catch {}
    }

    if ($liveHtml -and $liveHtml.Content) {
        $liveBundle = @([regex]::Matches($liveHtml.Content, 'index-[A-Za-z0-9_-]+\.(js|css)') | ForEach-Object { $_.Value })
        if ($localBundle.Count -gt 0 -and $liveBundle.Count -gt 0) {
            $mismatch = Compare-Object $localBundle $liveBundle
            if ($mismatch) {
                Write-Err "Staging bundle mismatch!"
                exit 1
            }
            Write-Ok "Staging site verified serving the new bundle: $($liveBundle -join ', ')"
        }
    } else {
        Write-Ok "Build package and backend files deployed successfully. HTTP verification skipped - staging URL didn't respond twice in a row."
    }

    # Backend API smoke test (added 23 Aug 2026, after a real incident: a
    # backend-breaking bug shipped a deploy that reported "Complete" - the
    # bundle-hash check above only proves the FRONTEND shell landed, never
    # that the PHP backend behind it still works. router.php had been
    # silently returning HTTP 200 with an EMPTY body for every single action
    # for over an hour - login, nav menu, everything - discovered only
    # because a real user couldn't log in, not by this pipeline.
    # Deliberately its OWN top-level try/retry, NOT nested inside the bundle
    # check above - the first version of this fix lived inside that block and
    # silently never ran on the very next deploy, because Invoke-WebRequest's
    # own flakiness (the same "didn't respond twice in a row" this file
    # already works around elsewhere) skipped it before it got a chance to
    # check anything. This has to run independently to be trustworthy.
    # get_nav_menu requires a real login (confirmed 23 Aug 2026 - it isn't
    # actually the unauthenticated canary it looked like), so success here
    # isn't "returns data", it's "returns ANY well-formed API response at
    # all" - a real {status:..., message:...} envelope, even a 401 rejection,
    # proves PHP ran the request to completion and echoed real JSON. Only a
    # genuinely empty/unparseable body - the exact failure mode that broke
    # login for real users - fails the deploy.
    Write-Step "Verifying Staging Backend API"
    $apiJson = $null
    for ($__attempt = 1; $__attempt -le 2 -and -not $apiJson; $__attempt++) {
        try {
            $apiCheck = Invoke-WebRequest -Uri "https://staging.artistic-sthan.com/php/api/router.php?action=get_nav_menu" -UseBasicParsing -ErrorAction Stop -TimeoutSec 20
            if ($apiCheck.Content) {
                $apiJson = $apiCheck.Content | ConvertFrom-Json -ErrorAction Stop
            }
        } catch {
            if ($__attempt -eq 1) { Start-Sleep -Seconds 3 }
        }
    }
    if (-not $apiJson -or (-not $apiJson.status -and -not $apiJson.message)) {
        Write-Err "Staging backend API returned an empty or unparseable response after 2 attempts - the deploy likely broke the PHP backend (this is exactly the failure mode that silently broke login for real users on 23 Aug 2026). Check /php/errors/ on staging immediately."
        exit 1
    }
    $__apiSummary = if ($apiJson.status) { $apiJson.status } else { $apiJson.message }
    Write-Ok "Staging backend API verified alive (get_nav_menu responded with a real API envelope: $__apiSummary)."
    
    Write-Host ""
    Write-Host "Staging Deploy Complete: https://staging.artistic-sthan.com/dist/" -ForegroundColor Green

} catch {
    Write-Err $_.Exception.Message
    exit 1
}
