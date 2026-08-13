# ðŸŒ Complete Deployment Guide: Making Your Site Live on PHP Web Hosting

This guide explains how to upload and launch the **Ground Code Resort Management System** on any standard PHP web hosting service (cPanel, Hostinger, GoDaddy, Namecheap, Bluehost, AWS Apache/Nginx, or VPS) **without needing Node.js or background application servers**.

---

## ðŸ“‹ What You Need To Upload

Since the frontend is pre-built into standard HTML/CSS/JS (`dist/` folder) and the backend is written in native **PHP PDO + MySQL**, your production web directory only requires these folders and files:

```text
public_html/ (or artists_farm/)
â”œâ”€â”€ dist/                   # Built static frontend (HTML, CSS, JS)
â”œâ”€â”€ php/                    # Modular PHP Backend
â”‚   â”œâ”€â”€ api/
â”‚   â”‚   â””â”€â”€ router.php      # Central API Controller Endpoint
â”‚   â”œâ”€â”€ config/
â”‚   â”‚   â””â”€â”€ database.php    # MySQL Database Connection Settings
â”‚   â”œâ”€â”€ schema/
â”‚   â”‚   â”œâ”€â”€ schema.sql      # Database Structure SQL
â”‚   â”‚   â””â”€â”€ seed.sql        # Seed Data & Initial Records SQL
â”‚   â”œâ”€â”€ guests/
â”‚   â”œâ”€â”€ kitchen/
â”‚   â”œâ”€â”€ inventory/
â”‚   â”œâ”€â”€ finance/
â”‚   â”œâ”€â”€ staff/
â”‚   â””â”€â”€ audit/
â”œâ”€â”€ index.php               # Root PHP web loader
â””â”€â”€ .htaccess               # Apache Rewrite & CORS Rules
```

---

## ðŸš€ Step-by-Step Live Deployment Process

### 1ï¸âƒ£ Create MySQL Database in your Web Hosting Control Panel (cPanel / Hostinger hPanel)

1. Log into your web hosting panel (e.g., **cPanel** or **Hostinger hPanel**).
2. Go to **MySQLÂ® Databases** (or **Databases**).
3. Create a new database, e.g., `u123456789_artists_farm`.
4. Create a MySQL user, e.g., `u123456789_farm_user`, with a strong password.
5. Add the user to the database and grant **ALL PRIVILEGES**.

---

### 2ï¸âƒ£ Import Database Tables & Seed Data

1. Open **phpMyAdmin** from your web hosting dashboard.
2. Select your newly created database on the left sidebar.
3. Click the **Import** tab at the top.
4. Upload `php/schema/seed.sql` from your project files.
5. Click **Go** / **Import**. You will see all 12+ database tables populated (`guests`, `orders`, `menu_items`, `req_catalog`, `users`, `audit_logs`, `farm_utility_expenses`, etc.).

---

### 3ï¸âƒ£ Configure Database Credentials

Open `php/config/database.php` in your hosting file manager or local code editor and update the credentials to match your live database:

```php
<?php
// Live Server Database Credentials
$db_host = 'localhost'; // Or database host provided by your hosting
$db_name = 'u123456789_artists_farm'; // Your live database name
$db_user = 'u123456789_farm_user'; // Your live database username
$db_pass = 'YourStrongPassword123!'; // Your live database password

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit();
}
```

---

### 4ï¸âƒ£ Upload Files to Web Hosting (`public_html`)

1. Open **File Manager** in cPanel or connect via **FTP/SFTP** (using FileZilla or Cyberduck).
2. Go to your web root folder (usually `public_html/` or a subdomain folder like `public_html/resort/`).
3. Upload all files:
   - `dist/`
   - `php/`
   - `index.php`
   - `.htaccess`

---

### 5ï¸âƒ£ Access Your Live Website!

Open your website domain in any web browser:
- **Main App**: `https://yourdomain.com/`
- **Test PHP API**: `https://yourdomain.com/php/api/router.php`

---

## ðŸ” System Login Credentials

Once your site is live, log in using these default credentials:

| Username | Passcode PIN | Role |
| :--- | :--- | :--- |
| **Tarpan** | `3685` | Super Admin |
| **Kamlesh** | `1202` | Staff Supervisor |
| **Rohit** | `1202` | Admin |
| **Abhijiet** | `1202` | Staff Kitchen |
| **Subrata** | `1202` | Admin |

---

## ðŸ› ï¸ Testing Local XAMPP vs. Live Hosting

| Environment | URL to Open Frontend | URL to Test PHP API |
| :--- | :--- | :--- |
| **Local XAMPP** | `http://localhost/artists_farm/` | `http://localhost/artists_farm/php/api/router.php` |
| **Live Web Host** | `https://yourdomain.com/` | `https://yourdomain.com/php/api/router.php` |

