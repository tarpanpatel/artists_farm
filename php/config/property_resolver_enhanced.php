<?php
/**
 * Property Resolver - Enhanced for SaaS
 * Now includes tenant context
 */

require_once __DIR__ . '/database.php';
require_once __DIR__ . '/../auth/saas_auth.php';

function resolveCurrentProperty($pdo, $userId = null) {
    // If user is logged in, use their access info
    if ($userId) {
        $accessInfo = getUserAccessInfo($pdo, $userId);
        
        // Platform admin can access any property
        if ($accessInfo['is_platform_admin']) {
            // Try to get property from URL/params first
            $propertyId = getPropertyIdFromRequest();
            if ($propertyId && canAccessProperty($accessInfo, $propertyId)) {
                return $propertyId;
            }
        }
        
        // Tenant admin: default to first property if none specified
        if ($accessInfo['is_tenant_admin'] && empty($_GET['property_id'])) {
            if (!empty($accessInfo['accessible_properties'])) {
                return $accessInfo['accessible_properties'][0];
            }
        }
        
        // Property user: always their property
        if (!$accessInfo['is_platform_admin'] && !$accessInfo['is_tenant_admin']) {
            return $accessInfo['property_id'];
        }
    }
    
    // Fallback to original logic
    return getPropertyIdFromRequest() ?: 1;
}

function getPropertyIdFromRequest() {
    // 1. Check URL path (e.g., /goa/ → property_slug=goa)
    if (isset($_SERVER['REQUEST_URI'])) {
        $uri = $_SERVER['REQUEST_URI'];
        $path = parse_url($uri, PHP_URL_PATH);
        
        // Extract property slug from path like /artists_farm/goa/
        if (preg_match('/\/([a-z0-9-]+)\/?$/', $path, $matches)) {
            $slug = $matches[1];
            // Skip common paths that aren't properties
            if (!in_array($slug, ['index.php', 'login.php', 'admin', 'api'])) {
                global $pdo;
                $stmt = $pdo->prepare("SELECT id FROM properties WHERE slug = ? LIMIT 1");
                $stmt->execute([$slug]);
                if ($row = $stmt->fetch()) {
                    return $row['id'];
                }
            }
        }
    }
    
    // 2. Check query parameter
    if (isset($_GET['property_id']) && is_numeric($_GET['property_id'])) {
        return (int)$_GET['property_id'];
    }
    
    // 3. Check property_slug parameter
    if (isset($_GET['property_slug']) && !empty($_GET['property_slug'])) {
        global $pdo;
        $stmt = $pdo->prepare("SELECT id FROM properties WHERE slug = ? LIMIT 1");
        $stmt->execute([$_GET['property_slug']]);
        if ($row = $stmt->fetch()) {
            return $row['id'];
        }
    }
    
    // 4. Check subdomain (if configured)
    if (isset($_SERVER['HTTP_HOST'])) {
        $host = $_SERVER['HTTP_HOST'];
        $subdomain = strtok($host, '.');
        
        if ($subdomain && $subdomain !== 'www' && $subdomain !== 'localhost') {
            global $pdo;
            $stmt = $pdo->prepare("SELECT id FROM properties WHERE slug = ? LIMIT 1");
            $stmt->execute([$subdomain]);
            if ($row = $stmt->fetch()) {
                return $row['id'];
            }
        }
    }
    
    // 5. Default to property 1
    return 1;
}

/**
 * Get property context for display
 */
function getPropertyContext($pdo, $propertyId) {
    $stmt = $pdo->prepare("
        SELECT p.*, t.name as tenant_name, t.slug as tenant_slug 
        FROM properties p 
        LEFT JOIN tenants t ON p.tenant_id = t.id 
        WHERE p.id = ?
    ");
    $stmt->execute([$propertyId]);
    return $stmt->fetch() ?: ['name' => 'Unknown Property', 'id' => $propertyId];
}

/**
 * Generate property-switching URLs
 */
function generatePropertySwitchUrls($pdo, $currentPropertyId, $accessInfo) {
    $urls = [];
    
    if ($accessInfo['is_platform_admin']) {
        // Platform admin can switch to any property
        $stmt = $pdo->query("SELECT id, name, slug FROM properties ORDER BY name");
        $properties = $stmt->fetchAll();
    } elseif ($accessInfo['is_tenant_admin']) {
        // Tenant admin can switch within their tenant
        $ids = implode(',', array_map('intval', $accessInfo['accessible_properties']));
        $stmt = $pdo->query("SELECT id, name, slug FROM properties WHERE id IN ($ids) ORDER BY name");
        $properties = $stmt->fetchAll();
    } else {
        // Property user has no switching
        return $urls;
    }
    
    foreach ($properties as $property) {
        $urls[] = [
            'id' => $property['id'],
            'name' => $property['name'],
            'url' => "/index.php?property_id={$property['id']}",
            'active' => $property['id'] == $currentPropertyId
        ];
    }
    
    return $urls;
}