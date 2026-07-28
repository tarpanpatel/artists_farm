# The Artists' Farm - Property Management System

## Overview
This repository contains the source code for the comprehensive property management and operational platform built for **The Artists' Farm**, an exclusive countryside vacation rental and Bed & Breakfast (B&B) property located in Rajasthan.

Designed specifically for a single-key property model (hosting one exclusive set of guests at a time), the system acts as an all-in-one hospitality operations dashboard. It streamlines everything from guest coordination and live kitchen orders to staff management and financial tracking, ensuring a seamless, highly personalized, and uninterrupted guest experience.

## Key Features & Modules

* **Exclusive Guest Management**: Tailored for single-group bookings, this module handles guest profiles, stay tracking, and specialized hospitality requirements, ensuring dedicated attention to the current occupants without the clutter of multi-room management.
* **Operational & Analytics Dashboards**: Provides real-time metrics, system overviews, and operational statistics (via `OperationalDashboard`, `AnalyticsDashboard`, and `AuditLogsView`) to monitor the daily performance of the property.
* **Kitchen & Menu Operations**: Manages food and beverage inventories, live kitchen orders, and digital menus, allowing the staff to efficiently cater to the specific culinary preferences of the residing guests.
* **Finance, Billing & Petty Cash**: Tracks ledger entries, billing receipts, petty cash, and miscellaneous charges using dedicated financial modules to maintain transparent and accurate accounting.
* **Inventory & Staff Tracking**: Monitors physical stock and supplies while coordinating staff duties, ensuring the property is perfectly maintained and staffed for the guests' needs.
* **Telegram Notification Integration**: Features an automated alert system integrated directly with Telegram. It pushes real-time updates and notifications regarding operations, kitchen orders, and system alerts to management and staff.
* **System Diagnostics & Customization**: Includes a dedicated error-handling center (`TelescopeErrorCenter`) and backend logging for operational stability, along with a Navigation Menu Editor and custom CSS overrides for UI tailoring.

## Technology Stack

**Frontend**
* **Framework**: React
* **Language**: TypeScript
* **Build Tool**: Vite
* **Styling**: Custom CSS with dynamic override capabilities

**Backend & Database**
* **Server Logic**: PHP (API endpoints and routing)
* **Database**: Relational SQL Database (`schema.sql` and `seed.sql` provided)
* **Architecture**: RESTful API architecture connecting the React frontend to PHP operational scripts.

**Deployment & Tooling**
* **Package Management**: npm / bun
* **Deployment Automation**: Pre-configured deployment scripts utilizing SFTP (`deploy-sftp.mjs`) and PowerShell (`deploy.ps1`) for seamless live server updates.
* **Data Utilities**: Automated scripts (`clone-db.mjs`, `clone-images.mjs`) for database replication and media asset migrations.