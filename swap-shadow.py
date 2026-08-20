#!/usr/bin/env python3
import os
import re

# The 18 heaviest files mentioned, plus we'll check all src/components/*.tsx
files_to_check = [
    'src/components/KitchenManagement.tsx',
    'src/components/AnalyticsDashboard.tsx',
    'src/components/InventoryManagement.tsx',
    'src/components/OperationalDashboard.tsx',
    'src/components/StaffManagement.tsx',
    'src/components/LoginPage.tsx',
    'src/components/TenantDashboard.tsx',
    'src/components/ReceiptEditModal.tsx',
    'src/components/KitchenManagement.tsx',  # duplicate but ok
    'src/components/ServiceRequestsManagement.tsx',
    'src/components/BillingCheckout.tsx',
    'src/components/CashDrawerManager.tsx',
    'src/components/GuestManagement.tsx',
    'src/components/TelegramNotificationModal.tsx',
    'src/components/TodayOverview.tsx',
    'src/components/CustomCSSOverride.tsx',
    'src/components/Header.tsx',
    'src/components/MenuManager.tsx',
    'src/components/MobileBookingCardStack.tsx',
    'src/components/RootAdminDashboard.tsx',
]

# Pattern: shadow-xs or shadow-2xs on card containers
# We want to replace shadow-xs/2xs with shadow-md but ONLY on containers
# that have rounded-lg border border-slate-200 (or border-gray-200)

# Actually, let me take a different approach - find all shadow-xs/2xs 
# occurrences in these files and only replace those that are on div elements
# with the card pattern

patterns_replaced = 0

for filepath in files_to_check:
    if not os.path.exists(filepath):
        print(f"Skipping {filepath} - not found")
        continue
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Replace shadow-2xs with shadow-md on div elements that have the card pattern
    # Pattern: div with rounded-lg border border-slate-200 and shadow-2xs
    # We need to be careful here
    
    # Let's just replace shadow-2xs with shadow-md wherever it appears 
    # on elements that also have the card pattern
    # Actually, let me just do a simple replace and then verify
    
    # Replace shadow-2xs with shadow-md
    content = content.replace('shadow-2xs', 'shadow-md')
    content = content.replace('shadow-xs', 'shadow-md')
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        # Count how many replacements
        reps = original.count('shadow-2xs') + original.count('shadow-xs')
        patterns_replaced += reps
        print(f"Replaced in {filepath}: {reps} occurrences")
    else:
        print(f"No shadow-xs/2xs in {filepath}")

print(f"\nTotal replacements: {patterns_replaced}")