<?php
/**
 * Push Confirmation Gate — preflight + typed confirmation
 *
 * Added 9 Sep 2026. Everything here exists because of one asymmetry: a push to an OTA is
 * irreversible in practice, and we cannot read back what we are about to replace. Airbnb's
 * per-date calendar prices "CANNOT be read" (CHANNEX.md §6) and a date the host blocked
 * directly on Airbnb's own calendar is invisible to us entirely (§5.2). So there is no undo
 * to build and no "restore previous values" to offer — the only protection possible is to
 * make the owner look at what is about to go out, before it goes out.
 *
 * The gate has three steps, and each one is a different KIND of check:
 *
 *   1. Rates    — VERIFIED. We can work out which nights carry no explicit price and would
 *                 therefore push the flat default. So we don't ask the owner to promise they
 *                 set prices; we show them the nights and the number that would be sent.
 *   2. Openings — ATTESTED, but concrete. We cannot see the host's manual Airbnb blocks, so
 *                 only they can catch this. What we CAN do is list the exact dates we are
 *                 about to mark bookable, so the check is "scan this list" rather than
 *                 "remember whether you blocked anything".
 *   3. Typed    — the property's own name, not a fixed word. A fixed word becomes muscle
 *                 memory across properties, and pushing to the WRONG property is as damaging
 *                 as pushing the wrong values.
 *
 * Everything in this file is READ-ONLY and touches no network: the two compute* calls are
 * plain DB reads on the same code path the real push uses (deliberately — a preview computed
 * a second way would eventually disagree with the push and be worse than showing nothing).
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/outbox.php';
require_once __DIR__ . '/ari_drain_worker.php';

if (!function_exists('channexPushPreflightRange')) {
    /**
     * The date window every wide push uses. Kept in one place so the preflight can never
     * describe a different range than the push that follows it.
     */
    function channexPushPreflightRange(): array {
        return [date('Y-m-d'), date('Y-m-d', strtotime('+500 days'))];
    }
}

if (!function_exists('buildChannexPushPreflight')) {
    /**
     * Builds the full "here is what is about to be sent" report for one property.
     *
     * @return array {
     *   property_id, property_name, confirmation_phrase, date_from, date_to,
     *   rooms: [{ room_id, room_name, pricing_mode, default_tariff, total_nights,
     *             uncovered_nights, uncovered_ranges: [{from,to,nights}],
     *             opening_nights, opening_ranges: [{from,to,nights}] }],
     *   totals: { rooms, uncovered_nights, opening_nights }
     * }
     */
    function buildChannexPushPreflight(PDO $pdo, int $propertyId, ?string $from = null, ?string $to = null): array {
        // The caller's own range when it has one - ChannelManager lets the owner narrow the
        // window, and a preflight that always described 500 days would over-report what a
        // narrower push actually touches. Falls back to the Go Live range, which is what
        // channex_channel_activate pushes.
        [$defFrom, $defTo] = channexPushPreflightRange();
        $valid = static fn($d) => is_string($d) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $d) === 1;
        $from = $valid($from) ? $from : $defFrom;
        $to = $valid($to) ? $to : $defTo;
        // Channex rejects past dates, so a push never really starts before today however the
        // range was chosen - the preview must not claim otherwise.
        if ($from < $defFrom) $from = $defFrom;
        if ($to < $from) $to = $from;

        $propStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ? AND is_deleted = 0");
        $propStmt->execute([$propertyId]);
        $propertyName = (string) ($propStmt->fetchColumn() ?: '');

        // Same room resolution the push itself uses. Hardcoding null here is CHANNEX.md §5.1,
        // the bug that shipped AVL=0 to two live channels - a preflight that enumerated rooms
        // differently from the push would report on rooms that never get pushed, or miss ones
        // that do.
        $roomIds = function_exists('getChannexPushRoomIds')
            ? getChannexPushRoomIds($pdo, $propertyId)
            : [null];

        $worker = new AriDrainWorker($pdo);
        $nameStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ?");

        $rooms = [];
        $totalUncovered = 0;
        $totalOpening = 0;

        foreach ($roomIds as $roomId) {
            $coverage = $worker->computeRateCoverage($propertyId, $roomId, $from, $to);

            // computeCompressedAvailability() returns the wire format: {date_from, date_to,
            // availability}. availability >= 1 is the OTA being told "this is bookable", which
            // is precisely the set of dates that would overwrite a manual block.
            $openingDates = [];
            foreach ($worker->computeCompressedAvailability($propertyId, $roomId, $from, $to) as $range) {
                if ((int) ($range['availability'] ?? 0) < 1) continue;
                $cur = strtotime($range['date_from']);
                $end = strtotime($range['date_to']);
                while ($cur <= $end) {
                    $openingDates[] = date('Y-m-d', $cur);
                    $cur = strtotime('+1 day', $cur);
                }
            }

            $roomName = $propertyName;
            if ($roomId) {
                $nameStmt->execute([$roomId]);
                $roomName = (string) ($nameStmt->fetchColumn() ?: ('Room ' . $roomId));
            }

            $rooms[] = [
                'room_id'          => $roomId,
                'room_name'        => $roomName,
                'pricing_mode'     => $coverage['pricing_mode'],
                'default_tariff'   => $coverage['default_tariff'],
                'total_nights'     => $coverage['total_nights'],
                'uncovered_nights' => $coverage['uncovered_nights'],
                'uncovered_ranges' => $coverage['uncovered_ranges'],
                'opening_nights'   => count($openingDates),
                'opening_ranges'   => channexCompressDateList($openingDates),
            ];
            $totalUncovered += $coverage['uncovered_nights'];
            $totalOpening += count($openingDates);
        }

        return [
            'property_id'         => $propertyId,
            'property_name'       => $propertyName,
            'confirmation_phrase' => $propertyName,
            'date_from'           => $from,
            'date_to'             => $to,
            'rooms'               => $rooms,
            'totals'              => [
                'rooms'            => count($rooms),
                'uncovered_nights' => $totalUncovered,
                'opening_nights'   => $totalOpening,
            ],
        ];
    }
}

