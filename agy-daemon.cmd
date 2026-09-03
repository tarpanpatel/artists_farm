@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ==========================================================================
REM Antigravity CLI - Remote Control Daemon Setup (Windows)
REM
REM Installs, updates, and manages 'agy --remote-control' as a background
REM daemon via Task Scheduler.
REM
REM Plain batch + schtasks only: works on locked-down machines where PowerShell
REM is in Constrained Language Mode.
REM
REM How the daemon survives sign-out (S4U):
REM   The daemon task is registered from an XML definition with the S4U
REM   logon type ("run whether user is logged on or not", no password
REM   stored). S4U runs the daemon in Session 0, which Windows does not
REM   tear down at sign-out, and its boot trigger starts it with no sign-in
REM   at all. S4U needs the "Log on as a batch job" right and registering
REM   the task needs elevation, so 'install' and 'uninstall' require an
REM   Administrator prompt. The XML also sets ExecutionTimeLimit to PT0S:
REM   the schtasks default would silently kill the daemon after 72 hours.
REM
REM How the no-window behavior works:
REM   Session 0 has no interactive desktop, so the S4U daemon never shows a
REM   window. The task still launches through wscript.exe (window style 0 =
REM   hidden) so nothing flashes if the runner is started manually, and it
REM   falls back to running the runner directly when wscript is blocked.
REM
REM Usage:
REM   agy_daemon.cmd [install|status|restart|uninstall]
REM                        [--no-auto-update]
REM                        [--interval hourly|daily|weekly] [--name <name>]
REM ==========================================================================

REM 1. Default Setup & Constants
set "TASK=AgyRemoteControl"
set "UPTASK=AgyRemoteControlUpdate"
set "BASEDIR=%LOCALAPPDATA%\agy"
set "AGY=%BASEDIR%\bin\agy.exe"
set "LOG=%BASEDIR%\agy_daemon.log"
set "RUNNER=%BASEDIR%\agy_run.cmd"
set "RESTARTER=%BASEDIR%\agy_restart.cmd"
set "WATCHER=%BASEDIR%\agy_loginwatch.cmd"
set "HIDER=%BASEDIR%\agy_hide.vbs"
set "PROBE=%BASEDIR%\agy_probe.vbs"
set "PROBEOUT=%BASEDIR%\agy_probe.txt"
set "TASKXML=%BASEDIR%\agy_task.xml"
REM Headless (--remote-control) persists its token to this FILE. See
REM auth_client.go: headless -> NewFileTokenStorage. The editor's normal login
REM uses the OS keyring instead, so this file appears only after a headless
REM login.
set "TOKEN=%USERPROFILE%\.gemini\jetski-standalone-oauth-token"

set "ACTION=install"
set "AUTOUPDATE=1"
set "NOPROMPT=0"
set "INTERVAL=daily"
set "RCNAME="
set "SKIPNEXT="
:: Captured before argument parsing: shift rotates %0 along with the
:: numbered arguments, so %~nx0 would report the first argument instead
:: of the script name once :parse has run.
set "SELF=%~nx0"
:: Set by :install_task once we know whether the daemon really started.
set "STARTED=0"

REM 2. Parse Arguments
:: Every shift happens at the top level, never inside a parenthesized block,
:: because a block is parsed as a unit before it runs.
:parse
if "%~1"=="" goto :endparse
set "A=%~1"
if /i "!A!"=="--no-auto-update" goto :parse_flag
if /i "!A!"=="--auto-update"    goto :parse_flag
if /i "!A!"=="--no-prompt"      goto :parse_flag
if /i "!A!"=="--interval"       goto :parse_interval
if /i "!A!"=="--name"           goto :parse_name
if "!A:~0,2!"=="--" (
    echo [ERROR] Unknown parameter: !A! >&2
) else (
    set "ACTION=!A!"
)
shift
goto :parse

:parse_flag
if /i "!A!"=="--no-auto-update" set "AUTOUPDATE=0"
if /i "!A!"=="--auto-update"    set "AUTOUPDATE=1"
if /i "!A!"=="--no-prompt"      set "NOPROMPT=1"
shift
goto :parse

:parse_interval
set "INTERVAL=%~2"
if not defined INTERVAL set "INTERVAL=daily"
shift & shift
goto :parse

