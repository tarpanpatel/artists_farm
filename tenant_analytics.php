<?php
/**
 * Tenant Dashboard - Combined Analytics Across All Properties
 * For tenant admins to see aggregated data from all their properties
 */

session_start();
require_once __DIR__ . '/php/config/database.php';
require_once __DIR__ . '/php/config/property_resolver.php';
header('Content-Type: text/html; charset=UTF-8');
require_once __DIR__ . '/php/auth/saas_auth.php';

$accessInfo = requireAuth($pdo, 'tenant_admin');

if (!$accessInfo['is_tenant_admin']) {
    header('Location: index.php');
    exit;
}

$tenantId = $accessInfo['tenant_id'];
$propertyIds = $accessInfo['accessible_properties'];

// Get tenant info
$stmt = $pdo->prepare("SELECT name, slug FROM tenants WHERE id = ?");
$stmt->execute([$tenantId]);
$tenant = $stmt->fetch();

// Get all properties for this tenant
$propertyPlaceholders = implode(',', array_map('intval', $propertyIds));
$properties = $pdo->query("SELECT * FROM properties WHERE id IN ($propertyPlaceholders) ORDER BY name")->fetchAll();

// Calculate aggregated stats
$stats = [
    'total_guests' => 0,
    'checked_in_guests' => 0,
    'total_revenue' => 0,
    'total_transactions' => 0,
    'checked_out_revenue' => 0,
    'total_staff' => 0,
    'occupancy_rate' => 0,
    'avg_daily_revenue' => 0,
];

