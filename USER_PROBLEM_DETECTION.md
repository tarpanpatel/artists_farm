# 🔍 User Problem Detection Guide

**Goal:** See what problems users are facing and fix them before they abandon  
**Tool:** userFlowTracker + Telescope Logger  
**Access:** http://localhost/artists_farm/php/errors/

---

## Quick Start

### 1. Import the tracker
```typescript
import { 
  trackDeadEnd, 
  trackAuthFailure, 
  trackPermissionDenied,
  trackAPIError,
  trackSessionLoss,
  trackConfusionPoint,
  trackSuccess
} from './utils/userFlowTracker';
```

### 2. Use in your components
```typescript
// When user can't escape a page
trackDeadEnd('/kitchen/orders', 'No logout button visible', {
  page: 'KitchenManagement',
  user: currentUser?.username,
});

// When API fails
trackAPIError('/api/guests', 500, 'Database connection failed', {
  endpoint: '/api/guests',
  propertyId: currentProperty?.id,
});

// When user lacks permission
trackPermissionDenied('PropertyManagement', 'Delete', 'User role is manager, needs super_admin', {
  userRole: userRole,
  requiredRole: 'super_admin',
});
```

---

## Common Problems & How to Track Them

### 1. Dead Ends (No Way Out)
**When to use:** User navigates to page but can't navigate away

```typescript
// Example: User stuck in modal
if (!canClose && !hasLogoutButton) {
  trackDeadEnd('/kitchen/kds', 'KDS mode stuck without escape button', {
    page: 'KitchenManagement',
    mode: 'kds_active',
  });
}
```

**Where to check in Telescope:** Portal = `404`, search for "DEAD END"

---

### 2. Authentication Failures
**When to use:** Login, passcode, or session verification fails

```typescript
// Example: Wrong passcode too many times
if (passcodeAttempts > 3) {
  trackAuthFailure('Too many failed passcode attempts', {
    attempts: passcodeAttempts,
    userIP: '192.168.1.100',
  });
}

// Example: Session expired
if (!session || session.expired) {
  trackSessionLoss('Session cookie expired after timeout', {
    duration: '45 minutes',
    userId: user?.id,
  });
}
```

**Where to check in Telescope:** Portal = `Security`, search for "AUTH FAILURE" or "SESSION LOST"

---

### 3. Permission Denied
**When to use:** User lacks necessary permissions

```typescript
// Example: User tries to delete property
if (!isSuper Admin) {
  trackPermissionDenied('PlatformPropertyManagement', 'Delete property', 'Only super_admin can delete', {
    userRole: userRole,
    propertyId: propertyId,
  });
}

// Example: Module not enabled
if (!isModuleEnabled('kitchen')) {
  trackPermissionDenied('Kitchen', 'Take Order', 'Kitchen module disabled for this property', {
    propertyId: propertyId,
    moduleName: 'kitchen',
  });
}
```

**Where to check in Telescope:** Portal = `Security`, search for "PERMISSION DENIED"

---

### 4. API Errors
**When to use:** API calls fail (500, 404, timeout, etc.)

```typescript
// Example: Fetch guests fails
try {
  const response = await fetch('/api/guests');
  if (!response.ok) {
    trackAPIError('/api/guests', response.status, 'Failed to fetch guests', {
      method: 'GET',
      propertyId: currentProperty?.id,
    });
  }
} catch (error) {
  trackAPIError('/api/guests', 0, error.message, {
    method: 'GET',
    error: error,
  });
}
```

**Where to check in Telescope:** Portal = `Requests`, search for "API ERROR"

---

### 5. Resource Not Found
**When to use:** User tries to access deleted/missing resource

```typescript
// Example: Property deleted
if (!property) {
  trackNotFound(`Property ${propertyId}`, {
    propertyId: propertyId,
    page: 'PropertyManagement',
  });
}

// Example: Guest record missing
if (!guest) {
  trackNotFound(`Guest ${guestId}`, {
    guestId: guestId,
    propertyId: propertyId,
  });
}
```