:parse_name
set "RCNAME=%~2"
shift & shift
goto :parse

:endparse

REM 3. Dispatch
if /i "%ACTION%"=="install"   goto :install
if /i "%ACTION%"=="status"    goto :status
if /i "%ACTION%"=="restart"   goto :restart
if /i "%ACTION%"=="logout"    goto :logout
if /i "%ACTION%"=="uninstall" goto :uninstall
echo [ERROR] Unknown command: %ACTION% >&2
goto :usage

REM ===========================================================================
:install
echo === Setting up agy Remote Control Daemon (Windows) ===
call :require_admin
if errorlevel 1 exit /b 1
if not exist "%BASEDIR%" mkdir "%BASEDIR%" 2>nul

call :ensure_agy
if errorlevel 1 exit /b 1

call :prompt_name
call :write_scripts
call :do_login
if errorlevel 1 exit /b 1
call :probe_wscript
call :install_task
if errorlevel 1 exit /b 1
call :install_update_task

echo.
if "%STARTED%"=="1" goto :banner_started
echo === Setup complete: the daemon will start at the next boot ===
goto :banner_done
:banner_started
echo === Success: daemon is active ===
:banner_done
echo Logs are being appended to: %LOG%
echo agy's own logs:             %USERPROFILE%\.gemini\antigravity-cli\log
echo To check status anytime:    %SELF% status
exit /b 0

REM ===========================================================================
REM 4. Ensure the agy Binary Is Installed
:ensure_agy
if exist "%AGY%" goto :ensure_agy_update
for /f "delims=" %%p in ('where agy.exe 2^>nul') do set "AGY=%%p"
if exist "%AGY%" goto :ensure_agy_update
echo 'agy' not found. Installing via the official Antigravity CLI installer...
where curl >nul 2>&1
if errorlevel 1 (
    echo Fatal: 'curl' is required to install 'agy' but is not available. >&2
    echo Please install curl, or install 'agy' manually and re-run this script. >&2
    exit /b 1
)
curl -fsSL https://antigravity.google/cli/install.cmd -o "%TEMP%\agy_install.cmd"
if exist "%TEMP%\agy_install.cmd" call "%TEMP%\agy_install.cmd"
if exist "%TEMP%\agy_install.cmd" del "%TEMP%\agy_install.cmd" >nul 2>&1
set "AGY=%LOCALAPPDATA%\agy\bin\agy.exe"
if not exist "%AGY%" for /f "delims=" %%p in ('where agy.exe 2^>nul') do set "AGY=%%p"
if not exist "%AGY%" (
    echo Fatal: 'agy' installation failed. >&2
    echo Please install it manually from https://antigravity.google/cli and re-run. >&2
    exit /b 1
)
goto :ensure_agy_done

:: Already installed: pick up the latest release before setting up.
:ensure_agy_update
"%AGY%" update
if errorlevel 1 echo Warning: 'agy update' failed; continuing with the current version. >&2
:ensure_agy_done
echo Using agy binary: %AGY%
exit /b 0

REM ===========================================================================
REM 5. Choose the Instance Name
:: Asked as part of setup unless --name or --no-prompt was given. A blank
:: reply leaves RCNAME unset, so the flag is omitted entirely: whatever name
:: is already saved in config.json keeps applying, and if nothing is saved
:: the language server generates one on first run. That also makes this safe
:: when stdin is empty: set /p simply leaves the variable untouched.
:prompt_name
if defined RCNAME exit /b 0
if "%NOPROMPT%"=="1" exit /b 0
echo.
echo Instance name (how this machine appears in Remote Control).
echo Lowercase letters, numbers, and hyphens work best (e.g. my-desktop).
echo Leave it blank to keep the name that is already saved, or to have one
echo generated for you if there is no saved name yet.
set "REPLY="
set /p "REPLY=Name (optional): "
if not defined REPLY (
    echo   Keeping the saved name, or generating one if there is none.
    exit /b 0
)
set "RCNAME=%REPLY%"
exit /b 0

REM ===========================================================================
REM 6. Generate Helper Scripts
:: Written one line at a time with >> so the escaping stays simple and
:: predictable (^> ^& only).
:write_scripts

