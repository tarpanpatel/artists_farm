# 📊 User Problem Monitoring Guide

**Purpose:** See what's breaking for users and why they get stuck  
**Location:** `/php/errors/` (Telescope Error Center)  
**Last Updated:** 2026-07-31

---

## 🎯 What Problems Can You See?

### 1. **Dead Ends** (User gets stuck, no way out)
- User navigates to a page but can't navigate away
- No logout button visible
- No back button or navigation
- Stuck in modal/form with no cancel button

**How to find:** Look for `🚫 DEAD END` in Telescope → `404` portal

**Example:**
```
🚫 DEAD END: User stuck at /admin/dashboard with no navigation
Context: User role is 'viewer', cannot access any features
```

---

### 2. **Authentication Failures** (User can't login)
- Wrong password repeatedly
- Passcode doesn't work
- Session expires unexpectedly
- Can't register new account

**How to find:** Look for `🔒 AUTH FAILURE` in Telescope → `Security` portal

**Example:**
```
🔒 AUTH FAILURE: Incorrect passcode attempt - tried 'invalid_pin'
User IP: 192.168.1.100
Attempts: 3 in last 5 minutes
```

---

### 3. **Permission Denied** (User lacks access)
- User tries to delete property but gets "unauthorized"
- Staff member tries to access Kitchen but module disabled
- Tenant tries to create second property but plan doesn't allow it

**How to find:** Look for `🔐 PERMISSION DENIED` in Telescope → `Security` portal

**Example:**
```
🔐 PERMISSION DENIED: Delete property on PropertyManagement - User role is 'manager'
Expected: Super admin only
Actual: User lacks is_platform_admin flag
```

---

### 4. **API Errors** (Backend is broken)
- "500 Internal Server Error"
- "404 Not Found"
- Timeout errors
- Database connection failures

**How to find:** Look for `⚠️ API ERROR` in Telescope → `Requests` portal

**Example:**
```
⚠️ API ERROR: POST /api/kitchen/orders returned 500
Message: SQLSTATE[HY000]: General error: 1030 Got error...
Endpoint affected: Creating kitchen orders
```

---

### 5. **Session Lost** (User unexpectedly logged out)
- User was logged in, then kicked out
- Session cookie expired
- Multiple devices logged in
- Browser closed/refreshed

**How to find:** Look for `⏱️ SESSION LOST` in Telescope → `Security` portal

**Example:**
```
⏱️ SESSION LOST: Session timeout after 30 minutes
User: tenant_user (ID: 5)
Property: The Grand Hotel
Duration: 28 minutes of inactivity
```

---

### 6. **Confusion Points** (User might get confused and give up)
- Unclear error message
- Missing navigation options
- Unexpected behavior
- Form validation failures

**How to find:** Look for `🤔 CONFUSION POINT` in Telescope → `JS Browser` portal

**Example:**
```
🤔 CONFUSION POINT: Delete confirmation modal doesn't explain what will happen
User hesitated for 45 seconds, then abandoned delete
Data deleted: 2000 guest records
```

---

## 📱 How to Access Telescope

### Step 1: Open Telescope Dashboard
```
http://localhost/artists_farm/php/errors/
or
https://your-domain.com/php/errors/
```

### Step 2: Select Time Period
- **Today** - last 24 hours
- **Yesterday** - specific date
- **Last 7 Days** - weekly view
- **Custom** - pick your own date range

### Step 3: Filter by Portal (Category)
| Portal | What it Shows |
|--------|---------------|
| **Requests** | API calls, user actions, successes |
| **PHP** | Backend errors, exceptions, warnings |
| **SQL** | Database queries, slow queries |
| **JS** | Browser errors, confusion points |
| **Telegram** | Notification successes/failures |
| **Security** | Auth failures, permissions denied |
| **404** | Not found errors, dead ends |

### Step 4: Search
Type any keyword to search across all logs:
- Error messages: `"404"`, `"timeout"`
- User actions: `"property"`, `"kitchen"`
- User IPs: `"192.168"`
- Feature names: `"telegram"`, `"billing"`

---

## 🔍 Common Problem Patterns

### Pattern 1: User Can't Login
**Symptoms:**
- Multiple `🔒 AUTH FAILURE` logs in short time
- Same user IP trying different passwords
- `🔐 PERMISSION DENIED` logs after failed auth

**Fix Steps:**
1. Check user account exists in database
2. Verify password not expired/reset
3. Check if user account is active (not suspended)
4. Reset password via admin panel

---

### Pattern 2: Property Deletion Stuck
**Symptoms:**
- User clicks delete but nothing happens
- `⚠️ API ERROR: DELETE /api/properties returned 500`
- `🚫 DEAD END: User stuck on property management`

**Fix Steps:**
1. Check database logs for integrity issues
2. Look for orphaned guest/order records
3. Verify foreign key constraints
4. Run database repair: `REPAIR TABLE properties, guests, orders;`