**Where to check in Telescope:** Portal = `404`, search for "NOT FOUND"

---

### 6. Confusion Points
**When to use:** Feature seems confusing or users might abandon

```typescript
// Example: Unclear delete confirmation
if (!userConfirmsDelete) {
  trackConfusionPoint('/property/delete', 'Delete confirmation modal unclear', {
    page: 'PlatformPropertyManagement',
    issue: 'User hesitated for 45 seconds then cancelled',
  });
}

// Example: Complex billing calculation
if (userQueriesTotal > 2) {
  trackConfusionPoint('/billing/checkout', 'User confused by total calculation', {
    page: 'Billing',
    issue: 'User clicked calculate total button 3 times',
    queryCount: userQueriesTotal,
  });
}
```

**Where to check in Telescope:** Portal = `JS Browser`, search for "CONFUSION POINT"

---

### 7. Successful Actions (Track Conversions)
**When to use:** Important user action completed successfully

```typescript
// Example: Guest checked in
trackSuccess('Guest checked in', {
  guestId: guest.id,
  guestName: guest.name,
  roomNumber: guest.roomNumber,
  propertyId: currentProperty?.id,
});

// Example: Order created
trackSuccess('Kitchen order created', {
  orderId: order.id,
  items: order.items.length,
  guestName: order.guestName,
});

// Example: Property created
trackSuccess('Property created', {
  propertyId: newProperty.id,
  propertyName: newProperty.name,
  slug: newProperty.slug,
});
```

**Where to check in Telescope:** Portal = `Requests`, filter by "SUCCESS"

---

## Real-World Examples

### Example 1: User Stuck in Kitchen KDS Mode
```typescript
// In KitchenManagement.tsx
useEffect(() => {
  // Check if user can exit KDS mode
  if (isKDSActive && !canCancelKDS) {
    trackDeadEnd('/kitchen/kds', 'User stuck in KDS mode - no cancel button', {
      page: 'KitchenManagement',
      mode: 'kds_active',
      user: currentUser?.username,
      duration: kdsActiveDuration,
    });
  }
}, [isKDSActive, canCancelKDS]);
```

### Example 2: API Timeout During Checkout
```typescript
// In GuestManagement.tsx billing section
const handleCheckout = async () => {
  try {
    const response = await fetch('/api/checkout', { timeout: 30000 });
    
    if (!response.ok) {
      trackAPIError('/api/checkout', response.status, response.statusText, {
        guestId: guest.id,
        totalAmount: billingTotal,
        paymentMethod: paymentMethod,
      });
      setError('Checkout failed. Try again.');
    }
  } catch (error) {
    trackAPIError('/api/checkout', 0, error.message, {
      guestId: guest.id,
      error: error.name,
    });
  }
};
```

### Example 3: Permission Issue for Tenant
```typescript
// In PlatformPropertyManagement.tsx
const handleDeleteProperty = () => {
  if (!isSuper Admin && !isPlatformAdmin) {
    trackPermissionDenied(
      'PlatformPropertyManagement', 
      'Delete property',
      `Only super_admin+ can delete. User role: ${userRole}`,
      {
        userRole: userRole,
        propertyId: property.id,
        propertyName: property.name,
      }
    );
    showError('Only administrators can delete properties.');
    return;
  }
  // Proceed with deletion...
};
```

---

## How to Identify & Fix Problems

### Daily Process
1. **Open Telescope**: http://localhost/artists_farm/php/errors/
2. **Check Today's Logs**: Set timeframe to "Today"
3. **Review by Portal**: Check each portal for ERROR/CRITICAL
4. **Search for Patterns**: Look for recurring issues

### When You Find a Problem

**Step 1: Understand It**
- Read the error message
- Check the context/details
- Identify affected users/properties

