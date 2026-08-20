#!/usr/bin/env python3
import os
import re

# Files to check (the heaviest ones + all src/components/*.tsx)
# Let's check all src/components/*.tsx but only replace the specific pattern
src_dir = 'src/components'
files = []
for f in os.listdir(src_dir):
    if f.endswith('.tsx'):
        files.append(os.path.join(src_dir, f))

print(f"Checking {len(files)} files...")

total_replaced = 0

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Find all occurrences of the pattern: rounded-lg border border-slate-200 (or gray-200) with shadow-xs/2xs
    # We need to replace shadow-xs/2xs with shadow-md ONLY when they appear on the same element as the card pattern
    
    # Strategy: use regex to find div elements with the full card pattern
    # Pattern: className containing "rounded-lg border border-slate-200" AND "shadow-xs" or "shadow-2xs"
    
    # Let's find all shadow-xs and shadow-2xs occurrences and their context
    shadow_positions = []
    for match in re.finditer(r'shadow-(xs|2xs)', content):
        pos = match.start()
        context_start = max(0, pos - 100)
        context_end = min(len(content), pos + 100)
        context = content[context_start:context_end]
        shadow_positions.append((pos, context))
    
    # Check which ones are on card containers
    replaced_in_file = 0
    
    for pos, context in shadow_positions:
        # Check if this shadow is on a card container
        # Look backwards for rounded-lg border border-slate-200 or border-gray-200
        backward = content[max(0, pos - 300):pos]
        
        is_card_container = (
            'rounded-lg' in backward and
            ('border border-slate-200' in backward or 'border border-gray-200' in backward or
             'border-slate-200' in backward or 'border-gray-200' in backward)
        )
        
        # Also check if it's a direct child class pattern like "shadow-2xs p-3.5"
        # that's part of a card div
        
        if is_card_container:
            # Replace shadow-xs/2xs with shadow-md in the original content
            # We need to find the exact match and replace it
            content = content.replace('shadow-2xs', 'shadow-md')
            content = content.replace('shadow-xs', 'shadow-md')
            replaced_in_file += 1
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        total_replaced += replaced_in_file
        print(f"  {os.path.basename(filepath)}: replaced {replaced_in_file} card shadows")
    else:
        # Still check if there are any that should have been replaced
        # Look for the specific pattern
        if re.search(r'rounded-lg.*border.*(slate|gray)-200.*shadow-(xs|2xs)', content, re.DOTALL):
            print(f"  {os.path.basename(filepath)}: has pattern but not replaced (may need manual review)")
        else:
            print(f"  {os.path.basename(filepath)}: no card shadows to replace")

print(f"\nTotal card shadows replaced: {total_replaced}")