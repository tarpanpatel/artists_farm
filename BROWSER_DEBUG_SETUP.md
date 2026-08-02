# Browser Debugging Integration Setup

This allows Claude to automatically monitor your browser console, network requests, and errors without you having to manually check the DevTools.

## Quick Start (5 minutes)

### 1. Install Dependencies

```bash
cd c:\xampp\htdocs\artists_farm

# Rename the package file
ren browser-monitor-package.json package.json

# Install
npm install
```

### 2. Launch Chrome with Debugging

**Option A: Using the batch file**

Create `launch-chrome-debug.bat`:
```batch
@echo off
taskkill /F /IM chrome.exe 2>nul
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --remote-debugging-port=9222 ^
  --user-data-dir=%TEMP%\chrome-debug ^
  http://localhost:3000/artists_farm
pause
```

Then run it.

**Option B: Manual command**

```bash
# PowerShell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir=$env:TEMP\chrome-debug `
  http://localhost:3000/artists_farm
```

### 3. Start Browser Monitor (in another terminal)

```bash
cd c:\xampp\htdocs\artists_farm
npm run monitor
```

You should see:
```
[INFO] 🔍 Connecting to Chrome DevTools Protocol on port 9222...
[INFO] ✅ Connected to Chrome
[CONSOLE] Console monitoring enabled
[NETWORK] Network monitoring enabled
[INFO] 📡 Monitoring browser. Press Ctrl+C to stop.
[INFO] Logs saved to: c:\xampp\htdocs\artists_farm\browser-logs
```

---

## How It Works

When you're browsing or testing the app:

### Console Logs
All `console.log()`, `console.error()`, etc. are captured:
```
[CONSOLE] [debug] Kitchen module loaded (app.tsx:409)
[CONSOLE] [error] Failed to fetch modules (ModulesContext.tsx:45)
```

### Network Requests
All API calls are logged:
```
[NETWORK] [1] POST http://localhost:3004/php/api/router.php?action=toggle_property_module
[NETWORK]     ↳ Response: 200 OK
```

### Errors & Exceptions
All JavaScript errors are captured:
```
[ERROR] Exception: Cannot read property 'is_enabled' of undefined at line 101:25
```

---

## Log Files

After running, check these files in `browser-logs/`:

- **console.log** - All console output
- **network.log** - All network requests
- **errors.log** - All errors and exceptions

```bash
# View logs in real-time
Get-Content browser-logs\console.log -Wait

# Or I can read them directly
```

---

## How Claude Uses This

When investigating bugs, I can:

1. **Read console logs** → Find JavaScript errors
2. **Check network logs** → See failed API calls
3. **Review errors** → Identify exceptions

**Instead of:**
- "Can you check the browser console?"
- "What's in the Network tab?"
- "Do you see any errors?"

**I can:**
- Read the logs directly
- Identify issues immediately
- Propose fixes with full context

---

## Example Workflow

### Before (Manual)
```
Me: "Can you check the browser console for errors?"
You: "Okay, let me look... I see 'Cannot read property is_enabled'"
Me: "Can you show me the full error?"
You: "It says line 101 in ModulesContext.tsx"
```

### After (Automated)
```
browser-logs/errors.log shows:
[ERROR] Exception: Cannot read property 'is_enabled' of undefined at ModulesContext.tsx:101

Me: I can read this directly and propose fix immediately
```

---

## Troubleshooting

### "Connection refused" error
- Make sure Chrome is running with `--remote-debugging-port=9222`
- Check that port 9222 is not blocked by firewall

### "No logs are being created"
- Check that Chrome is actually connected (you should see it in the monitor output)
- Make sure you're accessing the app through http://localhost:3000/

### Want to stop monitoring?
- Press `Ctrl+C` in the monitor terminal
- Logs will remain in `browser-logs/`

---

## Features

✅ Real-time console monitoring  
✅ Network request tracking  
✅ JavaScript error capture  
✅ Timestamped logs  
✅ Automatic file storage  
✅ No impact on app performance  

---

## Optional: Auto-Start Service

To auto-start the monitor when you launch Chrome, create a shortcut that runs:

```bash
start "" "C:\xampp\htdocs\artists_farm\launch-chrome-debug.bat"
timeout /t 2
start "" cmd /k "cd c:\xampp\htdocs\artists_farm && npm run monitor"
```

This will open both Chrome and the monitor in parallel.