REM --- Runner: the actual daemon command, with logging.
REM     NAMEARG is built outside any parenthesized block so we never mix
REM     redirection with block parsing.
set NAMEARG=
if defined RCNAME set NAMEARG= --remote-control-name "%RCNAME%"
> "%RUNNER%" echo @echo off
>>"%RUNNER%" echo set AGY_CLI_DISABLE_AUTO_UPDATE=false
>>"%RUNNER%" echo "%AGY%" --bg-updater ^>nul 2^>^&1
REM     The CLI exits at startup if its local port is taken (e.g. another
REM     instance), so the runner probes for a free one on every launch.
>>"%RUNNER%" echo set PORT=4400
>>"%RUNNER%" echo :port_loop
>>"%RUNNER%" echo netstat -an ^| findstr /C:":%%PORT%% " ^| findstr /C:"LISTENING" ^>nul 2^>^&1
>>"%RUNNER%" echo if errorlevel 1 goto port_done
>>"%RUNNER%" echo set /a PORT+=1
>>"%RUNNER%" echo if %%PORT%% LSS 4500 goto port_loop
>>"%RUNNER%" echo :port_done
>>"%RUNNER%" echo "%AGY%" --remote-control --hub-port %%PORT%%%NAMEARG% ^>^> "%LOG%" 2^>^&1

REM --- Hider: launches its argument with window style 0 (hidden) and waits,
REM     so the scheduled task stays in the Running state while agy is alive.
> "%HIDER%" echo Set s = CreateObject("WScript.Shell")
>>"%HIDER%" echo s.Run """" ^& WScript.Arguments(0) ^& """", 0, True

REM --- Restarter: used by the auto-update task to apply a swapped binary.
REM     /End alone is not enough: it terminates the task's own process
REM     (wscript), but agy.exe is a grandchild and survives as an orphan,
REM     so the daemon would never restart and the downloaded update would
REM     never take effect. Kill it explicitly, matching the command line so
REM     an interactive 'agy' session is left alone. Pipes below sit inside
REM     the quoted -Command string, so cmd does not treat them as pipes.
> "%RESTARTER%" echo @echo off
>>"%RESTARTER%" echo schtasks /End /TN "%TASK%" ^>nul 2^>^&1
>>"%RESTARTER%" echo powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object Name -eq agy.exe | Where-Object CommandLine -like '*--remote-control*' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" ^>nul 2^>^&1
::     Use ping rather than timeout for the settle delay: timeout aborts
::     with "Input redirection is not supported" whenever stdin is not a
::     console, which is exactly the case under some task/CI invocations.
>>"%RESTARTER%" echo ping -n 4 127.0.0.1 ^>nul 2^>^&1
>>"%RESTARTER%" echo schtasks /Run /TN "%TASK%" ^>nul 2^>^&1

REM --- Login watchdog: stops the foreground login CLI once the token file
REM     appears, so install continues without manual intervention.
> "%WATCHER%" echo @echo off
>>"%WATCHER%" echo :loop
>>"%WATCHER%" echo if exist "%TOKEN%" goto kill
>>"%WATCHER%" echo ping -n 3 127.0.0.1 ^>nul 2^>^&1
>>"%WATCHER%" echo goto loop
>>"%WATCHER%" echo :kill
>>"%WATCHER%" echo ping -n 3 127.0.0.1 ^>nul 2^>^&1
>>"%WATCHER%" echo taskkill /IM agy.exe /F ^>nul 2^>^&1

echo Created launcher scripts in: %BASEDIR%
exit /b 0

REM ===========================================================================
REM 7. First-Time Interactive Login
:: The background daemon has no stdin, so the paste-a-code flow cannot run
:: there.
:do_login
call :check_auth
if "%AUTHED%"=="1" (
    echo Notice: Already authenticated; skipping login.
    exit /b 0
)
echo --------------------------------------------------------------
echo First-time login required before the daemon can run headlessly.
echo A sign-in URL will be printed below. Open it and paste the code
echo if prompted. Setup continues automatically once you're signed in
echo ^(or press Ctrl+C after signing in^).
echo.
echo Note: this is a SEPARATE token from the Antigravity editor login,
echo which is stored in the Windows Credential Manager instead.
echo --------------------------------------------------------------
start "" /b "%WATCHER%"
call :find_free_port
"%AGY%" --remote-control --hub-port %PORT%
call :check_auth
if "%AUTHED%"=="1" (
    echo Login detected. Continuing setup...
) else (
    echo [ERROR] Sign-in did not complete: no auth token found. >&2
    echo         Install aborted: the daemon would only crash-loop unauthenticated. >&2
    echo         Re-run the script to try again. >&2
    exit /b 1
)
exit /b 0

