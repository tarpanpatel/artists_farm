<?php
/**
 * Receipts & Past Billing Archive Module
 * Function: Past checkout receipts retrieval and PDF/print audit records.
 */

function handleReceiptRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'get_receipts':
            $stmt = $pdo->query("SELECT * FROM audit_logs WHERE action LIKE '%Checkout%' ORDER BY timestamp DESC");
            echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid receipts action']);
            break;
    }
}
