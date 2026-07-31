# 🚀 DEPLOY TO PRODUCTION - artistic-sthan.com

**Server:** 91.238.163.173  
**Domain:** artistic-sthan.com  
**Database:** apartment_site

---

## 📋 **DEPLOYMENT STEPS** (5 minutes)

### **Step 1: Download SSH Key from cPanel**

1. Go to cPanel (as shown in your screenshot)
2. Click "Download Key" button
3. Save file as `id_rsa` in your home directory
4. Run on your computer:
```bash
chmod 600 ~/id_rsa
```

---

### **Step 2: Download Project Files**

Clone the latest code to your computer:

```bash
git clone https://github.com/your-repo/artists-farm.git artistic-sthan
cd artistic-sthan
```

Or if you already have it locally, update it:
```bash
cd artistic-sthan
git pull origin main
```

---

### **Step 3: Upload & Deploy**

Run this command from your local machine:

```bash
# Make deploy script executable
chmod +x deploy-to-production.sh

# Run deployment
./deploy-to-production.sh
```

The script will:
- ✅ Test SSH connection
- ✅ Package all files
- ✅ Upload to server (91.238.163.173)
- ✅ Extract files
- ✅ Install dependencies
- ✅ Build React app
- ✅ Create .env file
- ✅ Verify site is live

**Total time: ~3 minutes**

---

### **Step 4: Configure Credentials**

After deployment completes, SSH to your server:

```bash
ssh -i ~/id_rsa apartment@91.238.163.173
```

Edit the .env file:
```bash
nano public_html/.env
```

Update these values:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
TELEGRAM_KITCHEN_CHAT_ID=your_group_id
TELEGRAM_ADMIN_CHAT_ID=your_group_id
TELEGRAM_FINANCE_CHAT_ID=your_group_id

MAIL_USERNAME=your_gmail@gmail.com
MAIL_PASSWORD=your_app_password
```

Save: `Ctrl+O` → `Enter` → `Ctrl+X`

---

### **Step 5: Verify Site is Live**

Open in browser:
```
https://artistic-sthan.com
```

Should load without errors ✅

---

## 🔐 **SSH Credentials**

- **Server IP:** 91.238.163.173
- **Username:** apartment
- **SSH Key:** Download from cPanel (id_rsa)
- **Port:** 22 (default)

---

## 📊 **Database Credentials**

- **Database:** apartment_site
- **User:** apartment_site
- **Password:** admin@1235
- **Host:** localhost

---

## 🆘 **Troubleshooting**

### **"SSH permission denied"**
```bash
# Fix key permissions
chmod 600 ~/id_rsa
```

### **"Cannot find deploy script"**
Make sure you're in the project directory:
```bash
cd artistic-sthan
ls -la deploy-to-production.sh
```

### **"npm not found"**
cPanel may need Node.js enabled. Go to cPanel and enable Node.js support.

### **"Site shows 404"**
Wait 1-2 minutes for the site to initialize. If still 404, check:
```bash
ssh -i ~/id_rsa apartment@91.238.163.173
ls -la public_html/
cat public_html/.env
```

---

## ✅ **After Deployment**

- [ ] Site loads at https://artistic-sthan.com
- [ ] Update .env with Telegram credentials
- [ ] Test login functionality
- [ ] Create first property
- [ ] Test license management
- [ ] Verify Telegram notifications

---

## 📞 **Quick Commands**

```bash
# SSH to server
ssh -i ~/id_rsa apartment@91.238.163.173

# View logs
tail -f ~/public_html/logs/license_checker.log

# Backup database
mysqldump -u apartment_site -p apartment_site > backup.sql

# Restart services (via cPanel)
```

---

## 🎉 **READY TO DEPLOY!**

Just follow the 5 steps above and your site will be live.

**Questions?** Let me know after Step 3 if anything doesn't work!
