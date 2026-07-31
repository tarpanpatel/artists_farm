# 🚀 Deployment Guide - artistic-sthan.in

**Domain:** artistic-sthan.com  
**Database:** apartment_site  
**Status:** Ready for Production

---

## 📋 **Pre-Deployment Checklist**

Before running the deployment script, ensure you have:

- [ ] VPS/Server with Ubuntu 20.04 or higher
- [ ] Root SSH access to server
- [ ] Domain `artistic-sthan.in` registered
- [ ] Domain DNS updated to point to server IP
- [ ] Project files downloaded/cloned to local machine
- [ ] Telegram bot token (from @BotFather)
- [ ] Telegram group IDs for notifications

---

## 🖥️ **Server Requirements**

**Minimum:**
- 2GB RAM
- 20GB disk space
- 1 vCPU

**Recommended:**
- 4GB RAM
- 50GB disk space
- 2+ vCPU

**Supported OS:**
- Ubuntu 20.04 LTS
- Ubuntu 22.04 LTS
- Debian 11+

---

## 📥 **Step 1: Upload Project Files**

### **Option A: Clone from Git**
```bash
ssh root@your_server_ip
cd /var/www
git clone https://github.com/your-repo/artists-farm.git artistic-sthan.in
cd artistic-sthan.in
```

### **Option B: Upload via SCP**
```bash
# From your local machine
scp -r ./* root@your_server_ip:/var/www/artistic-sthan.in/
```

---

## 🔧 **Step 2: Run Deployment Script**

### **Make script executable:**
```bash
ssh root@your_server_ip
chmod +x /var/www/artistic-sthan.in/DEPLOYMENT_SCRIPT.sh
```

### **Run the script:**
```bash
/var/www/artistic-sthan.in/DEPLOYMENT_SCRIPT.sh
```

