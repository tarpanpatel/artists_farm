<?php
/**
 * Occupancy pricing and per-stay fees.
 *
 * Ground Code could previously express exactly one number for a stay - a nightly
 * rate - so a real "first N guests included, then X per head" structure had
 * nowhere to live and survived only on the OTAs' own pricing screens. Staff
 * quoted one number and the guest paid another; the Channex integration guide
 * calls that out as the two-sources-of-price-truth trap.
 *
 * This is the ONE place that turns a nightly subtotal plus a guest count into the
 * amount actually owed. Both quote paths - the public booking engine
 * (public_booking.php) and staff booking holds (booking_holds.php) - had a
 * byte-for-byte identical date loop already; adding a second copy of the
 * occupancy maths alongside them is how the two would drift into quoting
 * different totals for the same stay.
 *
 * Added 6 Sep 2026.
 */

/**
 * Read a unit's occupancy-pricing configuration, falling back to its parent.
 *
 * A MULTI_KEY room is what a guest actually books, so its own row wins - but a
 * room that has never been given its own values inherits the parent's rather
 * than silently pricing every extra guest at zero. Room-level 0 genuinely means
 * "free", so the fallback is keyed on the row being absent/unset, not on 0.
 */
function getOccupancyPricingConfig(PDO $pdo, int $unitId): array {
    $defaults = [
        'included_occupancy' => 2,
        'extra_guest_charge' => 0.0,
        'cleaning_fee' => 0.0,
        'security_deposit' => 0.0,
        'max_capacity' => 0,
    ];
    if ($unitId <= 0) return $defaults;

    try {
        $stmt = $pdo->prepare(
            "SELECT included_occupancy, extra_guest_charge, cleaning_fee, security_deposit, max_capacity, parent_property_id
             FROM properties WHERE id = ? AND is_deleted = 0 LIMIT 1"
        );
        $stmt->execute([$unitId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return $defaults;

        $cfg = [
            'included_occupancy' => (int)($row['included_occupancy'] ?? 2),
            'extra_guest_charge' => (float)($row['extra_guest_charge'] ?? 0),
            'cleaning_fee' => (float)($row['cleaning_fee'] ?? 0),
            'security_deposit' => (float)($row['security_deposit'] ?? 0),
            'max_capacity' => (int)($row['max_capacity'] ?? 0),
        ];

        // Inherit from the parent only for the fields this room has genuinely
        // never been configured with. included_occupancy is NOT NULL with a
        // default of 2, so it is always meaningful and never inherited.
        if (!empty($row['parent_property_id']) && ($cfg['extra_guest_charge'] <= 0 || $cfg['cleaning_fee'] <= 0)) {
            $p = $pdo->prepare("SELECT extra_guest_charge, cleaning_fee, security_deposit FROM properties WHERE id = ? AND is_deleted = 0 LIMIT 1");
            $p->execute([(int)$row['parent_property_id']]);
            if ($parent = $p->fetch(PDO::FETCH_ASSOC)) {
                if ($cfg['extra_guest_charge'] <= 0) $cfg['extra_guest_charge'] = (float)($parent['extra_guest_charge'] ?? 0);
                if ($cfg['cleaning_fee'] <= 0) $cfg['cleaning_fee'] = (float)($parent['cleaning_fee'] ?? 0);
                if ($cfg['security_deposit'] <= 0) $cfg['security_deposit'] = (float)($parent['security_deposit'] ?? 0);
            }
        }
        return $cfg;
    } catch (Exception $e) {
        // A missing column (schema not yet self-healed on this environment) must
        // never take a booking down - quoting the room rate alone is wrong by the
        // extra-guest amount, but refusing to quote at all is worse.
        return $defaults;
    }
}

/**
 * Turn a nightly subtotal into what the guest actually owes.
 *
 * $nightlySubtotal - sum of each night's room rate, already computed by the
 *                    caller's own date loop (rate rules, weekday rules, etc).
 *
 * Returns a breakdown rather than one number, because every consumer needs a
 * different slice of it: the booking row stores the grand total, the voucher
 * itemises, and the deposit must be reported WITHOUT being added to revenue.
 */
function computeStayCharges(PDO $pdo, int $unitId, float $nightlySubtotal, int $numGuests, int $nights): array {
    $cfg = getOccupancyPricingConfig($pdo, $unitId);
    $nights = max(1, $nights);
    $numGuests = max(1, $numGuests);

    // Deliberately NOT capped at max_capacity. If someone is booked in over
    // capacity that is a problem to surface, not a discount to hand out - and
    // silently charging for fewer heads than are staying is the kind of quiet
    // revenue leak nobody notices for months.
    $extraGuests = max(0, $numGuests - max(1, $cfg['included_occupancy']));
    $extraGuestTotal = round($extraGuests * $cfg['extra_guest_charge'] * $nights, 2);

    // The extra-guest charge is per night, so it belongs in the nightly average.
    // The cleaning fee is once per stay and must not be, or a 2-night stay would
    // appear to have a higher nightly rate than a 5-night one at the same rate.
    $roomTotal = round($nightlySubtotal + $extraGuestTotal, 2);
    $cleaningFee = round($cfg['cleaning_fee'], 2);

    return [
        'nightly_subtotal' => round($nightlySubtotal, 2),
        'included_occupancy' => (int)$cfg['included_occupancy'],
        'extra_guests' => $extraGuests,
        'extra_guest_rate' => round($cfg['extra_guest_charge'], 2),
        'extra_guest_total' => $extraGuestTotal,
        'cleaning_fee' => $cleaningFee,
        // Held against damage and returned at checkout - reported so a voucher can
        // state it, never added to the total, because it is not revenue.
        'security_deposit' => round($cfg['security_deposit'], 2),
        'avg_nightly_rate' => round($roomTotal / $nights, 2),
        'total' => round($roomTotal + $cleaningFee, 2),
    ];
}
