// Guest status constants - single source of truth matching php/config/guest_status.php

export const GUEST_STATUS_CHECKED_IN = 'Checked In';
export const GUEST_STATUS_CHECKED_OUT = 'Checked Out';
export const GUEST_STATUS_BOOKED = 'Booked';

// Legacy aliases for backward compatibility during migration
export const GUEST_STATUS_ACTIVE_LEGACY = 'Active';
export const GUEST_STATUS_CONFIRMED_LEGACY = 'Confirmed';
export const GUEST_STATUS_CHECKEDOUT_LEGACY = 'CheckedOut';

export type GuestStatus = typeof GUEST_STATUS_CHECKED_IN | typeof GUEST_STATUS_CHECKED_OUT | typeof GUEST_STATUS_BOOKED;

export const GUEST_STATUS_OPTIONS: GuestStatus[] = [
  GUEST_STATUS_BOOKED,
  GUEST_STATUS_CHECKED_IN,
  GUEST_STATUS_CHECKED_OUT,
];
