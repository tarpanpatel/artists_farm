<?php
/**
 * Expenses & Cash Drawer Module
 * Function: Petty cash outflows, operational expenses, vendor payments, and desk cash drawer reconciliation.
 */

function handleFinanceRequests($pdo, $request_method, $action) {
    switch ($action) {
        case 'get_petty_cash':
            try {
                $stmt = $pdo->query("SELECT id, expense_date as date, category, description, amount, payment_mode, vendor_name as vendor FROM farm_utility_expenses ORDER BY expense_date DESC");
                echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
            } catch (PDOException $e) {
                try {
                    $stmt = $pdo->query("SELECT id, date, category, amount, description, vendor_name as vendor FROM petty_cash ORDER BY date DESC");
                    echo json_encode(['status' => 'success', 'data' => $stmt->fetchAll()]);
                } catch (PDOException $e2) {
                    echo json_encode(['status' => 'success', 'data' => []]);
                }
            }
            break;

        case 'add_petty_cash':
            if ($request_method === 'POST') {
                $input = json_decode(file_get_contents('php://input'), true);
                try {
                    $stmt = $pdo->prepare("INSERT INTO farm_utility_expenses (expense_date, category, description, amount, payment_mode, vendor_name) VALUES (?, ?, ?, ?, ?, ?)");
                    $stmt->execute([
                        $input['date'] ?? date('Y-m-d'),
                        $input['category'] ?? 'Other',
                        $input['description'] ?? '',
                        $input['amount'] ?? 0,
                        $input['payment_mode'] ?? 'Cash',
                        $input['vendor'] ?? $input['vendor_name'] ?? 'Manager'
                    ]);
                    $id = $pdo->lastInsertId();
                } catch (PDOException $e) {
                    $id = 'EXP-' . time();
                    $stmt = $pdo->prepare("INSERT INTO petty_cash (id, date, category, amount, description, vendor_name, approved_by) VALUES (?, ?, ?, ?, ?, ?, 'Manager')");
                    $stmt->execute([
                        $id,
                        $input['date'] ?? date('Y-m-d'),
                        $input['category'] ?? 'Other',
                        $input['amount'] ?? 0,
                        $input['description'] ?? '',
                        $input['vendor'] ?? $input['vendor_name'] ?? 'Manager'
                    ]);
                }
                echo json_encode(['status' => 'success', 'id' => $id, 'message' => 'Expense outflow recorded']);
            }
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => 'Invalid finance action']);
            break;
    }
}