if (!function_exists('channexTypedConfirmationMatches')) {
    /**
     * Compares the owner's typed confirmation against the property name.
     *
     * Forgiving about case, surrounding space, runs of whitespace and the curly/straight
     * apostrophe split (property names here genuinely contain both - "The Artists' Farm"),
     * because the point of typing is to force a deliberate pause, not to test typing accuracy.
     * A gate people cannot pass gets worked around; a gate that rejects "artists farm" for
     * "Artists Farm" trains them to paste, which defeats it just as thoroughly.
     */
    function channexTypedConfirmationMatches(?string $typed, string $propertyName): bool {
        $norm = static function (string $v): string {
            $v = str_replace(["\xE2\x80\x99", "\xE2\x80\x98", "\xC2\xA0"], ["'", "'", ' '], $v);
            $v = preg_replace('/\s+/u', ' ', $v);
            return mb_strtolower(trim((string) $v));
        };
        $propertyName = trim($propertyName);
        if ($propertyName === '') return false;
        return $norm((string) $typed) === $norm($propertyName);
    }
}

if (!function_exists('requireChannexPushConfirmation')) {
    /**
     * Server-side half of the gate. Returns null when the push may proceed, or an error array
     * (with http_code) to return to the caller.
     *
     * This is NOT belt-and-braces. CHANNEX.md §5.4 records a consent checkbox that shipped
     * with its value never actually sent - the UI looked like a gate and enforced nothing. Any
     * push path that can reach an OTA has to check here, not just render a nice dialog.
     */
    function requireChannexPushConfirmation(PDO $pdo, int $propertyId, ?string $typed): ?array {
        $stmt = $pdo->prepare("SELECT name FROM properties WHERE id = ? AND is_deleted = 0");
        $stmt->execute([$propertyId]);
        $name = (string) ($stmt->fetchColumn() ?: '');

        if ($name === '') {
            return ['status' => 'error', 'message' => 'Property not found', 'http_code' => 404];
        }
        if (!channexTypedConfirmationMatches($typed, $name)) {
            return [
                'status'   => 'error',
                'message'  => 'Type the property name exactly (' . $name . ') to confirm this push. '
                    . 'It replaces prices and availability on every connected channel and cannot be undone.',
                'expected' => $name,
                'http_code' => 422,
            ];
        }
        return null;
    }
}