**Step 2: Reproduce It**
- Try to recreate the issue locally
- Follow the same user path
- Note what exactly breaks

**Step 3: Fix It**
```typescript
// Bad: Silent failure
const deleteProperty = async (id) => {
  try {
    await fetch(`/api/properties/${id}`, { method: 'DELETE' });
  } catch (e) {
    // Silent failure - user doesn't know what happened
  }
};

// Good: Track and inform user
const deleteProperty = async (id) => {
  try {
    const response = await fetch(`/api/properties/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      trackAPIError(`/api/properties/${id}`, response.status, 'Delete failed');
      setError('Failed to delete property. Please try again.');
      return false;
    }
    trackSuccess('Property deleted', { propertyId: id });
    return true;
  } catch (error) {
    trackAPIError(`/api/properties/${id}`, 0, error.message);
    setError('Network error. Please try again.');
    return false;
  }
};
```

**Step 4: Test It**
- Verify fix locally
- Test with different user roles
- Check telescope logs show success

**Step 5: Deploy & Monitor**
- Deploy fix
- Watch telescope logs for next 24 hours
- Verify no new similar issues

---

## Telescope Portal Reference

| Portal | What to Look For | Action |
|--------|-----------------|--------|
| **Requests** | API errors, failures, slow calls | Check backend logs, optimize queries |
| **PHP** | Exceptions, fatal errors, warnings | Fix PHP code, add validation |
| **SQL** | Slow queries, connection errors | Add indexes, optimize queries |
| **JS** | Browser errors, confusion points | Fix UI, improve UX |
| **Telegram** | Notification failures | Check bot token, group IDs |
| **Security** | Auth failures, permission denied | Fix authentication, role validation |
| **404** | Dead ends, missing resources | Add navigation, error recovery |

---

## Smart Tracking Tips

### ✅ DO
- Track both **successes** and **failures**
- Include **context** (user, property, action)
- Track **early failures** before they escalate
- Monitor **conversion funnels** (register → login → create property)
- Set up **Telegram alerts** for CRITICAL issues

### ❌ DON'T
- Track every single action (too noisy)
- Log sensitive data (passwords, tokens)
- Forget to include action context
- Track only failures (miss success metrics)
- Leave issues in telescope unfixed for > 24 hours

---

## Setting Up Telegram Alerts (Optional)

To get **instant notification** when CRITICAL issues occur:

1. Create a Telegram group: `#artists-farm-alerts`
2. Add your bot to the group
3. Add this to your code:

```typescript
import { sendTelegramAlertDB } from './services/api';

// On CRITICAL error
if (severity === 'CRITICAL') {
  await sendTelegramAlertDB(
    'admin',
    `🚨 CRITICAL: ${message}\nUser: ${user}\nProperty: ${property}`
  );
}
```

---

## Monitoring Checklist

### Daily ✅
- [ ] Check CRITICAL logs in telescope
- [ ] Search for "AUTH FAILURE" - any brute force?
- [ ] Search for "API ERROR" - any backend issues?
- [ ] Check "DEAD END" logs - users getting stuck?

### Weekly ✅
- [ ] Review all ERROR logs
- [ ] Check error rate trend (going up or down?)
- [ ] Look for patterns (same issue multiple times?)
- [ ] Review confusion points - any UX improvements needed?

### Monthly ✅
- [ ] Analyze success/failure ratio
- [ ] Calculate conversion rates
- [ ] Plan fixes for top 3 issues
- [ ] Archive old logs (keep last 2000)

---

## Summary

**With userFlowTracker + Telescope, you can:**
- ✅ See **exactly where users get stuck**
- ✅ Find **errors before users report them**
- ✅ Identify **which features are confusing**
- ✅ Track **which users are affected**
- ✅ Fix **problems with real data context**
- ✅ Prove **fixes work** by monitoring logs

**This is your window into user problems. Use it daily.**
