<?php
require_once __DIR__ . '/../php/config/database.php';
require_once __DIR__ . '/../php/api/public_booking.php';

try {
    handleGetPublicBookingInfo($pdo, 1);
} catch (Throwable $t) {
    echo "ERROR: " . $t->getMessage() . "\n" . $t->getTraceAsString();
}
