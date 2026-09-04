<?php
/**
 * Legacy Public Availability Page - Permanently Redirects to New Direct Booking Engine
 */
$slug = isset($_GET['property_slug']) ? trim($_GET['property_slug']) : '';
if (!empty($slug)) {
    header("Location: /" . urlencode($slug) . "/#book", true, 301);
} else {
    header("Location: /#book", true, 301);
}
exit;
