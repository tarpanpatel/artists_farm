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

