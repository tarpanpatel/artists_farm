<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login - Artists Farm SaaS Platform</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-container { background: white; padding: 2.5rem; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); width: 100%; max-width: 420px; }
        .login-header { text-align: center; margin-bottom: 2rem; }
        .login-header h1 { font-size: 1.5rem; color: #333; margin-bottom: 0.5rem; }
        .login-header p { color: #666; font-size: 0.9rem; }
        .form-group { margin-bottom: 1.5rem; }
        .form-label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #333; }
        .form-input { width: 100%; padding: 0.75rem; border: 2px solid #e5e5e5; border-radius: 6px; font-size: 1rem; transition: border-color 0.2s; }
        .form-input:focus { outline: none; border-color: #667eea; }
        .btn { width: 100%; padding: 0.75rem; border: none; border-radius: 6px; font-size: 1rem; font-weight: 600; cursor: pointer; }
        .btn-primary { background: #667eea; color: white; }
        .btn-primary:hover { background: #5568d3; }
        .btn-danger { background: #ef4444; color: white; width: auto; padding: 0.5rem 1rem; font-size: 0.875rem; border-radius: 4px; text-decoration: none; display: inline-block; }
        .error-message { background: #fee2e2; color: #991b1b; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.9rem; display: none; }
        .demo-credentials { margin-top: 1.5rem; padding: 1rem; background: #f0f9ff; border-radius: 6px; font-size: 0.85rem; color: #666; }
        .demo-credentials strong { display: block; margin-bottom: 0.5rem; color: #333; }
        .demo-credentials code { background: #e5e5e5; padding: 0.125rem 0.375rem; border-radius: 3px; font-size: 0.8rem; }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="login-header">
            <h1>🏗️ Artists Farm SaaS</h1>
            <p>Platform Administration Portal</p>
        </div>

        <div id="error-message" class="error-message"></div>

        <form id="login-form" method="POST" action="api/login.php">
            <div class="form-group">
                <label class="form-label">Username</label>
                <input type="text" name="username" class="form-input" placeholder="Enter your username" required>
            </div>

            <div class="form-group">
                <label class="form-label">Password</label>
                <input type="password" name="password" class="form-input" placeholder="Enter your password" required>
            </div>

            <button type="submit" class="btn btn-primary">Sign In</button>
        </form>

        <div class="demo-credentials">
            <strong>Demo Accounts</strong>
            <div>Platform Admin: <code>platform_admin</code> / <code>admin123</code></div>
            <div>Tenant Admin: <code>artists-farm-platform_admin</code> / <code>admin123</code></div>
        </div>
    </div>

    <script type="module">
        document.getElementById('login-form').addEventListener('submit', async function(event) {
            event.preventDefault();
            const form = event.target;
            const formData = new FormData(form);
            const errorMessageElement = document.getElementById('error-message');

            try {
                const response = await fetch(form.action, {
                    method: 'POST',
                    body: formData
                });

                const result = await response.json();

                if (result.status === 'success') {
                    errorMessageElement.style.display = 'none';
                    window.location.href = result.redirect;
                } else {
                    errorMessageElement.textContent = result.message;
                    errorMessageElement.style.display = 'block';
                }
            } catch (error) {
                console.error('Login request failed:', error);
                errorMessageElement.textContent = 'An unexpected error occurred. Please try again.';
                errorMessageElement.style.display = 'block';
            }
        });

        // Display any initial error from URL (e.g., unauthorized.php redirect)
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('error')) {
            document.getElementById('error-message').textContent = urlParams.get('error');
            document.getElementById('error-message').style.display = 'block';
        }
    </script>
</body>
</html>