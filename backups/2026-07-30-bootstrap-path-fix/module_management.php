<?php
/**
 * Platform Admin - Module Management
 * Control features for all tenants
 */

require_once '../config/database.php';
require_once '../php/auth/saas_auth.php'; // Corrected path

$accessInfo = requireAuth($pdo, 'platform_admin');

// Include module manager
require_once '../modules/module_manager.php';

$action = $_GET['action'] ?? 'list';
$moduleKey = $_GET['module'] ?? '';
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Module Management - Artists Farm SaaS</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
        
        .header { background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%); color: white; padding: 1.5rem 2rem; }
        .header h1 { font-size: 1.5rem; font-weight: 600; }
        
        .container { padding: 2rem; max-width: 1200px; margin: 0 auto; }
        
        .tabs { display: flex; gap: 1rem; margin-bottom: 2rem; }
        .tab { padding: 0.75rem 1.5rem; background: white; border-radius: 6px; border: 1px solid #ddd; cursor: pointer; }
        .tab.active { background: #3b82f6; color: white; border-color: #3b82f6; }
        
        .module-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; }
        .module-card { background: white; border-radius: 8px; padding: 1.5rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .module-card.enabled { border-left: 4px solid #10b981; }
        .module-card.disabled { border-left: 4px solid #ef4444; }
        .module-card.core { border-left: 4px solid #f59e0b; }
        
        .module-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .module-title { font-weight: 600; font-size: 1.125rem; }
        .module-status { font-size: 0.875rem; padding: 0.25rem 0.75rem; border-radius: 999px; }
        .status-enabled { background: #d1fae5; color: #065f46; }
        .status-disabled { background: #fee2e2; color: #991b1b; }
        .status-core { background: #fef3c7; color: #92400e; }
        
        .module-description { color: #666; margin-bottom: 1rem; font-size: 0.95rem; }
        .module-meta { display: flex; gap: 1rem; font-size: 0.85rem; color: #888; }
        
        .badge { padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 500; }
        .badge-core { background: #fef3c7; color: #92400e; }
        .badge-premium { background: #e0e7ff; color: #3730a3; }
        .badge-beta { background: #f3e8ff; color: #7c3aed; }
        
        .actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
        .btn { padding: 0.5rem 1rem; border-radius: 4px; border: none; cursor: pointer; font-size: 0.875rem; }
        .btn-primary { background: #3b82f6; color: white; }
        .btn-danger { background: #ef4444; color: white; }
        .btn-warning { background: #f59e0b; color: white; }
        .btn-success { background: #10b981; color: white; }
        
        .form-group { margin-bottom: 1.5rem; }
        .form-label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
        .form-input, .form-textarea, .form-select { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; }
        .form-textarea { min-height: 120px; resize: vertical; }
        
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: white; padding: 1.5rem; border-radius: 8px; text-align: center; }
        .stat-value { font-size: 2rem; font-weight: 700; color: #3b82f6; }
        .stat-label { color: #666; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Module Management - Platform Admin</h1>
    </div>
    
    <div class="container">
        <div class="tabs">
            <div class="tab active" onclick="showTab('overview')">Overview</div>
            <div class="tab" onclick="showTab('modules')">All Modules</div>
            <div class="tab" onclick="showTab('deploy')">Deploy Update</div>
            <div class="tab" onclick="showTab('tenants')">Tenant Assignments</div>
        </div>
        
        <!-- Overview Tab -->
        <div id="overview" class="tab-content active">
            <div class="stats-grid">
                <?php
                $totalModules = $pdo->query("SELECT COUNT(*) FROM system_modules")->fetchColumn();
                $activeModules = $pdo->query("SELECT COUNT(*) FROM system_modules WHERE is_active = 1")->fetchColumn();
                $totalTenants = $pdo->query("SELECT COUNT(*) FROM tenants")->fetchColumn();
                $activeTenants = $pdo->query("SELECT COUNT(*) FROM tenants WHERE is_active = 1")->fetchColumn();
                ?>
                <div class="stat-card">
                    <div class="stat-value"><?php echo $totalModules; ?></div>
                    <div class="stat-label">Total Modules</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value"><?php echo $activeModules; ?></div>
                    <div class="stat-label">Active Modules</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value"><?php echo $totalTenants; ?></div>
                    <div class="stat-label">Tenants</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value"><?php echo $activeTenants; ?></div>
                    <div class="stat-label">Active Tenants</div>
                </div>
            </div>
            
            <div style="background: white; padding: 1.5rem; border-radius: 8px; margin-top: 2rem;">
                <h3 style="margin-bottom: 1rem;">Recent Module Updates</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 1px solid #e5e5e5;">
                            <th style="padding: 0.75rem; text-align: left;">Module</th>
                            <th style="padding: 0.75rem; text-align: left;">Version</th>
                            <th style="padding: 0.75rem; text-align: left;">Date</th>
                            <th style="padding: 0.75rem; text-align: left;">Tenants Affected</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $updates = $pdo->query("
                            SELECT m.module_key, m.name, m.version, m.updated_at,
                                   (SELECT COUNT(*) FROM tenant_modules tm WHERE tm.module_key = m.module_key AND tm.is_enabled = 1) as tenant_count
                            FROM system_modules m
                            ORDER BY m.updated_at DESC
                            LIMIT 10
                        ")->fetchAll();
                        
                        foreach ($updates as $update):
                        ?>
                        <tr style="border-bottom: 1px solid #f5f5f5;">
                            <td style="padding: 0.75rem;"><?php echo htmlspecialchars($update['name']); ?></td>
                            <td style="padding: 0.75rem;">v<?php echo htmlspecialchars($update['version']); ?></td>
                            <td style="padding: 0.75rem;"><?php echo date('M d, Y', strtotime($update['updated_at'])); ?></td>
                            <td style="padding: 0.75rem;"><?php echo $update['tenant_count']; ?></td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- All Modules Tab -->
        <div id="modules" class="tab-content" style="display: none;">
            <div class="module-grid">
                <?php
                $modules = getAllModules();
                foreach ($modules as $module):
                    $statusClass = $module['is_active'] ? 'enabled' : 'disabled';
                    $statusText = $module['is_active'] ? 'Active' : 'Inactive';
                    $statusBadge = $module['is_active'] ? 'status-enabled' : 'status-disabled';
                    $coreBadge = $module['is_core_required'] ? 'status-core' : '';
                ?>
                <div class="module-card <?php echo $statusClass; if($module['is_core_required']) echo ' core'; ?>">
                    <div class="module-header">
                        <div class="module-title">
                            <?php echo htmlspecialchars($module['name']); ?>
                            <?php if($module['is_core_required']): ?>
                            <span class="badge badge-core">Core</span>
                            <?php endif; ?>
                        </div>
                        <span class="module-status <?php echo $statusBadge . ' ' . $coreBadge; ?>">
                            <?php echo $statusText; ?>
                            <?php if($module['is_core_required']) echo ' (Core)'; ?>
                        </span>
                    </div>
                    <div class="module-description"><?php echo htmlspecialchars($module['description']); ?></div>
                    <div class="module-meta">
                        <span><?php echo htmlspecialchars($module['category']); ?></span>
                        <span>v<?php echo htmlspecialchars($module['version']); ?></span>
                        <span><?php echo date('M Y', strtotime($module['release_date'])); ?></span>
                    </div>
                    <div class="actions">
                        <button class="btn btn-primary" onclick="editModule('<?php echo $module['module_key']; ?>')">Edit</button>
                        <button class="btn btn-warning" onclick="viewTenants('<?php echo $module['module_key']; ?>')">Tenants</button>
                        <button class="btn btn-success" onclick="deployUpdate('<?php echo $module['module_key']; ?>')">Update</button>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
        
        <!-- Deploy Update Tab -->
        <div id="deploy" class="tab-content" style="display: none;">
            <div style="background: white; padding: 2rem; border-radius: 8px; max-width: 600px; margin: 0 auto;">
                <h3 style="margin-bottom: 1.5rem;">Deploy Module Update</h3>
                <form id="deployForm" method="POST" action="api/module_api.php">
                    <input type="hidden" name="action" value="deploy_update">
                    
                    <div class="form-group">
                        <label class="form-label">Module</label>
                        <select name="module_key" class="form-select" required>
                            <option value="">Select Module</option>
                            <?php foreach ($modules as $module): ?>
                            <option value="<?php echo $module['module_key']; ?>"><?php echo htmlspecialchars($module['name']); ?> (v<?php echo $module['version']; ?>)</option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">New Version</label>
                        <input type="text" name="version" class="form-input" placeholder="e.g., 1.2.0" required pattern="\d+\.\d+\.\d+">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Changelog</label>
                        <textarea name="changelog" class="form-textarea" placeholder="What's new in this update..." required></textarea>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="is_breaking">
                            <span>Breaking Change</span>
                        </label>
                        <small style="color: #666; display: block; margin-top: 0.25rem;">
                            Check if this update contains breaking changes that require tenant attention
                        </small>
                    </div>
                    
                    <div style="display: flex; gap: 1rem; margin-top: 2rem;">
                        <button type="button" class="btn" onclick="showTab('modules')">Cancel</button>
                        <button type="submit" class="btn btn-primary">Deploy Update</button>
                    </div>
                </form>
            </div>
        </div>
        
        <!-- Tenants Tab -->
        <div id="tenants" class="tab-content" style="display: none;">
            <div style="background: white; padding: 1.5rem; border-radius: 8px;">
                <h3 style="margin-bottom: 1rem;">Tenant Module Assignments</h3>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #e5e5e5;">
                            <th style="padding: 0.75rem; text-align: left;">Tenant</th>
                            <th style="padding: 0.75rem; text-align: left;">Plan</th>
                            <th style="padding: 0.75rem; text-align: left;">Core Modules</th>
                            <th style="padding: 0.75rem; text-align: left;">Premium Modules</th>
                            <th style="padding: 0.75rem; text-align: left;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php
                        $tenants = $pdo->query("
                            SELECT t.id, t.name, t.slug, t.subscription_plan,
                                   COUNT(tm.module_key) as total_modules,
                                   SUM(CASE WHEN sm.is_core_required = 1 THEN 1 ELSE 0 END) as core_modules
                            FROM tenants t
                            LEFT JOIN tenant_modules tm ON t.id = tm.tenant_id AND tm.is_enabled = 1
                            LEFT JOIN system_modules sm ON tm.module_key = sm.module_key
                            GROUP BY t.id, t.name, t.slug, t.subscription_plan
                            ORDER BY t.name
                        ")->fetchAll();
                        
                        foreach ($tenants as $tenant):
                        ?>
                        <tr style="border-bottom: 1px solid #f5f5f5;">
                            <td style="padding: 0.75rem;">
                                <strong><?php echo htmlspecialchars($tenant['name']); ?></strong><br>
                                <small style="color: #666;"><?php echo htmlspecialchars($tenant['slug']); ?></small>
                            </td>
                            <td style="padding: 0.75rem;">
                                <span style="padding: 0.25rem 0.75rem; border-radius: 999px; background: #e0e7ff; color: #3730a3; font-size: 0.875rem;">
                                    <?php echo ucfirst($tenant['subscription_plan']); ?>
                                </span>
                            </td>
                            <td style="padding: 0.75rem;"><?php echo $tenant['core_modules']; ?></td>
                            <td style="padding: 0.75rem;"><?php echo $tenant['total_modules'] - $tenant['core_modules']; ?></td>
                            <td style="padding: 0.75rem;">
                                <button class="btn btn-primary" onclick="manageTenantModules(<?php echo $tenant['id']; ?>)">Manage</button>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
    
    <script>
        function showTab(tabId) {
            // Hide all tabs
            document.querySelectorAll('.tab-content').forEach(tab => {
                tab.style.display = 'none';
            });
            
            // Show selected tab
            document.getElementById(tabId).style.display = 'block';
            
            // Update active tab button
            document.querySelectorAll('.tab').forEach(tabBtn => {
                tabBtn.classList.remove('active');
            });
            event.target.classList.add('active');
        }
        
        function editModule(moduleKey) {
            window.location.href = `module_edit.php?module=${moduleKey}`;
        }
        
        function viewTenants(moduleKey) {
            alert(`View tenants using module: ${moduleKey}`);
            // In production: load tenant list for this module
        }
        
        function deployUpdate(moduleKey) {
            showTab('deploy');
            document.querySelector('select[name="module_key"]').value = moduleKey;
        }
        
        function manageTenantModules(tenantId) {
            window.location.href = `tenant_modules.php?tenant_id=${tenantId}`;
        }
        
        // Form submission
        document.getElementById('deployForm')?.addEventListener('submit', function(e) {
            if (!confirm('Deploy this update to all tenants?')) {
                e.preventDefault();
            }
        });
    </script>
</body>
</html>