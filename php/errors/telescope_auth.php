<?php
/**
 * Login gate for the Telescope Error Center (added 22 Aug 2026, at the
 * user's explicit request - this page previously had no auth at all).
 *
 * Deliberately NOT wired to the main app's staff/session system
 * (StaffContext, artists_farm_session, the staff_users table) - Telescope's
 * whole reason for existing is to still work when the rest of the app is
 * broken, including "the database itself is down" (a SQL Error is one of
 * the very things it alerts on). If logging in here required a working DB
 * connection, the one moment you most need to open Telescope - a live
 * outage - is exactly the moment you'd be locked out of it. So this is a
 * single shared password, file-backed, zero DB dependency, same pattern as
 * php/config/db_pass.php.
 *
 * Uses its own session name (telescope_session) - entirely separate cookie
 * from the main app's artists_farm_session, so logging in/out here can
 * never interact with a staff member's own logged-in session on the real
 * app, and vice versa.
 */

if (!function_exists('getTelescopePassword')) {

    function getTelescopePassword(): string {
        // Staging always uses this fixed passcode (explicit request) so QA/staff can unlock
        // Telescope there without needing to look up a generated password - staging never holds
        // real guest data, so a shared, memorable passcode is an acceptable tradeoff there in a
        // way it wouldn't be on production. Checked first (before the env var / generated-file
        // fallbacks below) so it's authoritative on staging regardless of what else is configured.
        // Server-name check only (no database.php require) - this file is deliberately
        // DB-independent, see the file-level doc comment above.
        $serverName = $_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? '';
        if ($serverName === 'staging.ground-code.com') {
            return '368545';
        }

        $envPass = getenv('TELESCOPE_ACCESS_PASSWORD');
        if ($envPass) {
            return $envPass;
        }

        $path = __DIR__ . '/../config/telescope_pass.php';
        if (file_exists($path)) {
            $stored = require $path;
            if (is_string($stored) && $stored !== '') {
                return $stored;
            }
        }

        // Self-heal: first-ever access generates and persists a strong random
        // password rather than shipping any hardcoded default (this app has
        // already been burned once by exactly that - see ROADMAP.md's "hardcoded
        // emergency-admin backdoor" entry - not repeating it here). Read it the
        // same way db_pass.php's own value is normally retrieved: open the file
        // on the server once (SSH/file manager) to see what got generated.
        $generated = bin2hex(random_bytes(12));
        @file_put_contents($path, "<?php\nreturn " . var_export($generated, true) . ";\n", LOCK_EX);
        @chmod($path, 0600);
        return $generated;
    }

    function telescopeStartSession(): void {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        session_name('telescope_session');
        session_set_cookie_params([
            'lifetime' => 86400 * 30,
            // Deliberately '/' not '/php/errors/' - this app is served from
            // the domain root in production but from a /artists_farm/
            // subfolder on local XAMPP (see .htaccess's own RewriteBase
            // comment for the same distinction elsewhere), so a path scoped
            // to just "/php/errors/" would silently never match a request to
            // "/artists_farm/php/errors/..." locally. A same-origin session
            // cookie doesn't leak anything by being sent domain-wide - only
            // this file ever reads $_SESSION['telescope_authed'].
            'path' => '/',
            'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    function isTelescopeAuthed(): bool {
        telescopeStartSession();
        return !empty($_SESSION['telescope_authed']);
    }

    function renderTelescopeLoginPage(?string $error = null): void {
        ?>
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Telescope Error Center</title>
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#0b0f19">
    <link rel="stylesheet" href="telescope.css">
    <style>
        body { background-color: #0b0f19; color: #f3f4f6; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .icon { width: 1em; height: 1em; display: inline-block; flex-shrink: 0; }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center px-4">
    <form id="loginForm" class="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4 shadow-2xl">
        <div class="flex items-center gap-2.5 mb-2">
            <div class="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">🔭</div>
            <h1 class="text-base font-bold text-white tracking-wider uppercase">Telescope Error Center</h1>
        </div>
        <?php if ($error): ?>
        <div class="text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2"><?= htmlspecialchars($error) ?></div>
        <?php endif; ?>
        <div class="relative">
            <input type="password" id="passwordInput" placeholder="Access password" autofocus
                inputmode="numeric"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-11 min-h-[2.75rem] text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <button type="button" id="togglePasswordBtn" onclick="toggleTelescopePasswordVisibility()" class="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-300 transition cursor-pointer" title="Show password" aria-label="Show password">
                <svg id="togglePasswordIconShow" class="icon w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                <svg id="togglePasswordIconHide" class="icon w-4 h-4 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/></svg>
            </button>
        </div>
        <button type="submit" class="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold rounded-lg px-3 min-h-[2.75rem] transition cursor-pointer">
            Unlock
        </button>
    </form>
    <script>
        function toggleTelescopePasswordVisibility() {
            const input = document.getElementById('passwordInput');
            const showIcon = document.getElementById('togglePasswordIconShow');
            const hideIcon = document.getElementById('togglePasswordIconHide');
            const btn = document.getElementById('togglePasswordBtn');
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            showIcon.classList.toggle('hidden', isHidden);
            hideIcon.classList.toggle('hidden', !isHidden);
            btn.title = isHidden ? 'Hide password' : 'Show password';
            btn.setAttribute('aria-label', btn.title);
        }

        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('passwordInput').value;
            const res = await fetch('index.php?action=telescope_login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });
            const data = await res.json();
            if (data.status === 'success') {
                window.location.reload();
            } else {
                window.location.href = 'index.php?login_error=1';
            }
        });
    </script>
</body>
</html>
        <?php
    }
}