// Guests stats
$stmt = $pdo->prepare("SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status = 'Checked In' THEN 1 ELSE 0 END) as Checked In,
    SUM(CASE WHEN status = 'CheckedOut' THEN total_charge ELSE 0 END) as revenue
    FROM guests WHERE property_id IN ($propertyPlaceholders)");
$stmt->execute();
$guestStats = $stmt->fetch();
$stats['total_guests'] = (int)$guestStats['total'];
$stats['checked_in_guests'] = (int)$guestStats['Checked In'];
$stats['checked_out_revenue'] = (float)($guestStats['revenue'] ?? 0);

// Financial stats
$stmt = $pdo->prepare("SELECT
    SUM(amount) as total,
    COUNT(*) as count
    FROM financial_ledger WHERE property_id IN ($propertyPlaceholders) AND direction = 'credit'");
$stmt->execute();
$finStats = $stmt->fetch();
$stats['total_revenue'] = max($stats['checked_out_revenue'], (float)($finStats['total'] ?? 0));
$stats['total_transactions'] = (int)$finStats['count'];

// Staff stats
$stmt = $pdo->prepare("SELECT COUNT(*) FROM staff_users WHERE property_id IN ($propertyPlaceholders) AND status = 'Checked In'");
$stmt->execute();
$stats['total_staff'] = (int)$stmt->fetchColumn();

// Occupancy (simplified: Checked In guests / total capacity)
$totalCapacity = array_sum(array_map(function($p) { return (int)$p['max_capacity']; }, $properties));
$stats['occupancy_rate'] = $totalCapacity > 0 ? round(($stats['checked_in_guests'] / $totalCapacity) * 100, 1) : 0;

// Average daily revenue (last 30 days)
$stmt = $pdo->prepare("SELECT
    SUM(amount) as total,
    COUNT(DISTINCT DATE(created_at)) as days
    FROM financial_ledger
    WHERE property_id IN ($propertyPlaceholders)
    AND direction = 'credit'
    AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
$stmt->execute();
$dailyStats = $stmt->fetch();
$totalDays = (int)($dailyStats['days'] ?? 1);
$stats['avg_daily_revenue'] = $totalDays > 0 ? (float)($dailyStats['total'] ?? 0) / $totalDays : 0;

// Per-property stats
$propertyStats = [];
foreach ($properties as $p) {
    $pid = (int)$p['id'];
    $propertyStats[$pid] = [
        'name' => $p['name'],
        'guests' => 0,
        'checked_in_guests' => 0,
        'revenue' => 0,
        'occupancy' => 0,
    ];

    $stmt = $pdo->prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'Checked In' THEN 1 ELSE 0 END) as Checked In FROM guests WHERE property_id = ?");
    $stmt->execute([$pid]);
    $pg = $stmt->fetch();
    $propertyStats[$pid]['guests'] = (int)$pg['total'];
    $propertyStats[$pid]['checked_in_guests'] = (int)$pg['Checked In'];
    $propertyStats[$pid]['occupancy'] = $p['max_capacity'] > 0 ? round(($propertyStats[$pid]['checked_in_guests'] / $p['max_capacity']) * 100, 1) : 0;

    $stmt = $pdo->prepare("SELECT SUM(amount) FROM financial_ledger WHERE property_id = ? AND direction = 'credit' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    $stmt->execute([$pid]);
    $propertyStats[$pid]['revenue'] = (float)($stmt->fetchColumn() ?? 0);
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tenant Dashboard - <?php echo htmlspecialchars($tenant['name']); ?></title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }

        .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 1.5rem 2rem; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 1.5rem; font-weight: 600; }
        .header-nav { display: flex; gap: 1rem; }
        .nav-link { color: white; text-decoration: none; padding: 0.5rem 1rem; background: rgba(255,255,255,0.2); border-radius: 4px; font-size: 0.9rem; }

        .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }

        .section-header { font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; margin-top: 2rem; }
        .section-header:first-child { margin-top: 0; }

        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-value { font-size: 2rem; font-weight: 700; color: #4f46e5; }
        .stat-label { color: #666; font-size: 0.9rem; margin-top: 0.5rem; }
        .stat-unit { font-size: 0.9rem; color: #999; }

        .properties-table { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 2rem; }
        .table-header { background: #f8f9fa; padding: 1rem; border-bottom: 1px solid #e5e5e5; font-weight: 600; display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 1rem; font-size: 0.9rem; }
        .table-row { padding: 1rem; border-bottom: 1px solid #e5e5e5; display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 1rem; align-items: center; }
        .table-row:last-child { border-bottom: none; }
        .table-row:hover { background: #f8f9fa; }

        .property-name { font-weight: 600; color: #333; }
        .property-link { color: #4f46e5; text-decoration: none; }
        .property-link:hover { text-decoration: underline; }

        .progress-bar { background: #e5e5e5; height: 6px; border-radius: 3px; overflow: hidden; }
        .progress-fill { background: #10b981; height: 100%; border-radius: 3px; }

        .empty-state { text-align: center; padding: 3rem; color: #666; }

        .btn-primary { background: #4f46e5; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; cursor: pointer; text-decoration: none; display: inline-block; }
        .btn-primary:hover { background: #3f3aa7; }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 <?php echo htmlspecialchars($tenant['name']); ?> - Tenant Dashboard</h1>
        <div class="header-nav">
            <a href="index.php" class="nav-link">Back to App</a>
            <a href="logout.php" class="nav-link">Logout</a>
        </div>
    </div>

    <div class="container">
        <div class="section-header">📈 Overall Analytics (Last 30 Days)</div>
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value"><?php echo (int)$stats['total_revenue']; ?></div>
                <div class="stat-label">Total Revenue</div>
                <div class="stat-unit">₹ INR</div>
            </div>
            <div class="stat-card">
                <div class="stat-value"><?php echo (int)$stats['avg_daily_revenue']; ?></div>
                <div class="stat-label">Avg Daily Revenue</div>
                <div class="stat-unit">₹ INR/day</div>
            </div>
            <div class="stat-card">
                <div class="stat-value"><?php echo $stats['total_guests']; ?></div>
                <div class="stat-label">Total Guests</div>
                <div class="stat-unit"><?php echo $stats['checked_in_guests']; ?> Checked In</div>
            </div>
            <div class="stat-card">
                <div class="stat-value"><?php echo $stats['occupancy_rate']; ?>%</div>
                <div class="stat-label">Occupancy Rate</div>
                <div class="stat-unit"><?php echo $stats['checked_in_guests']; ?>/<?php echo $totalCapacity; ?> rooms</div>
            </div>
            <div class="stat-card">
                <div class="stat-value"><?php echo $stats['total_staff']; ?></div>
                <div class="stat-label">Checked In Staff</div>
                <div class="stat-unit">Across all properties</div>
            </div>
            <div class="stat-card">
                <div class="stat-value"><?php echo count($properties); ?></div>
                <div class="stat-label">Total Properties</div>
                <div class="stat-unit">Managed by you</div>
            </div>
        </div>

        <div class="section-header">🏠 Performance by Property</div>
        <?php if (empty($properties)): ?>
            <div class="empty-state">
                <p>No properties found for your tenant account.</p>
                <a href="tenant_property_requests.php" class="btn-primary" style="margin-top: 1rem;">Request a Property</a>
            </div>
        <?php else: ?>
            <div class="properties-table">
                <div class="table-header">
                    <div>Property</div>
                    <div>Total Guests</div>
                    <div>Revenue (30d)</div>
                    <div>Occupancy</div>
                    <div>Action</div>
                </div>
                <?php foreach ($properties as $p):
                    $pid = (int)$p['id'];
                    $ps = $propertyStats[$pid];
                ?>
                <div class="table-row">
                    <div class="property-name"><?php echo htmlspecialchars($ps['name']); ?></div>
                    <div><?php echo $ps['guests']; ?> (<?php echo $ps['checked_in_guests']; ?> Checked In)</div>
                    <div>₹ <?php echo number_format($ps['revenue'], 0); ?></div>
                    <div>
                        <div style="margin-bottom: 0.25rem; font-weight: 600;"><?php echo $ps['occupancy']; ?>%</div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: <?php echo min(100, $ps['occupancy']); ?>%"></div>
                        </div>
                    </div>
                    <div>
                        <a href="http://localhost/artists_farm/<?php echo htmlspecialchars($tenant['slug']); ?>/<?php echo htmlspecialchars($p['slug']); ?>/" class="property-link" target="_blank">Visit →</a>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>
</body>
</html>

