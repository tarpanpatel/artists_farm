# 🧭 Ground Code — SaaS Product & Pricing Strategy

This document serves as the single source of truth for **Ground Code**'s SaaS monetization model, trial parameters, single subscription tiering, and onboarding playbooks.

---

## 💳 1. Subscription Tiering & Pricing Matrix

Ground Code operates on a single unified **GroundCode Pro Plan** designed for high conversion, zero buyer friction, and transparent key-based scaling:

| SaaS Plan | Property Scale | What's Included | Monthly Price | Annual Price *(2 Months Free)* |
| :--- | :--- | :--- | :---: | :---: |
| **GroundCode Pro** | **Single Villa, Homestay, or Resort**<br>*(Includes 1st Room Key)* | Booking Calendar (iCal Sync), Front-Desk PMS, KDS Kitchen Display, Petty Cash Drawer, Inventory Catalog, Staff Attendance, Telegram Alerts | **₹1,499 / mo** | **₹14,990 / yr** |

### 🔑 Flexible Key Add-On
Properties scaling beyond 1 room key do not require complex enterprise contracts or separate tiers:
* **Additional Room Key**: **₹350 / room / month** for each additional key beyond 1 key.

---

## ⏱️ 2. Universal Free Trial & Guided Onboarding

* **100% Universal Free Trial**: **1 Month (30 Days)** free trial granted to **EVERY** new property owner on registration — zero credit card required, zero lock-in commitment.
* **Guided Onboarding Call**: Every trial includes a **personal 30–45 minute 1-on-1 setup call** to pre-populate room names, room slots, KDS menu items, and staff PINs.

### 📅 30-Day Conversion Milestone Playbook

```
Day 1 ────────► Day 7 ────────► Day 21 ────────► Day 27 ────────► Day 30
Onboarding     First-Week       Mid-Trial       Expiration        Conversion
Setup Call     Check-In         Review Call     Warning Toast     & Billing
```

1. **Day 1 (Setup Call)**: Configure initial property settings, room slots, food menu, and staff accounts.
2. **Day 7 (Check-in)**: Support touchpoint after the first weekend of live guest orders.
3. **Day 21 (Review Call)**: Mid-month check-in to resolve staff questions and review petty cash/KDS usage.
4. **Day 27 (In-App Warning)**: In-app notification toast reminding the owner that their 30-day trial ends in 3 days.
5. **Day 30 (Conversion)**: Close subscriber on **GroundCode Pro (₹1,499/mo + ₹350/extra key)** or **Annual Plan (₹14,990/yr — 2 Months Free)**.

---

## 🔒 3. Billing & Architecture Principles

* **Direct Offline Billing Only**: No payment gateways or automated card charges. Subscription status, plan tier (`GroundCode Pro`), and renewal expiry dates (`subscription_expires_at`) are managed directly by Root Admin.
* **No Jargon / ELI5 Messaging**: Landing page and user-facing copy use plain, everyday hospitality terms (e.g. *"Easy Booking Calendar"*, *"Kitchen Order Screen"*, *"Photo Expense Receipts"*) instead of technical jargon.
* **No WhatsApp Automation Without Confirmation**: Native Telegram Bot handles instant staff notifications. WhatsApp uses native `wa.me` links generated on-demand by the owner/staff.

---

## 🎁 4. Incentives & Referral Growth

* **Annual Discount**: **2 Months Free** when billed annually (Pay for 10 months, get 12 — ₹14,990/yr).
* **Owner Referral Engine**: Existing property owners receive **1 Month Free SaaS Credit** for every new resort owner they refer who subscribes to the platform.

---

## 🏗️ 5. Unit Economics Summary

* **Marginal Hosting Cost**: ~₹75–150 / month per trial property.
* **API Messaging Cost**: **₹0** *(100% Free via `wa.me` links and native Telegram Bot API)*.
* **Customer Acquisition Cost (CAC)**: Low / Zero (Driven by direct referral loops and field visits).
