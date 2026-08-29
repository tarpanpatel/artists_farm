<?php
/**
 * Platform Theme Settings Manager
 * Handles dynamic theme customization from Root Admin Dashboard
 */

function getThemeSettings($pdo) {
    try {
        $stmt = $pdo->prepare("SELECT settings_json FROM platform_theme_settings WHERE id = 1");
        $stmt->execute();
        $result = $stmt->fetch();

        if ($result) {
            return json_decode($result['settings_json'], true);
        }

        return getDefaultThemeSettings();
    } catch (Exception $e) {
        return getDefaultThemeSettings();
    }
}

function getDefaultThemeSettings() {
    return [
        'colors' => [
            'primary' => '#3b82f6',
            'secondary' => '#1e293b',
            'accent' => '#06b6d4',
            'success' => '#10b981',
            'warning' => '#f59e0b',
            'error' => '#ef4444',
            'info' => '#0284c7',
        ],
        'darkMode' => [
            'background' => '#0f172a',
            'surface' => '#1e293b',
            'text' => '#f1f5f9',
            'textMuted' => '#94a3b8',
        ],
        'typography' => [
            'fontFamily' => 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
            'baseFontSize' => '16px',
            'headingScale' => 1.2,
        ],
        'spacing' => [
            'baseUnit' => '4px',
        ],
        'borderRadius' => [
            'small' => '0.375rem',
            'medium' => '0.5rem',
            'large' => '1rem',
        ],
        'shadows' => [
            'small' => '0 1px 2px 0 rgb(0 0 0 / 0.05)',
            'medium' => '0 4px 6px -1px rgb(0 0 0 / 0.1)',
            'large' => '0 10px 15px -3px rgb(0 0 0 / 0.1)',
        ],
    ];
}

function updateThemeSettings($pdo, $settingsData, $updatedBy = 'system') {
    try {
        // Validate settings data
        if (!is_array($settingsData)) {
            return ['success' => false, 'message' => 'Invalid settings data'];
        }

        $settingsJson = json_encode($settingsData);

        // Try to update first
        $stmt = $pdo->prepare("
            UPDATE platform_theme_settings
            SET settings_json = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = 1
        ");

        $stmt->execute([$settingsJson, $updatedBy]);

        // If no rows updated, insert instead
        if ($stmt->rowCount() === 0) {
            $stmt = $pdo->prepare("
                INSERT INTO platform_theme_settings (id, settings_json, updated_by)
                VALUES (1, ?, ?)
            ");
            $stmt->execute([$settingsJson, $updatedBy]);
        }

        return [
            'success' => true,
            'message' => 'Theme settings updated successfully',
            'settings' => $settingsData,
        ];
    } catch (Exception $e) {
        return [
            'success' => false,
            'message' => 'Error updating theme settings: ' . $e->getMessage(),
        ];
    }
}

require_once __DIR__ . '/../security/input_validator.php';

function handleThemeRequests($pdo, $request_method, $action, $propertyId = null) {
    try {
        switch ($action) {
            case 'get_theme_settings':
                $settings = getThemeSettings($pdo);
                echo json_encode([
                    'status' => 'success',
                    'data' => $settings,
                ]);
                break;

            case 'save_theme_settings':
                if ($request_method !== 'POST') {
                    http_response_code(405);
                    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
                    break;
                }

                $isRootAdmin = (($_SESSION['role'] ?? '') === 'root_admin')
                    || (($_SERVER['HTTP_X_USER_ROLE'] ?? '') === 'root_admin');
                if (!$isRootAdmin) {
                    http_response_code(403);
                    echo json_encode(['status' => 'error', 'message' => 'Only root administrators can modify theme settings']);
                    break;
                }

                $input = json_decode(file_get_contents('php://input'), true);
                $settingsData = $input['settings'] ?? null;
                $updatedBy = InputValidator::validateString($_SESSION['username'] ?? 'root_admin', 1, 100);

                if (!$settingsData || !is_array($settingsData)) {
                    http_response_code(400);
                    echo json_encode([
                        'status' => 'error',
                        'message' => 'Settings data is required and must be an array/object',
                    ]);
                    break;
                }

                $result = updateThemeSettings($pdo, $settingsData, $updatedBy);
                echo json_encode($result);
                break;

            default:
                http_response_code(404);
                echo json_encode(['status' => 'error', 'message' => 'Action not found']);
        }
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'status' => 'error',
            'message' => 'Server error: ' . $e->getMessage(),
        ]);
    }
}
?>
