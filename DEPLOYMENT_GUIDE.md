# Ground Code Deployment Guide

**Status**: Partial - FTP archive uploaded, configuration updated, ready for extraction

## What's Been Done âœ…

1. **Configuration Updated**
   - âœ… `database.php` updated to use `apartment_site` database
   - âœ… `db_pass.php` created with production credentials
   - âœ… `sftp-config.json` corrected (Port: 21, Path: /public_html)
   - âœ… `.sftpignore` created with proper ignore patterns

2. **Files Ready**
   - âœ… Project archive created: `deploy.tar.gz` (1.2 MB)
   - âœ… Archive UPLOADED to server at `/public_html/deploy.tar.gz`
   - âœ… Key files uploaded: `.htaccess`, `index.html`, `package.json`, `tsconfig.json`

## What's Needed Next ðŸ“‹

### Step 1: Extract Project Files (CRITICAL)
**On the server via cPanel File Manager or SSH:**
```bash
cd /public_html
tar -xzf deploy.tar.gz
rm deploy.tar.gz
```

### Step 2: Database Setup (CRITICAL)
**Via cPanel > phpMyAdmin or SSH:**

Import SQL files in order:
```
php/schema/schema.sql
php/schema/properties.sql  
php/schema/licenses.sql
php/schema/seed.sql
```

**Database Credentials:**
- Host: localhost
- Database: apartment_site
- User: apartment_site
- Password: admin@1235

### Step 3: Build Frontend
```bash
cd /public_html
npm install
npm run build
```

### Step 4: Setup Deploylite
Visit: `http://artistsfarmjaipur.com/deploylite/public/`
- Login: admin
- Configure backups & deployments

## SFTP Sync (Optional - for future updates)

Use the corrected `sftp-config.json`:
- **Host**: 91.238.163.173
- **Port**: 21
- **User**: apartment
- **Password**: tPatel13@
- **Remote**: /public_html

## Quick Test

1. Frontend: https://artistsfarmjaipur.com/
2. Deploylite: https://artistsfarmjaipur.com/deploylite/public/
3. API: Test connection works

---
All configuration files are ready. Main task: Extract archive & import database.

