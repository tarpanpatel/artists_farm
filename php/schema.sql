-- MySQL Database Schema for Artists Farm Resort & Kitchen Management System

CREATE DATABASE IF NOT EXISTS `artists_farm_resort` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `artists_farm_resort`;

-- 1. Guests Table
CREATE TABLE IF NOT EXISTS `guests` (
    `id` VARCHAR(50) PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `contact` VARCHAR(50) NOT NULL,
    `id_proof` VARCHAR(255) NOT NULL,
    `room_type` ENUM('Villa', 'Cottage') NOT NULL,
    `room_number` INT NOT NULL,
    `check_in` DATETIME NOT NULL,
    `check_out` DATETIME DEFAULT NULL,
    `total_guests` INT DEFAULT 1,
    `status` ENUM('Active Resident', 'Checked-Out') DEFAULT 'Active Resident',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Kitchen Orders Table
CREATE TABLE IF NOT EXISTS `kitchen_orders` (
    `id` VARCHAR(50) PRIMARY KEY,
    `guest_id` VARCHAR(50) DEFAULT NULL,
    `room_number` VARCHAR(50) NOT NULL,
    `items_json` JSON NOT NULL,
    `total_amount` DECIMAL(10,2) NOT NULL,
    `status` ENUM('Received', 'In-Preparation', 'Delivered', 'Cancelled') DEFAULT 'Received',
    `order_time` DATETIME NOT NULL,
    `delivery_time` DATETIME DEFAULT NULL,
    `special_notes` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`guest_id`) REFERENCES `guests`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Menu Items Table
CREATE TABLE IF NOT EXISTS `menu_items` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `category` ENUM('Breakfast', 'Main Course', 'Beverages', 'Snacks', 'Desserts') NOT NULL,
    `price` DECIMAL(10,2) NOT NULL,
    `is_available` TINYINT(1) DEFAULT 1,
    `prep_time_mins` INT DEFAULT 15,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Inventory Items Table
CREATE TABLE IF NOT EXISTS `inventory_items` (
    `id` VARCHAR(50) PRIMARY KEY,
    `item_name` VARCHAR(255) NOT NULL,
    `category` ENUM('Grains & Spices', 'Dairy & Fresh Produce', 'Poultry & Meat', 'Beverages & Cleaning', 'Linen & Amenities') NOT NULL,
    `current_stock` DECIMAL(10,2) NOT NULL,
    `min_reorder_level` DECIMAL(10,2) NOT NULL,
    `unit` VARCHAR(50) NOT NULL,
    `unit_cost` DECIMAL(10,2) NOT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Petty Cash Outflows Table
CREATE TABLE IF NOT EXISTS `petty_cash` (
    `id` VARCHAR(50) PRIMARY KEY,
    `date` DATE NOT NULL,
    `category` ENUM('Kitchen Purchase', 'Diesel/Electricity', 'Maintenance', 'Staff Advance', 'Miscellaneous') NOT NULL,
    `amount` DECIMAL(10,2) NOT NULL,
    `description` TEXT NOT NULL,
    `vendor_name` VARCHAR(255) NOT NULL,
    `approved_by` VARCHAR(255) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Staff Attendance Table
CREATE TABLE IF NOT EXISTS `staff_attendance` (
    `id` VARCHAR(50) PRIMARY KEY,
    `staff_id` VARCHAR(50) NOT NULL,
    `staff_name` VARCHAR(255) NOT NULL,
    `role` ENUM('Chef/Cook', 'Housekeeping', 'Manager/Reception', 'Gardener/Maintenance', 'Security') NOT NULL,
    `date` DATE NOT NULL,
    `status` ENUM('Present', 'Absent', 'Half-Day', 'On Leave') NOT NULL,
    `check_in_time` TIME DEFAULT NULL,
    `check_out_time` TIME DEFAULT NULL,
    `remarks` TEXT DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Audit Security Logs Table
CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` VARCHAR(50) PRIMARY KEY,
    `timestamp` VARCHAR(100) NOT NULL,
    `user` VARCHAR(255) NOT NULL,
    `action` TEXT NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
