<?php
require_once __DIR__ . '/php/config/database.php';
header('Content-Type: text/html; charset=UTF-8'); // database.php defaults to application/json for the API router
require_once __DIR__ . '/php/auth/saas_auth.php';
require_once __DIR__ . '/php/modules/property_manager.php';

$accessInfo = requireAuth($pdo, 'tenant_admin');
$tenantId = $accessInfo['tenant_id'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Content-Type: application/json');
    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    if (($input['action'] ?? '') === 'request_property') {
        echo json_encode(requestPropertyCreation($pdo, $tenantId, $input, $accessInfo['user_id']));
        exit;
    }
    echo json_encode(['success' => false, 'message' => 'Unknown action']);
    exit;
}

$stmt = $pdo->prepare("SELECT name, max_properties FROM tenants WHERE id = ?");
$stmt->execute([$tenantId]);
$tenant = $stmt->fetch();

$properties = getTenantProperties($pdo, $tenantId);
$maxProperties = $tenant['max_properties'] ?? 1;
$usedPct = $maxProperties > 0 ? min(100, round((count($properties) / $maxProperties) * 100, 1)) : 100;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Properties - Tenant Dashboard | Artists Farm SaaS</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 2rem; }
        .container { max-width: 900px; margin: 0 auto; }
        .header { margin-bottom: 2rem; }
        .header h1 { font-size: 1.5rem; }
        .header p { color: #666; margin-top: 0.5rem; }
        .card { background: white; padding: 2rem; border-radius: 8px; margin-bottom: 1.5rem; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .property-list { display: grid; gap: 1rem; }
        .property-item { border: 1px solid #e5e5e5; border-radius: 8px; padding: 1.5rem; display: flex; justify-content: space-between; align-items: center; }
        .property-item-name { font-weight: 600; font-size: 1.125rem; }
        .property-item-type { font-size: 0.85rem; color: #666; }
        .badge { padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 500; }
        .badge-active { background: #d1fae5; color: #065f46; }
        .badge-inactive { background: #fee2e2; color: #991b1b; }
        .badge-pending { background: #fef3c7; color: #92400e; }
        .info-box { background: #f0f9ff; border: 1px solid #bae6fd; padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; }
        .info-box-title { font-weight: 600; margin-bottom: 0.5rem; }
        .info-box p { font-size: 0.9rem; color: #666; }
        .progress-bar { background: #e5e5e5; border-radius: 999px; height: 8px; margin-top: 0.5rem; }
        .progress-fill { background: #667eea; height: 100%; border-radius: 999px; }
        .request-form { margin-top: 2rem; }
        .form-group { margin-bottom: 1.5rem; }
        .form-label { display: block; margin-bottom: 0.5rem; font-weight: 500; }
        .form-input, .form-select, .form-textarea { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; }
        .form-textarea { min-height: 100px; resize: vertical; }
        .btn { padding: 0.75rem 1.5rem; border-radius: 4px; border: none; cursor: pointer; font-weight: 500; display: inline-block; text-decoration: none; color: inherit; }
        .btn-primary { background: #667eea; color: white; }
        .btn-primary:disabled { background: #ccc; cursor: not-allowed; }
        .btn-secondary { background: #e5e5e5; color: #333; }
        .type-options { display: flex; flex-direction: column; gap: 0.75rem; }
        .type-option { display: flex; align-items: flex-start; gap: 1rem; padding: 1rem; border: 2px solid #e5e5e5; border-radius: 8px; cursor: pointer; }
        .type-option:hover { border-color: #667eea; }
        .type-option.selected { border-color: #667eea; background: #f0f0ff; }
        .type-option input { margin-top: 0.25rem; }
        .type-option-label { font-weight: 500; }
        .type-option-desc { font-size: 0.8rem; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏠 My Properties</h1>
            <p>Request new properties or modify existing ones</p>
        </div>

        <div class="info-box">
            <div class="info-box-title">Your Properties</div>
            <p><strong><?php echo count($properties); ?></strong> of <strong><?php echo (int)$maxProperties; ?></strong> properties allowed</p>
            <div class="progress-bar"><div class="progress-fill" style="width: <?php echo $usedPct; ?>%;"></div></div>
        </div>

        <div class="card">
            <h3 style="margin-bottom:1rem;">Your Properties</h3>
            <div class="property-list">
                <?php if (empty($properties)): ?>
                <div style="color:#666;">No properties yet.</div>
                <?php endif; ?>
                <?php foreach ($properties as $p): ?>
                <div class="property-item">
                    <div>
                        <div class="property-item-name"><?php echo htmlspecialchars($p['name']); ?></div>
                        <div class="property-item-type"><?php echo htmlspecialchars($p['slug']); ?> | <?php echo htmlspecialchars($p['property_type']); ?> | <?php echo htmlspecialchars($p['status']); ?></div>
                    </div>
                    <span class="badge <?php echo $p['status'] === 'active' ? 'badge-active' : 'badge-inactive'; ?>"><?php echo htmlspecialchars(ucfirst($p['status'])); ?></span>
                </div>
                <?php endforeach; ?>
            </div>
        </div>

        <div class="card">
            <h3 style="margin-bottom:1rem;">Request New Property</h3>
            <p style="color:#666;margin-bottom:1.5rem;">Fill out the form below to request a new property. The platform admin will review and create it for you.</p>

            <div class="request-form">
                <div class="form-group">
                    <label class="form-label">Property Type *</label>
                    <div class="type-options" id="type-options">
                        <label class="type-option">
                            <input type="radio" name="property_type" value="vacation_home" checked>
                            <div>
                                <div class="type-option-label">🏠 Vacation Home</div>
                                <div class="type-option-desc">Whole property booked by one group. Multiple rooms, single booking entity. Like Artists Farm.</div>
                            </div>
                        </label>
                        <label class="type-option">
                            <input type="radio" name="property_type" value="apartment_unit">
                            <div>
                                <div class="type-option-label">🏢 Apartment Unit</div>
                                <div class="type-option-desc">Single apartment/unit with multiple rooms. One group stays at a time.</div>
                            </div>
                        </label>
                        <label class="type-option">
                            <input type="radio" name="property_type" value="multi_unit_building">
                            <div>
                                <div class="type-option-label">🏗️ Multi-Unit Building</div>
                                <div class="type-option-desc">Building with independent apartments/rooms. Each unit can have different guests.</div>
                            </div>
                        </label>
                    </div>
                </div>

                <div class="form-group">
                    <label class="form-label">Property Name *</label>
                    <input type="text" id="req-property-name" class="form-input" placeholder="e.g., My New Location">
                </div>

                <div class="form-group">
                    <label class="form-label">URL Slug *</label>
                    <input type="text" id="req-property-slug" class="form-input" placeholder="e.g., my-new-location">
                    <small style="color:#666;">Format: lowercase letters, numbers, hyphens only. Will be used in URL: /&lt;slug&gt;/</small>
                </div>

                <div class="form-group">
                    <label class="form-label">Address</label>
                    <input type="text" id="req-property-address" class="form-input" placeholder="Street address">
                </div>

                <div class="form-group">
                    <label class="form-label">City</label>
                    <input type="text" id="req-property-city" class="form-input" placeholder="City">
                </div>

                <div class="form-group">
                    <label class="form-label">Max Capacity (guests)</label>
                    <input type="number" id="req-property-capacity" class="form-input" value="0" min="0">
                </div>

                <div class="form-group">
                    <label class="form-label">Why do you need this property?</label>
                    <textarea id="req-property-reason" class="form-textarea" placeholder="Explain why you need a new property..."></textarea>
                </div>

                <button class="btn btn-primary" id="submit-request-btn" onclick="submitRequest()">Submit Request</button>
            </div>
        </div>
    </div>

    <script>
        document.querySelectorAll('.type-option').forEach(function(opt) {
            opt.addEventListener('click', function() {
                document.querySelectorAll('.type-option').forEach(function(o) { o.classList.remove('selected'); });
                this.classList.add('selected');
            });
        });

        function submitRequest() {
            var name = document.getElementById('req-property-name').value.trim();
            var slug = document.getElementById('req-property-slug').value.trim();
            var reason = document.getElementById('req-property-reason').value.trim();
            var type = document.querySelector('input[name="property_type"]:checked').value;

            if (!name || !slug || !reason) { alert('Please fill in all required fields'); return; }

            var btn = document.getElementById('submit-request-btn');
            btn.textContent = 'Submitting...';
            btn.disabled = true;

            fetch(window.location.href, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    action: 'request_property',
                    property_type: type,
                    name: name,
                    slug: slug,
                    address: document.getElementById('req-property-address').value,
                    city: document.getElementById('req-property-city').value,
                    max_capacity: parseInt(document.getElementById('req-property-capacity').value) || 0,
                    reason: reason
                })
            }).then(function(r) { return r.json(); }).then(function(data) {
                alert(data.message);
                if (data.success) { location.reload(); }
                else { btn.textContent = 'Submit Request'; btn.disabled = false; }
            });
        }
    </script>
</body>
</html>
