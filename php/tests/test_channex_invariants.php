<?php
/**
 * Channex safety-invariant suite.
 *
 *   php php/tests/test_channex_invariants.php      (exit 0 = pass, 1 = fail)
 *
 * WHY THIS EXISTS
 *
 * On 11-12 Sep 2026 a run of Channex bugs was found by hand, one at a time, after they had
 * already reached a real guest-facing Airbnb listing. Every one of them shared a shape:
 *
 *   **a comment or a label asserting a safety property that the code did not implement.**
 *
 *   - router.php said the import path had "no outward-facing write" - it bound a fabricated
 *     ₹3,500 rate to the live listing.
 *   - content_sync.php's guard blocked any price <= 0 - ota_provisioner.php wrote a fake
 *     ₹2,500 *upstream*, so the guard never saw a zero.
 *   - ari_drain_worker.php said "the loop below skips those dates" - it stripped the rate
 *     from the ENTIRE push, silently discarding real, explicitly-set prices.
 *   - CHANNEX.md said channex_feed_drain.php runs "every 5 min" - it was not in
 *     getCronJobDefinitions() at all, so it had never been scheduled anywhere.
 *   - ChannelConnectionsPage.tsx showed a green "Mapped & Active" badge - it only checked
 *     that a rate plan existed; the channel had never been activated and was pushing nothing.
 *
 * A comment is a claim about the past. It does not run. This file is the same claims
 * written as assertions that DO run, so the next person to reintroduce one of these gets a
 * failing test instead of a guest getting a wrong price.
 *
 * Two kinds of check here, and the split is deliberate:
 *
 *   SOURCE  - reads the code as text (via PHP's own tokenizer, so comments and strings can't
 *             produce false hits). Catches a dangerous *pattern* anywhere in php/channex/,
 *             including in a file that doesn't exist yet. This is what would have caught the
 *             sibling `?: 2500` that sat in ota_provisioner.php after content_sync.php's
 *             identical bug was "fixed".
 *   BEHAVIOUR - runs the real functions against an in-memory SQLite fixture. No MySQL, no
 *             network, no Channex account needed - same zero-setup rule as
 *             test_ai_intents.php next door.
 *
 * ADDING TO THIS FILE: when a Channex bug is fixed, add the invariant it violated here in
 * the same commit. That is the rule this suite exists to enforce on itself.
 */

// Every require happens BEFORE any output: database.php (pulled in transitively by the
// Channex classes) calls header(), which warns once a single byte has been echoed.
// APP_UNIT_TEST_NO_DB makes it skip only its MySQL connection - see that file's own note.
define('APP_UNIT_TEST_NO_DB', true);

$channexDir = __DIR__ . '/../channex';
$repoRoot = dirname(__DIR__, 2);

require_once __DIR__ . '/../cron/cron_jobs.php';
require_once $channexDir . '/ari_drain_worker.php';
require_once $channexDir . '/ChannexAdapter.php';

$pass = 0;
$fail = 0;
$failures = [];

function ok(string $label): void {
    global $pass;
    $pass++;
    echo "  PASS  {$label}\n";
}

function bad(string $label, string $reason): void {
    global $fail, $failures;
    $fail++;
    $failures[] = "{$label}\n          {$reason}";
    echo "  FAIL  {$label}\n        {$reason}\n";
}

function check(string $label, bool $condition, string $reasonIfFalse): void {
    $condition ? ok($label) : bad($label, $reasonIfFalse);
}

/**
 * A file's PHP source with every comment and string literal removed, so a pattern scan can
 * never be fooled by prose. This matters here more than usual: several of these files
 * DOCUMENT the very patterns being banned ("this used to be `?: 3500`"), and a naive grep
 * would fail on its own changelog.
 *
 * Returns an array of [lineNumber, codeText] for the surviving code tokens.
 */
function codeTokensOnly(string $path): array {
    $tokens = token_get_all(file_get_contents($path));
    $out = [];
    // Single-character tokens ('?', ':', '{' ...) arrive as plain strings with no line
    // number attached, so carry the last known one forward. Without this the money-fallback
    // failure - which anchors on a '?' token - reported "content_sync.php:?" and made the
    // reader go hunting for a line the test already knew.
    $lastLine = 0;
    foreach ($tokens as $t) {
        if (is_array($t)) {
            [$id, $text, $line] = $t;
            $lastLine = $line;
            if (in_array($id, [T_COMMENT, T_DOC_COMMENT, T_CONSTANT_ENCAPSED_STRING, T_INLINE_HTML], true)) {
                continue;
            }
            $out[] = [$line, $text];
        } else {
            $out[] = [$lastLine, $t];
        }
    }
    return $out;
}