REM ===========================================================================
REM 8. Authentication State Check
:: AUTHED=1 when the headless token file exists and is non-empty.
:check_auth
set "AUTHED=0"
if exist "%TOKEN%" for %%A in ("%TOKEN%") do if %%~zA GTR 0 set "AUTHED=1"
exit /b 0

REM ===========================================================================
REM 8b. Find a Free Port for the Local Web UI
:: The CLI exits at startup if its port is already taken (e.g. by another
:: agy instance), so probe for a free one. Sets PORT for the caller.
:find_free_port
set PORT=4400
:ffp_loop
netstat -an | findstr /C:":%PORT% " | findstr /C:"LISTENING" >nul 2>&1
if errorlevel 1 exit /b 0
set /a PORT+=1
if %PORT% LSS 4500 goto ffp_loop
exit /b 0

REM ===========================================================================
REM 9. Probe Window-Hiding Support
:: Determine whether wscript can run. If it can, we get a hidden window; if
:: policy blocks it, we degrade to a visible window instead of failing.
:probe_wscript
set "USEVBS=0"
del /q "%PROBEOUT%" >nul 2>&1
> "%PROBE%" echo Set f = CreateObject("Scripting.FileSystemObject")
>>"%PROBE%" echo f.CreateTextFile("%PROBEOUT%", True).WriteLine "ok"
wscript.exe //B //Nologo "%PROBE%" >nul 2>&1
if exist "%PROBEOUT%" set "USEVBS=1"
del /q "%PROBE%" "%PROBEOUT%" >nul 2>&1
if "%USEVBS%"=="1" (
    echo Window hiding: enabled ^(wscript available^).
) else (
    echo Window hiding: NOT available ^(wscript blocked by policy^).
    echo The daemon will run with a visible console window.
)
exit /b 0

REM ===========================================================================
REM 10. Register the Daemon Task
:: Registered from an XML file: /Create's flags cannot express the S4U logon
:: type together with ExecutionTimeLimit PT0S, and the schtasks default
:: limit would silently kill the daemon after 72 hours. The wscript action
:: uses short (8.3) paths so the line needs no nested quoting.
:install_task
for %%I in ("%HIDER%")  do set "SHIDER=%%~sI"
for %%I in ("%RUNNER%") do set "SRUNNER=%%~sI"

set "TASKCMD=cmd.exe"
set "TASKARGS=/c %SRUNNER%"
if "%USEVBS%"=="1" set "TASKCMD=wscript.exe"
if "%USEVBS%"=="1" set "TASKARGS=//B //Nologo %SHIDER% %SRUNNER%"

call :write_task_xml
:: Create (replace) the task definition first and stop the old daemon only
:: after that succeeded: a failed create then leaves a working daemon alone.
schtasks /Create /TN "%TASK%" /XML "%TASKXML%" /F >nul
if errorlevel 1 (
    echo Fatal: Failed to create scheduled task "%TASK%". >&2
    echo This step needs an elevated Command Prompt ^(Run as administrator^). >&2
    exit /b 1
)
echo Registered scheduled task: %TASK% ^(S4U, at boot; survives sign-out^)
call :stop_daemon
:: An S4U task does not need an interactive session, so unlike the old
:: ONLOGON task this start is expected to succeed even over SSH.
schtasks /Run /TN "%TASK%" >nul 2>&1
if errorlevel 1 goto :run_failed
set "STARTED=1"
echo Started scheduled task: %TASK%
exit /b 0
:run_failed
set "STARTED=0"
echo Notice: The task is registered but could not be started right now. >&2
echo It will start at the next boot. Check: schtasks /Query /TN "%TASK%" >&2
exit /b 0

