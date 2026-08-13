# ðŸ˜ PHP Server Deployment Guide â€” Ground Code Jaipur Terminal

This directory contains a modular, structured PHP + MySQL backend organized strictly by domain function and usage for easy deployment on Apache/Nginx, cPanel, Hostinger, GoDaddy, Bluehost, or AWS.

---

## ðŸ“‚ Modular Directory & File Structure

```
php/
â”œâ”€â”€ config/
â”‚   â””â”€â”€ database.php         # PDO MySQL connection & CORS headers
â”œâ”€â”€ api/
â”‚   â””â”€â”€ router.php           # Central API endpoint router & request dispatcher
â”œâ”€â”€ guests/
â”‚   â””â”€â”€ guests.php           # Front Office resident check-ins, stay details & checkouts
â”œâ”€â”€ billing/
â”‚   â”œâ”€â”€ billing.php          # Incidentals logging, custom adjustments & split checkout
â”‚   â””â”€â”€ receipts.php         # Past printed receipts archive
â”œâ”€â”€ kitchen/
â”‚   â”œâ”€â”€ orders.php           # Take food orders, KOT tickets & status updates
â”‚   â””â”€â”€ menu.php             # Food menu catalog & custom dishes manager
â”œâ”€â”€ inventory/
â”‚   â””â”€â”€ inventory.php        # Warehouse stock requests, deficits & kitchen purchases
â”œâ”€â”€ finance/
â”‚   â””â”€â”€ petty_cash.php       # Outflow expenses, cash drawer & misc charges
â”œâ”€â”€ staff/
â”‚   â””â”€â”€ staff.php            # Attendance tracking, payee salaries & permissions
â”œâ”€â”€ audit/
â”‚   â””â”€â”€ audit.php            # Security audit trails, staff logs & system errors
â”œâ”€â”€ telegram/
â”‚   â””â”€â”€ telegram.php         # Telegram alert templates & webhook dispatches
â”œâ”€â”€ schema/
â”‚   â””â”€â”€ schema.sql           # MySQL database schema (7 core relational tables)
â””â”€â”€ README_PHP.md            # Directory structure documentation
```

---

## ðŸ› ï¸ Installation & Setup Steps

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