---

### Pattern 3: Telegram Notifications Not Sending
**Symptoms:**
- User creates order but no Telegram notification
- `⚠️ API ERROR: POST telegram API returned 401`
- Check bot token in logs shows `"null"`

**Fix Steps:**
1. Verify `.env` has `TELEGRAM_BOT_TOKEN` set
2. Check bot hasn't been deleted or revoked
3. Verify group IDs are correct
4. Test bot connection: `curl -X GET "https://api.telegram.org/bot<TOKEN>/getMe"`

---

### Pattern 4: User Confusion During Checkout
**Symptoms:**
- `🤔 CONFUSION POINT: Billing page shows confusing total`
- User abandons checkout
- Logs show 3+ navigation attempts before giving up

**Fix Steps:**
1. Improve error messages
2. Add confirmation dialogs
3. Show calculation breakdown
4. Test UI with real users

---

## 📈 Metrics to Monitor Daily

### 1. Error Rate
```
Daily Check: How many CRITICAL/ERROR logs?
Target: < 5 per day in production
Alert: > 10 per day = investigate immediately
```

### 2. Failed Logins
```
Check: 🔒 AUTH FAILURE logs
Threshold: > 5 failed attempts = potential attack or confused user
Action: Send password reset email or investigate IP
```

### 3. API Response Times
```
Check: execution_time in Requests logs
Target: < 100ms for most queries
Alert: > 500ms = database performance issue
```

### 4. Module Errors
```
Check: 🔌 MODULE ERROR logs
Expected: 0 errors for enabled modules
If errors exist: Check module configuration
```

---

## 🛠️ How to Fix User Problems

### When You See a Dead End
```
1. Read the context in telescope log
2. Reproduce the issue locally
3. Add missing navigation/logout button
4. Test user can escape from page
5. Deploy fix
6. Verify next user doesn't hit same issue
```

### When You See Auth Failure
```
1. Check if user credentials are correct
2. Verify user account status (active/suspended)
3. Check password reset email sent
4. If repeated: investigate for brute force attack
5. Consider rate limiting or CAPTCHA
```

### When You See API Error
```
1. Check HTTP status code in telescope
   - 401: Auth/API key issue
   - 403: Permission issue
   - 404: Resource not found
   - 500: Server error (check PHP logs)
   - 503: Service temporarily down
2. Look for error message details
3. Check database logs
4. Test endpoint with curl
5. Fix and redeploy
```

---

## 🚨 Critical Issues to Watch For

### 🔴 IMMEDIATE ACTION REQUIRED
| Issue | Watch For | Action |
|-------|-----------|--------|
| **DDoS/Attack** | Spike in 404s or auth failures from same IP | Block IP in firewall |
| **Database Down** | Multiple "database connection" errors | Restart MySQL, check disk space |
| **Session Hijacking** | Different IPs for same session ID | Force logout all users, review logs |
| **Data Loss** | Delete operations fail silently | Restore from backup, audit changes |
| **Payment Failed** | Billing API errors | Check with payment provider |

---

## 📊 Sample Telescope Queries

### Find all dead ends today
```
Filter: Portal = "404"
Time: Today
Search: "dead_end" or "DEAD END"
```

### Find all failed authentications
```
Filter: Portal = "Security"
Time: Last 7 Days
Search: "AUTH FAILURE"
```

### Find slow API calls
```
Filter: Portal = "Requests"
Time: Last 7 Days
Search: "ERROR" or "CRITICAL"
```

### Find confused users
```
Filter: Portal = "JS Browser"
Time: Last 24 Hours
Search: "confusion" or "CONFUSION POINT"
```

---

## 📋 Weekly Monitoring Checklist

- [ ] Review all ERROR/CRITICAL logs from past 7 days
- [ ] Check auth failure pattern
- [ ] Verify Telegram notifications working
- [ ] Check API response times
- [ ] Look for any 404/dead ends
- [ ] Confirm no session loss issues
- [ ] Review permission denied patterns
- [ ] Archive old logs if > 2000 entries

---

## 🔗 Related Documentation

- **Deployment:** See `DEPLOYMENT.md` for monitoring setup
- **Security:** See `PRE_LAUNCH_CHECKLIST.md` for security issues
- **Architecture:** See `ARCHITECTURE.md` for system design

---

## 💡 Tips for Better Monitoring

1. **Set up alerts** - Have Telegram notify you of CRITICAL logs
2. **Tag important logs** - Add custom context to understand user flow
3. **Test dead ends** - Regularly test for pages user can't escape from
4. **Monitor conversion** - Track successful vs failed user actions
5. **Review patterns** - Look for recurring issues that affect many users
6. **Act fast** - Fix issues within 24 hours if they block users

---

**Your Telescope Dashboard is your window into user problems.**  
**Check it daily. Fix issues quickly. Your users will thank you.**
