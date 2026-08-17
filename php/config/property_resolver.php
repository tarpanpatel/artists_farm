<?php

function getCurrentPropertyId(PDO $pdo): int {
    $candidates = [];
    $explicitlyRequested = false;

    // Priority 1: Explicit Tenant + Property slugs from query parameters or rewrite rules
    if (isset($_GET['tenant_slug']) && isset($_GET['property_slug'])) {
        $tenantSlug = strtolower(trim($_GET['tenant_slug']));
        $propertySlug = strtolower(trim($_GET['property_slug']));

        $stmt = $pdo->prepare("
            SELECT p.id FROM properties p
            JOIN tenants t ON p.tenant_id = t.id
            WHERE (t.slug = ? OR REPLACE(t.slug, '_', '-') = ? OR REPLACE(t.slug, '-', '_') = ?)
              AND (p.slug = ? OR REPLACE(p.slug, '_', '-') = ? OR REPLACE(p.slug, '-', '_') = ?)
              AND p.is_active = 1
            LIMIT 1
        ");
        $stmt->execute([$tenantSlug, $tenantSlug, $tenantSlug, $propertySlug, $propertySlug, $propertySlug]);
        $row = $stmt->fetch();
        if ($row) {
            return (int)$row['id'];
        }
        // Explicit tenant+property combo requested but not found - reject immediately rather
        // than falling through to an unrelated property.
        return 0;
    }

    // Priority 2: Single property slug query parameter
    if (isset($_GET['property_slug']) && !empty($_GET['property_slug'])) {
        $explicitlyRequested = true;
        $candidates[] = strtolower(trim($_GET['property_slug']));
    }

    // Priority 3: HTTP header
    if (isset($_SERVER['HTTP_X_PROPERTY_SLUG']) && !empty($_SERVER['HTTP_X_PROPERTY_SLUG'])) {
        $explicitlyRequested = true;
        $candidates[] = strtolower(trim($_SERVER['HTTP_X_PROPERTY_SLUG']));
    }

    // Priority 4: URL path segments
    $request_uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($request_uri, PHP_URL_PATH) ?: '/';
    $segments = array_values(array_filter(explode('/', $path), fn($s) => $s !== ''));

    // Reserved non-property path segments
    $reserved = ['artists_farm', 'php', 'dist', 'assets', 'icons', 'api', 'backups', 'node_modules', 'login'];

    // Priority 3.5: URL path as an explicit tenant_slug/property_slug PAIR, matching the
    // documented /{tenant_slug}/{property_slug}/ convention - tried before the generic
    // single-slug fallback below so a property-slug collision across tenants can't silently
    // resolve to the wrong tenant's property just because it's checked first. Found 17 Aug
    // 2026: an orphaned property with no tenant_id and bare slug "jaipur" was shadowing the
    // correctly tenant-scoped property (slug "artists-farm-jaipur", tenant "artists-farm") on
    // every request to /artists-farm/jaipur/, because the old single-slug loop below matches
    // globally with no tenant scoping.
    $pathSegmentsOrdered = array_values(array_filter($segments, function ($s) use ($reserved) {
        $c = strtolower(trim($s));
        return $c !== '' && !in_array($c, $reserved) && !str_contains($c, '.');
    }));
    if (count($pathSegmentsOrdered) >= 2) {
        $maybeTenant = strtolower(trim($pathSegmentsOrdered[0]));
        $maybeProperty = strtolower(trim($pathSegmentsOrdered[1]));
        $stmt = $pdo->prepare("
            SELECT p.id FROM properties p
            JOIN tenants t ON p.tenant_id = t.id
            WHERE (t.slug = ? OR REPLACE(t.slug, '_', '-') = ? OR REPLACE(t.slug, '-', '_') = ?)
              AND (p.slug = ? OR REPLACE(p.slug, '_', '-') = ? OR REPLACE(p.slug, '-', '_') = ?)
              AND p.is_active = 1
            LIMIT 1
        ");
        $stmt->execute([$maybeTenant, $maybeTenant, $maybeTenant, $maybeProperty, $maybeProperty, $maybeProperty]);
        $row = $stmt->fetch();
        if ($row) {
            return (int)$row['id'];
        }
        // No exact pair match (e.g. a legacy compound slug, or segment[1] isn't a property
        // slug at all) - fall through to the generic candidate loop below unchanged.
    }

    // Collect all valid path segments in reverse order (most specific segment first)
    foreach (array_reverse($segments) as $seg) {
        $clean = strtolower(trim($seg));
        if ($clean !== '' && !in_array($clean, $reserved) && !str_contains($clean, '.')) {
            $explicitlyRequested = true;
            $candidates[] = $clean;
        }
    }

    // Priority 5: Subdomain fallback (not treated as an "explicit" request on its own - a bare
    // subdomain hit is ambiguous enough that it should still be eligible for the default fallback
    // below rather than being rejected outright)
    $host = strtolower(trim($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $hostParts = explode('.', $host);
    if (count($hostParts) >= 3 && $hostParts[0] !== 'www') {
        $candidates[] = $hostParts[0];
    }

    // Deduplicate candidates preserving order
    $candidates = array_unique($candidates);

    // Attempt resolution for candidates: match against property slug first, then tenant slug
    // (a tenant-only URL like /artists_farm/vrikshawan/ resolves to that tenant's first active
    // property, so e.g. Root Admin isn't locked out just because no property segment was given)
    foreach ($candidates as $slug) {
        if ($slug === '') continue;

        // A. Match against property slug (exact or hyphen/underscore variant)
        $stmt = $pdo->prepare("
            SELECT id FROM properties
            WHERE (slug = ? OR REPLACE(slug, '_', '-') = ? OR REPLACE(slug, '-', '_') = ?)
              AND is_active = 1
            LIMIT 1
        ");
        $stmt->execute([$slug, $slug, $slug]);
        $row = $stmt->fetch();
        if ($row) {
            return (int)$row['id'];
        }

        // B. Match against tenant slug (returns first active property belonging to this tenant)
        $stmt = $pdo->prepare("
            SELECT p.id FROM properties p
            JOIN tenants t ON p.tenant_id = t.id
            WHERE (t.slug = ? OR REPLACE(t.slug, '_', '-') = ? OR REPLACE(t.slug, '-', '_') = ?)
              AND p.is_active = 1
            ORDER BY p.id ASC
            LIMIT 1
        ");
        $stmt->execute([$slug, $slug, $slug]);
        $row = $stmt->fetch();
        if ($row) {
            return (int)$row['id'];
        }
    }

    // A property/tenant was explicitly requested (via query param, header, or URL path) but none
    // of the candidates matched a real property or tenant - reject rather than silently falling
    // back to an unrelated property. This is a multi-tenant app; silently loading a different
    // tenant's data for an unresolved request would be a data-isolation bug, not a convenience.
    if ($explicitlyRequested) {
        return 0;
    }

    // Priority 6: Default fallback - only reached when NO explicit signal was present at all
    // (e.g. bare domain root access, or only an ambiguous subdomain).
    $stmt = $pdo->prepare("SELECT id FROM properties WHERE slug = 'jaipur' AND is_active = 1 LIMIT 1");
    $stmt->execute();
    $row = $stmt->fetch();
    if ($row) {
        return (int)$row['id'];
    }

    // Ultimate fallback: return the first active property in the database
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

// $knownId lets a caller that already resolved the property (router.php does,
// right before this) skip re-running the whole slug-matching candidate chain
// a second time - that chain is 2+ queries per attempt, and every single API
// request in the app calls both getCurrentPropertyId() and getCurrentProperty()
// unconditionally, so resolving twice doubled that cost on every request.
function getCurrentProperty(PDO $pdo, ?int $knownId = null): array {
    $id = $knownId ?? getCurrentPropertyId($pdo);
    $stmt = $pdo->prepare("SELECT * FROM properties WHERE id = ? LIMIT 1");
    $stmt->execute([$id]);
    return $stmt->fetch() ?: [];
}
