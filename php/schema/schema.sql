-- Artists Farm Jaipur Terminal Database Schema Creation
-- Compatible with MySQL 5.7+ / 8.0 / MariaDB

CREATE DATABASE IF NOT EXISTS `artists_farm_resort` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `artists_farm_resort`;

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) NOT NULL,
  `qr_image_path` VARCHAR(255) DEFAULT NULL,
  `is_financial_handler` TINYINT(1) DEFAULT 0,
  `telegram_user_id` VARCHAR(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. GUESTS & RESIDENTS TABLE
CREATE TABLE IF NOT EXISTS `guests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `guest_name` VARCHAR(255) DEFAULT '',
  `phone_number` VARCHAR(50) NOT NULL,
  `adults` INT DEFAULT 1,
  `children` INT DEFAULT 0,
  `checkin_date` DATE NOT NULL,
  `expected_checkout` DATETIME NOT NULL,
  `notes` TEXT DEFAULT NULL,
  `misc_arrangements` TEXT DEFAULT NULL,
  `status` VARCHAR(50) DEFAULT 'Active',
  `advance_paid` DECIMAL(10,2) DEFAULT 0.00,
  `total_charge` DECIMAL(10,2) DEFAULT 0.00,
  `pending_amount` DECIMAL(10,2) DEFAULT 0.00,
  `guest_notes` TEXT DEFAULT NULL,
  `booking_source` VARCHAR(50) DEFAULT 'Offline',
  `no_of_guests` INT DEFAULT 1,
  `per_night_charges` DECIMAL(10,2) DEFAULT 0.00,
  `total_days` INT DEFAULT 1,
  `advance_received_by` VARCHAR(100) DEFAULT '',
  `pending_received_by` VARCHAR(100) DEFAULT '',
  `total_food` DECIMAL(10,2) DEFAULT 0.00,
  `food_received_by` VARCHAR(100) DEFAULT '',
  `food_remark` TEXT DEFAULT NULL,
  `decoration_charges` DECIMAL(10,2) DEFAULT 0.00,
  `tip_amount` DECIMAL(10,2) DEFAULT 0.00,
  `base_room_rent` DECIMAL(10,2) DEFAULT 0.00,
  `checkout_date` DATE DEFAULT NULL,
  `payment_status` VARCHAR(50) DEFAULT 'Pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. FOOD MENU CATALOG & CATEGORIES
CREATE TABLE IF NOT EXISTS `menu_categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `sort_order` INT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `menu_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category_id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `is_hidden` TINYINT(1) DEFAULT 0,
  `image_path` VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. KITCHEN ORDERS & KOT TABLE
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `guest_id` INT DEFAULT NULL,
  `order_time` DATETIME NOT NULL,
  `status` VARCHAR(50) DEFAULT 'Pending',
  `served_at` DATETIME DEFAULT NULL,
  `served_by_name` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `menu_item_id` INT NOT NULL,
  `quantity` INT DEFAULT 1,
  `item_status` VARCHAR(50) DEFAULT 'Pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `kitchen_orders` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `guest_id` VARCHAR(50) DEFAULT NULL,
  `room_number` VARCHAR(50) NOT NULL,
  `items_json` LONGTEXT NOT NULL,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` ENUM('Received', 'Cooking', 'Ready', 'Served', 'Cancelled') DEFAULT 'Received',
  `order_time` DATETIME NOT NULL,
  `special_notes` TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. REQUISITIONS CATALOG & INVENTORY LOG
CREATE TABLE IF NOT EXISTS `material_categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `is_ingredient` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `req_catalog` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `item_name` VARCHAR(255) NOT NULL,
  `category_id` INT DEFAULT 1,
  `current_stock` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `unit_label` VARCHAR(20) NOT NULL DEFAULT 'Kg'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `quantity` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'pcs',
  `min_threshold` DECIMAL(10,2) DEFAULT 5.00,
  `last_updated` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. PETTY CASH & EXPENSES
CREATE TABLE IF NOT EXISTS `farm_utility_expenses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `expense_date` DATE NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `description` TEXT NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `payment_mode` VARCHAR(50) DEFAULT 'Cash',
  `vendor_name` VARCHAR(255) DEFAULT NULL,
  `logged_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `petty_cash` (
  `id` VARCHAR(50) NOT NULL PRIMARY KEY,
  `date` DATE NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `description` TEXT NOT NULL,
  `vendor_name` VARCHAR(255) DEFAULT NULL,
  `approved_by` VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. CASH DRAWER ENTRIES (Handover & Accountability Tracking)
CREATE TABLE IF NOT EXISTS `cash_drawer_entries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `staff_id` VARCHAR(50) NOT NULL,
  `staff_name` VARCHAR(150) NOT NULL,
  `type` ENUM('handover','market_expense','manual_adjustment') NOT NULL,
  `amount` DECIMAL(10,2) NOT NULL,
  `handed_to` VARCHAR(150) DEFAULT NULL,
  `notes` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. STAFF & PAYROLL TABLE
CREATE TABLE IF NOT EXISTS `staff_attendance` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `attendance_date` DATE NOT NULL,
  `user_id` INT DEFAULT 7,
  `staff_name` VARCHAR(255) DEFAULT 'Staff Member',
  `status` VARCHAR(50) DEFAULT 'Present',
  `marked_by` VARCHAR(100) DEFAULT 'Tarpan'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. AUDIT TRAIL LOGS
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `timestamp` DATETIME NOT NULL,
  `user_id` INT DEFAULT 7,
  `action` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. TELEGRAM NOTIFICATION TEMPLATES
CREATE TABLE IF NOT EXISTS `system_telegram_templates` (
  `template_key` VARCHAR(50) PRIMARY KEY,
  `title` VARCHAR(100) NOT NULL,
  `category` VARCHAR(50) NOT NULL,
  `description` TEXT,
  `content` TEXT NOT NULL,
  `available_variables` TEXT,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. PLATFORM THEME SETTINGS (Customizable from Root Admin Dashboard)
CREATE TABLE IF NOT EXISTS `platform_theme_settings` (
  `id` INT PRIMARY KEY DEFAULT 1,
  `settings_json` LONGTEXT NOT NULL COMMENT 'JSON object containing all theme customizations',
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updated_by` VARCHAR(100) DEFAULT 'system'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert default theme settings
INSERT IGNORE INTO `platform_theme_settings` (`id`, `settings_json`, `updated_by`) VALUES (
  1,
  '{
    "colors": {
      "primary": "#3b82f6",
      "secondary": "#1e293b",
      "accent": "#06b6d4",
      "success": "#10b981",
      "warning": "#f59e0b",
      "error": "#ef4444",
      "info": "#0284c7"
    },
    "darkMode": {
      "background": "#0f172a",
      "surface": "#1e293b",
      "text": "#f1f5f9",
      "textMuted": "#94a3b8"
    },
    "typography": {
      "fontFamily": "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto",
      "baseFontSize": "16px",
      "headingScale": 1.2
    },
    "spacing": {
      "baseUnit": "4px"
    },
    "borderRadius": {
      "small": "0.375rem",
      "medium": "0.5rem",
      "large": "1rem"
    },
    "shadows": {
      "small": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      "medium": "0 4px 6px -1px rgb(0 0 0 / 0.1)",
      "large": "0 10px 15px -3px rgb(0 0 0 / 0.1)"
    }
  }',
  'system'
);