**What the script does:**
1. ✅ Updates system packages
2. ✅ Installs PHP, Apache, MySQL, Node.js
3. ✅ Creates project directories
4. ✅ Creates `.env` file
5. ✅ Creates database `apartment_site`
6. ✅ Configures Apache VirtualHost
7. ✅ Installs SSL certificate (Let's Encrypt)
8. ✅ Sets file permissions
9. ✅ Builds React app
10. ✅ Configures cron jobs
11. ✅ Creates backup script
12. ✅ Verifies installation

---

## ⚙️ **Step 3: Configure Credentials**

After deployment, update `.env` with your credentials:

```bash
ssh root@your_server_ip
nano /var/www/artistic-sthan.in/.env
```

**Update these fields:**

```env
# Telegram Configuration
TELEGRAM_BOT_TOKEN=1234567890:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg
TELEGRAM_KITCHEN_CHAT_ID=-5511705268
TELEGRAM_ADMIN_CHAT_ID=-5362212071
TELEGRAM_FINANCE_CHAT_ID=-5511705268

# Email Configuration (optional)
MAIL_USERNAME=your_email@gmail.com
MAIL_PASSWORD=your_app_password
```

**Save with:** `Ctrl+O`, `Enter`, `Ctrl+X`

---

## ✅ **Step 4: Verify Installation**

### **Check if application loads:**
```bash
curl -I https://artistic-sthan.in
# Should return: HTTP/2 200
```

### **Test database connection:**
```bash
mysql -u apartment_site -p -h localhost apartment_site
# Enter password: admin@1235
```

### **Check Apache logs:**
```bash
tail -f /var/log/apache2/artistic-sthan.in-error.log
```

### **Check PHP logs:**
```bash
tail -f /var/log/php8.1-fpm.log
```

---

## 🔐 **SSL Certificate**

The script automatically installs SSL via Let's Encrypt.

**Certificate renewal (automatic):**
```bash
# Certbot auto-renewal runs daily
systemctl status certbot.timer

# Manual renewal:
certbot renew
```

---

## 🛠️ **Post-Deployment Tasks**

### **1. Create Admin User**

```bash
ssh root@your_server_ip
mysql -u apartment_site -p apartment_site

INSERT INTO users (username, password, role, is_platform_admin) 
VALUES ('admin', PASSWORD('your_secure_password'), 'Super Admin', 1);
```

### **2. Test Telegram Notifications**

```bash
# Manually trigger the license checker
php /var/www/artistic-sthan.in/php/cron/check_licenses.php
```

### **3. Backup Initial Database**

```bash
/var/www/artistic-sthan.in/backup.sh
# Check: ls /var/www/artistic-sthan.in/backups/
```

### **4. Monitor Application**

```bash
# Real-time error monitoring
tail -f /var/log/apache2/artistic-sthan.in-error.log

# PHP errors
tail -f /var/log/php8.1-fpm.log

# License checker logs
tail -f /var/www/artistic-sthan.in/logs/license_checker.log
```

---

## 📊 **Useful Commands**

### **Restart Services**
```bash
# Apache
systemctl restart apache2

# PHP-FPM
systemctl restart php8.1-fpm

# MySQL
systemctl restart mysql
```

### **View Cron Jobs**
```bash
# www-data user
crontab -u www-data -l

# root user
crontab -l
```

### **Database Backup**
```bash
# Manual backup
mysqldump -u apartment_site -p apartment_site > backup.sql

# Restore backup
mysql -u apartment_site -p apartment_site < backup.sql
```

### **View Logs**
```bash
# All errors (last 100 lines)
tail -n 100 /var/log/apache2/artistic-sthan.in-error.log

# Follow live
tail -f /var/log/apache2/artistic-sthan.in-error.log

# Search for specific error
grep "ERROR" /var/log/apache2/artistic-sthan.in-error.log
```

---

## 🚨 **Troubleshooting**

### **Problem: "Cannot connect to database"**
```bash
# Check MySQL is running
systemctl status mysql

# Check credentials in .env
grep DB_ /var/www/artistic-sthan.in/.env

# Test connection
mysql -u apartment_site -p -h localhost apartment_site
```

### **Problem: "Apache gives 500 error"**
```bash
# Check error log
tail -f /var/log/apache2/artistic-sthan.in-error.log

# Check .htaccess
cat /var/www/artistic-sthan.in/public/.htaccess

# Check PHP config
php -r "phpinfo();" | grep -i "Configuration File"
```

### **Problem: "SSL certificate not working"**
```bash
# Check certificate
certbot certificates

# Renew certificate
certbot renew --force-renewal

# Check Apache SSL config
apache2ctl -S | grep artistic-sthan
```

### **Problem: "Telegram notifications not sending"**
```bash
# Check license checker log
tail -f /var/www/artistic-sthan.in/logs/license_checker.log

# Test cron job manually
php /var/www/artistic-sthan.in/php/cron/check_licenses.php

# Check .env has Telegram credentials
grep TELEGRAM /var/www/artistic-sthan.in/.env
```

---

## 📈 **Performance Tuning**

### **Increase PHP memory limit:**
```bash
nano /etc/php/8.1/fpm/php.ini

# Find and update:
memory_limit = 512M
max_execution_time = 300
upload_max_filesize = 100M
```

### **Enable Apache compression:**
```bash
a2enmod deflate
a2enmod gzip

systemctl restart apache2
```

### **Optimize MySQL:**
```bash
# Edit MySQL config
nano /etc/mysql/mysql.conf.d/mysqld.cnf

# Add these lines:
[mysqld]
key_buffer_size = 256M
max_connections = 200
tmp_table_size = 32M
```

---

## 📅 **Maintenance Schedule**

**Daily:**
- Check error logs
- Monitor disk space
- Verify license checker ran

**Weekly:**
- Review application performance
- Check backup status
- Test database restore

**Monthly:**
- Update system packages
- Review security logs
- Audit user access

**Quarterly:**
- Update dependencies
- Security review
- Performance optimization

---

## 🆘 **Support & Rollback**

### **If something goes wrong:**

1. **Check what failed:**
   ```bash
   tail -f /var/log/apache2/artistic-sthan.in-error.log
   ```

2. **Restore from backup:**
   ```bash
   mysql -u apartment_site -p apartment_site < /var/www/artistic-sthan.in/backups/db_backup_YYYYMMDD_HHMMSS.sql
   ```

3. **Revert files:**
   ```bash
   cd /var/www/artistic-sthan.in
   git checkout HEAD~1  # Go back one commit
   npm run build
   ```

4. **Contact support:**
   - Check application logs
   - Get error messages
   - Document the issue

---

## ✨ **URLs After Deployment**

```
Main Application:       https://artistic-sthan.in
Telescope Dashboard:    https://artistic-sthan.in/php/errors/
API Base:              https://artistic-sthan.in/php/api/router.php
Admin Panel:           https://artistic-sthan.in (login required)
```

---

## 🎉 **Deployment Complete!**

Your application is now live at **https://artistic-sthan.in**

**Next:** 
1. Log in as admin
2. Create your first tenant
3. Create a property
4. Add licenses
5. Set up Telegram notifications

**Questions?** Check the documentation or review the logs!
