<#
.SYNOPSIS
  Commit-and-deploy pipeline for Artists Farm Resort (multi-tenant branch).

.DESCRIPTION
  Does exactly what has been done by hand all session, in order:
    0. If assets/css/custom_css_override.css has uncommitted changes,
       auto-commit just that one file (see note below) - nothing else.
    1. Push local commits on `multi-tenant` to GitHub.
    2. SSH into cPanel and `git pull` (syncs the PHP backend).
    3. Stash any OTHER UNCOMMITTED local changes (so a concurrent WIP
       session's half-finished edits never leak into the build - this is
       the same safety net used throughout this engagement).
    4. `npm run build` from that clean, committed state.
    5. Restore the stash (nothing is ever lost).
    6. Tar the fresh dist/, scp it up, swap it into public_html/dist/ on
       the server, clean up temp files.
    7. Verify: confirm the live site is serving the bundle that was just
       built (compares the JS/CSS hashes in dist/index.html locally vs.
       what artistic-sthan.com actually returns).

  IMPORTANT: this script only ships what's already COMMITTED. If you (or
  an AI session) made changes and haven't run `git add` + `git commit`
  yet, do that first - uncommitted changes get stashed out of the way,
  not deployed. The ONE exception is assets/css/custom_css_override.css
  (step 0 above) - that file is deliberately auto-committed on your
  behalf every run, since its whole purpose is instant no-deploy edits
  from the Appearance Settings admin UI, and requiring a manual commit
  for every CSS tweak would defeat that. Nothing else gets this treatment.

.USAGE
  Open PowerShell in the project root and run:
      .\deploy.ps1

  Or from anywhere:
      powershell -File "C:\xampp\htdocs\artists_farm\deploy.ps1"

  Flags:
      -SkipPhpSync    Skip step 2 (only touch the frontend build/deploy;
                      use this if your change was frontend-only and you
                      want a faster run).
      -DryRun         Do everything up through the build, but don't
                      upload anything - useful to confirm it builds clean
                      before actually shipping.
#>

param(
    [switch]$SkipPhpSync,
    [switch]$DryRun
)

# NOTE: deliberately NOT $ErrorActionPreference = 'Stop' globally. Native
# commands (git, ssh, scp, tar, npm) routinely write benign progress/status
# text to stderr even on success (e.g. `git fetch`'s "From https://...`
# line) - PowerShell 5.1 wraps native stderr output into ErrorRecords, and
# under a global 'Stop' preference those get auto-upgraded into terminating
# exceptions, aborting the script on a command that actually succeeded.
# Every native call below already has its own explicit
# `if ($LASTEXITCODE -ne 0) { throw ... }` check, which is the real error
# gate; cmdlet calls that need strict failure handling (Invoke-WebRequest)
# pass -ErrorAction Stop individually instead.
$ErrorActionPreference = 'Continue'

# ---- Configuration (matches what's been used by hand all session) ----
$SshKey    = "C:\Users\Tarpan Patel\Documents\Downloads\github_cpanel"
$SshHost   = "artistic-sthan.com"
$SshPort   = 88
$SshUser   = "apartment"
$RemoteDir = "~/public_html"
$LiveUrl   = "https://artistic-sthan.com/dist/"
$ProjectRoot = $PSScriptRoot

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
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

# The one deliberate, narrow exception to "only ships what's already
# committed": the live-editable Custom CSS override file. Its whole point
# is instant, no-deploy edits from the Appearance Settings admin UI - but
# for local's and live's copies (and their two Appearance Settings
# dashboards, which both read this exact file) to ever converge, SOME
# deploy has to carry a local edit over. Requiring a manual git add/commit
# for every CSS tweak defeats that, so this one specific file is
# auto-committed here, before anything else runs - never anything else in
# the working tree, which stays protected by the stash step below exactly
# as before.
$CustomCssFile = "assets/css/custom_css_override.css"

