<?php

function getCurrentPropertyId(PDO $pdo): int {
    $candidates = [];

    // Priority 1: Tenant + Property slugs from URL (e.g., /tenant-slug/property-slug/)
    // This comes from .htaccess rewrite rule for multi-tenant properties
    if (isset($_GET['tenant_slug']) && isset($_GET['property_slug'])) {
        $tenantSlug = strtolower($_GET['tenant_slug']);
        $propertySlug = strtolower($_GET['property_slug']);

        $stmt = $pdo->prepare("
            SELECT p.id FROM properties p
            JOIN tenants t ON p.tenant_id = t.id
            WHERE t.slug = ? AND p.slug = ? AND p.is_active = 1
            LIMIT 1
        ");
        $stmt->execute([$tenantSlug, $propertySlug]);
        $row = $stmt->fetch();
        if ($row) {
            return (int)$row['id'];
        }
    }

    // Priority 2: Single property slug query parameter
    if (isset($_GET['property_slug'])) {
        $candidates[] = strtolower($_GET['property_slug']);
    }

    // Priority 3: HTTP header
    if (isset($_SERVER['HTTP_X_PROPERTY_SLUG'])) {
        $candidates[] = strtolower($_SERVER['HTTP_X_PROPERTY_SLUG']);
    }

    // Priority 4: URL path segment (legacy single-segment URLs)
    $request_uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($request_uri, PHP_URL_PATH) ?: '/';
    $segments = array_values(array_filter(explode('/', $path), fn($s) => $s !== ''));
    foreach (array_slice($segments, 0, 1) as $seg) {
        $candidates[] = strtolower($seg);
    }

    // Priority 5: Subdomain (for backward compatibility)
    $host = strtolower(trim($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $hostParts = explode('.', $host);
    if (count($hostParts) >= 3) {
        $candidates[] = $hostParts[0];
    }

    // Priority 6: Default to jaipur
    $candidates[] = 'jaipur';

    foreach ($candidates as $slug) {
        if ($slug === '') continue;
        $stmt = $pdo->prepare("SELECT id FROM properties WHERE slug = ? AND is_active = 1 LIMIT 1");
        $stmt->execute([$slug]);
        $row = $stmt->fetch();
        if ($row) {
            return (int)$row['id'];
        }
    }

    // Ultimate fallback: first active property
    $stmt = $pdo->query("SELECT id FROM properties WHERE is_active = 1 ORDER BY id ASC LIMIT 1");
    $row = $stmt->fetch();
    return $row ? (int)$row['id'] : 1;
}

function getCurrentPropertySlug(PDO $pdo): string {
    $id = getCurrentPropertyId($pdo);
    $stmt = $pdo->prepare("SELECT slug FROM properties WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ? $row['slug'] : 'jaipur';
}

function getCurrentProperty(PDO $pdo): array {
    $id = getCurrentPropertyId($pdo);
    $stmt = $pdo->prepare("SELECT * FROM properties WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    return $stmt->fetch() ?: [];
}
