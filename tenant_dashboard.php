<?php
/**
 * Tenant Dashboard - Aggregated Analytics Across Properties
 * For restaurant chain owners to see all their properties' data
 */

require_once __DIR__ . '/php/config/database.php';
header('Content-Type: text/html; charset=UTF-8'); // database.php defaults to application/json for the API router
require_once __DIR__ . '/php/auth/saas_auth.php';

session_start();

// Allow access if: (1) tenant admin, OR (2) platform admin impersonating tenant
$isImpersonating = false;
$tenantId = null;

// Check if platform admin is impersonating
if (!empty($_SESSION['is_platform_admin']) && !empty($_SESSION['impersonating_tenant_id'])) {
    $isImpersonating = true;
    $tenantId = (int)$_SESSION['impersonating_tenant_id'];
} else {
    // Otherwise require tenant admin auth
    $accessInfo = requireAuth($pdo, 'tenant_admin');
    if (!$accessInfo['is_tenant_admin']) {
        header('Location: index.php');
        exit;
    }
    $tenantId = $accessInfo['tenant_id'];
}

// Verify tenant exists
if (!$tenantId) {
    header('Location: index.php');
    exit;
}
$stmt = $pdo->prepare("SELECT name, slug FROM tenants WHERE id = ?");
$stmt->execute([$tenantId]);
$tenant = $stmt->fetch();

// Get aggregated stats
$stats = getTenantDashboardStats($pdo, $tenantId);

