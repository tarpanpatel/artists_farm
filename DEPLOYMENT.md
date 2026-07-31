# 🚀 Deployment Guide - Artists Farm

**Last Updated:** 2026-07-31  
**Status:** Ready for Production Deploy

---

## Pre-Deployment Checklist

### 1. Environment Configuration ✅ REQUIRED
```bash
# Copy the example file
cp .env.example .env

# Edit .env with your actual values
nano .env  # or use your editor
```

**Required Variables:**
```
API_KEY=<generate-secure-random-32-char-key>
TELEGRAM_BOT_TOKEN=<your-telegram-bot-token>
TELEGRAM_KITCHEN_CHAT_ID=<your-kitchen-group-id>
TELEGRAM_ADMIN_CHAT_ID=<your-admin-group-id>
TELEGRAM_FINANCE_CHAT_ID=<your-finance-group-id>
```

### 2. Telegram Bot Setup
1. Create new bot via @BotFather on Telegram
2. Copy the bot token (format: `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
3. Create private groups for Kitchen, Admin, Finance
4. Add bot to each group
5. Get group IDs (usually negative numbers like `-5456387701`)
6. Update `.env` with these values

### 3. API Key Generation
```bash
# Generate a secure random API key (Linux/Mac)
openssl rand -hex 16

# Or use this one-liner to generate 32 chars
head -c 32 /dev/urandom | base64 | tr '+/' '-_'
```

### 4. Database Backup
```bash
# Create backup before deployment
mysqldump -u root artists_farm > backup_2026-07-31.sql

# Test restore to verify backup works
# (Don't restore to production, just verify file is valid)
```

### 5. Build for Production
```bash
# Install dependencies
npm install

# Create production build
npm run build

# Verify build succeeded
ls -lh dist/
```

---

## Deployment Steps

### Option A: XAMPP/Local Server
```bash
# 1. Copy .env file (already in place)
# 2. Restart PHP/Apache
# 3. Test: Open http://localhost/artists_farm

# Verify in browser:
# - No console errors (press F12, check Console tab)
# - Login page loads
# - Can create test property
```

### Option B: Production Server
```bash
# 1. SSH to server
ssh user@your-server.com

# 2. Navigate to project
cd /var/www/artists_farm

# 3. Pull latest code
git pull origin main

# 4. Create .env file
nano .env
# Paste production values

# 5. Restart PHP-FPM (if applicable)
sudo systemctl restart php-fpm

# 6. Clear caches (if any)
rm -rf dist/
npm run build

# 7. Verify logs
tail -f /var/log/php-fpm.log
tail -f /var/log/nginx/error.log
```

---

## Post-Deployment Verification

### ✅ Security Checks
```bash
# 1. Verify no hardcoded secrets in deployed files
grep -r "artists-farm-secure-key\|8999394059" dist/ php/
# Should return: no results

# 2. Check .env is NOT in version control
git status | grep ".env"
# Should show: no results

# 3. Verify environment variables loaded
# Check server logs for any "undefined API_KEY" errors
```

### ✅ Functional Tests
1. **Login Flow**
   - Root admin can login
   - Tenant can login
   - Failed login shows error

2. **Property Management**
   - Create new property → has no prefilled data
   - Delete property → shows confirmation modal
   - Must type property name to confirm deletion

3. **Telegram Notifications**
   - Trigger a test event (create order, expense, etc.)
   - Verify message appears in Kitchen/Admin/Finance groups
   - Check message format is correct

4. **API Authentication**
   - POST requests require valid API_KEY
   - Missing API_KEY returns 401 Unauthorized
   - Invalid API_KEY returns 401 Unauthorized

5. **Console Verification**
   - Open browser DevTools (F12 → Console)
   - No red errors
   - No sensitive data visible
   - No debug logs

---

## Rollback Plan

### If Something Goes Wrong
```bash
# 1. Restore database from backup
mysql -u root < backup_2026-07-31.sql

# 2. Revert code to last known good version
git revert <commit-hash>
# or
git checkout <previous-tag>

# 3. Rebuild and redeploy
npm install
npm run build

# 4. Restart services
sudo systemctl restart php-fpm nginx
```

### Emergency Contacts
- Database: Check backups are readable
- Telegram: Verify bot token hasn't been revoked
- Server: Check disk space, CPU, memory

---

## Troubleshooting

### "Unauthorized API key" errors
```
✓ Check .env file exists and is readable by PHP
✓ Verify API_KEY environment variable is set
✓ Restart PHP-FPM: sudo systemctl restart php-fpm
✓ Check error logs: tail -f /var/log/php-fpm.log
```

### "Telegram bot token not working"
```
✓ Verify bot token copied correctly from @BotFather
✓ Confirm bot is added to all three groups
✓ Check bot hasn't been revoked or deleted
✓ Test with curl:
   curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
     -d "chat_id=<GROUP_ID>&text=Test"
```

### "Property deletion fails silently"
```
✓ Check database permissions
✓ Verify all related tables exist (guests, orders, inventory, etc.)
✓ Check database error logs
✓ Increase PHP max_execution_time if dataset is large
```

### Build fails with "out of memory"
```
# Increase Node memory
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

---

## Monitoring Post-Deploy

### Daily Checks
- [ ] Check error logs: `tail -f /var/log/php-fpm.log`
- [ ] Verify Telegram messages are sending
- [ ] Check database disk usage
- [ ] Monitor server CPU/memory

### Weekly Checks
- [ ] Test login with different user roles
- [ ] Verify backups are running
- [ ] Check for security warnings/updates

### Monthly Reviews
- [ ] Review error logs for patterns
- [ ] Audit API usage/authentication
- [ ] Check Telegram group IDs are still valid
- [ ] Plan performance optimizations

---

## Security Reminders

🔒 **Never commit .env file to git**
```bash
# Make sure .gitignore includes .env
echo ".env" >> .gitignore
git rm --cached .env
```

🔒 **Rotate secrets periodically**
- API_KEY: Every 6 months
- Telegram Bot Token: Every 6-12 months
- Database Password: Every 3 months

🔒 **Monitor for unauthorized access**
- Check API logs for suspicious patterns
- Watch for failed login attempts
- Monitor database queries for injection attempts

---

## Support & Documentation

- **Architecture:** See `ARCHITECTURE.md`
- **Pre-Launch Checklist:** See `PRE_LAUNCH_CHECKLIST.md`
- **API Routes:** See `php/api/router.php`
- **Database Schema:** See `php/schema.sql`

---

**Deployment Date:** _______________  
**Deployed By:** _______________  
**Environment:** ☐ Local ☐ Staging ☐ Production  
**Backup File:** _______________  
