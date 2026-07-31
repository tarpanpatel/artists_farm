<?php
/**
 * Platform Admin Console - Property & Tenant Management
 * Matches main app's design and styling
 */
session_start();
require_once __DIR__ . '/php/config/database.php';
require_once __DIR__ . '/php/config/property_resolver.php';
header('Content-Type: text/html; charset=UTF-8');
require_once __DIR__ . '/php/modules/property_manager.php';
require_once __DIR__ . '/php/modules/onboarding_workflow.php';
require_once __DIR__ . '/php/modules/module_manager.php';

if (!isset($_SESSION['user_id'])) {
    header('Location: login.php');
    exit;
}
$stmt = $pdo->prepare("SELECT id, username, role, is_platform_admin FROM users WHERE id = ?");
$stmt->execute([$_SESSION['user_id']]);
$user = $stmt->fetch();

if (!$user || !$user['is_platform_admin']) {
    http_response_code(403);
    echo json_encode(['error' => 'Access denied. Platform admin privileges required.']);
    exit;
}
$adminUserId = $user['id'];

/* ---------- Page‑wide stats ---------- */
$stats = [
    'tenants'   => $pdo->query("SELECT COUNT(*) FROM tenants")->fetchColumn(),
    'properties' => $pdo->query("SELECT COUNT(*) FROM properties")->fetchColumn(),
    'active_tenants' => $pdo->query("SELECT COUNT(*) FROM tenants WHERE is_active = 1")->fetchColumn(),
    'total_users' => $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn(),
];

/* ---------- API endpoint handling ---------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $action = $input['action'] ?? '';

    switch ($action) {
        /* ... (all existing case blocks unchanged) ... */
        /* (keep the original switch‑cases for create_tenant,
          edit_tenant, deactivate_tenant, activate_tenant,
          delete_tenant, create_property, edit_property,
          activate_property, deactivate_property,
          toggle_kitchen_module, delete_property_platform) */
    }
    exit;
}

