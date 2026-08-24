<?php
/**
 * Offline Intent Engine
 *
 * Zero-cost, zero-network phrase/action matcher for the "Ground Code AI" chat
 * widget. Runs on every message before any online provider (Gemini/OpenAI) is
 * consulted, so common commands (log an expense, open a screen, greet the
 * user) never need an API call. Rules are ordered most-specific-first; the
 * first rule that matches wins.
 */

/**
 * Strip punctuation/casing for keyword matching. Digits are preserved because
 * quantities and amounts are extracted from the raw message separately.
 */
function ai_normalize(string $text): string {
    $text = strtolower(trim($text));
    $text = preg_replace('/[^\p{L}\p{N}\s.]/u', ' ', $text);
    $text = preg_replace('/\s+/', ' ', $text);
    return trim($text);
}

/**
 * Fixes the handful of item-name typos/plurals staff actually type on a
 * phone keyboard (e.g. "air freshers" -> "air freshener").
 */
function ai_normalize_item(string $item): string {
    $item = trim($item);
    $item = preg_replace('/[.,!:?]+$/', '', $item);

    $corrections = [
        '/\bfreshers?\b/i' => 'freshener',
        '/\bnapkin\'?s\b/i' => 'napkins',
        '/\bmatchbox(?:es)?\b/i' => 'matchbox',
        '/\bbulb\'?s\b/i' => 'bulbs',
    ];
    foreach ($corrections as $pattern => $replacement) {
        $item = preg_replace($pattern, $replacement, $item);
    }

    // Drop trailing filler words a purchase request often carries.
    $item = preg_replace('/\s+(please|today|now|urgently|asap)$/i', '', $item);
    return trim($item);
}

/**
 * Look up the last logged price for an item so a bare "buy 2 X" can be
 * completed without asking the user for a price every single time.
 */
function ai_lookup_last_price(PDO $pdo, string $itemName): ?float {
    try {
        $stmt = $pdo->prepare("SELECT last_price FROM expense_item_prices WHERE LOWER(item_name) = LOWER(?) LIMIT 1");
        $stmt->execute([$itemName]);
        $row = $stmt->fetch();
        if ($row) {
            return (float) $row['last_price'];
        }
        // Loose match: "air freshener" should also match a saved "Air Fresheners" entry.
        $stmt = $pdo->prepare("SELECT last_price FROM expense_item_prices WHERE LOWER(item_name) LIKE LOWER(?) LIMIT 1");
        $stmt->execute(['%' . $itemName . '%']);
        $row = $stmt->fetch();
        return $row ? (float) $row['last_price'] : null;
    } catch (PDOException $e) {
        return null;
    }
}

/**
 * Build a log_expense intent from a "buy/purchase/order/get N item" phrase,
 * optionally continuing a pending intent from the previous turn (e.g. the
 * user just replied with a bare number after being asked for a price).
 */
function ai_match_log_expense(string $rawMessage, string $normalized, PDO $pdo, ?array $pending): ?array {
    // Turn 2 of a pending log_expense: the reply is just an amount.
    if ($pending && ($pending['intent'] ?? '') === 'log_expense' && preg_match('/^\D*(\d+(?:\.\d+)?)\D*$/', trim($rawMessage), $m)) {
        $quantity = (float) ($pending['params']['quantity'] ?? 1);
        return [
            'intent' => 'log_expense',
            'confidence' => 0.95,
            'params' => [
                'item' => $pending['params']['item'],
                'quantity' => $quantity,
                'unitPrice' => (float) $m[1],
                'amount' => $quantity * (float) $m[1],
            ],
        ];
    }

    $verbs = 'buy|bought|purchase|purchased|order|ordered|get|got';
    if (preg_match('/^(?:please\s+)?(?:' . $verbs . ')\s+(.+)$/i', trim($rawMessage), $m)) {
        $rest = trim($m[1]);
    } elseif (preg_match('/\b(?:log|record|add)\s+(?:an?\s+)?expense\b\s*(?:for|:)?\s*(.+)$/i', trim($rawMessage), $m)) {
        $rest = trim($m[1]);
    } else {
        return null;
    }

    // 1. Pull off a leading quantity: "2 air freshener", "3x candles".
    $quantity = 1.0;
    if (preg_match('/^(\d+(?:\.\d+)?)\s*x?\s+(.+)$/i', $rest, $qm)) {
        $quantity = (float) $qm[1];
        $rest = $qm[2];
    }

    // 2. Pull off a price: currency-symbol-anchored, keyword-anchored, or a bare trailing number.
    $amount = null;
    if (preg_match('/^(.*?)\s+(?:for|at|worth)?\s*(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*$/i', $rest, $am)
        || preg_match('/^(.*?)\s+(?:for|at|worth)\s+(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*$/i', $rest, $am)
        || preg_match('/^(.+?)\s+(\d+(?:\.\d+)?)\s*$/', $rest, $am)) {
        $rest = trim($am[1]);
        $amount = (float) $am[2];
    }

    $item = ai_normalize_item($rest);
    if ($item === '' || preg_match('/^\d+(?:\.\d+)?$/', $item)) {
        return null;
    }

    $unitPrice = $amount !== null
        ? ($quantity > 0 ? $amount / $quantity : $amount)
        : ai_lookup_last_price($pdo, $item);

    $params = ['item' => $item, 'quantity' => $quantity];
    if ($unitPrice !== null) {
        $params['unitPrice'] = round($unitPrice, 2);
        $params['amount'] = round($unitPrice * $quantity, 2);
    }

    return [
        'intent' => 'log_expense',
        'confidence' => 0.9,
        'params' => $params,
    ];
}

