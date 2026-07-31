/**
 * User Flow Tracker - Capture dead ends, errors, and user confusion points
 * Helps identify what's breaking for users and why they get stuck
 */

import { recordTelescopeLog } from './telescopeLogger';

export interface UserFlowIssue {
  type: 'dead_end' | 'auth_failure' | 'permission_denied' | 'not_found' | 'api_error' | 'session_lost' | 'confusion_point';
  severity: 'ERROR' | 'WARNING';
  message: string;
  context: {
    page: string;
    user?: string;
    userId?: string;
    property?: string;
    action?: string;
    expectedOutcome?: string;
    actualOutcome?: string;
  };
  timestamp: string;
}

/**
 * Track when user gets stuck with no way forward
 */
export function trackDeadEnd(page: string, reason: string, context?: any) {
  const issue: UserFlowIssue = {
    type: 'dead_end',
    severity: 'ERROR',
    message: `User stuck at ${page}: ${reason}`,
    context: {
      page,
      ...context,
    },
    timestamp: new Date().toISOString(),
  };

  recordTelescopeLog({
    portal: '404',
    severity: 'CRITICAL',
    msg: `🚫 DEAD END: ${issue.message}`,
    origin: page,
    details: {
      issueType: 'dead_end',
      reason,
      url: window.location.href,
      ...context,
    },
  });

  return issue;
}

/**
 * Track authentication failures
 */
export function trackAuthFailure(reason: string, context?: any) {
  recordTelescopeLog({
    portal: 'security',
    severity: 'CRITICAL',
    msg: `🔒 AUTH FAILURE: ${reason}`,
    origin: 'Authentication Flow',
    details: {
      issueType: 'auth_failure',
      reason,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      ...context,
    },
  });
}

/**
 * Track permission denied errors
 */
export function trackPermissionDenied(page: string, action: string, reason: string, context?: any) {
  recordTelescopeLog({
    portal: 'security',
    severity: 'WARNING',
    msg: `🔐 PERMISSION DENIED: ${action} on ${page} - ${reason}`,
    origin: page,
    details: {
      issueType: 'permission_denied',
      page,
      action,
      reason,
      url: window.location.href,
      ...context,
    },
  });
}

/**
 * Track 404 / not found errors
 */
export function trackNotFound(resource: string, context?: any) {
  recordTelescopeLog({
    portal: '404',
    severity: 'WARNING',
    msg: `❌ NOT FOUND: ${resource}`,
    origin: 'Resource Lookup',
    details: {
      issueType: 'not_found',
      resource,
      url: window.location.href,
      ...context,
    },
  });
}

/**
 * Track API failures and network errors
 */
export function trackAPIError(endpoint: string, status: number, message: string, context?: any) {
  recordTelescopeLog({
    portal: 'requests',
    severity: status >= 500 ? 'CRITICAL' : 'ERROR',
    msg: `⚠️ API ERROR: ${endpoint} returned ${status} - ${message}`,
    origin: 'API Handler',
    details: {
      issueType: 'api_error',
      endpoint,
      status,
      message,
      url: window.location.href,
      ...context,
    },
  });
}

/**
 * Track session loss / unexpected logouts
 */
export function trackSessionLoss(reason: string, context?: any) {
  recordTelescopeLog({
    portal: 'security',
    severity: 'CRITICAL',
    msg: `⏱️ SESSION LOST: ${reason}`,
    origin: 'Session Handler',
    details: {
      issueType: 'session_lost',
      reason,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      ...context,
    },
  });
}

/**
 * Track user confusion points (places where users get confused and might give up)
 * - Complex modals with unclear buttons
 * - Unclear error messages
 * - Missing navigation
 * - Unexpected behavior
 */
export function trackConfusionPoint(page: string, issue: string, context?: any) {
  recordTelescopeLog({
    portal: 'js',
    severity: 'WARNING',
    msg: `🤔 CONFUSION POINT: ${issue} on ${page}`,
    origin: page,
    details: {
      issueType: 'confusion_point',
      page,
      issue,
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...context,
    },
  });
}

/**
 * Track property access issues
 */
export function trackPropertyIssue(propertyId: string | number, issue: string, context?: any) {
  recordTelescopeLog({
    portal: 'requests',
    severity: 'ERROR',
    msg: `🏠 PROPERTY ERROR: Property ${propertyId} - ${issue}`,
    origin: 'Property Handler',
    details: {
      issueType: 'property_error',
      propertyId,
      issue,
      url: window.location.href,
      ...context,
    },
  });
}

/**
 * Track module/feature access issues
 */
export function trackModuleError(moduleName: string, action: string, error: string, context?: any) {
  recordTelescopeLog({
    portal: 'requests',
    severity: 'ERROR',
    msg: `🔌 MODULE ERROR: ${moduleName} - ${action} failed: ${error}`,
    origin: `Module: ${moduleName}`,
    details: {
      issueType: 'module_error',
      moduleName,
      action,
      error,
      url: window.location.href,
      ...context,
    },
  });
}

/**
 * Track user successful completions (to measure conversion)
 */
export function trackSuccess(action: string, details?: any) {
  recordTelescopeLog({
    portal: 'requests',
    severity: 'SUCCESS',
    msg: `✅ SUCCESS: ${action}`,
    origin: 'User Action',
    details: {
      action,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      ...details,
    },
  });
}
