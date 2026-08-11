<?php
// Guest status constants - single source of truth for all guest status values.
// Use these everywhere instead of hardcoded strings to prevent drift.

define('GUEST_STATUS_CHECKED_IN', 'Checked In');
define('GUEST_STATUS_CHECKED_OUT', 'Checked Out');
define('GUEST_STATUS_BOOKED', 'Booked');

// Legacy aliases for backward compatibility during migration
define('GUEST_STATUS_ACTIVE_LEGACY', 'Active');
define('GUEST_STATUS_CONFIRMED_LEGACY', 'Confirmed');
define('GUEST_STATUS_CHECKEDOUT_LEGACY', 'CheckedOut');