// Get property switching menu
$properties = getPropertySwitchMenu($pdo, $accessInfo);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($tenant['name']); ?> - Tenant Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
        
        .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; padding: 1.5rem 2rem; }
        .header h1 { font-size: 1.5rem; font-weight: 600; margin-bottom: 0.5rem; }
        .header-subtitle { opacity: 0.9; font-size: 0.9rem; }
        
        .tenant-nav { background: white; border-bottom: 1px solid #e5e5e5; padding: 0 2rem; display: flex; gap: 2rem; }
        .nav-link { padding: 1rem 0; color: #666; text-decoration: none; border-bottom: 3px solid transparent; }
        .nav-link.active { color: #4f46e5; border-color: #4f46e5; font-weight: 500; }
        
        .dashboard-container { padding: 2rem; max-width: 1400px; margin: 0 auto; }
        
        .property-switcher { background: white; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; display: flex; gap: 1rem; align-items: center; }
        .property-switcher-label { font-weight: 500; }
        .property-pill { background: #e0e7ff; color: #4f46e5; padding: 0.5rem 1rem; border-radius: 999px; text-decoration: none; font-size: 0.875rem; }
        .property-pill:hover { background: #c7d2fe; }
        .property-pill.active { background: #4f46e5; color: white; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
        .stat-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-value { font-size: 2rem; font-weight: 700; color: #4f46e5; margin-bottom: 0.5rem; }
        .stat-label { color: #666; font-size: 0.9rem; }
        
        .section { background: white; padding: 1.5rem; border-radius: 8px; margin-bottom: 2rem; }
        .section-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 1.5rem; }
        
        .property-list { display: grid; gap: 1rem; }
        .property-item { border: 1px solid #e5e5e5; border-radius: 8px; padding: 1.5rem; }
        .property-name { font-weight: 600; font-size: 1.125rem; margin-bottom: 0.5rem; }
        .property-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-top: 1rem; }
        .metric { text-align: center; }
        .metric-value { font-weight: 600; color: #4f46e5; }
        .metric-label { font-size: 0.75rem; color: #666; }
        
        .btn-primary { background: #4f46e5; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 6px; font-weight: 500; cursor: pointer; text-decoration: none; display: inline-block; }
        .btn-primary:hover { background: #4338ca; }
        
        .quick-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
        .action-card { border: 1px solid #e5e5e5; border-radius: 8px; padding: 1.5rem; text-align: center; cursor: pointer; text-decoration: none; color: inherit; }
        .action-card:hover { border-color: #4f46e5; }
        .action-icon { font-size: 2rem; margin-bottom: 1rem; }
        
        .chart-container { height: 300px; margin-top: 1rem; }
    </style>
</head>
<body>
    <div class="header">
        <h1><?php echo htmlspecialchars($tenant['name']); ?> - Tenant Dashboard</h1>
        <div class="header-subtitle">Aggregated analytics across all your properties</div>
    </div>

    <?php if ($isImpersonating): ?>
    <div style="background: #fef3c7; border-bottom: 2px solid #fbbf24; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center;">
        <div style="color: #92400e; font-weight: 500;">
            ⚠️ You are viewing this tenant as a platform admin.
        </div>
        <button onclick="exitImpersonation()" style="background: #d97706; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; font-weight: 500;">Return to Platform Admin</button>
    </div>
    <script>
        function exitImpersonation() {
            fetch('/artists_farm/api/exit_impersonation.php', { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    if (data.redirect) {
                        window.location.href = data.redirect;
                    }
                })
                .catch(() => window.location.href = '/artists_farm/platform_property_management.php');
        }
    </script>
    <?php endif; ?>
    
    <div class="tenant-nav">
        <a href="#overview" class="nav-link active">Overview</a>
        <a href="#properties" class="nav-link">Properties</a>
        <a href="#financials" class="nav-link">Financials</a>
        <a href="#staff" class="nav-link">Staff</a>
        <a href="#settings" class="nav-link">Settings</a>
    </div>
    
    <div class="dashboard-container">
        <!-- Property Switcher -->
        <div class="property-switcher">
            <div class="property-switcher-label">View Property:</div>
            <a href="?view=all" class="property-pill <?php echo (!isset($_GET['view']) || $_GET['view'] === 'all') ? 'active' : ''; ?>">
                All Properties
            </a>
            <?php foreach ($properties as $prop): ?>
            <a href="?view=property&property_id=<?php echo $prop['id']; ?>" class="property-pill <?php echo (isset($_GET['property_id']) && $_GET['property_id'] == $prop['id']) ? 'active' : ''; ?>">
                <?php echo htmlspecialchars($prop['name']); ?>
            </a>
            <?php endforeach; ?>
        </div>
        
        <!-- Overview Tab -->
        <div id="overview" class="tab-content active">
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value"><?php echo $stats['total_properties']; ?></div>
                    <div class="stat-label">Properties</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">₹<?php echo number_format($stats['total_revenue'], 2); ?></div>
                    <div class="stat-label">Total Revenue</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value"><?php echo $stats['total_guests']; ?></div>
                    <div class="stat-label">Guests Served</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value"><?php echo $stats['total_staff']; ?></div>
                    <div class="stat-label">Active Staff</div>
                </div>
            </div>
            
            <div class="section">
                <h3 class="section-title">Recent Activity by Property</h3>
                <div class="property-list">
                    <?php foreach ($stats['recent_activity'] as $activity): ?>
                    <div class="property-item">
                        <div class="property-name"><?php echo htmlspecialchars($activity['property_name']); ?></div>
                        <div class="property-metrics">
                            <div class="metric">
                                <div class="metric-value"><?php echo $activity['recent_checkins']; ?></div>
                                <div class="metric-label">Check-ins (7 days)</div>
                            </div>
                            <div class="metric">
                                <div class="metric-value">₹0</div>
                                <div class="metric-label">Today's Revenue</div>
                            </div>
                            <div class="metric">
                                <div class="metric-value">0</div>
                                <div class="metric-label">Active Orders</div>
                            </div>
                        </div>
                        <a href="index.php?property_id=<?php echo $activity['property_id'] ?? ''; ?>" class="btn-primary" style="margin-top: 1rem; display: inline-block;">
                            View Property Dashboard
                        </a>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            
            <div class="section">
                <h3 class="section-title">Quick Actions</h3>
                <div class="quick-actions">
                    <a href="tenant_property_requests.php" class="action-card">
                        <div class="action-icon">🏢</div>
                        <div class="action-title">Add New Property</div>
                        <div class="action-desc">Register a new location</div>
                    </a>
                    <a href="manage_users.php" class="action-card">
                        <div class="action-icon">👥</div>
                        <div class="action-title">Manage Users</div>
                        <div class="action-desc">Add/remove staff access</div>
                    </a>
                    <a href="financial_reports.php" class="action-card">
                        <div class="action-icon">📊</div>
                        <div class="action-title">Financial Reports</div>
                        <div class="action-desc">Detailed revenue analytics</div>
                    </a>
                    <a href="settings.php" class="action-card">
                        <div class="action-icon">⚙️</div>
                        <div class="action-title">Tenant Settings</div>
                        <div class="action-desc">Billing & configuration</div>
                    </a>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Simple tab switching
        document.querySelectorAll('.nav-link').forEach(tab => {
            tab.addEventListener('click', function(e) {
                e.preventDefault();
                const targetId = this.getAttribute('href').substring(1);
                
                // Update active tab
                document.querySelectorAll('.nav-link').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
                
                // Show target content
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(targetId).classList.add('active');
            });
        });
    </script>
</body>
</html>