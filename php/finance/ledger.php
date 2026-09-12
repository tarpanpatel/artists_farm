<?php
/**
 * Immutable financial event ledger shared by guest, billing, payroll, expense,
 * and cash-drawer workflows. Source records remain their operational detail;
 * this table provides the accounting timeline and prevents duplicate postings.
 */

require_once __DIR__ . '/../config/schema_cache.php';

/**
 * Self-heals the ledger table (13 Sep 2026).
 *
 * This function previously only marked the schema "verified" and returned - it
 * never created anything, and no CREATE TABLE for `financial_ledger` existed
 * anywhere in the codebase or in php/schema/*.sql. It works today only because
 * the table was created by hand at some point on each existing environment. On
 * a fresh install every money posting in the app would fail, which is exactly
 * the situation CLAUDE.md's self-healing-schema rule exists to prevent (prod is
 * cPanel with no migration step).
 *
 * CREATE TABLE IF NOT EXISTS only - it never ALTERs an existing table, so this
 * is a no-op wherever the table is already present.
 *
 * NOTE for a human to confirm against production: the unique key below is
 * (property_id, entry_key). postFinancialLedger()'s INSERT IGNORE relies on a
 * unique index over entry_key to dedupe repeat postings, and scoping it by
 * property is the multi-tenant-correct choice - but if production's existing
 * table indexes entry_key ALONE, the two environments dedupe slightly
 * differently for keys that are not already property-unique. Verify with
 * `SHOW CREATE TABLE financial_ledger` and reconcile if they differ.
 */
function ensureFinancialLedger($pdo) {
    if (isSchemaVerified('schema_financial_ledger')) return;
    try {
        $pdo->exec("CREATE TABLE IF NOT EXISTS financial_ledger (
            id INT AUTO_INCREMENT PRIMARY KEY,
            property_id INT NOT NULL,
            entry_key VARCHAR(191) NOT NULL,
            occurred_at DATETIME NOT NULL,
            direction VARCHAR(10) NOT NULL DEFAULT 'debit',
            amount DECIMAL(12,2) NOT NULL DEFAULT 0,
            category VARCHAR(100) DEFAULT 'Uncategorised',
            payment_method VARCHAR(50) DEFAULT '',
            party_type VARCHAR(50) DEFAULT '',
            party_id VARCHAR(64) DEFAULT '',
            party_name VARCHAR(191) DEFAULT '',
            source_type VARCHAR(50) NOT NULL DEFAULT 'manual',
            source_id VARCHAR(64) DEFAULT '',
            description TEXT,
            metadata LONGTEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_property_entry (property_id, entry_key),
            INDEX idx_property_occurred (property_id, occurred_at),
            INDEX idx_source (source_type, source_id, property_id)
        )");
        markSchemaVerified('schema_financial_ledger');
    } catch (Exception $e) {
        error_log('financial_ledger schema migration error: ' . $e->getMessage());
    }
}

/**
 * $propertyId is REQUIRED - it deliberately has no default (13 Sep 2026).
 *
 * It used to default to 1. A caller that forgot it did not fail; it quietly
 * posted real money to whichever property happens to be id 1, and nothing
 * anywhere surfaced that. CLAUDE.md records a 15 Aug 2026 sweep where EVERY
 * real call site had been omitting it, and reverseFinancialSource() below was
 * found doing the same thing again on 13 Sep 2026 in petty_cash.php.
 *
 * A default that is silently wrong is worse than no default: omitting the
 * argument is now an immediate ArgumentCountError at the call site, which is
 * noticed in a minute rather than discovered in someone's books months later.
 */
function postFinancialLedger($pdo, array $entry, int $propertyId) {
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

/** $propertyId is REQUIRED - same reasoning as postFinancialLedger() above. */
function reverseFinancialSource($pdo, string $sourceType, string $sourceId, string $reason, int $propertyId) {
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
