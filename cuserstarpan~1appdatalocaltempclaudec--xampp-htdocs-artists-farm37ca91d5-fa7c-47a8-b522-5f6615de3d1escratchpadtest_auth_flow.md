# Auth Flow Debugging Checklist

## Current Issue
Sidebar not showing after staff login despite successful authentication

## Root Causes Found
1. **Two separate auth systems**: LoginPage (generic session) vs LoginModal (property-specific AuthContext)
2. **Missing bridge**: When logging in via LoginPage, AuthContext wasn't synced

## Fix Applied
- Updated AuthContext.useEffect to check for generic session if property-specific key not found
- Migrates generic session to property-specific auth keys

## Verification Steps
1. ✅ Code change applied to AuthContext
2. ⏳ Need to test actual login flow
3. ⏳ Verify sidebar appears after staff login
4. ⏳ Test logout clears both auth systems

## Test Scenario
1. Navigate to `/artists_farm/vrikshawan/resort-hut/`
2. LoginModal should appear (isAuthenticated = false)
3. Log in with staff credentials
4. After login:
   - isAuthenticated should be true
   - localStorage should have:
     - `artists_farm_authenticated_resort-hut` = 'true'
     - `artists_farm_user_resort-hut` = user JSON
   - Sidebar should render

## If Still Not Working
- Check getPropertySlug() extraction
- Check DataLoader timeout behavior
- Verify useEffect dependencies
