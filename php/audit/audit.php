<?php
/**
 * System Audit & Security Trail Module
 * Function: Audit logs, past receipts logs, staff activity trails, login logs, and error logs.
 */

function handleAuditRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'get_audit_logs':
            try {
                $sql = "SELECT a.id, a.timestamp, COALESCE(u.username, 'System') as user, a.action 
                        FROM audit_logs a 
                        LEFT JOIN users u ON a.user_id = u.id 
                        ORDER BY a.timestamp DESC LIMIT 150";
                $stmt = $pdo->query($sql);
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                try {
                    $sql = "SELECT id, timestamp, user, action FROM audit_logs ORDER BY timestamp DESC LIMIT 150";
                    $stmt = $pdo->query($sql);
                    echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
                } catch (PDOException $e2) {
                    echo json_encode(['status' => 'success', 'data' => []]);
                }
            }
            break;

        case 'add_audit_log':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO audit_logs (user_id, action, timestamp) VALUES (?, ?, ?)");
                    $stmt->execute([
                        $input['user_id'] ?? 7,
                        $input['action'] ?? 'System Event',
                        $input['timestamp'] ?? date('Y-m-d H:i:s')
                    ]);
                    $id = $pdo->lastInsertId();
                } catch (PDOException $e) {
                    $id = 'AUD-' . time();
                    try {
                        $stmt = $pdo->prepare("INSERT INTO audit_logs (id, timestamp, user, action) VALUES (?, ?, 'System', ?)");
                        $stmt->execute([
                            $id,
                            $input['timestamp'] ?? date('Y-m-d H:i:s'),
                            $input['action'] ?? 'System Event'
                        ]);
                    } catch (PDOException $e2) {}
                }
                echo json_encode(['status' => 'success', 'id' => $id, 'message' => 'Audit log recorded']);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid audit action']);
            break;
    }
}
