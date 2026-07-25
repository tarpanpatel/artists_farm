# 🐘 PHP Server Deployment Guide — Artists Farm Jaipur Terminal

This directory contains a modular, structured PHP + MySQL backend organized strictly by domain function and usage for easy deployment on Apache/Nginx, cPanel, Hostinger, GoDaddy, Bluehost, or AWS.

---

## 📂 Modular Directory & File Structure

```
php/
├── config/
│   └── database.php         # PDO MySQL connection & CORS headers
├── api/
│   └── router.php           # Central API endpoint router & request dispatcher
├── guests/
│   └── guests.php           # Front Office resident check-ins, stay details & checkouts
├── billing/
│   ├── billing.php          # Incidentals logging, custom adjustments & split checkout
│   └── receipts.php         # Past printed receipts archive
├── kitchen/
│   ├── orders.php           # Take food orders, KOT tickets & status updates
│   └── menu.php             # Food menu catalog & custom dishes manager
├── inventory/
│   └── inventory.php        # Warehouse stock requests, deficits & kitchen purchases
├── finance/
│   └── petty_cash.php       # Outflow expenses, cash drawer & misc charges
├── staff/
│   └── staff.php            # Attendance tracking, payee salaries & permissions
├── audit/
│   └── audit.php            # Security audit trails, staff logs & system errors
├── telegram/
│   └── telegram.php         # Telegram alert templates & webhook dispatches
├── schema/
│   └── schema.sql           # MySQL database schema (7 core relational tables)
└── README_PHP.md            # Directory structure documentation
```

---

## 🛠️ Installation & Setup Steps

1. **Import Database Schema**:
   Import `php/schema/schema.sql` into phpMyAdmin or MySQL server.

2. **Database Credentials**:
   Configure host, user, and password inside `php/config/database.php`:
   ```php
   $db_host = 'localhost';
   $db_name = 'artists_farm_resort';
   $db_user = 'your_username';
   $db_pass = 'your_password';
   ```

3. **Deploy API Router**:
   Point your frontend API base URL to `https://your-domain.com/php/api/router.php`.
