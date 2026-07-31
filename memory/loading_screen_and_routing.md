---
name: loading-screen-routing-implementation
description: Complete loading screen system and property routing with property selector
metadata:
  type: project
---

## Loading Screen & Routing Implementation Complete

**Completed 2026-07-31**

### Components Created

1. **LoadingScreen.tsx**
   - Beautiful animated Tailwind loading screen
   - Pulsing logo, spinning loader, animated dots
   - Shows while configuration data is fetching

2. **DataLoader.tsx** 
   - Fetches critical data in parallel before app renders
   - Data: property details, modules, nav items, telegram config
   - Detects invalid/missing properties
   - Shows InvalidPropertyPage if property not in URL

3. **InvalidPropertyPage.tsx**
   - Shows when user accesses invalid property URL (e.g., /artists_farm/#dashboard)
   - Displays error message with URL format instructions
   - Provides link to go home

4. **PropertySelector.tsx**
   - Shows when user accesses root path (/artists_farm/)
   - Displays available properties as cards
   - Users click property to access it at correct URL

### URL Routing Flow

- `http://localhost:3000/artists_farm/` → PropertySelector (choose property)
- `http://localhost:3000/artists_farm/#dashboard` → InvalidPropertyPage (no property specified)
- `http://localhost:3000/artists_farm/tenant/property/#dashboard` → Staff login then app
- `http://localhost:3000/artists_farm/artists-farm-platform/jaipur/` → Works correctly

### Key Features

✅ No flash of wrong data (property name, color scheme, menus)
✅ Loading screen shows during startup
✅ Invalid URLs properly handled
✅ Staff login only on property pages
✅ Root path shows property selector
✅ All configuration data preloaded before rendering app

### Architecture

```
App
├─ if no property → PropertySelector
└─ if property exists
   └─ AuthProvider
      └─ DataLoader (fetch config data)
         ├─ if invalid property → InvalidPropertyPage
         ├─ if loading → LoadingScreen
         └─ if valid → AppWithProviders
            └─ ModulesProvider (with preloaded modules)
               └─ Other Providers...
                  └─ AppBody (with preloaded data)
```

### Files Modified

- App.tsx: Added routing check for root path
- DataLoader.tsx: Added property validation
- ModulesProvider: Accepts initialData prop
- AppBody: Uses preloadedData for state initialization

### Next Steps

- API endpoint `/php/api/router.php?action=get_available_properties` needs to be implemented
- Or hardcode properties for now and fetch dynamically later