try {
    # ---- 0. Auto-commit the Custom CSS override, if it changed ----
    $cssChanged = git status --porcelain -- $CustomCssFile
    if ($cssChanged -and -not $DryRun) {
        Write-Step "Custom CSS override changed - committing it"
        git add -- $CustomCssFile
        git commit -m "chore: sync custom CSS override" -- $CustomCssFile | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "git commit failed for $CustomCssFile" }
        Write-Ok "Committed."
    } elseif ($cssChanged) {
        Write-Warn "(dry run - not committing the changed Custom CSS override)"
    }

    # ---- 1. Push commits ----
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
        } else {
            Write-Warn "(dry run - not actually pushing)"
        }
    } else {
        Write-Ok "Nothing to push - already up to date with origin."
    }

    # ---- 2. Sync PHP backend on cPanel ----
    if (-not $SkipPhpSync -and -not $DryRun) {
        Write-Step "Syncing PHP backend on cPanel (git pull)"
        Invoke-Ssh "cd $RemoteDir && git pull origin multi-tenant"
        Write-Ok "cPanel PHP is in sync."
    } elseif ($SkipPhpSync) {
        Write-Warn "Skipped PHP sync (-SkipPhpSync)."
    } else {
        Write-Warn "(dry run - not syncing PHP)"
    }

    # ---- 3. Stash any uncommitted local changes ----
    Write-Step "Checking for uncommitted local changes"
    $dirty = git status --porcelain
    $stashed = $false
    if ($dirty) {
        $stashLabel = "deploy-script-isolation-$(Get-Date -Format yyyyMMdd-HHmmss)"
        Write-Warn "Uncommitted changes found - stashing them so they don't get built/deployed:"
        Write-Host ($dirty | Select-Object -First 10 | Out-String)
        if (($dirty | Measure-Object).Count -gt 10) {
            Write-Host "    ... and $((($dirty | Measure-Object).Count) - 10) more"
        }
        git stash push -u -m $stashLabel | Out-Null
        $stashed = $true
        Write-Ok "Stashed as '$stashLabel'. Will restore after the build."
    } else {
        Write-Ok "Working tree is clean - nothing to stash."
    }

    # ---- 4. Build ----
    Write-Step "Building (npm run build)"
    npm run build
    $buildExitCode = $LASTEXITCODE

    # ---- 5. Restore stash (ALWAYS, even if build failed) ----
    if ($stashed) {
        Write-Step "Restoring stashed changes"
        git stash pop
        if ($LASTEXITCODE -ne 0) {
            Write-Err "git stash pop reported a conflict - your changes are still safe in the stash."
            Write-Err "Run 'git stash list' then 'git stash show -p stash@{0}' to inspect, or"
            Write-Err "'git checkout stash@{0} -- <file>' to restore individual files."
        } else {
            Write-Ok "Restored."
        }
    }

    if ($buildExitCode -ne 0) {
        throw "npm run build failed (exit $buildExitCode) - not deploying a broken build."
    }
    Write-Ok "Build succeeded."

    if ($DryRun) {
        Write-Step "Dry run complete - build is clean. Nothing was uploaded."
        exit 0
    }

    # ---- 6. Package and ship dist/ ----
    Write-Step "Packaging dist/"
    # Explicit path to Windows' native tar.exe, not just `tar` - Git for
    # Windows ships its own MSYS/Unix tar (Git\usr\bin\tar.exe), and
    # depending on which process launched this script, that one can win
    # the PATH race over the native C:\Windows\System32\tar.exe. The MSYS
    # build interprets a Windows path like "C:\Users\..." as a REMOTE HOST
    # spec (Unix tar's `host:path` syntax for remote tape archives sees
    # "C" as the hostname) and fails with "Cannot connect to C: resolve
    # failed" - happened when this ran via the deploy-panel PHP page
    # (Apache's spawned-process PATH order differs from an interactive
    # shell's) even though the exact same command worked fine run by hand.
    $tarExe = "$env:WINDIR\System32\tar.exe"
    if (-not (Test-Path $tarExe)) { $tarExe = "tar" } # fallback for older Windows without bundled tar
    $tarPath = Join-Path $env:TEMP "artists_farm_dist_deploy.tar.gz"
    if (Test-Path $tarPath) { Remove-Item $tarPath -Force }
    Push-Location (Join-Path $ProjectRoot "dist")
    try {
        & $tarExe -czf $tarPath .
        if ($LASTEXITCODE -ne 0) { throw "tar failed" }
    } finally {
        Pop-Location
    }
    Write-Ok "Packaged to $tarPath"

    Write-Step "Uploading to server"
    & scp -P $SshPort -i $SshKey $tarPath "${SshUser}@${SshHost}:~/deploy_dist.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "scp upload failed" }
    Write-Ok "Uploaded."

    Write-Step "Swapping into place on the server"
    Invoke-Ssh "cd $RemoteDir && rm -rf dist_deploy_new && mkdir dist_deploy_new && tar -xzf ~/deploy_dist.tar.gz -C dist_deploy_new && rsync -a --delete dist_deploy_new/ dist/ && rm -rf dist_deploy_new ~/deploy_dist.tar.gz"
    Write-Ok "Live dist/ updated."
    Remove-Item $tarPath -Force -ErrorAction SilentlyContinue

    # ---- 7. Verify ----
    Write-Step "Verifying deployment"
    # Vite's content-hash alphabet includes hyphens (e.g. "index-hBgSHhk-.js",
    # "index-Bk-Aez8Z.css") - the character class here used to be missing '-',
    # so it silently matched ZERO bundle filenames whenever a build's hash
    # happened to contain one (random per build). Piping zero matches through
    # ForEach-Object collapses to $null (not an empty array) in PowerShell,
    # and Compare-Object refuses a $null ReferenceObject/DifferenceObject -
    # crashing with a cryptic "Cannot bind argument" error that had nothing
    # to do with the actual deploy, which had already succeeded by this
    # point (upload + swap both complete before this check even runs).
    # Fixed 14 Aug 2026: added '-' to the class, and wrapped both sides in
    # @(...) so a genuine zero-match case degrades to a clear error message
    # instead of this same crash.
    $localBundle = @(Select-String -Path (Join-Path $ProjectRoot "dist\index.html") -Pattern 'index-[A-Za-z0-9_-]+\.(js|css)' -AllMatches |
        ForEach-Object { $_.Matches.Value })
    $liveHtml = Invoke-WebRequest -Uri $LiveUrl -UseBasicParsing -ErrorAction Stop
    $liveBundle = @([regex]::Matches($liveHtml.Content, 'index-[A-Za-z0-9_-]+\.(js|css)') | ForEach-Object { $_.Value })

    if ($localBundle.Count -eq 0 -or $liveBundle.Count -eq 0) {
        Write-Err "Could not find bundle filenames to compare (local: $($localBundle.Count) found, live: $($liveBundle.Count) found) - deploy itself succeeded, but this verification step couldn't confirm it. Check $LiveUrl manually."
        exit 1
    }

    $mismatch = Compare-Object $localBundle $liveBundle
    if ($mismatch) {
        Write-Err "Live bundle does NOT match what was just built. Local: $($localBundle -join ', ') | Live: $($liveBundle -join ', ')"
        exit 1
    }
    Write-Ok "Live site confirmed serving the new bundle: $($liveBundle -join ', ')"
    Write-Host ""
    Write-Host "Deploy complete: $LiveUrl" -ForegroundColor Green

} catch {
    Write-Err $_.Exception.Message
    exit 1
}
