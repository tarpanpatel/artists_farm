-- --------------------------------------------------------
-- Artists Farm Resort & Kitchen Management System Database Seed
-- Database: apartment_blue / artists_farm_resort
-- Host: 91.238.163.173
-- Server version: 10.6.27-MariaDB
-- --------------------------------------------------------

CREATE DATABASE IF NOT EXISTS `artists_farm_resort` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `artists_farm_resort`;

-- Table 1: users
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `role` VARCHAR(50) NOT NULL,
  `qr_image_path` VARCHAR(255) DEFAULT NULL,
  `is_financial_handler` TINYINT(1) DEFAULT 0,
  `telegram_user_id` VARCHAR(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `users` (`id`, `username`, `password`, `role`, `qr_image_path`, `is_financial_handler`, `telegram_user_id`) VALUES
	(7, 'Tarpan', '$2y$10$tYRGqBhADGoxkLMiiElRdOogeg2cY474dqJoGeWK0JE0HV2HtvBAS', 'Super Admin', 'assets/img/qrs/qr_1784184027_6a587cdb702ba.png', 1, NULL),
	(8, 'Kamlesh', '$2y$10$.HSrRv5fBJrA2qYzmWyec.EypVtmk7MoDQUyPCnw/KJcAuVm/GAgG', 'Staff', NULL, 1, NULL),
	(11, 'Rohit', '$2y$10$JirjxU.dT8BVhcLP4eKlTutC6U2QAlRm6yvKs.pVNn3ReBXriZjwC', 'Admin', NULL, 1, NULL),
	(12, 'Abhijiet', '$2y$10$rZV5BM19GIByLIMUNbLB3OajRFV2TJh06Bi/XWt1r6H3RlkDI6a5q', 'Staff Kitchen', NULL, 0, NULL),
	(13, 'Subrata', '$2y$10$b6BNBUcNzTAnl6RJCfpfDuqUxz28hp6dYPkGEMWARP4X2DKaO/Ex6', 'Admin', NULL, 0, NULL),
	(15, 'Rana Das', '$2y$10$abcdefghijklmnopqrstuuzbHVUl/V.tgE/iqmRREGakVLBallPWy', 'Staff', NULL, 0, NULL),
	(16, 'Samar Sil', '$2y$10$abcdefghijklmnopqrstuuzbHVUl/V.tgE/iqmRREGakVLBallPWy', 'Staff', NULL, 0, NULL),
	(17, 'Ashish Mandal', '$2y$10$abcdefghijklmnopqrstuuzbHVUl/V.tgE/iqmRREGakVLBallPWy', 'Staff', NULL, 0, NULL),
	(18, 'Kinkar Sarkar', '$2y$10$abcdefghijklmnopqrstuuzbHVUl/V.tgE/iqmRREGakVLBallPWy', 'Staff', NULL, 0, NULL),
	(19, 'Ramesh', '$2y$10$abcdefghijklmnopqrstuuzbHVUl/V.tgE/iqmRREGakVLBallPWy', 'Staff', NULL, 0, NULL),
	(20, 'Pranay', '$2y$10$abcdefghijklmnopqrstuuzbHVUl/V.tgE/iqmRREGakVLBallPWy', 'Staff', NULL, 0, NULL);

-- Table 2: guests
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

REPLACE INTO `guests` (`id`, `guest_name`, `phone_number`, `adults`, `children`, `checkin_date`, `expected_checkout`, `notes`, `misc_arrangements`, `status`, `advance_paid`, `total_charge`, `pending_amount`, `guest_notes`, `booking_source`, `no_of_guests`, `per_night_charges`, `total_days`, `advance_received_by`, `pending_received_by`, `total_food`, `food_received_by`, `food_remark`, `decoration_charges`, `tip_amount`, `base_room_rent`, `checkout_date`, `payment_status`) VALUES
	(1, 'Sharma Group (10 Jul)', '9111111111', 4, 0, '2026-07-10', '2026-07-11 11:00:00', NULL, NULL, 'CheckedOut', 5000.00, 15000.00, 13200.00, NULL, 'Offline', 1, 15000.00, 1, 'Tarpan', 'Kamlesh', 3200.00, 'Subrata', NULL, 0.00, 0.00, 15000.00, '2026-07-11', 'Settled'),
	(2, 'Verma Group (11 Jul)', '9222222222', 5, 0, '2026-07-11', '2026-07-12 11:00:00', NULL, NULL, 'CheckedOut', 4000.00, 14000.00, 12800.00, NULL, 'Offline', 1, 14000.00, 1, 'Tarpan', 'Kamlesh', 2800.00, 'Subrata', NULL, 0.00, 0.00, 14000.00, '2026-07-12', 'Settled'),
	(3, 'Mehta Group (12 Jul)', '9333333333', 3, 0, '2026-07-12', '2026-07-13 11:00:00', NULL, NULL, 'CheckedOut', 6000.00, 16500.00, 14600.00, NULL, 'Offline', 1, 16500.00, 1, 'Tarpan', 'Kamlesh', 4100.00, 'Subrata', NULL, 0.00, 0.00, 16500.00, '2026-07-13', 'Settled'),
	(4, 'Mishra Group (13 Jul)', '9444444444', 6, 0, '2026-07-13', '2026-07-14 11:00:00', NULL, NULL, 'CheckedOut', 3000.00, 12000.00, 11300.00, NULL, 'Offline', 1, 12000.00, 1, 'Tarpan', 'Kamlesh', 2300.00, 'Subrata', NULL, 0.00, 0.00, 12000.00, '2026-07-14', 'Settled'),
	(5, 'Singh Group (14 Jul)', '9555555555', 4, 0, '2026-07-14', '2026-07-15 11:00:00', NULL, NULL, 'CheckedOut', 5000.00, 15000.00, 13500.00, NULL, 'Offline', 1, 15000.00, 1, 'Tarpan', 'Kamlesh', 3500.00, 'Subrata', NULL, 0.00, 0.00, 15000.00, '2026-07-15', 'Settled'),
	(6, 'Joshi Group (15 Jul)', '9666666666', 2, 0, '2026-07-15', '2026-07-16 11:00:00', NULL, NULL, 'CheckedOut', 5000.00, 13500.00, 8500.00, NULL, 'Offline', 1, 13500.00, 1, 'Tarpan', 'Kamlesh', 347.00, '', '[]', 0.00, 0.00, 13500.00, '2026-07-16', 'Settled'),
	(7, 'Current Active Guest', '9777777777', 5, 0, '2026-07-16', '2026-07-17 11:00:00', '', NULL, 'CheckedOut', 5000.00, 17000.00, 12000.00, NULL, 'Offline', 1, 17000.00, 1, 'Tarpan', 'Abhijit', 6414.00, 'Tarpan', '[{"id":1784184852,"reason":"Decoration Fees","amount":1900,"type":"charge"},{"id":1784186872,"reason":"Discount Rebate","amount":200,"type":"discount"}]', 0.00, 0.00, 17000.00, '2026-07-16', 'Settled'),
	(8, 'Jain Group', '8888888', 1, 0, '2026-07-17', '2026-07-18 11:00:00', 'Jain Food', NULL, 'Booked', 5000.00, 12000.00, 7000.00, NULL, 'Offline', 11, 12000.00, 1, 'Abhijit', '', 0.00, 'Unnamed', NULL, 0.00, 0.00, 12000.00, '2026-07-18', 'Settled'),
	(9, 'Private Guest', '333333333', 1, 0, '2026-07-16', '2026-07-17 11:00:00', '', NULL, 'CheckedOut', 3000.00, 12000.00, 9000.00, NULL, 'Offline', 10, 12000.00, 1, 'Kamlesh', 'Subrata', 5000.00, 'Rohit', '[{"id":1784365139,"reason":"Decoration Fees","amount":500,"type":"charge"},{"id":1784454726,"reason":"Discount Rebate","amount":6,"type":"discount"}]', 0.00, 0.00, 12000.00, '2026-07-19', 'Settled'),
	(10, 'Villa 101 Resident Group', '8888888', 1, 0, '2026-07-20', '2026-07-21 11:00:00', '', NULL, 'Active', 10000.00, 12000.00, 2000.00, NULL, 'Offline', 1, 12000.00, 1, 'Tarpan', 'Kamlesh', 0.00, 'Unnamed', '[{"id":1784630186,"reason":"Misc","amount":200,"type":"charge"}]', 0.00, 0.00, 12000.00, '2026-07-21', 'Settled');

-- Table 3: menu_items
CREATE TABLE IF NOT EXISTS `menu_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `category_id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `price` DECIMAL(10,2) NOT NULL,
  `is_hidden` TINYINT(1) DEFAULT 0,
  `image_path` VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `menu_items` (`id`, `category_id`, `name`, `price`, `is_hidden`, `image_path`) VALUES
	(1, 1, 'Paneer Tikka (8-10pcs)', 249.00, 0, NULL),
	(2, 1, 'Paneer Pakoda (10pcs)', 195.00, 0, NULL),
	(3, 1, 'Pyaz Pakoda (10pcs)', 149.00, 0, NULL),
	(4, 1, 'Aloo Pakoda (6-8pcs)', 149.00, 0, 'assets/images/item_4_1782923011.jfif'),
	(5, 1, 'Mix-Veg Pakoda (12pcs)', 198.00, 0, ''),
	(6, 1, 'Kabuli Chana Chaat', 149.00, 0, NULL),
	(7, 1, 'Kaala Chana Chaat', 149.00, 0, NULL),
	(8, 1, 'Peanut Masala', 125.00, 0, NULL),
	(9, 1, 'Pani Puri (8)', 49.00, 0, NULL),
	(10, 1, 'French Fries Regular', 149.00, 0, NULL),
	(11, 1, 'French Fries Peri-Peri', 179.00, 0, 'assets/images/item_11_1784285619.png'),
	(12, 1, 'Chicken Tikka', 359.00, 0, ''),
	(13, 1, 'Chicken Seekh Kebab', 289.00, 0, 'assets/images/item_13_1784285551.jpg'),
	(14, 1, 'Mutton Seekh Kebab', 389.00, 0, ''),
	(15, 1, 'Roasted Papad', 30.00, 0, NULL),
	(16, 1, 'Fried Papad', 40.00, 0, NULL),
	(17, 1, 'Masala Papad', 49.00, 0, NULL),
	(18, 2, 'Chow mein', 149.00, 0, NULL),
	(19, 2, 'Veg Spring roll (6-8pcs)', 149.00, 0, NULL),
	(20, 2, 'Chilly Paneer (8-10pcs)', 249.00, 0, NULL),
	(21, 2, 'Chilly Potatoes (8-10pcs)', 198.00, 0, NULL),
	(22, 2, 'Sweet Corn Chaat', 198.00, 0, NULL),
	(23, 2, 'Maggie Regular', 98.00, 0, NULL),
	(24, 2, 'Masala Maggie', 149.00, 0, NULL),
	(25, 2, 'Chinese Pakoda (6-8pcs)', 169.00, 0, NULL),
	(26, 3, 'OTC Pizza', 198.00, 0, NULL),
	(27, 3, 'Paneer Pizza', 298.00, 0, NULL),
	(28, 3, 'Cheese Corn Pizza', 298.00, 0, NULL),
	(29, 3, 'Veg Grilled Sandwich', 149.00, 0, NULL),
	(30, 3, 'Cheese Grilled Sandwich', 198.00, 0, NULL),
	(31, 3, 'Cheesy Garlic Bread (6pcs)', 149.00, 0, NULL),
	(32, 4, 'Shahi Paneer', 285.00, 0, NULL),
	(33, 4, 'Kadhai Paneer', 285.00, 0, NULL),
	(34, 4, 'Paneer Butter Masala', 285.00, 0, NULL),
	(35, 4, 'Chicken Curry (4pcs)', 389.00, 0, NULL),
	(36, 4, 'Mutton Curry (4pcs)', 489.00, 0, NULL),
	(37, 4, 'Paneer Bhurji', 298.00, 0, NULL),
	(38, 4, 'Jeera Aloo', 249.00, 0, NULL),
	(39, 4, 'Gatta Masala', 198.00, 0, NULL),
	(40, 4, 'Daal Tadka', 198.00, 0, NULL),
	(41, 4, 'Daal Fry', 149.00, 0, NULL),
	(42, 4, 'Kadhi Pakoda', 198.00, 0, NULL),
	(43, 4, 'Sev Tamatar', 249.00, 0, NULL),
	(44, 4, 'Dinner Buffet (Per Person)', 600.00, 0, NULL),
	(45, 5, 'Plain Rice', 198.00, 0, NULL),
	(46, 5, 'Jeera Rice', 248.00, 0, NULL),
	(47, 5, 'Veg Pulao', 298.00, 0, NULL),
	(48, 5, 'Plain Chapati', 29.00, 0, NULL),
	(49, 5, 'Chapati With Butter', 38.00, 0, NULL),
	(50, 5, 'Paratha Plain', 59.00, 0, NULL),
	(51, 5, 'Aloo Paratha', 149.00, 0, NULL),
	(52, 5, 'Pyaz Paratha', 149.00, 0, NULL),
	(53, 6, 'Bread Toast Butter (2)', 50.00, 0, NULL),
	(54, 6, 'Bread Toast Jam (2)', 60.00, 0, NULL),
	(55, 6, 'Boiled Eggs', 149.00, 0, NULL),
	(56, 6, 'Egg Bhurji', 149.00, 0, NULL),
	(57, 6, 'Poha', 98.00, 0, NULL),
	(58, 6, 'Bread Pakoda', 98.00, 0, NULL),
	(59, 6, 'French Toast', 149.00, 0, NULL),
	(60, 6, 'Omelette', 98.00, 0, NULL),
	(61, 6, 'Breakfast Buffet (Per Person)', 300.00, 0, NULL),
	(62, 7, 'Boondi Raita', 95.00, 0, NULL),
	(63, 7, 'Veg Raita', 149.00, 0, NULL),
	(64, 7, 'Plain Curd', 58.00, 0, NULL),
	(65, 7, 'Chaach', 68.00, 0, NULL),
	(66, 7, 'Green Salad', 119.00, 0, NULL),
	(67, 8, 'Regular Tea', 48.00, 0, NULL),
	(68, 8, 'Masala Tea', 58.00, 0, NULL),
	(69, 8, 'Coffee', 80.00, 0, NULL),
	(70, 8, 'Cold Coffee', 148.00, 0, NULL),
	(71, 8, 'Nimbu Pani', 49.00, 0, NULL),
	(72, 8, 'Nimbu Soda', 59.00, 0, NULL),
	(73, 8, 'Hot Chocolate', 249.00, 0, NULL),
	(74, 1, 'Laal Maans', 800.00, 0, 'assets/images/catalog/placeholder.png');

-- Table 4: orders
CREATE TABLE IF NOT EXISTS `orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `guest_id` INT DEFAULT NULL,
  `order_time` DATETIME NOT NULL,
  `status` VARCHAR(50) DEFAULT 'Pending',
  `served_at` DATETIME DEFAULT NULL,
  `served_by_name` VARCHAR(100) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `orders` (`id`, `guest_id`, `order_time`, `status`, `served_at`, `served_by_name`, `created_at`) VALUES
	(1, 1, '2026-07-10 14:30:00', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(2, 2, '2026-07-11 14:30:00', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(3, 3, '2026-07-12 14:30:00', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(4, 4, '2026-07-13 14:30:00', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(5, 5, '2026-07-14 14:30:00', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(6, 6, '2026-07-15 14:30:00', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(7, 7, '2026-07-16 14:30:00', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(8, 7, '2026-07-15 19:59:17', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(9, 9, '2026-07-16 09:23:06', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(10, 9, '2026-07-16 09:27:11', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(11, 9, '2026-07-16 12:02:59', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(12, 9, '2026-07-17 10:53:58', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(13, 9, '2026-07-17 11:43:21', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(14, 9, '2026-07-17 12:10:25', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(15, 9, '2026-07-17 12:13:29', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(16, 9, '2026-07-17 12:17:06', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(17, 9, '2026-07-17 12:17:28', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(18, 9, '2026-07-17 12:18:19', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(19, 9, '2026-07-17 12:18:57', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(20, 9, '2026-07-17 13:08:10', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(21, 9, '2026-07-17 13:08:19', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(22, 9, '2026-07-17 13:08:33', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(23, 9, '2026-07-18 05:17:22', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(24, 9, '2026-07-18 07:14:26', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(25, 9, '2026-07-18 17:26:56', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(26, 9, '2026-07-19 08:32:47', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(27, 10, '2026-07-21 09:57:20', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(28, 10, '2026-07-21 10:52:27', 'Served', NULL, NULL, '2026-07-21 19:55:09'),
	(29, 10, '2026-07-21 10:54:01', 'Served', '2026-07-22 01:15:29', 'Cosmic', '2026-07-21 19:55:09'),
	(30, 10, '2026-07-21 17:27:37', 'Completed', NULL, NULL, '2026-07-21 19:55:09'),
	(31, 10, '2026-07-21 18:53:38', 'Served', NULL, NULL, '2026-07-21 19:55:09'),
	(32, 10, '2026-07-21 19:45:45', 'Ready', '2026-07-22 01:16:05', 'Cosmic', '2026-07-22 01:15:45'),
	(33, 10, '2026-07-21 19:45:49', 'Pending', NULL, NULL, '2026-07-22 01:15:49'),
	(34, 10, '2026-07-21 19:45:53', 'Served', NULL, NULL, '2026-07-22 01:15:53'),
	(35, 10, '2026-07-21 19:52:58', 'Pending', NULL, NULL, '2026-07-22 01:22:58'),
	(36, 10, '2026-07-21 19:53:35', 'Served', NULL, NULL, '2026-07-22 01:23:35'),
	(37, 10, '2026-07-21 19:54:55', 'Pending', NULL, NULL, '2026-07-22 01:24:55'),
	(39, 10, '2026-07-23 18:52:27', 'Pending', NULL, NULL, '2026-07-24 00:22:27'),
	(40, 10, '2026-07-23 19:02:51', 'Pending', NULL, NULL, '2026-07-24 00:32:51');

-- Table 5: farm_utility_expenses
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

REPLACE INTO `farm_utility_expenses` (`id`, `expense_date`, `category`, `description`, `amount`, `payment_mode`, `vendor_name`, `logged_at`) VALUES
	(1, '2026-07-21', 'Other', 'Ball', 50.00, 'Cash', 'Kamlesh', '2026-07-20 19:52:55'),
	(2, '2026-07-21', 'Other', 'Ball', 50.00, 'Cash', 'Kamlesh', '2026-07-20 20:04:04'),
	(3, '2026-07-21', 'Other', 'Bat', 150.00, 'Online', 'Kamlesh', '2026-07-20 20:11:53'),
	(4, '2026-07-21', 'Other', 'Bat', 150.00, 'Online', 'Kamlesh', '2026-07-20 20:15:29'),
	(5, '2026-07-21', 'Other', 'Chess board', 120.00, 'Online', 'Tarpan', '2026-07-21 10:27:59');

-- Table 6: registry_payees
CREATE TABLE IF NOT EXISTS `registry_payees` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `type` VARCHAR(100) NOT NULL,
  `qr_image_path` VARCHAR(255) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `registry_payees` (`id`, `name`, `type`, `qr_image_path`, `created_at`) VALUES
	(1, 'Nandkishore', 'Third Party', 'assets/img/qrs/qr_1784183993_6a587cb9bcfe4.png', '2026-07-16 06:39:53'),
	(2, 'Raju', 'Vendor', NULL, '2026-07-19 10:46:55'),
	(3, 'Disposable Shop', 'Vendor', NULL, '2026-07-19 10:47:06');

-- Table 7: material_categories
CREATE TABLE IF NOT EXISTS `material_categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `material_categories` (`id`, `name`) VALUES
	(1, 'Kitchen & Grocery'),
	(2, 'Dairy & Fresh Produce'),
	(3, 'Housekeeping & Cleaning'),
	(4, 'Pool & Maintenance');

-- Table 8: req_catalog & inventory_items
CREATE TABLE IF NOT EXISTS `req_catalog` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `item_name` VARCHAR(255) NOT NULL,
  `category_id` INT DEFAULT 1,
  `current_stock` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `unit_label` VARCHAR(20) NOT NULL DEFAULT 'Kg'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `req_catalog` (`id`, `item_name`, `category_id`, `current_stock`, `unit_label`) VALUES
	(1, 'Basmati Rice', 1, 45.00, 'Kg'),
	(2, 'Paneer (Fresh)', 2, 12.50, 'Kg'),
	(3, 'Cooking Oil (Sunflower)', 1, 28.00, 'Ltr'),
	(4, 'Amul Butter', 2, 8.00, 'Kg'),
	(5, 'Pool Chlorine Tablets', 4, 15.00, 'Pcs'),
	(6, 'Dishwashing Liquid', 3, 10.00, 'Ltr');

CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `quantity` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `unit` VARCHAR(20) NOT NULL DEFAULT 'pcs'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `inventory_items` (`id`, `name`, `category`, `quantity`, `unit`) VALUES
	(1, 'Basmati Rice', 'Grocery', 45.00, 'Kg'),
	(2, 'Paneer Fresh', 'Dairy', 12.50, 'Kg'),
	(3, 'Sunflower Oil', 'Grocery', 28.00, 'Ltr'),
	(4, 'Amul Butter', 'Dairy', 8.00, 'Kg');

-- Table 9: menu_categories
CREATE TABLE IF NOT EXISTS `menu_categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL,
  `sort_order` INT DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `menu_categories` (`id`, `name`, `sort_order`) VALUES
	(1, 'Starters', 1),
	(2, 'Chinese & Snacks', 2),
	(3, 'Pizzas & Sandwiches', 3),
	(4, 'Main Course', 4),
	(5, 'Breads & Rice', 5),
	(6, 'Breakfast & Eggs', 6),
	(7, 'Salads & Raita', 7),
	(8, 'Beverages', 8);

-- Table 10: order_items
CREATE TABLE IF NOT EXISTS `order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `order_id` INT NOT NULL,
  `menu_item_id` INT NOT NULL,
  `quantity` INT DEFAULT 1,
  `item_status` VARCHAR(50) DEFAULT 'Pending'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `order_items` (`id`, `order_id`, `menu_item_id`, `quantity`, `item_status`) VALUES
	(1, 1, 1, 2, 'Served'),
	(2, 1, 32, 1, 'Served'),
	(3, 2, 4, 3, 'Served'),
	(4, 3, 11, 2, 'Served');

-- Table 11: staff_attendance
CREATE TABLE IF NOT EXISTS `staff_attendance` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `attendance_date` DATE NOT NULL,
  `user_id` INT DEFAULT 7,
  `staff_name` VARCHAR(255) DEFAULT 'Staff Member',
  `status` VARCHAR(50) DEFAULT 'Present',
  `marked_by` VARCHAR(100) DEFAULT 'Tarpan'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `staff_attendance` (`id`, `attendance_date`, `user_id`, `staff_name`, `status`, `marked_by`) VALUES
	(1, '2026-07-23', 7, 'Tarpan', 'Present', 'Tarpan'),
	(2, '2026-07-23', 8, 'Kamlesh', 'Present', 'Tarpan'),
	(3, '2026-07-23', 11, 'Rohit', 'Present', 'Tarpan'),
	(4, '2026-07-23', 12, 'Abhijiet', 'Present', 'Tarpan');

-- Table 12: audit_logs
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `timestamp` DATETIME NOT NULL,
  `user_id` INT DEFAULT 7,
  `action` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

REPLACE INTO `audit_logs` (`id`, `timestamp`, `user_id`, `action`) VALUES
	(1, '2026-07-23 10:15:00', 7, 'System initialized and database seeded'),
	(2, '2026-07-23 11:20:00', 8, 'KOT order #32 dispatched to kitchen'),
	(3, '2026-07-23 14:05:00', 7, 'Guest check-in settlement logged');