/**
 * "add a booking / new guest / check-in someone" -> hands off to the Guest
 * Registration form rather than guessing at guest details from free text.
 */
function ai_match_add_booking(string $normalized): ?array {
    if (preg_match('/\b(add|create|new|make|start)\b.*\b(booking|reservation|guest|check ?in)\b/i', $normalized)
        || preg_match('/\bbook\s+(?:a\s+)?(?:room|villa|cottage)\b/i', $normalized)) {
        return ['intent' => 'add_booking', 'confidence' => 0.85, 'params' => []];
    }
    return null;
}

function ai_match_checkout(string $normalized): ?array {
    if (preg_match('/\bcheck ?out\b/i', $normalized)) {
        return ['intent' => 'checkout', 'confidence' => 0.8, 'params' => []];
    }
    return null;
}

function ai_match_kitchen(string $normalized): ?array {
    if (preg_match('/\bkds\b/i', $normalized) || preg_match('/\bkitchen\s+(order|screen|display)/i', $normalized)) {
        return ['intent' => 'navigate', 'confidence' => 0.85, 'target' => ['tabKey' => 'kitchen', 'uniqueKey' => 'kitchen_orders'], 'label' => 'Kitchen Orders'];
    }
    return null;
}

/** "Billing & Checkout" and "billing and checkout" should match each other. */
function ai_normalize_label(string $text): string {
    $text = ai_normalize($text);
    $text = preg_replace('/\band\b/', ' ', $text);
    $text = preg_replace('/\s+/', ' ', $text);
    return trim($text);
}

/** Dynamic "go to X" / "open X" navigation against the live nav menu. */
function ai_match_navigate(string $normalized, array $navIntents): ?array {
    if (!preg_match('/\b(?:go to|open|show(?: me)?|take me to|navigate to)\s+(.+)$/i', $normalized, $m)) {
        return null;
    }
    $target = ai_normalize_label(trim($m[1]));
    $best = null;
    $bestScore = 0;
    foreach ($navIntents as $nav) {
        $label = ai_normalize_label($nav['label']);
        if ($target === $label) {
            $best = $nav;
            $bestScore = 100;
            break;
        }
        if (str_contains($label, $target) || str_contains($target, $label)) {
            $score = strlen($target) > 0 ? similar_text($label, $target) : 0;
            if ($score > $bestScore) {
                $best = $nav;
                $bestScore = $score;
            }
        }
    }
    if ($best) {
        return ['intent' => 'navigate', 'confidence' => 0.75, 'target' => $best['target'], 'label' => $best['label']];
    }
    return null;
}

function ai_match_status(string $normalized): ?array {
    $hasBookingWord = (bool) preg_match('/\bbookings?\b/i', $normalized);
    $hasStatusWord = (bool) preg_match('/\b(how many|status|summary|overview)\b/i', $normalized);
    if (($hasBookingWord && $hasStatusWord) || preg_match('/\btoday.?s?\s+bookings?\b/i', $normalized)) {
        return ['intent' => 'status', 'confidence' => 0.8, 'params' => []];
    }
    return null;
}

function ai_match_greeting(string $normalized): ?array {
    if (preg_match('/^(hi|hello|hey|good (morning|afternoon|evening))\b/i', $normalized)) {
        return ['intent' => 'greeting', 'confidence' => 0.9, 'params' => []];
    }
    return null;
}

function ai_match_help(string $normalized): ?array {
    if (preg_match('/\b(help|what can you do|options|commands)\b/i', $normalized)) {
        return ['intent' => 'help', 'confidence' => 0.85, 'params' => []];
    }
    return null;
}

/**
 * Run every rule in priority order and return the first (highest-priority)
 * match, or null when nothing recognized the message.
 */
function ai_match_offline_intent(string $rawMessage, array $navIntents, PDO $pdo, ?array $pending = null): ?array {
    $normalized = ai_normalize($rawMessage);
    if ($normalized === '') {
        return null;
    }

    $matchers = [
        fn() => ai_match_log_expense($rawMessage, $normalized, $pdo, $pending),
        // Explicit "go to/open/show X" beats keyword-only intents below, so
        // "open billing and checkout" opens that screen instead of firing checkout.
        fn() => ai_match_navigate($normalized, $navIntents),
        fn() => ai_match_kitchen($normalized),
        fn() => ai_match_add_booking($normalized),
        fn() => ai_match_checkout($normalized),
        fn() => ai_match_status($normalized),
        fn() => ai_match_help($normalized),
        fn() => ai_match_greeting($normalized),
    ];

    foreach ($matchers as $matcher) {
        $result = $matcher();
        if ($result !== null) {
            return $result;
        }
    }

    return null;
}
