# 🌐 Complete Deployment Guide: Making Your Site Live on PHP Web Hosting

This guide explains how to upload and launch the **Artists Farm Resort Management System** on any standard PHP web hosting service (cPanel, Hostinger, GoDaddy, Namecheap, Bluehost, AWS Apache/Nginx, or VPS) **without needing Node.js or background application servers**.

---

## 📋 What You Need To Upload

Since the frontend is pre-built into standard HTML/CSS/JS (`dist/` folder) and the backend is written in native **PHP PDO + MySQL**, your production web directory only requires these folders and files:

```text
public_html/ (or artists_farm/)
├── dist/                   # Built static frontend (HTML, CSS, JS)
├── php/                    # Modular PHP Backend
│   ├── api/
│   │   └── router.php      # Central API Controller Endpoint
│   ├── config/
│   │   └── database.php    # MySQL Database Connection Settings
│   ├── schema/
│   │   ├── schema.sql      # Database Structure SQL
│   │   └── seed.sql        # Seed Data & Initial Records SQL
│   ├── guests/
│   ├── kitchen/
│   ├── inventory/
│   ├── finance/
│   ├── staff/
│   └── audit/
├── index.php               # Root PHP web loader
└── .htaccess               # Apache Rewrite & CORS Rules
```

---

## 🚀 Step-by-Step Live Deployment Process

### 1️⃣ Create MySQL Database in your Web Hosting Control Panel (cPanel / Hostinger hPanel)

1. Log into your web hosting panel (e.g., **cPanel** or **Hostinger hPanel**).
2. Go to **MySQL® Databases** (or **Databases**).
3. Create a new database, e.g., `u123456789_artists_farm`.
4. Create a MySQL user, e.g., `u123456789_farm_user`, with a strong password.
5. Add the user to the database and grant **ALL PRIVILEGES**.

---

### 2️⃣ Import Database Tables & Seed Data

1. Open **phpMyAdmin** from your web hosting dashboard.
2. Select your newly created database on the left sidebar.
3. Click the **Import** tab at the top.
4. Upload `php/schema/seed.sql` from your project files.
5. Click **Go** / **Import**. You will see all 12+ database tables populated (`guests`, `orders`, `menu_items`, `req_catalog`, `users`, `audit_logs`, `farm_utility_expenses`, etc.).

---

### 3️⃣ Configure Database Credentials

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

### 4️⃣ Upload Files to Web Hosting (`public_html`)

1. Open **File Manager** in cPanel or connect via **FTP/SFTP** (using FileZilla or Cyberduck).
2. Go to your web root folder (usually `public_html/` or a subdomain folder like `public_html/resort/`).
3. Upload all files:
   - `dist/`
   - `php/`
   - `index.php`
   - `.htaccess`

---

### 5️⃣ Access Your Live Website!

Open your website domain in any web browser:
- **Main App**: `https://yourdomain.com/`
- **Test PHP API**: `https://yourdomain.com/php/api/router.php`

---

## 🔐 System Login Credentials

Once your site is live, log in using these default credentials:

| Username | Passcode PIN | Role |
| :--- | :--- | :--- |
| **Tarpan** | `3685` | Super Admin |
| **Kamlesh** | `1202` | Staff Supervisor |
| **Rohit** | `1202` | Admin |
| **Abhijiet** | `1202` | Staff Kitchen |
| **Subrata** | `1202` | Admin |

---

## 🛠️ Testing Local XAMPP vs. Live Hosting

| Environment | URL to Open Frontend | URL to Test PHP API |
| :--- | :--- | :--- |
| **Local XAMPP** | `http://localhost/artists_farm/` | `http://localhost/artists_farm/php/api/router.php` |
| **Live Web Host** | `https://yourdomain.com/` | `https://yourdomain.com/php/api/router.php` |