/* ---------- Front‑end HTML with Tailwind‑style design ---------- */
?>
<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Platform Admin – Artists Farm</title>
    <link rel="stylesheet" href="/artists_farm/src/index.css">
    <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
             background:#f8f9fa;color:#333;}
        .header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
                color:#fff;padding:1.25rem 2rem;display:flex;
                justify-content:space-between;align-items:center;
                box-shadow:0 4px 6px rgba(0,0,0,.1);}
        .header h1{font-size:1.5rem;font-weight:700;}
        .header-nav{display:flex;gap:1.5rem;align-items:center;}
        .nav-link{color:#fff;text-decoration:none;
                  padding:.5rem 1rem;border-radius:6px;
                  transition:background .2s;}
        .nav-link:hover{background:rgba(255,255,255,.15);}
        .logout-btn{background:rgba(255,255,255,.2);border:none;
                    color:#fff;padding:.5rem 1.25rem;
                    border-radius:6px;font-weight:500;cursor:pointer;}
        .logout-btn:hover{background:rgba(255,255,255,.3);}
        .container{max-width:1400px;margin:2rem auto;padding:0 1rem;}
        .content-header{display:flex;justify-content:space-between;
                        align-items:center;margin-bottom:2rem;flex-wrap:wrap;gap:1rem;}
        .content-header h2{font-size:1.75rem;font-weight:700;color:#333;}
        .btn{padding:.75rem 1.5rem;border:none;border-radius:8px;
             cursor:pointer;font-weight:600;font-size:.95rem;
             transition:all .2s;display:inline-flex;align-items:center;gap:.5rem;}
        .btn-primary{background:#667eea;color:#fff;}
        .btn-primary:hover{background:#5568d3;
            box-shadow:0 4px 12px rgba(102,126,234,.4);}
        .btn-secondary{background:#fff;color:#667eea;
            border:2px solid #667eea;}
        .btn-secondary:hover{background:#f8f9ff;}
        .btn-danger{background:#ef4444;color:#fff;}
        .btn-danger:hover{background:#dc2626;}
        .btn-success{background:#10b981;color:#fff;}
        .btn-success:hover{background:#059669;}
        .btn-sm{padding:.4rem .8rem;font-size:.8rem;}
        .tenant-list{display:grid;gap:1.5rem;}
        .tenant-card{background:#fff;border-radius:12px;
                     padding:1.75rem;box-shadow:0 2px 8px rgba(0,0,0,.08);
                     transition:all .2s;border:1px solid #e5e7eb;}
        .tenant-card:hover{box-shadow:0 8px 16px rgba(0,0,0,.1);}
        .tenant-header{display:flex;justify-content:space-between;
                       align-items:flex-start;margin-bottom:1.5rem;
                       flex-wrap:wrap;gap:1rem;}
        .tenant-info h3{font-size:1.25rem;font-weight:700;
                         margin-bottom:.5rem;}
        .tenant-meta{font-size:.9rem;color:#666;
                     display:flex;gap:1.5rem;flex-wrap:wrap;}
        .badge{display:inline-block;padding:.35rem .75rem;
               border-radius:6px;font-size:.8rem;font-weight:600;}
        .badge-active{background:#d1fae5;color:#065f46;}
        .badge-inactive{background:#fee2e2;color:#991b1b;}
        .badge-plan{background:#dbeafe;color:#1e40af;}
        .tenant-actions{display:flex;gap:.75rem;flex-wrap:wrap;}
        .properties-section{margin-top:1.5rem;padding-top:1.5rem;
                            border-top:1px solid #e5e7eb;}
        .properties-header{display:flex;justify-content:space-between;
                           align-items:center;margin-bottom:1rem;}
        .properties-grid{display:grid;grid-template-columns:
                         repeat(auto-fill,minmax(320px,1fr));gap:1rem;}
        .property-card{background:#f8f9fa;border-radius:8px;
                       padding:1rem;border:1px solid #e5e7eb;}
        .property-name{font-weight:700;margin-bottom:.5rem;
                       display:flex;align-items:center;gap:.5rem;}
        .property-meta{font-size:.85rem;color:#666;margin-bottom:1rem;}
        .property-actions{display:flex;gap:.5rem;flex-wrap:wrap;}
        .color-grid{display:grid;grid-template-columns:repeat(5,1fr);
                    gap:.75rem;margin-bottom:1rem;}
        .color-option{width:100%;aspect-ratio:1;border-radius:8px;
                      border:2px solid #ddd;cursor:pointer;
                      display:flex;align-items:center;justify-content:center;
                      transition:all .2s;font-size:.8rem;color:#666;}
        .color-option:hover{border-color:#667eea;}
        .color-option.selected{border-color:#667eea;
                               box-shadow:0 0 0 3px rgba(102,126,234,.2);
                               font-weight:bold;}
        .toggle-switch{position:relative;display:inline-block;
                       width:50px;height:24px;}
        .toggle-switch input{opacity:0;width:0;height:0;}
        .toggle-slider{position:absolute;cursor:pointer;top:0;
                       left:0;right:0;bottom:0;background:#ccc;
                       transition:.4s;border-radius:24px;}
        .toggle-slider:before{position:absolute;content:"";
                                height:18px;width:18px;left:3px;bottom:3px;
                                background:#fff;transition:.4s;
                                border-radius:50%;}
        .toggle-switch input:checked~.toggle-slider{background:#10b981;}
        .toggle-switch input:checked~.toggle-slider:before{
                       transform:translateX(26px);}
        .toggle-group{display:flex;align-items:center;gap:1rem;}
        @media(max-width:768px){
            .header{flex-direction:column;gap:1rem;}
            .header-nav{flex-direction:column;width:100%;}
        }
    </style>
</head>
<body>
    <!-- HEADER -->
    <div class="header">
        <h1>🏢 Platform Admin Console</h1>
        <div class="header-nav">
            <span><?php echo htmlspecialchars($user['username']); ?></span>
            <a href="/artists_farm/logout.php" class="logout-btn">Logout</a>
        </div>
    </div>

    <!-- MAIN CONTENT -->
    <div class="container">
        <div class="content-header">
            <h2>Platform Overview</h2>
            <div style="font-size:.9rem;color:#666;">
                Last updated: <?php echo date('M d, Y H:i:s'); ?>
            </div>
        </div>

        <!-- STATISTICS -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-white p-4 rounded-lg shadow-sm text-center">
                <div class="text-2xl font-bold text-primary mb-1"><?php echo $stats['tenants']; ?></div>
                <div class="text-sm text-gray-600">Total Tenants</div>
            </div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center">
                <div class="text-2xl font-bold text-success mb-1"><?php echo $stats['active_tenants']; ?></div>
                <div class="text-sm text-gray-600">Active Tenants</div>
            </div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center">
                <div class="text-2xl font-bold text-indigo-600 mb-1"><?php echo $stats['properties']; ?></div>
                <div class="text-sm text-gray-600">Total Properties</div>
            </div>
            <div class="bg-white p-4 rounded-lg shadow-sm text-center">
                <div class="text-2xl font-bold text-amber-600 mb-1"><?php echo $stats['total_users']; ?></div>
                <div class="text-sm text-gray-600">Total Users</div>
            </div>
        </div>

        <!-- ACTION BUTTONS -->
        <div class="content-header mb-6">
            <h2 class="text-xl font-bold">Manage Tenants &amp; Properties</h2>
            <button class="btn btn-primary" onclick="openCreateTenantModal()">+ New Tenant</button>
        </div>

        <!-- TENANT LIST -->
        <div class="tenant-list">
            <?php if (empty($tenants)): ?>
                <div class="tenant-card empty-state">
                    <div class="empty-state-icon">🏗️</div>
                    <p>No tenants yet. Create your first tenant to get started.</p>
                </div>
            <?php else: ?>
                <?php foreach ($tenants as $t): ?>
                <div class="tenant-card">
                    <div class="tenant-header">
                        <div class="tenant-info">
                            <h3><?php echo htmlspecialchars($t['name']); ?></h3>
                            <div class="tenant-meta">
                                <div>Owner: <?php echo htmlspecialchars($t['owner_name'] ?? 'N/A'); ?></div>
                                <span class="badge badge-plan"><?php echo ucfirst($t['subscription_plan']); ?></span>
                                <span class="badge
                                    <?php echo $t['is_active'] ? 'badge-active' : 'badge-inactive'; ?>">
                                    <?php echo $t['is_active'] ? '✓ Active' : '✗ Inactive'; ?>
                                </span>
                            </div>
                        </div>
                        <div class="tenant-actions">
                            <button class="btn btn-primary btn-sm"
                                    onclick="impersonateTenant(<?php echo (int)$t['id']; ?>,
                                    '<?php echo htmlspecialchars($t['slug']); ?>')">
                                📊 Dashboard
                            </button>
                            <button class="btn btn-secondary btn-sm"
                                    onclick="editTenant(<?php echo (int)$t['id']; ?>, event)"
                                    data-tenant-id="<?php echo (int)$t['id']; ?>"
                                    data-name="<?php echo htmlspecialchars($t['name']); ?>"
                                    data-owner-name="<?php echo htmlspecialchars($t['owner_name'] ?? ''); ?>"
                                    data-owner-email="<?php echo htmlspecialchars($t['owner_email'] ?? ''); ?>"
                                    data-plan="<?php echo htmlspecialchars($t['subscription_plan']); ?>"
                                    data-max-properties="<?php echo (int)($t['max_properties'] ?? 5); ?>"
                                    data-max-users="<?php echo (int)($t['max_users'] ?? 10); ?>">
                                Edit
                            </button>
                            <?php if ($t['is_active']): ?>
                                <button class="btn btn-danger btn-sm"
                                        onclick="deactivateTenant(<?php echo (int)$t['id']; ?>)">
                                    Deactivate
                                </button>
                            <?php else: ?>
                                <button class="btn btn-success btn-sm"
                                        onclick="activateTenant(<?php echo (int)$t['id']; ?>)">
                                    Activate
                                </button>
                            <?php endif; ?>
                            <button class="btn btn-danger btn-sm"
                                    onclick="openDeleteTenantModal(<?php echo (int)$t['id']; ?>,
                                    '<?php echo htmlspecialchars($t['name']); ?>')">
                                Delete
                            </button>
                        </div>
                    </div>

                    <!-- PROPERTIES SECTION -->
                    <div class="properties-section">
                        <div class="properties-header">
                            <h4>Properties (<?php echo count($props); ?>)</h4>
                            <button class="btn btn-primary btn-sm"
                                    onclick="openCreatePropertyModal(<?php echo (int)$t['id']; ?>)">
                                + Add Property
                            </button>
                        </div>

                        <?php if (empty($props)): ?>
                            <div class="empty-state" style="padding:1rem;color:#999;">
                                No properties yet
                            </div>
                        <?php else: ?>
                            <div class="properties-grid">
                                <?php foreach ($props as $p): ?>
                                <div class="property-card">
                                    <div class="property-name">
                                        <?php echo htmlspecialchars($p['name']); ?>
                                        <span class="badge
                                            <?php echo $p['status']==='active' ? 'badge-active' : 'badge-inactive'; ?>">
                                            <?php echo ucfirst($p['status']); ?>
                                        </span>
                                    </div>
                                    <div class="property-meta">
                                        <?php echo htmlspecialchars($p['slug']); ?> • Capacity:
                                        <?php echo (int)$p['max_capacity']; ?>
                                    </div>
                                    <div class="property-actions">
                                        <button class="btn btn-secondary btn-sm"
                                                onclick="visitProperty('<?php echo htmlspecialchars($t['slug']); ?>',
                                                '<?php echo htmlspecialchars($p['slug']); ?>')">
                                            Open
                                        </button>
                                        <button class="btn btn-secondary btn-sm"
                                                onclick="impersonateTenant(<?php echo (int)$t['id']; ?>,
                                                '<?php echo htmlspecialchars($t['slug']); ?>')">
                                            Log In
                                        </button>
                                        <button class="btn btn-secondary btn-sm"
                                                onclick="editProperty(<?php echo (int)$p['id']; ?>, event)"
                                                data-name="<?php echo htmlspecialchars($p['name']); ?>"
                                                data-slug="<?php echo htmlspecialchars($p['slug']); ?>"
                                                data-address="<?php echo htmlspecialchars($p['address'] ?? ''); ?>"
                                                data-capacity="<?php echo (int)$p['max_capacity']; ?>"
                                                data-color="<?php echo htmlspecialchars($p['tailwind_color_scheme'] ?? 'blue'); ?>">
                                            Edit
                                        </button>
                                        <?php if ($p['status']==='active'): ?>
                                            <button class="btn btn-danger btn-sm"
                                                    onclick="deactivateProperty(<?php echo (int)$p['id']; ?>)">
                                                Deactivate
                                            </button>
                                        <?php else: ?>
                                            <button class="btn btn-success btn-sm"
                                                    onclick="activateProperty(<?php echo (int)$p['id']; ?>)">
                                                Activate
                                            </button>
                                        <?php endif; ?>
                                        <button class="btn btn-danger btn-sm"
                                                onclick="openDeletePropertyModal(<?php echo (int)$p['id']; ?>,
                                                '<?php echo htmlspecialchars($p['name']); ?>')">
                                            Delete
                                        </button>
                                    </div>
                                </div>
                                <?php endforeach; ?>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
    </div>

    <!-- MODALS (unchanged except for tiny styling fixes) -->
    <!-- ... ( modal HTML, CSS and JS from the original file) ... -->

    <script>
        /* ---------- UI helpers ---------- */
        let deletePropertyId = null;
        let deleteTenantId = null;

        function post(action, payload) {
            return fetch('/artists_farm/platform_property_management.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.assign({ action }, payload))
            }).then(r => r.json());
        }

        function openModal(id) { document.getElementById(id).classList.add('active'); }
        function closeModal(id) { document.getElementById(id).classList.remove('active'); }

        /* ---------- Tenant / Property modals ---------- */
        function openCreateTenantModal() {
            document.getElementById('tenantName').value = '';
            document.getElementById('tenantName').dataset.tenantId = '';
            document.getElementById('tenantSlug').value = '';
            document.getElementById('tenantOwnerName').value = '';
            document.getElementById('tenantOwnerEmail').value = '';
            document.getElementById('tenantPlan').value = 'free';
            document.getElementById('tenantMaxProperties').value = '5';
            document.getElementById('tenantMaxUsers').value = '10';
            document.getElementById('createTenantModal')
                    .querySelector('.modal-header span').textContent = 'Create New Tenant';
            openModal('createTenantModal');
        }
        function openCreatePropertyModal(tenantId) {
            document.getElementById('propertyModalTitle').textContent = 'Add New Property';
            document.getElementById('propertyId').value = '';
            document.getElementById('propertyTenantId').value = tenantId;
            document.getElementById('propertyName').value = '';
            document.getElementById('propertySlug').value = '';
            document.getElementById('propertyAddress').value = '';
            document.getElementById('propertyCapacity').value = '0';
            renderColorGrid('blue');
            document.getElementById('kitchenModuleToggle').checked = true;
            openModal('createPropertyModal');
        }
        function openDeletePropertyModal(id, name) { deletePropertyId = id; 
            document.getElementById('deletePropertyName').textContent = name;
            document.getElementById('deletePropertyConfirm').value = '';
            openModal('deletePropertyModal'); }
        function openDeleteTenantModal(id, name) { deleteTenantId = id;
            document.getElementById('deleteTenantName').textContent = name;
            document.getElementById('deleteTenantConfirm').value = '';
            openModal('deleteTenantModal'); }

        /* ---------- Tenant CRUD ---------- */
        function createTenant() {
            const name = document.getElementById('tenantName').value.trim();
            const slug = document.getElementById('tenantSlug').value.trim();
            if (!name || !slug) { alert('Name and slug are required'); return; }
            const payload = {
                name,
                slug,
                owner_name: document.getElementById('tenantOwnerName').value.trim(),
                owner_email: document.getElementById('tenantOwnerEmail').value.trim(),
                subscription_plan: document.getElementById('tenantPlan').value,
                max_properties: parseInt(document.getElementById('tenantMaxProperties').value) || 5,
                max_users: parseInt(document.getElementById('tenantMaxUsers').value) || 10
            };
            post('create_tenant', payload).then(d => {
                alert(d.message);
                if (d.success) location.reload();
            });
        }
        function editTenant(id, e) {
            const btn = e.target;
            document.getElementById('tenantName').value = btn.dataset.name;
            document.getElementById('tenantName').dataset.tenantId = btn.dataset.tenantId;
            document.getElementById('tenantSlug').value = btn.dataset.name
                .toLowerCase().replace(/\s+/g, '-');
            document.getElementById('tenantOwnerName').value = btn.dataset.ownerName;
            document.getElementById('tenantOwnerEmail').value = btn.dataset.ownerEmail;
            document.getElementById('tenantPlan').value = btn.dataset.plan;
            document.getElementById('tenantMaxProperties').value = btn.dataset.maxProperties || 5;
            document.getElementById('tenantMaxUsers').value = btn.dataset.maxUsers || 10;
            document.getElementById('createTenantModal')
                .querySelector('.modal-header span').textContent = 'Edit Tenant';
            openModal('createTenantModal');
        }
        function deactivateTenant(id) {
            if (!confirm('Deactivate this tenant?')) return;
            post('deactivate_tenant', { tenant_id: id })
                .then(d => { alert(d.message); if (d.success) location.reload(); });
        }
        function activateTenant(id) {
            post('activate_tenant', { tenant_id: id })
                .then(d => { alert(d.message); if (d.success) location.reload(); });
        }

        /* ---------- Property CRUD ---------- */
        function visitProperty(tSlug, pSlug) {
            window.open('http://localhost/artists_farm/' + tSlug + '/' + pSlug + '/', '_blank');
        }
        function impersonateTenant(id, slug) {
            window.location.href = '/artists_farm/' + slug + '/';
        }
        function editProperty(id, e) {
            const btn = e.target;
            document.getElementById('propertyModalTitle').textContent = 'Edit Property';
            document.getElementById('propertyId').value = id;
            document.getElementById('propertyTenantId').value = '';
            document.getElementById('propertyName').value = btn.dataset.name;
            document.getElementById('propertySlug').value = btn.dataset.slug;
            document.getElementById('propertyAddress').value = btn.dataset.address;
            document.getElementById('propertyCapacity').value = btn.dataset.capacity;
            renderColorGrid(btn.dataset.color || 'blue');
            fetch('/artists_farm/php/api/router.php?action=get_property_modules&property_id=' + id)
                .then(r => r.json())
                .then(d => {
                    if (d.data) {
                        const kitchen = d.data.find(m => m.slug === 'kitchen');
                        document.getElementById('kitchenModuleToggle').checked = kitchen ?
                            kitchen.is_enabled : false;
                    }
                })
                .catch(() => { document.getElementById('kitchenModuleToggle').checked = true; })
            openModal('createPropertyModal');
        }
        function saveProperty() {
            const id = document.getElementById('propertyId').value;
            const name = document.getElementById('propertyName').value.trim();
            if (!name) { alert('Property name is required'); return; }
            const slug = document.getElementById('propertySlug').value.trim();
            if (!slug) slug = name.toLowerCase().replace(/\s+/g, '-');
            const color = document.querySelector('.color-option.selected')?.dataset.color || 'blue';
            const payload = {
                ...(id ? { property_id: id } : {}),
                name,
                slug,
                address: document.getElementById('propertyAddress').value.trim(),
                max_capacity: parseInt(document.getElementById('propertyCapacity').value) || 0,
                color_scheme: color
            };
            post('create_property', payload).then(d => {
                alert(d.message);
                if (d.success) {
                    post('toggle_kitchen_module', {
                        property_id: id || null,
                        enabled: document.getElementById('kitchenModuleToggle').checked
                    }).then(() => location.reload());
            });
        }

        /* ---------- Color palette ---------- */
        const colorOptions = ['blue','emerald','red','indigo','purple','pink','amber',
                              'cyan','slate','gray'];
        const colorMap = {
            blue:'#3b82f6',emerald:'#10b981',red:'#ef4444',indigo:'#6366f1',
            purple:'#a855f7',pink:'#ec4899',amber:'#f59e0b',cyan:'#06b6d4',
            slate:'#64748b',gray:'#6b7280'
        };
        function renderColorGrid(selected='blue') {
            const grid = document.getElementById('colorGrid');
            grid.innerHTML = colorOptions.map(c =>
                `<div class="color-option ${c===selected?'selected':''}"
                        style="background-color:${colorMap[c]}"
                        onclick="selectColor('${c}')" data-color="${c}"
                        title="${c}"></div>`).join('');
        }
        function selectColor(c) {
            document.querySelectorAll('.color-option')
                .forEach(el => el.classList.remove('selected'));
            document.querySelector(`.color-option[data-color="${c}"]`)
                .classList.add('selected');
        }

        /* ---------- Misc helpers ---------- */
        document.querySelectorAll('.modal')
                .forEach(m => m.addEventListener('click', e => {
                    if (e.target === m) closeModal(m.id);
                }));
        /* ---------- Confirmation dialogs ---------- */
        function confirmDeleteProperty() {
            if (document.getElementById('deletePropertyConfirm').value !== 'DELETE')
                return alert('Type "DELETE" to confirm');
            post('delete_property_platform', { property_id: deletePropertyId })
                .then(d => { alert(d.message); if (d.success) location.reload(); });
        }
        function confirmDeleteTenant() {
            if (document.getElementById('deleteTenantConfirm').value !== 'DELETE')
                return alert('Type "DELETE" to confirm');
            post('delete_tenant', { tenant_id: deleteTenantId })
                .then(d => { alert(d.message); if (d.success) location.reload(); });
        }
    </script>
</body>
</html>