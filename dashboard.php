<?php
/**
 * Tenant Dashboard
 * Shows combined analytics for all tenant properties
 * Accessible at: /TENANT_SLUG/dashboard.php
 */

session_start();
require_once __DIR__ . '/php/config/database.php';
header('Content-Type: text/html; charset=UTF-8');
require_once __DIR__ . '/php/config/property_resolver.php';

// Check if tenant is logged in
if (!isset($_SESSION['user_id']) || !isset($_SESSION['tenant_id'])) {
    header('Location: /artists_farm/tenant_login.php');
    exit;
}

$userId = (int)$_SESSION['user_id'];
$sessionTenantId = (int)$_SESSION['tenant_id'];
$isImpersonating = isset($_SESSION['is_platform_admin_impersonating']) && $_SESSION['is_platform_admin_impersonating'];

// If property_slug is in URL (from .htaccess rewrite), verify it matches session
$propertySlug = $_GET['property_slug'] ?? '';
$tenantId = $sessionTenantId;

if ($propertySlug) {
    $stmt = $pdo->prepare("SELECT id FROM tenants WHERE slug = ? AND id = ?");
    $stmt->execute([$propertySlug, $tenantId]);
    if (!$stmt->fetch()) {
        session_destroy();
        header('Location: /artists_farm/tenant_login.php?error=access_denied');
        exit;
    }
}

// Get tenant info
$stmt = $pdo->prepare("SELECT id, name, slug FROM tenants WHERE id = ?");
$stmt->execute([$tenantId]);
$tenant = $stmt->fetch();

if (!$tenant) {
    session_destroy();
    header('Location: /artists_farm/tenant_login.php');
    exit;
}

// Handle password change
$pwChangeMsg = '';
$pwChangeError = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action']) && $_POST['action'] === 'change_password') {
    $currentPwd = trim($_POST['current_password'] ?? '');
    $newPwd = trim($_POST['new_password'] ?? '');
    $confirmPwd = trim($_POST['confirm_password'] ?? '');

    // Verify current password
    $stmt = $pdo->prepare("SELECT password FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!password_verify($currentPwd, $user['password'])) {
        $pwChangeError = 'Current password is incorrect';
    } elseif (strlen($newPwd) < 6) {
        $pwChangeError = 'New password must be at least 6 characters';
    } elseif ($newPwd !== $confirmPwd) {
        $pwChangeError = 'Passwords do not match';
    } else {
        $hashedPwd = password_hash($newPwd, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("UPDATE users SET password = ? WHERE id = ?");
        if ($stmt->execute([$hashedPwd, $userId])) {
            $pwChangeMsg = 'Password changed successfully!';
        }
    }
}

// Get all properties for this tenant
$properties = $pdo->prepare("SELECT id, name, slug, status FROM properties WHERE tenant_id = ? ORDER BY name");
$properties->execute([$tenantId]);
$propertyList = $properties->fetchAll();

// Calculate aggregated stats
$stats = [
    'total_guests' => 0,
    'active_guests' => 0,
    'total_revenue' => 0,
    'occupancy_rate' => 0,
    'avg_daily_revenue' => 0,
];

