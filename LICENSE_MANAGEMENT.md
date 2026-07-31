# 📋 License Management System - Setup & Usage Guide

**Status:** ✅ Complete  
**Last Updated:** 2026-07-31

---

## 📊 **What It Does**

Comprehensive license tracking system for Indian properties with **automatic expiry notifications**.

- ✅ Track multiple licenses per property (Homestay, FSSAI, Trade, etc.)
- ✅ Automatic Telegram notifications at 7, 4, and 1 day before expiry
- ✅ Visual status indicators (Active, Expiring Soon, Expired)
- ✅ Prevents duplicate notifications
- ✅ Beautiful dashboard UI

---

## 🚀 **Setup Instructions**

### **Step 1: Create Database Tables**

Run this SQL to create the license tables:

```bash
# Via command line
mysql -u root artists_farm < php/schema/licenses.sql

# Or via PHPMyAdmin
```

Or manually run:

```sql
-- License Management Tables
CREATE TABLE IF NOT EXISTS `property_licenses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `property_id` INT NOT NULL,
  `license_type` VARCHAR(100) NOT NULL,
  `license_name` VARCHAR(255),
  `license_number` VARCHAR(100) NOT NULL UNIQUE,
  `issuing_authority` VARCHAR(255),
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `document_url` TEXT,
  `status` ENUM('active', 'expired', 'expiring_soon', 'renewal_pending') DEFAULT 'active',
  `notes` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
  INDEX `idx_property_expiry` (`property_id`, `end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `license_expiry_notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `license_id` INT NOT NULL,
  `property_id` INT NOT NULL,
  `days_before` INT NOT NULL,
  `notification_sent_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `telegram_message_id` VARCHAR(100),
  FOREIGN KEY (`license_id`) REFERENCES `property_licenses`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON DELETE CASCADE,
  UNIQUE KEY `unique_notification` (`license_id`, `days_before`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### **Step 2: Set Up Cron Job (Daily License Check)**

Add to your server's crontab to run daily at 8 AM:

```bash
# Edit crontab
crontab -e

# Add this line (runs at 8 AM every day)
0 8 * * * /usr/bin/php /path/to/artists_farm/php/cron/check_licenses.php >> /var/log/license_checker.log 2>&1
```

**For Windows (if using Task Scheduler):**
```
Program: C:\xampp\php\php.exe
Arguments: C:\xampp\htdocs\artists_farm\php\cron\check_licenses.php
Schedule: Daily at 08:00
```

### **Step 3: Add Component to Tenant Dashboard**

In `src/components/TenantDashboard.tsx`, add the License Management tab:

```typescript
import { LicenseManagement } from './LicenseManagement';

// In the component, add this case to your tab rendering:
case 'licenses':
  return <LicenseManagement propertyId={propertyId} />;
```

Or add as a separate page/modal accessible from the tenant dashboard.

### **Step 4: Build & Deploy**

```bash
npm run build
# Deploy dist/ folder to your server
```

---

## 📱 **User Guide**

### **For Tenant (Property Owner)**

1. **Go to:** Tenant Dashboard → License Management
2. **Click:** "Add License" button
3. **Fill in:**
   - License Type (Homestay, FSSAI, etc.)
   - License Name (e.g., "Homestay License - Rajasthan")
   - License Number (e.g., "HM/2024/00123")
   - Issuing Authority (Department name)
   - Start Date
   - **Expiry Date** ← Most important!
   - Notes (optional)
4. **Save** → License appears in list with status

### **License Status Indicators**

| Status | Icon | Color | Meaning |
|--------|------|-------|---------|
| **Active** | ✅ | Green | Valid for >7 days |
| **Expiring Soon** | ⚠️ | Orange | 1-7 days remaining |
| **Expired** | 🚨 | Red | Past expiry date |

---

## 🔔 **Notification System**

### **How It Works**

When a license is about to expire, the cron job sends **3 Telegram notifications** to the Super Admin:

| Days Before | Icon | Alert | Message |
|-------------|------|-------|---------|
| 7 days | ⏰ | First reminder | "License expiring in 7 days" |
| 4 days | ⚠️ | Second reminder | "License expiring in 4 days" |
| 1 day | 🚨 | Final warning | "License expiring tomorrow!" |

### **Example Notification**

```
⏰ License Expiry Alert

Property: The Grand Hotel
License Type: FSSAI License
License Name: Food Safety License - Rajasthan
License Number: FSSAI/2024/00456
Expiry Date: 2026-08-15
Days Remaining: 7 days

Please renew the license before expiry.
```

### **Requirements**

- ✅ Super Admin added to Telegram bot group
- ✅ Telegram bot configured in Property Settings
- ✅ Cron job running daily

---

## 📋 **Supported License Types**

The system includes these common Indian licenses:

```
🏠 Homestay License
🏨 Guest House License
🍽️ FSSAI License (Food Safety)
💨 Pollution Control Certificate
📋 Trade License
🏛️ Property Tax Certificate
🔥 Fire Safety Certificate
⚡ Electrical Certificate
📊 GST Certificate
📄 Other (Custom)
```

---

## 🔧 **API Endpoints**

### **Get Licenses**
```bash
GET /php/api/router.php?action=get_licenses&property_id=123
```

**Response:**
```json
{
  "status": "success",
  "data": [
    {
      "id": 1,
      "license_type": "fssai",
      "license_name": "FSSAI License - Rajasthan",
      "license_number": "FSSAI/2024/00456",
      "issuing_authority": "FSSAI Regional Office",
      "start_date": "2024-01-15",
      "end_date": "2026-08-15",
      "status": "expiring_soon",
      "days_remaining": 7,
      "notes": "Valid for food preparation"
    }
  ]
}
```

### **Add License**
```bash
POST /php/api/router.php?action=add_license
Body: {
  "property_id": 123,
  "license_type": "fssai",
  "license_name": "FSSAI License",
  "license_number": "FSSAI/2024/00456",
  "issuing_authority": "FSSAI",
  "start_date": "2024-01-15",
  "end_date": "2026-08-15",
  "notes": "Valid for food"
}
```

### **Update License**
```bash
POST /php/api/router.php?action=update_license
Body: { "id": 1, "property_id": 123, ...fields }
```

### **Delete License**
```bash
POST /php/api/router.php?action=delete_license
Body: { "id": 1, "property_id": 123 }
```

### **Check Expiring (Cron)**
```bash
GET /php/api/router.php?action=check_expiring_licenses
```

---

## 📊 **Database Schema**

### **property_licenses**
```sql
id (PK)
property_id (FK)
license_type (enum: homestay, guest_house, fssai, etc.)
license_name (varchar)
license_number (unique)
issuing_authority (varchar)
start_date (date)
end_date (date) ← Key field for expiry calculation
document_url (optional)
status (enum: active, expiring_soon, expired)
notes (text)
created_at, updated_at (timestamps)
```

### **license_expiry_notifications**
```sql
id (PK)
license_id (FK)
property_id (FK)
days_before (int: 7, 4, or 1)
notification_sent_at (timestamp)
telegram_message_id (optional, for tracking)
```

---

## 🐛 **Troubleshooting**

### **Problem: Notifications not sending**

**Checklist:**
- [ ] Cron job is running: `crontab -l | grep license`
- [ ] PHP can execute: `php php/cron/check_licenses.php`
- [ ] Database tables created
- [ ] Telegram bot is configured
- [ ] Super admin in Telegram group
- [ ] Check logs: `tail -f /var/log/license_checker.log`

### **Problem: Duplicate notifications**

**Solution:** The system has a `UNIQUE KEY` to prevent duplicates. If you see duplicates:
- Check `license_expiry_notifications` table for the license_id
- Delete duplicate rows if needed:
  ```sql
  DELETE FROM license_expiry_notifications 
  WHERE license_id = 123 AND days_before = 7 AND id != 1;
  ```

### **Problem: License status not updating**

**Solution:** Status is calculated on-the-fly based on `end_date`. If incorrect:
- Verify `end_date` is correct: `SELECT * FROM property_licenses WHERE id = 123;`
- Check that today's date is correct on server: `date`
- Manually run checker: `php php/cron/check_licenses.php`

---

## 📈 **Best Practices**

1. **Set reminders:** Enter licenses BEFORE they expire
2. **Renewal buffer:** Plan renewal 30 days before expiry
3. **Document storage:** Keep PDF copies of licenses
4. **Regular checks:** Review licenses monthly
5. **Compliance:** Renew immediately after expiry
6. **Multiple properties:** Use separate license entries per property

---

## 📝 **Sample License Data**

```sql
-- Insert sample licenses for testing
INSERT INTO property_licenses 
(property_id, license_type, license_name, license_number, issuing_authority, start_date, end_date, notes)
VALUES
(1, 'fssai', 'FSSAI License - Jaipur', 'FSSAI/2024/00123', 'FSSAI Regional Office', '2024-01-15', '2026-08-15', 'Valid for food preparation'),
(1, 'homestay', 'Homestay License', 'HM/2024/00456', 'Department of Tourism', '2023-06-01', '2026-05-31', 'Valid for 3 years'),
(1, 'pollution', 'Pollution Control Certificate', 'PCC/2024/00789', 'Pollution Board', '2024-03-01', '2025-02-28', 'Annual renewal');
```

---

## 🎯 **Summary**

| Feature | Status |
|---------|--------|
| Add/Edit/Delete licenses | ✅ Done |
| Multi-license support | ✅ Done |
| Expiry date tracking | ✅ Done |
| 7-4-1 day notifications | ✅ Done |
| Telegram integration | ✅ Done |
| Duplicate prevention | ✅ Done |
| Beautiful UI | ✅ Done |
| Cron job support | ✅ Done |
| Database schema | ✅ Done |

**Everything is ready to use!** Just set up the cron job and start adding licenses. 🎉