REM ===========================================================================
REM 10b. Helper: Write the Daemon Task XML
:: Mirrors the definition proven live: LogonType S4U (Session 0, survives
:: sign-out, no stored password), a boot trigger, and ExecutionTimeLimit
:: PT0S (no limit). UserId carries the account SID (resolved via whoami).
:: Written as plain ASCII with no XML encoding declaration.
:write_task_xml
:: Use the SID: DOMAIN-qualified names can fail to resolve in some
:: session types; a SID needs no lookup. Falls back to plain username.
set "USERSID="
for /f "skip=1 tokens=2" %%A in ('whoami /user /fo table') do set "USERSID=%%A"
if not defined USERSID set "USERSID=%USERNAME%"
REM No encoding attribute: echo writes ANSI, and schtasks refuses a file
REM whose declared encoding does not match its bytes ("unable to switch
REM the encoding"). With no declaration schtasks accepts the ANSI bytes.
>  "%TASKXML%" echo ^<?xml version="1.0"?^>
>>"%TASKXML%" echo ^<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"^>
>>"%TASKXML%" echo   ^<Principals^>
>>"%TASKXML%" echo     ^<Principal id="Author"^>
>>"%TASKXML%" echo       ^<UserId^>%USERSID%^</UserId^>
>>"%TASKXML%" echo       ^<LogonType^>S4U^</LogonType^>
>>"%TASKXML%" echo       ^<RunLevel^>LeastPrivilege^</RunLevel^>
>>"%TASKXML%" echo     ^</Principal^>
>>"%TASKXML%" echo   ^</Principals^>
>>"%TASKXML%" echo   ^<Settings^>
>>"%TASKXML%" echo     ^<MultipleInstancesPolicy^>IgnoreNew^</MultipleInstancesPolicy^>
>>"%TASKXML%" echo     ^<ExecutionTimeLimit^>PT0S^</ExecutionTimeLimit^>
>>"%TASKXML%" echo   ^</Settings^>
>>"%TASKXML%" echo   ^<Triggers^>
>>"%TASKXML%" echo     ^<BootTrigger /^>
>>"%TASKXML%" echo   ^</Triggers^>
>>"%TASKXML%" echo   ^<Actions Context="Author"^>
>>"%TASKXML%" echo     ^<Exec^>
>>"%TASKXML%" echo       ^<Command^>%TASKCMD%^</Command^>
>>"%TASKXML%" echo       ^<Arguments^>%TASKARGS%^</Arguments^>
>>"%TASKXML%" echo     ^</Exec^>
>>"%TASKXML%" echo   ^</Actions^>
>>"%TASKXML%" echo ^</Task^>
exit /b 0

REM ===========================================================================
REM 11. Register the Auto-Update Task
:: Periodically restart the daemon so a downloaded update takes effect. The
:: updater swaps the binary on disk but the running process keeps the old one,
:: which is why a restart is required.
:install_update_task
if not "%AUTOUPDATE%"=="1" (
    schtasks /Delete /TN "%UPTASK%" /F >nul 2>&1
    echo Scheduled auto-update restarts: disabled ^(--no-auto-update^)
    exit /b 0
)
for %%I in ("%RESTARTER%") do set "SRESTART=%%~sI"
for %%I in ("%HIDER%")     do set "SHIDER=%%~sI"

set "SC=DAILY"
set "SCEXTRA=/ST 04:00"
if /i "%INTERVAL%"=="hourly" set "SC=HOURLY"
if /i "%INTERVAL%"=="hourly" set "SCEXTRA="
if /i "%INTERVAL%"=="weekly" set "SC=WEEKLY"

if "%USEVBS%"=="1" (
    schtasks /Create /TN "%UPTASK%" /TR "wscript.exe //B //Nologo %SHIDER% %SRESTART%" /SC %SC% %SCEXTRA% /RU "%USERNAME%" /NP /F <nul >nul
) else (
    schtasks /Create /TN "%UPTASK%" /TR "%SRESTART%" /SC %SC% %SCEXTRA% /RU "%USERNAME%" /NP /F <nul >nul
)
if errorlevel 1 (
    echo Warning: Could not create the auto-update task "%UPTASK%". >&2
    echo The daemon still runs, but will not restart to pick up new versions. >&2
) else (
    echo Registered auto-update task: %UPTASK% ^(%SC%^)
)
exit /b 0

REM ===========================================================================
REM 12. Status
:status
echo --- Daemon (%TASK%) ---
schtasks /Query /TN "%TASK%" /V /FO LIST 2>nul || echo Not installed.
echo.
echo --- Auto-update task (%UPTASK%) ---
schtasks /Query /TN "%UPTASK%" /FO LIST 2>nul || echo Not installed.
echo.
echo --- Running processes ---
tasklist /FI "IMAGENAME eq agy.exe" 2>nul | findstr /i agy.exe || echo No agy.exe running.
echo.
echo --- Recent Logs (last 10 lines) ---
if not exist "%LOG%" (
    echo No log file at %LOG% yet.
    exit /b 0
)
:: Pure-batch tail: count lines, then print only the final ones. Avoids
:: PowerShell, which is unavailable in Constrained Language Mode.
set /a LC=0
for /f %%N in ('find /c /v "" ^< "%LOG%"') do set /a LC=%%N
set /a SKIP=LC-10
if %SKIP% LSS 0 set /a SKIP=0
set /a IDX=0
for /f "usebackq delims=" %%L in ("%LOG%") do (
    set /a IDX+=1
    if !IDX! GTR %SKIP% echo %%L
)
exit /b 0

REM ===========================================================================
REM 13. Restart
:restart
call :stop_daemon
schtasks /Run /TN "%TASK%" >nul 2>&1
if errorlevel 1 goto :restart_failed
echo Restarted %TASK%.
exit /b 0
:restart_failed
echo Notice: Stopped the daemon, but could not start it again right now. >&2
echo It will start at the next boot. Check: schtasks /Query /TN "%TASK%" >&2
exit /b 1

REM ===========================================================================
REM 13b. Logout
:logout
call :stop_daemon
del /q "%TOKEN%" >nul 2>&1
echo Signed out: removed the saved auth token and stopped the daemon.
echo Run "%SELF% install" to sign in again.
exit /b 0

REM ===========================================================================
REM 14. Uninstall
:uninstall
call :require_admin
if errorlevel 1 exit /b 1
call :stop_daemon
schtasks /Delete /TN "%TASK%" /F >nul 2>&1
schtasks /Delete /TN "%UPTASK%" /F >nul 2>&1
del /q "%RUNNER%" "%RESTARTER%" "%WATCHER%" "%HIDER%" "%TASKXML%" >nul 2>&1
echo Removed %TASK%, %UPTASK%, and the launcher scripts.
exit /b 0

REM ===========================================================================
REM 15. Helper: Stop the running daemon
:: schtasks /End only terminates the task's own process (wscript). agy.exe
:: is launched as a grandchild, so /End leaves it running as an orphan and
:: the daemon is never actually restarted -- which silently defeated the
:: entire auto-update mechanism. Match on the --remote-control command line
:: so an interactive 'agy' the user is running does not get killed too.
:stop_daemon
schtasks /End /TN "%TASK%" >nul 2>&1
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object Name -eq agy.exe | Where-Object CommandLine -like '*--remote-control*' | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
exit /b 0

REM ===========================================================================
REM 15b. Helper: Require an elevated prompt
:: Registering the S4U task (and deleting it again) needs Administrator.
:: 'net session' is the standard elevation probe: it fails with errorlevel 2
:: in a non-elevated shell and succeeds (0) in an elevated one.
:require_admin
net session >nul 2>&1
if errorlevel 1 (
    echo Fatal: This command must be run as Administrator. >&2
    echo Right-click Command Prompt, choose "Run as administrator", and re-run. >&2
    exit /b 1
)
exit /b 0

REM ===========================================================================
REM 16. Helper: Display usage instructions
:usage
echo Usage: %SELF% [install ^| status ^| restart ^| logout ^| uninstall] [options]
echo.
echo   install                   Install and start the daemon (needs admin).
echo                             Starts at boot and keeps running after you
echo                             sign out (S4U scheduled task, Session 0).
echo                             Auto-update is ON by default: periodically
echo                             restarts the daemon to apply downloaded updates.
echo   install --no-auto-update  Install without the scheduled auto-update.
echo   install --interval weekly Customize the cadence (hourly/daily/weekly).
echo   install --name ^<name^>     Set the instance name shown in Remote Control.
echo                             If omitted, setup asks for it interactively.
echo   install --no-prompt       Don't ask for a name; keep whatever is saved.
echo   status                    Show daemon status and recent logs.
echo   restart                   Restart the daemon (also applies any update).
echo   logout                    Sign out: stop the daemon and delete the saved auth token.
echo   uninstall                 Stop and remove the daemon and auto-update task.
exit /b 1
