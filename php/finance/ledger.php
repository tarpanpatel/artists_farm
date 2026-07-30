<?php
/**
 * Immutable financial event ledger shared by guest, billing, payroll, expense,
 * and cash-drawer workflows. Source records remain their operational detail;
 * this table provides the accounting timeline and prevents duplicate postings.
 */

function ensureFinancialLedger($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS `financial_ledger` (
        `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        `property_id` INT NOT NULL DEFAULT 1,
        `entry_key` VARCHAR(150) NOT NULL UNIQUE,
        `occurred_at` DATETIME NOT NULL,
        `direction` ENUM('credit','debit') NOT NULL,
        `amount` DECIMAL(12,2) NOT NULL,
        `category` VARCHAR(80) NOT NULL,
        `payment_method` VARCHAR(80) DEFAULT '',
        `party_type` VARCHAR(40) DEFAULT '',
        `party_id` VARCHAR(80) DEFAULT '',
        `party_name` VARCHAR(255) DEFAULT '',
        `source_type` VARCHAR(80) NOT NULL,
        `source_id` VARCHAR(80) NOT NULL,
        `description` TEXT,
        `metadata` JSON NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX `idx_ledger_occurred_at` (`occurred_at`),
        INDEX `idx_ledger_party` (`party_type`, `party_id`),
        INDEX `idx_ledger_source` (`source_type`, `source_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
}

function postFinancialLedger($pdo, array $entry, int $propertyId = 1) {
    $amount = round((float)($entry['amount'] ?? 0), 2);
    if ($amount <= 0) return false;
    ensureFinancialLedger($pdo);
    $key = $entry['entry_key'] ?? (($entry['source_type'] ?? 'event') . ':' . ($entry['source_id'] ?? uniqid()));
    $stmt = $pdo->prepare("INSERT IGNORE INTO financial_ledger
        (property_id, entry_key, occurred_at, direction, amount, category, payment_method, party_type, party_id, party_name, source_type, source_id, description, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $propertyId,
        $key,
        $entry['occurred_at'] ?? date('Y-m-d H:i:s'),
        $entry['direction'] ?? 'debit',
        $amount,
        $entry['category'] ?? 'Uncategorised',
        $entry['payment_method'] ?? '',
        $entry['party_type'] ?? '',
        (string)($entry['party_id'] ?? ''),
        $entry['party_name'] ?? '',
        $entry['source_type'] ?? 'manual',
        (string)($entry['source_id'] ?? ''),
        $entry['description'] ?? '',
        isset($entry['metadata']) ? json_encode($entry['metadata']) : null,
    ]);
    return $stmt->rowCount() > 0;
}

function reverseFinancialSource($pdo, string $sourceType, string $sourceId, string $reason, int $propertyId = 1) {
    ensureFinancialLedger($pdo);
    $stmt = $pdo->prepare("SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END), 0) FROM financial_ledger WHERE source_type = ? AND source_id = ? AND property_id = ?");
    $stmt->execute([$sourceType, $sourceId, $propertyId]);
    $netDebit = (float)$stmt->fetchColumn();
    if (abs($netDebit) < 0.005) return false;
    return postFinancialLedger($pdo, [
        'entry_key' => 'reversal:' . $sourceType . ':' . $sourceId . ':' . uniqid(),
        'direction' => $netDebit > 0 ? 'credit' : 'debit',
        'amount' => abs($netDebit),
        'category' => 'Ledger Reversal',
        'source_type' => $sourceType,
        'source_id' => $sourceId,
        'description' => $reason,
    ], $propertyId);
}