/** Flat code string (comments/strings stripped) for whole-file pattern scans. */
function codeOnly(string $path): string {
    $s = '';
    foreach (codeTokensOnly($path) as [, $text]) {
        $s .= $text;
    }
    return $s;
}

/**
 * The body of one function, brace-matched from the token stream so that braces inside
 * comments/strings cannot throw off the count.
 */
function functionBody(string $path, string $fnName): ?string {
    $tokens = token_get_all(file_get_contents($path));
    $n = count($tokens);
    for ($i = 0; $i < $n; $i++) {
        $t = $tokens[$i];
        if (!is_array($t) || $t[0] !== T_FUNCTION) continue;
        // next meaningful token should be the name
        for ($j = $i + 1; $j < $n; $j++) {
            $u = $tokens[$j];
            if (is_array($u) && in_array($u[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) continue;
            if (is_array($u) && $u[0] === T_STRING && $u[1] === $fnName) {
                // walk to the opening brace, then brace-match
                $depth = 0;
                $body = '';
                $started = false;
                for ($k = $j; $k < $n; $k++) {
                    $v = $tokens[$k];
                    $txt = is_array($v) ? $v[1] : $v;
                    $isComment = is_array($v) && in_array($v[0], [T_COMMENT, T_DOC_COMMENT], true);
                    if ($txt === '{') { $depth++; $started = true; }
                    if ($started && !$isComment) $body .= $txt;
                    if ($txt === '}') {
                        $depth--;
                        if ($depth === 0 && $started) return $body;
                    }
                }
            }
            break;
        }
    }
    return null;
}

echo "\nChannex safety invariants\n";
echo str_repeat('=', 68) . "\n";

// ---------------------------------------------------------------------------
echo "\nSOURCE invariants (pattern scans over php/channex/)\n";
// ---------------------------------------------------------------------------

/**
 * S1. No fabricated money fallback anywhere in php/channex/.
 *
 * The ₹3,500 incident, and then its sibling ₹2,500 in a second file, and then very nearly a
 * fabricated ₹1 from an unguarded (float) cast. The shape is always the same: `?:` or `??`
 * followed by a hardcoded money-sized number, standing in for a price nobody actually set.
 *
 * Threshold of 100 is deliberate: `?: 0` is the CORRECT modern form (it means "no price",
 * which callers check for), and small integers are legitimately used for counts, occupancy
 * and retry limits. Anything >= 100 in this directory is a currency amount wearing a
 * disguise.
 */
// Walks the token SEQUENCE rather than pattern-matching reconstructed text. The first
// version of this check did the latter and silently caught nothing: PHP's tokenizer splits
// `?:` into separate '?' and ':' tokens, so a regex for a literal "?:" never fired, and the
// suite reported a confident PASS against a deliberately reintroduced `?: 3500`. A test that
// cannot fail is worse than no test - it is this codebase's own headline bug, committed
// inside the file written to prevent it. Caught by mutation-testing every check here before
// trusting any of them; do the same to anything added later.
$moneyFallbackHits = [];
foreach (glob($channexDir . '/*.php') as $file) {
    $toks = array_values(array_filter(
        codeTokensOnly($file),
        fn($t) => trim($t[1]) !== ''           // drop pure whitespace, keep everything else
    ));
    for ($i = 0; $i < count($toks); $i++) {
        $txt = trim($toks[$i][1]);
        $numIdx = null;

        if ($txt === '?' && isset($toks[$i + 1]) && trim($toks[$i + 1][1]) === ':') {
            $numIdx = $i + 2;                  // elvis:  X ?: 3500
        } elseif ($txt === '??') {
            $numIdx = $i + 1;                  // coalesce: X ?? 3500
        }

        if ($numIdx !== null && isset($toks[$numIdx])) {
            $num = trim($toks[$numIdx][1]);
            if (is_numeric($num) && abs((float)$num) >= 100) {
                $moneyFallbackHits[] = basename($file) . ':' . ($toks[$i][0] ?: '?')
                    . "  ({$txt}" . ($txt === '?' ? ':' : '') . " {$num})";
            }
        }
    }
}
check(
    'S1  no hardcoded money fallback (`?: <number>`) in php/channex/',
    empty($moneyFallbackHits),
    empty($moneyFallbackHits) ? '' :
        "A fabricated price fallback is back. This is the ₹3,500 incident's exact shape:\n          "
        . implode("\n          ", $moneyFallbackHits)
        . "\n          If a price is unknown the answer is 0/null (meaning \"not set\"), never an invented number."
);

/**
 * S2. The OTA import path must never push ARI and never activate a channel.
 *
 * CHANNEX.md 5.4a, and the hard rule in CLAUDE.md: "no matter what ... no availability is
 * pushed from app end but only imported". Activation is itself a write (Channex documents it
 * as "a full synchronisation pushes availability, rates and restrictions"), so there is no
 * such thing as "activate but push nothing". ota_provisioner.php already carries a DO NOT
 * RE-ADD comment saying exactly this - which is precisely why it needs a test: the comment
 * cannot stop anyone.
 */
$provisioner = $channexDir . '/ota_provisioner.php';
foreach (['autoProvisionPropertyFromAirbnb', 'autoCreateRoomsFromAirbnbListings'] as $fn) {
    $body = functionBody($provisioner, $fn);
    if ($body === null) {
        bad("S2  import path {$fn}() never activates/enqueues", "Could not find function {$fn}() in ota_provisioner.php - has it been renamed? Update this test rather than deleting it.");
        continue;
    }
    $banned = [];
    if (str_contains($body, 'activateChannel(')) $banned[] = 'activateChannel(';
    if (str_contains($body, 'enqueueOutboxItem(')) $banned[] = 'enqueueOutboxItem(';
    check(
        "S2  {$fn}() never activates a channel or enqueues ARI",
        empty($banned),
        empty($banned) ? '' :
            'Found ' . implode(' and ', $banned) . " inside an IMPORT path.\n          "
            . "An import must never push or activate (CHANNEX.md 5.4a). Going live belongs behind\n          "
            . "the owner's own Go Live action, where the push-confirmation gate lives."
    );
}

/**
 * S3. Doc drift: every cron named in CHANNEX.md's own table must actually be registered.
 *
 * CHANNEX.md described channex_feed_drain.php as running "every 5 min" while it was absent
 * from getCronJobDefinitions() entirely - so on a fresh environment the only backstop for a
 * missed OTA booking would never have been scheduled at all. A document is not a scheduler.
 */
$channexMd = file_get_contents($repoRoot . '/CHANNEX.md');
preg_match_all('/^\|\s*`(channex_[a-z_]+\.php)`\s*\|/m', $channexMd, $cronMatches);
$documentedCrons = array_unique($cronMatches[1] ?? []);

$registeredScripts = array_map(fn($d) => basename($d['script_path']), getCronJobDefinitions());

$unregistered = array_values(array_diff($documentedCrons, $registeredScripts));
check(
    'S3  every cron documented in CHANNEX.md is registered in getCronJobDefinitions()',
    empty($unregistered) && !empty($documentedCrons),
    empty($documentedCrons)
        ? "Parsed ZERO cron rows out of CHANNEX.md - the table format changed and this check has gone blind. Fix the pattern, don't delete the check."
        : "Documented but never scheduled: " . implode(', ', $unregistered)
          . "\n          A job missing here is never run on a fresh environment, however confidently the docs describe its cadence."
);

// ---------------------------------------------------------------------------
echo "\nBEHAVIOUR invariants (in-memory SQLite, no MySQL/network)\n";
// ---------------------------------------------------------------------------

/** A minimal schema with just the columns these code paths actually read. */
function makeFixtureDb(): PDO {
    $db = new PDO('sqlite::memory:');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec("CREATE TABLE properties (id INTEGER PRIMARY KEY, name TEXT, default_tariff REAL, pricing_mode TEXT,
        included_occupancy INTEGER DEFAULT 2, extra_guest_charge REAL DEFAULT 0, max_capacity INTEGER DEFAULT 2)");
    $db->exec("CREATE TABLE room_rate_rules (id INTEGER PRIMARY KEY, property_id INT, room_id INT NULL,
        start_date TEXT, end_date TEXT, rate_per_night REAL NULL, rule_name TEXT NULL,
        min_stay_arrival INT NULL, min_stay_through INT NULL, max_stay INT NULL,
        stop_sell INT DEFAULT 0, closed_to_arrival INT DEFAULT 0, closed_to_departure INT DEFAULT 0,
        days_of_week TEXT NULL, rule_type TEXT DEFAULT 'fixed', created_at TEXT)");
    $db->exec("CREATE TABLE channex_mappings (id INTEGER PRIMARY KEY, property_id INT, room_id INT NULL,
        sell_mode TEXT, channex_property_id TEXT, channex_room_type_id TEXT, channex_rate_plan_id TEXT,
        sync_status TEXT DEFAULT 'active')");
    return $db;
}

/** AriDrainWorker without its real constructor (which would build a live ChannexClient). */
function makeWorker(PDO $db): AriDrainWorker {
    $rc = new ReflectionClass('AriDrainWorker');
    $w = $rc->newInstanceWithoutConstructor();
    $p = $rc->getProperty('pdo');
    $p->setAccessible(true);
    $p->setValue($w, $db);
    return $w;
}

/**
 * B1. A unit with NO base tariff but a real, explicit rate rule must still push that rule's
 * rate.
 *
 * This is the 12 Sep regression, caught in review hours after it shipped. The first version
 * of the no-fabricated-price guard removed `rate_per_night` from the WHOLE push whenever the
 * base tariff was <= 0 - so a property with no base rate but a deliberate ₹8,000 Christmas
 * price pushed no rate for Christmas either. It then returned [] -> no_op -> markRowsDone(),
 * so the owner saw "saved successfully", the outbox row read `done`, and the OTA kept the old
 * price indefinitely. Silent in every direction.
 *
 * The control (a property identical but for having a base tariff) must produce the SAME
 * payload - that equality is the real assertion.
 */
$db = makeFixtureDb();
$db->exec("INSERT INTO properties (id, default_tariff, pricing_mode) VALUES (100, NULL, 'variable')");
$db->exec("INSERT INTO properties (id, default_tariff, pricing_mode) VALUES (200, 4000, 'variable')");
foreach ([100, 200] as $pid) {
    $db->exec("INSERT INTO room_rate_rules (property_id, room_id, start_date, end_date, rate_per_night, rule_type, created_at)
               VALUES ({$pid}, NULL, '2026-12-20', '2026-12-25', 8000, 'fixed', '2026-09-12')");
    $db->exec("INSERT INTO channex_mappings (property_id, room_id, sell_mode, channex_rate_plan_id)
               VALUES ({$pid}, NULL, 'per_room', 'rp-{$pid}')");
}
$worker = makeWorker($db);

$noBase = $worker->computeCompressedRestrictions(100, null, '2026-12-20', '2026-12-25', ['rate_per_night']);
$withBase = $worker->computeCompressedRestrictions(200, null, '2026-12-20', '2026-12-25', ['rate_per_night']);

check(
    'B1  explicit rate rule still pushes when the property has NO base tariff',
    !empty($noBase) && (float)($noBase[0]['rate'] ?? 0) === 8000.0,
    'Expected the ₹8,000 rule to be pushed; got ' . json_encode($noBase)
    . "\n          A missing BASE price must not suppress dates that carry a real, explicit price."
);
check(
    'B1b no-base-tariff payload matches the with-base-tariff control exactly',
    json_encode($noBase) === json_encode($withBase),
    'Payloads diverge.' . "\n          no base: " . json_encode($noBase) . "\n          with base: " . json_encode($withBase)
);

/**
 * B2. The other half of the same rule: a date whose ONLY possible price would be a
 * non-existent base tariff must send no rate at all - not 0, not an invented number.
 *
 * Sending 0 would publish "free" to every connected OTA; sending a placeholder is the
 * original incident. Omitting the key leaves whatever the OTA already has, which is the
 * honest outcome when Ground Code genuinely does not know the price.
 */
$uncovered = $worker->computeCompressedRestrictions(100, null, '2027-03-01', '2027-03-05', ['rate_per_night']);
$hasAnyRate = false;
foreach ($uncovered as $range) {
    if (array_key_exists('rate', $range) || array_key_exists('rates', $range)) $hasAnyRate = true;
}
check(
    'B2  unpriced dates send no rate at all (never 0, never a placeholder)',
    !$hasAnyRate,
    'A rate was emitted for dates with no price of any kind: ' . json_encode($uncovered)
);

/**
 * B3. A `pending_price` mapping row - a real row carrying an EMPTY channex_rate_plan_id -
 * must be reported as "no mapping".
 *
 * Being merely truthy, such a row (a) permanently disabled the "no mapping -> re-sync"
 * self-heal, so a unit stayed unpriced forever even after the owner finally entered a rate,
 * and (b) sent `rate_plan_id: ""` to Channex on every attempt, failing forever - the same
 * endless-retry shape as the documented "74th identical attempt" incident.
 */
$db2 = makeFixtureDb();
$db2->exec("INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sync_status)
            VALUES (300, NULL, 'cp-1', 'rt-1', '', 'pending_price')");
$db2->exec("INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id, sync_status)
            VALUES (301, NULL, 'cp-2', 'rt-2', 'rp-real', 'active')");

$rcA = new ReflectionClass('ChannexAdapter');
$adapter = $rcA->newInstanceWithoutConstructor();
$pA = $rcA->getProperty('pdo');
$pA->setAccessible(true);
$pA->setValue($adapter, $db2);
$getMapping = $rcA->getMethod('getMapping');
$getMapping->setAccessible(true);

check(
    'B3  getMapping() reports an empty rate-plan id as NO mapping (so the self-heal runs)',
    $getMapping->invoke($adapter, 300, null) === null,
    'A pending_price row was returned as a usable mapping - the re-sync self-heal will never run for it, and every push will send rate_plan_id:"" forever.'
);
check(
    'B3b getMapping() still returns a genuine mapping unchanged',
    is_array($getMapping->invoke($adapter, 301, null)),
    'A real, fully-mapped row was reported as missing - this would trigger pointless content re-syncs on every push.'
);

/**
 * B4. A SINGLE-unit property's rate rules must actually be found.
 *
 * Both `channex_mappings.room_id` and `room_rate_rules.room_id` are NULL for a single-unit
 * property, and the audit joined them with a bare `rr.room_id = m.room_id`. In SQL
 * `NULL = NULL` is NULL, not true - so the join matched nothing, MAX(end_date) came back
 * NULL, and the daily audit reported "rate coverage: never" for a property that had full
 * day-of-week pricing running to March 2027. It was structurally incapable of seeing the rate
 * rules of ANY single-unit property.
 *
 * Found 12 Sep 2026 only because the owner said "you're wrong, I always had dynamic pricing"
 * - the alert had been firing every morning and had been repeated back to them as fact. The
 * control below (a MULTI_KEY room, where room_id is a real integer) is what made the bug
 * invisible: that half always worked.
 */
require_once $channexDir . '/sync_audit.php';
$db3 = makeFixtureDb();
// 400: SINGLE unit - mapping and rules both carry room_id NULL
$db3->exec("INSERT INTO properties (id, name, default_tariff, pricing_mode) VALUES (400, 'Single Unit Property', 20000, 'variable')");
$db3->exec("INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id)
            VALUES (400, NULL, 'cp-400', 'rt-400', 'rp-400')");
$db3->exec("INSERT INTO room_rate_rules (property_id, room_id, start_date, end_date, rate_per_night, days_of_week, rule_type, created_at)
            VALUES (400, NULL, '2026-09-11', '2027-03-30', 14000, 'mo,tu,we,th', 'fixed', '2026-09-11')");
// 401: MULTI_KEY room - the control. This half always worked, which is why the bug hid.
$db3->exec("INSERT INTO properties (id, name, default_tariff, pricing_mode) VALUES (401, 'Multi Key Parent', 5000, 'variable')");
$db3->exec("INSERT INTO properties (id, name, default_tariff, pricing_mode) VALUES (4011, 'Room One', 5000, 'variable')");
$db3->exec("INSERT INTO channex_mappings (property_id, room_id, channex_property_id, channex_room_type_id, channex_rate_plan_id)
            VALUES (401, 4011, 'cp-401', 'rt-401', 'rp-401')");
$db3->exec("INSERT INTO room_rate_rules (property_id, room_id, start_date, end_date, rate_per_night, rule_type, created_at)
            VALUES (401, 4011, '2026-09-11', '2027-03-30', 6000, 'fixed', '2026-09-11')");

$coverageProblems = auditChannexRateCoverage($db3, [400, 401], '2026-12-01');
$flaggedNames = array_map(fn($p) => $p['room'], $coverageProblems);

check(
    'B4  a SINGLE-unit property\'s own rate rules are found (NULL room_id joins correctly)',
    empty($coverageProblems),
    'Reported rate coverage missing for: ' . implode(', ', $flaggedNames)
    . "\n          Both sides of the join are NULL for a single-unit property, and NULL = NULL is not true in SQL."
    . "\n          This exact false alarm was filed every morning against a property with full day-of-week pricing."
);

// ---------------------------------------------------------------------------
echo "\n" . str_repeat('=', 68) . "\n";
echo "Channex invariants: {$pass}/" . ($pass + $fail) . " passed\n";
if ($failures) {
    echo "\nFailures:\n";
    foreach ($failures as $f) {
        echo "  - {$f}\n";
    }
    echo "\nEach of these encodes a bug that already reached a live Airbnb listing once.\n";
}
exit($fail > 0 ? 1 : 0);
