# 🐘 Complete XAMPP Installation & Setup Guide
## Artists Farm Resort & Kitchen Management System

This guide explains step-by-step how to set up and run the entire **Artists Farm Resort Management System** (React Frontend + PHP Modular Backend + MySQL Database) on **XAMPP** (Windows, macOS, or Linux).

---

## 🛠️ Step 1: Start XAMPP Control Panel

1. Open **XAMPP Control Panel**.
2. Click **Start** next to **Apache**.
3. Click **Start** next to **MySQL**.

---

## 📂 Step 2: Copy Project Files to `htdocs`

Locate your XAMPP web root directory (`htdocs`):
- **Windows**: `C:\xampp\htdocs\`
- **macOS**: `/Applications/XAMPP/xamppfiles/htdocs/` or `~/.bitnami/stackman/machines/xampp/volumes/root/htdocs/`
- **Linux**: `/opt/lampp/htdocs/`

1. Create a folder inside `htdocs` named **`artists_farm`**:
   `C:\xampp\htdocs\artists_farm\`
2. Copy all your project files into this `artists_farm` directory.
   The structure inside `htdocs/artists_farm` will look like:
   ```
   htdocs/
   └── artists_farm/
       ├── dist/                # Production build of React app
       ├── php/                 # PHP Backend
       │   ├── api/router.php   # Central API Endpoint
       │   ├── config/database.php
       │   ├── schema/seed.sql  # Full Database Seed with 290+ Records
       │   ├── guests/
       │   ├── kitchen/
       │   ├── inventory/
       │   ├── finance/
       │   └── staff/
       ├── index.html
       └── package.json
   ```

---

## 🗄️ Step 3: Create & Import Database in phpMyAdmin

1. Open your browser and go to: **[http://localhost/phpmyadmin/](http://localhost/phpmyadmin/)**
2. In the left sidebar, click **New** (or go to the **Databases** tab).
3. Database Name: Type **`artists_farm_resort`**
4. Collation: Select `utf8mb4_unicode_ci` (or default).
5. Click **Create**.

### 📥 Import Seed Data:
1. Click on the newly created **`artists_farm_resort`** database on the left sidebar.
2. Click on the **Import** tab at the top.
3. Click **Choose File** and navigate to your project directory:
   `htdocs/artists_farm/php/schema/seed.sql`
4. Scroll down and click **Import** (or **Go**).
5. You will see a success message importing all 10+ core tables (`guests`, `orders`, `menu_items`, `req_catalog`, `users`, `audit_logs`, `farm_utility_expenses`, etc.).

---

## ⚙️ Step 4: Verify Database Connection Config

Open `htdocs/artists_farm/php/config/database.php` in any text editor and confirm the credentials match XAMPP defaults:

```php
<?php
$db_host = 'localhost';
$db_name = 'artists_farm_resort';
$db_user = 'root';
$db_pass = ''; // Default XAMPP password is empty

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

*(Note: If you set a root password in XAMPP MySQL, update `$db_pass` accordingly).*

---

## 🚀 Step 5: Test PHP API Endpoints in Browser

To test that PHP + MySQL are communicating properly, open these URLs in your browser:

- **API Status**:
  `http://localhost/artists_farm/php/api/router.php`
  *(Returns JSON with online status and active modules)*

- **Fetch Active Residents**:
  `http://localhost/artists_farm/php/api/router.php?action=get_guests`

- **Fetch Kitchen KOT Orders**:
  `http://localhost/artists_farm/php/api/router.php?action=get_orders`

- **Fetch Menu Items**:
  `http://localhost/artists_farm/php/api/router.php?action=get_menu`

- **Fetch Warehouse Inventory**:
  `http://localhost/artists_farm/php/api/router.php?action=get_inventory`

- **Fetch Expenses Log**:
  `http://localhost/artists_farm/php/api/router.php?action=get_petty_cash`

---

## 🌐 Step 6: Access Application

- **Production Build (HTML/JS)**:
  Navigate to **`http://localhost/artists_farm/dist/`** or **`http://localhost/artists_farm/`**

- **Live Development Mode**:
  If developing locally with Node.js:
  1. Open terminal inside `htdocs/artists_farm/`
  2. Run `npm install`
  3. Run `npm run dev`
  4. Access at `http://localhost:3000`

---

## 🔒 Default User Accounts for System Login

| Username | Passcode PIN | Role |
| :--- | :--- | :--- |
| **Tarpan** | `3685` | Super Admin |
| **Kamlesh** | `1202` | Staff Supervisor |
| **Rohit** | `1202` | Admin |
| **Abhijiet** | `1202` | Staff Kitchen |
| **Subrata** | `1202` | Admin |

---

## ❓ Troubleshooting Common Issues

1. **`Database connection failed` Error**:
   - Ensure MySQL service is running in XAMPP Control Panel.
   - Verify database name is `artists_farm_resort` in phpMyAdmin.

2. **CORS Headers Error**:
   - `php/config/database.php` already contains `Access-Control-Allow-Origin: *` headers for smooth API requests.

3. **404 Not Found**:
   - Make sure your directory path matches `C:\xampp\htdocs\artists_farm\php\api\router.php`.