if (!empty($propertyList)) {
    $propIds = implode(',', array_map(fn($p) => (int)$p['id'], $propertyList));

    $stmt = $pdo->prepare("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active FROM guests WHERE property_id IN ($propIds)");
    $stmt->execute();
    $guestStats = $stmt->fetch();
    $stats['total_guests'] = (int)$guestStats['total'];
    $stats['active_guests'] = (int)$guestStats['active'];

    $stmt = $pdo->prepare("SELECT SUM(amount) FROM financial_ledger WHERE property_id IN ($propIds) AND direction = 'credit' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    $stmt->execute();
    $stats['total_revenue'] = (float)($stmt->fetchColumn() ?? 0);

    $totalCapacity = array_sum(array_map(fn($p) => $pdo->prepare("SELECT max_capacity FROM properties WHERE id = ?")->execute([(int)$p['id']]) || (int)$pdo->query("SELECT max_capacity FROM properties WHERE id = " . (int)$p['id'])->fetchColumn() ?? 0, $propertyList));
    $stats['occupancy_rate'] = $totalCapacity > 0 ? round(($stats['active_guests'] / $totalCapacity) * 100, 1) : 0;

    $stmt = $pdo->prepare("SELECT COUNT(DISTINCT DATE(created_at)) as days FROM financial_ledger WHERE property_id IN ($propIds) AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    $stmt->execute();
    $days = (int)($stmt->fetchColumn() ?? 1);
    $stats['avg_daily_revenue'] = $days > 0 ? $stats['total_revenue'] / $days : 0;
}

// Generate auto-login token for property access
function generatePropertyToken($pdo, $propertyId, $userId) {
    $token = bin2hex(random_bytes(32));
    $stmt = $pdo->prepare("INSERT INTO property_access_tokens (user_id, property_id, token, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))");
    $stmt->execute([$userId, $propertyId, $token]);
    return $token;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($tenant['name']); ?> Dashboard</title>
    <link rel="stylesheet" href="/artists_farm/src/index.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        /* Minimal styles, most will come from index.css */
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 2rem; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { font-size: 1.5rem; }
        .header-nav { display: flex; gap: 1rem; }
        .nav-link { color: white; text-decoration: none; padding: 0.5rem 1rem; background: rgba(255,255,255,0.2); border-radius: 4px; cursor: pointer; }
        .nav-link:hover { background: rgba(255,255,255,0.3); }

        .container { max-width: 1400px; margin: 0 auto; padding: 2rem; }
        .section { margin-bottom: 2rem; }
        .section-title { font-size: 1.25rem; font-weight: 600; margin-bottom: 1rem; }

        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .stat-value { font-size: 2rem; font-weight: 700; color: #667eea; }
        .stat-label { color: #666; font-size: 0.9rem; margin-top: 0.5rem; }

        .properties-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
        .property-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .property-name { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; }
        .property-status { font-size: 0.85rem; padding: 0.2rem 0.6rem; border-radius: 999px; display: inline-block; }
        .status-active { background: #d1fae5; color: #065f46; }
        .status-inactive { background: #fee2e2; color: #991b1b; }
        .property-actions { margin-top: 1rem; display: flex; gap: 0.5rem; }
        .btn { padding: 0.5rem 1rem; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; text-decoration: none; display: inline-block; }
        .btn-primary { background: #667eea; color: white; }
        .btn-primary:hover { background: #5568d3; }
        .btn-secondary { background: #e5e5e5; color: #333; }
        .btn-secondary:hover { background: #d5d5d5; }
        .btn-danger { background: #ef4444; color: white; }
        .btn-danger:hover { background: #dc2626; }

        .modal { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; }
        .modal.active { display: flex; }
        .modal-content { background: white; border-radius: 8px; width: 400px; max-width: 90%; padding: 2rem; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
        .modal-close { background: none; border: none; font-size: 1.5rem; cursor: pointer; }
        .form-group { margin-bottom: 1rem; }
        .form-label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
        .form-input { width: 100%; padding: 0.65rem; border: 1px solid #ddd; border-radius: 4px; }
        .message { padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
        .message.success { background: #d1fae5; color: #065f46; }
        .message.error { background: #fee2e2; color: #991b1b; }
    </style>
</head>
<body>
    <?php if ($isImpersonating): ?>
    <div style="background: #fef3c7; border-bottom: 2px solid #f59e0b; padding: 1rem; display: flex; justify-content: space-between; align-items: center;">
        <div style="color: #92400e; font-weight: 500;">
            🔐 <strong>Platform Admin Mode:</strong> You are logged in as <strong><?php echo htmlspecialchars($tenant['name']); ?></strong> tenant admin
        </div>
        <button onclick="exitImpersonation()" style="background: #f59e0b; color: white; padding: 0.5rem 1rem; border-radius: 4px; border: none; cursor: pointer; font-weight: 500;">← Return to Platform Admin</button>
    </div>
    <?php endif; ?>

    <div class="header">
        <h1>📊 <?php echo htmlspecialchars($tenant['name']); ?></h1>
        <div class="header-nav">
            <button class="nav-link" onclick="openPasswordModal()">🔐 Change Password</button>
            <a href="logout.php" class="nav-link">Logout</a>
        </div>
    </div>

    <div class="container">
        <div class="section">
            <div class="section-title">📈 Analytics (Last 30 Days)</div>
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">₹<?php echo number_format($stats['total_revenue'], 0); ?></div>
                    <div class="stat-label">Total Revenue</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">₹<?php echo number_format($stats['avg_daily_revenue'], 0); ?></div>
                    <div class="stat-label">Daily Avg</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value"><?php echo $stats['total_guests']; ?></div>
                    <div class="stat-label">Total Guests</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value"><?php echo $stats['occupancy_rate']; ?>%</div>
                    <div class="stat-label">Occupancy</div>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-title">🏠 Your Properties</div>
            <?php if (empty($propertyList)): ?>
                <p style="color: #666;">No properties found.</p>
            <?php else: ?>
                <div class="properties-grid">
                    <?php foreach ($propertyList as $prop): ?>
                    <div class="property-card">
                        <div class="property-name"><?php echo htmlspecialchars($prop['name']); ?></div>
                        <span class="property-status <?php echo $prop['status'] === 'active' ? 'status-active' : 'status-inactive'; ?>">
                            <?php echo ucfirst($prop['status']); ?>
                        </span>
                        <div class="property-actions">
                            <a href="http://localhost/artists_farm/<?php echo htmlspecialchars($tenant['slug']); ?>/<?php echo htmlspecialchars($prop['slug']); ?>/" class="btn btn-primary" target="_blank">
                                Open Property →
                            </a>
                            <button class="btn btn-danger" onclick="openDeletePropertyModal(<?php echo (int)$prop['id']; ?>, '<?php echo htmlspecialchars($prop['name']); ?>')">
                                Delete
                            </button>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>
    </div>

    <!-- Delete Property Modal -->
    <div class="modal" id="deletePropertyModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Delete Property</h3>
                <button class="modal-close" onclick="closeDeletePropertyModal()">&times;</button>
            </div>
            <div style="padding: 1rem 0; background: #fee2e2; border-left: 4px solid #ef4444; padding: 1rem; border-radius: 4px; margin-bottom: 1rem;">
                <strong style="color: #991b1b;">⚠️ Warning:</strong> This action cannot be undone. All data associated with this property will be permanently deleted.
            </div>
            <p style="margin-bottom: 1rem; color: #666;">Property: <strong id="deletePropertyName"></strong></p>
            <form onsubmit="confirmDeleteProperty(event)">
                <div class="form-group">
                    <label class="form-label">Type "DELETE" to confirm:</label>
                    <input type="text" id="deleteConfirmInput" class="form-input" placeholder="Type DELETE here" required>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button type="submit" class="btn btn-danger" style="flex: 1;">Delete Property</button>
                    <button type="button" class="btn btn-secondary" style="flex: 1;" onclick="closeDeletePropertyModal()">Cancel</button>
                </div>
            </form>
        </div>
    </div>

    <!-- Password Change Modal -->
    <div class="modal" id="passwordModal">
        <div class="modal-content">
            <div class="modal-header">
                <h3>Change Password</h3>
                <button class="modal-close" onclick="closePasswordModal()">&times;</button>
            </div>
            <?php if ($pwChangeMsg): ?>
                <div class="message success"><?php echo htmlspecialchars($pwChangeMsg); ?></div>
            <?php elseif ($pwChangeError): ?>
                <div class="message error"><?php echo htmlspecialchars($pwChangeError); ?></div>
            <?php endif; ?>
            <form method="POST">
                <input type="hidden" name="action" value="change_password">
                <div class="form-group">
                    <label class="form-label">Current Password</label>
                    <input type="password" name="current_password" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">New Password</label>
                    <input type="password" name="new_password" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Confirm Password</label>
                    <input type="password" name="confirm_password" class="form-input" required>
                </div>
                <button type="submit" class="btn btn-primary" style="width: 100%;">Update Password</button>
            </form>
        </div>
    </div>

    <script>
        let deletePropertyId = null;

        function exitImpersonation() {
            fetch('/artists_farm/api/exit_impersonation.php', {
                method: 'POST'
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    window.location.href = '/artists_farm/platform_property_management.php#tenants';
                } else {
                    alert('Error: ' + data.message);
                }
            })
            .catch(err => alert('Error: ' + err));
        }

        function openPasswordModal() {
            document.getElementById('passwordModal').classList.add('active');
        }
        function closePasswordModal() {
            document.getElementById('passwordModal').classList.remove('active');
        }
        document.getElementById('passwordModal').addEventListener('click', function(e) {
            if (e.target === this) closePasswordModal();
        });

        function openDeletePropertyModal(propertyId, propertyName) {
            deletePropertyId = propertyId;
            document.getElementById('deletePropertyName').textContent = propertyName;
            document.getElementById('deleteConfirmInput').value = '';
            document.getElementById('deletePropertyModal').classList.add('active');
        }

        function closeDeletePropertyModal() {
            document.getElementById('deletePropertyModal').classList.remove('active');
            deletePropertyId = null;
        }

        function confirmDeleteProperty(event) {
            event.preventDefault();
            const confirmText = document.getElementById('deleteConfirmInput').value.trim();
            if (confirmText !== 'DELETE') {
                alert('Please type "DELETE" exactly to confirm');
                return;
            }
            if (!deletePropertyId) {
                alert('No property selected');
                return;
            }
            if (confirm('Are you absolutely sure? This cannot be undone.')) {
                fetch('/artists_farm/api/delete_property.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ property_id: deletePropertyId })
                })
                .then(r => r.json())
                .then(data => {
                    alert(data.message);
                    if (data.success) location.reload();
                })
                .catch(err => alert('Error: ' + err));
            }
        }

        document.getElementById('deletePropertyModal').addEventListener('click', function(e) {
            if (e.target === this) closeDeletePropertyModal();
        });
    </script>
</body>
</html>
