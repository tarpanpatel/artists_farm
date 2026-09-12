<?php
/**
 * OTA Automated Property Provisioner
 *
 * Automatically provisions local properties and child rooms directly from
 * connected Airbnb listings, runs Channex content sync, creates channel room
 * mappings, applies comprehensive pricing/rules/amenities, and activates the
 * channel connection in a single automated step.
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/channel_connections.php';
require_once __DIR__ . '/ChannexChannelClient.php';
require_once __DIR__ . '/content_sync.php';
require_once __DIR__ . '/../api/multikey_properties.php';
// DELIBERATELY NOT REQUIRED HERE: outbox.php and ari_drain_worker.php. This file imports from
// an OTA and must never push to one (see the "Step 5" comment in
// autoProvisionPropertyFromAirbnb()), so the push machinery is kept out of its reach entirely -
// nothing on the import request path loads them (verified 9 Sep 2026: router.php requires
// outbox.php only inside the channex_outbox_drain / channex_push_ari cases, and
// multikey_properties.php only inside update_room_tariff), so adding a push here would have to be
// a conscious act of requiring them, not a one-line call that just happens to resolve.
// They were required here between 8 and 9 Sep 2026, when this path still activated the channel.

if (!function_exists('airbnbNormalizeHour')) {
    function airbnbNormalizeHour($raw): ?string {
        if ($raw === null || $raw === '') return null;
        if (!is_numeric($raw)) return null;
        $h = (int)$raw;
        if ($h < 0 || $h > 23) return null;
        return str_pad((string)$h, 2, '0', STR_PAD_LEFT) . ':00';
    }
}

if (!function_exists('normalizeOtaListingTitle')) {
    /**
     * Channex's listing `title` is composed, not the raw Airbnb listing name:
     * it joins the listing's parent title and the unit's own title with a
     * middle dot. On this account every unit's title already begins with the
     * parent's, so rooms imported verbatim came out doubled - "The Designer's
     * Studio · The Designer's Studio ★Central Area★" (found live 12 Sep 2026,
     * reported as "room names are repeating"; all 5 multi-segment titles on
     * Patel Colony had the same shape).
     *
     * Drops a leading segment only when it is genuinely redundant - a
     * case-insensitive prefix of what follows - so a listing legitimately
     * named "A · B" keeps both halves. The remainder is the full listing name
     * as it reads on Airbnb, which is what Ground Code shows and uses.
     */
    function normalizeOtaListingTitle(string $title): string {
        $title = trim($title);
        $parts = explode("\u{00B7}", $title);
        if (count($parts) < 2) return $title;

        $result = trim(array_shift($parts));
        foreach ($parts as $part) {
            $part = trim($part);
            if ($part === '') continue;
            $result = stripos($part, $result) === 0 ? $part : $result . ' ' . "\u{00B7}" . ' ' . $part;
        }
        return $result;
    }
}

/**
 * Auto-provision property and rooms from connected Airbnb account.
 *
 * @param PDO $pdo
 * @param int $propertyId
 * @param array $selectedListingIds List of external Airbnb listing IDs to import (empty = import all)
 * @param string|null $customPropertyName Optional custom name for the property - used ONLY when this
 *   property is not (and is not becoming) a MULTI_KEY parent. A MULTI_KEY parent's name is never
 *   written by this function at all, regardless of this argument - see the CLAUDE.md rule
 *   "OTA Import Must Never Rewrite a Property's Identity" (6 Sep 2026). Passing a name through here
 *   for a multi-listing property is silently ignored for `name` specifically.
 *
 * IMPORT ONLY - this function never writes to the OTA and never activates the channel. See the
 * "Step 5" comment at the end of the function for the full reasoning. It therefore takes no
 * consent gates: `confirmed_existing_bookings` / `confirmed_rate_fallback` belong to
 * `channex_channel_activate`, which is the action that actually pushes.
 *
 * @return array
 */
function autoProvisionPropertyFromAirbnb(
    PDO $pdo,
    int $propertyId,
    array $selectedListingIds = [],
    ?string $customPropertyName = null
): array {
    if ($propertyId <= 0) {
        return ['status' => 'error', 'message' => 'Invalid property ID'];
    }
    $conn = getChannexChannelConnection($pdo, $propertyId, 'AirBNB');
    if (!$conn || empty($conn['channex_channel_id'])) {
        return ['status' => 'error', 'message' => 'No active Airbnb connection found for this property. Please authorize Airbnb first.'];
    }

    $channelClient = new ChannexChannelClient();
    $listingsRes = $channelClient->getChannelListings($conn['channex_channel_id']);
    if (empty($listingsRes['success'])) {
        return ['status' => 'error', 'message' => 'Could not read listings from Airbnb: ' . ($listingsRes['error'] ?? 'Unknown error')];
    }

    $rawListings = $listingsRes['data']['listing_id_dictionary']['values'] ?? [];
    if (empty($rawListings)) {
        return ['status' => 'error', 'message' => 'No listings found in your connected Airbnb account'];
    }

    // Filter to selected listings if specified
    if (!empty($selectedListingIds)) {
        $selectedSet = array_flip(array_map('strval', $selectedListingIds));
        $rawListings = array_values(array_filter($rawListings, fn($l) => isset($selectedSet[(string)($l['id'] ?? '')])));
        if (empty($rawListings)) {
            return ['status' => 'error', 'message' => 'None of the selected listings were found on your Airbnb account'];
        }
    }

    // A listing already imported into ANOTHER property of this tenant is refused outright
    // (9 Sep 2026). One Airbnb listing mapped into two Ground Code properties means both
    // believe they own that calendar and both push availability and rates to it - the two
    // would fight, and the losing push would silently reopen or reprice nights the other
    // just set. That is a double-booking generator, not an untidiness.
    //
    // Enforced HERE, not only by greying out the checkbox: CHANNEX.md 5.4 records a consent
    // control that shipped with its value never sent, so a client-side-only gate on this
    // integration has already failed once. The picker's greying is the courtesy; this is the
    // guarantee.
    $tenantStmt = $pdo->prepare("SELECT tenant_id FROM properties WHERE id = ? AND is_deleted = 0");
    $tenantStmt->execute([$propertyId]);
    $ownerTenantId = (int) ($tenantStmt->fetchColumn() ?: 0);
    if ($ownerTenantId > 0 && function_exists('getClaimedChannexListings')) {
        $claimed = getClaimedChannexListings($pdo, $ownerTenantId, $propertyId, 'AirBNB');
        $blocked = [];
        foreach ($rawListings as $l) {
            $lid = (string) ($l['id'] ?? '');
            if ($lid !== '' && isset($claimed[$lid])) {
                $blocked[] = ($l['title'] ?? $lid) . ' (already in "' . $claimed[$lid]['property_name'] . '")';
            }
        }
        if (!empty($blocked)) {
            return [
                'status' => 'error',
                'http_code' => 409,
                'message' => 'These listings are already imported into another property, so they cannot be added here: '
                    . implode('; ', $blocked)
                    . '. Remove them from that property first if you meant to move them.',
                'blocked_listings' => $blocked,
            ];
        }
    }

    // Concurrent fetch of detailed listing configuration
    $listingIds = array_map(fn($l) => (string)$l['id'], $rawListings);
    $detailsByListingId = $channelClient->getMultipleListingDetails($conn['channex_channel_id'], $listingIds);

    // Fetch local property
    $propStmt = $pdo->prepare("SELECT * FROM properties WHERE id = ? AND is_deleted = 0");
    $propStmt->execute([$propertyId]);
    $property = $propStmt->fetch(PDO::FETCH_ASSOC);
    if (!$property) {
        return ['status' => 'error', 'message' => 'Property not found'];
    }

    $isMultiListing = count($rawListings) > 1;
    $roomMappingsToSave = [];
    $confirmedRooms = [];
    $propertyFields = [];

    // Property-level address and coordinates from the first listing with location info
    foreach ($rawListings as $l) {
        $lid = (string)$l['id'];
        $det = $detailsByListingId[$lid] ?? null;
        $detListing = ($det && !empty($det['success'])) ? ($det['data']['listing'] ?? []) : [];
        if (!empty($detListing)) {
            $addrParts = array_values(array_filter([
                trim((string)($detListing['street'] ?? '')),
                trim((string)($detListing['city'] ?? '')),
                trim((string)($detListing['state'] ?? '')),
                trim((string)($detListing['zipcode'] ?? '')),
            ], fn($v) => $v !== ''));
            if ($addrParts) {
                $propertyFields['address'] = implode(', ', $addrParts);
            }
            if (!empty($detListing['lat']) && !empty($detListing['lng'])) {
                $propertyFields['google_maps_link'] = 'https://maps.google.com/?q=' . $detListing['lat'] . ',' . $detListing['lng'];
            }
            if (!empty($propertyFields['address']) || !empty($propertyFields['google_maps_link'])) {
                break;
            }
        }
    }

    // Determine the property's name. A MULTI_KEY PARENT's name is NEVER
    // derived from a listing title - only $customPropertyName (something a
    // human actually typed) may ever be written to a parent's `name` column.
    // See "OTA Import Must Never Rewrite a Property's Identity" (CLAUDE.md,
    // 6 Sep 2026) - naming a multi-room BUILDING after one of its rooms is
    // exactly the mistake that rule exists to stop, and this function's own
    // multi-listing branch below was doing exactly that (found 8 Sep 2026).
    // The listing-title fallback stays legitimate for a genuinely single-unit
    // property, computed separately just below the branch that needs it -
    // there, "the property" and "the one listing" are the same thing, so
    // naming it from the listing isn't overwriting a separate identity.
    $explicitParentName = trim((string)$customPropertyName);

    // Existing mappings (if this connection was mapped before - e.g. a retry
    // after a partial failure, or re-running this on an already-provisioned
    // property) - a listing already bound to a specific local room keeps that
    // exact binding. Channex's own listing order is not something this app
    // controls or can rely on staying stable between calls, so positional
    // index is only ever a last-resort fallback below, never the primary
    // match (found 8 Sep 2026 - re-running this could previously rename an
    // established room to a different listing's title purely because the
    // order Channex returned listings in had shifted).
    $existingMappingByListingId = [];
    foreach (getChannexChannelRoomMappings($pdo, (int)$conn['id']) as $m) {
        if (!empty($m['external_room_code']) && $m['local_room_id'] !== null) {
            $existingMappingByListingId[(string)$m['external_room_code']] = (int)$m['local_room_id'];
        }
    }

    // The property/room writes below are one business event - either all of
    // it lands (rename/upgrade + every room resolved) or none of it does.
    // Previously unwrapped: a Channex network failure further down (content
    // sync, mapping, activation) could leave the property already renamed and
    // upgraded to MULTI_KEY with only SOME child rooms created, and a retry
    // would then re-enter with a different existingRooms and mis-align
    // everything (found 8 Sep 2026). Committed before the first network call
    // below, matching this project's own convention for exactly this
    // (CLAUDE.md: "commit before the first network call").
    $pdo->beginTransaction();
    try {
        if ($isMultiListing) {
            // Upgrade to MULTI_KEY if not already
            if ($property['property_type'] !== 'MULTI_KEY') {
                if ($explicitParentName !== '') {
                    $pdo->prepare("UPDATE properties SET property_type = 'MULTI_KEY', unit_count = ?, name = ? WHERE id = ?")
                        ->execute([count($rawListings), $explicitParentName, $propertyId]);
                } else {
                    $pdo->prepare("UPDATE properties SET property_type = 'MULTI_KEY', unit_count = ? WHERE id = ?")
                        ->execute([count($rawListings), $propertyId]);
                }
                if (function_exists('populateDefaultExpenses')) {
                    populateDefaultExpenses($pdo, $propertyId);
                }
            } else {
                if ($explicitParentName !== '') {
                    $pdo->prepare("UPDATE properties SET name = ?, unit_count = ? WHERE id = ?")
                        ->execute([$explicitParentName, count($rawListings), $propertyId]);
                } else {
                    $pdo->prepare("UPDATE properties SET unit_count = ? WHERE id = ?")
                        ->execute([count($rawListings), $propertyId]);
                }
            }

            // Fetch existing child rooms
            $roomStmt = $pdo->prepare("SELECT id, name, slug, room_order FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0 ORDER BY room_order ASC, id ASC");
            $roomStmt->execute([$propertyId]);
            $existingRooms = $roomStmt->fetchAll(PDO::FETCH_ASSOC);
            $claimedRoomIds = [];

            foreach ($rawListings as $idx => $listing) {
                $listingId = (string)$listing['id'];
                $listingTitle = normalizeOtaListingTitle((string)($listing["title"] ?? "Room " . ($idx + 1)));
                $det = $detailsByListingId[$listingId] ?? null;
                $L = ($det && !empty($det['success'])) ? ($det['data']['listing'] ?? []) : [];
                $PS = is_array($L['pricing_settings'] ?? null) ? $L['pricing_settings'] : $L;
                // No placeholder fallback (found 11 Sep 2026 - same incident as the removed
                // `?: 3500`/`?: 2500` in content_sync.php, this sibling call site was missed
                // then because the fix only touched content_sync.php's OWN fallback, not the
                // value handed to it). A real Airbnb-reported price wins; otherwise the
                // property's own already-set default_tariff; otherwise 0 - never a fabricated
                // number. This value is written straight into the new room's default_tariff
                // column below, then syncProperty() runs on the same request, so a fabricated
                // non-zero value here would slip past content_sync.php's own
                // `default_tariff <= 0` guard (it only catches an UNSET price, not one that was
                // already faked upstream) and get pushed to the live OTA as a real rate plan.
                // is_numeric() guard mirrors the same field's handling 146 lines below in this
                // file. Without it, a non-scalar shape from Channex (e.g. {amount, currency})
                // casts to 1.0 - a fabricated ₹1 rate that is > 0, so it would sail straight
                // past every "is there a real price?" guard added today, become a genuine
                // Channex rate plan, and bind to the live listing. Exactly the incident class
                // this change set exists to close, just with a different fake number.
                $airbnbPrice = $PS['default_daily_price'] ?? null;
                $defaultTariff = (is_numeric($airbnbPrice) && (float)$airbnbPrice > 0)
                    ? (float)$airbnbPrice
                    : (float)($property['default_tariff'] ?: 0);

                $roomId = null;

                // Priority 1: this listing was already bound to a local room
                // by an earlier run - keep that exact binding.
                if (isset($existingMappingByListingId[$listingId])) {
                    $candidateId = $existingMappingByListingId[$listingId];
                    foreach ($existingRooms as $er) {
                        if ((int)$er['id'] === $candidateId && !isset($claimedRoomIds[$candidateId])) {
                            $roomId = $candidateId;
                            break;
                        }
                    }
                }
                // Priority 2: an existing room nothing has claimed yet this
                // run, taken positionally - only reached for a listing that
                // was never mapped before (first provision, or a genuinely
                // new listing added since).
                if ($roomId === null) {
                    foreach ($existingRooms as $er) {
                        $erId = (int)$er['id'];
                        if (!isset($claimedRoomIds[$erId])) {
                            $roomId = $erId;
                            break;
                        }
                    }
                }

                if ($roomId !== null) {
                    $claimedRoomIds[$roomId] = true;
                    $pdo->prepare("UPDATE properties SET name = ? WHERE id = ?")->execute([$listingTitle, $roomId]);
                } else {
                    // Priority 3: no existing room left to claim - create one.
                    // Was previously wrapped in a catch(Throwable) that fell
                    // through to a raw INSERT bypassing BOTH the 10-room cap
                    // and the unique-slug constraint addMultiKeyRoomCore()
                    // itself enforces (found 8 Sep 2026) - a real failure
                    // (cap reached, slug collision) now surfaces as a real
                    // error instead of being silently worked around.
                    $roomSlug = $property['slug'] . '-room-' . ($idx + 1) . '-' . substr(md5($listingId), 0, 4);
                    $added = addMultiKeyRoomCore($pdo, $propertyId, $listingTitle, $roomSlug, $defaultTariff);
                    $roomId = (int)$added['room_id'];
                    $claimedRoomIds[$roomId] = true;
                }

                $roomMappingsToSave[] = [
                    'local_room_id' => $roomId,
                    'external_room_code' => $listingId,
                    'listing' => $listing,
                    'details' => $L,
                ];
            }
        } else {
            // Single unit property - naming it from its own one listing is not
            // an identity overwrite (there is no separate "parent" here), so
            // the placeholder-name fallback stays legitimate for this branch only.
            $singleUnitName = $explicitParentName;
            if ($singleUnitName === '') {
                $existingName = trim((string)$property['name']);
                if (preg_match('/^(My Property|New Property|Property \d+|.*\'s Property)$/i', $existingName)) {
                    $firstTitle = trim((string)($rawListings[0]['title'] ?? ''));
                    $singleUnitName = $firstTitle !== '' ? $firstTitle : $existingName;
                } else {
                    $singleUnitName = $existingName;
                }
            }

            $listing = $rawListings[0];
            $listingId = (string)$listing['id'];
            $det = $detailsByListingId[$listingId] ?? null;
            $L = ($det && !empty($det['success'])) ? ($det['data']['listing'] ?? []) : [];

            $pdo->prepare("UPDATE properties SET name = ? WHERE id = ?")->execute([$singleUnitName, $propertyId]);

            $roomMappingsToSave[] = [
                'local_room_id' => null,
                'external_room_code' => $listingId,
                'listing' => $listing,
                'details' => $L,
            ];
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return ['status' => 'error', 'message' => 'Could not provision property/rooms: ' . $e->getMessage()];
    }

    // Step 2: Content Sync to Channex (creates/updates Channex properties, room types, rate plans)
    $syncer = new ChannexContentSyncer($pdo, $channelClient->client ?? new ChannexClient());
    $syncer->syncProperty($propertyId);

    // Step 3: Link Channex Channel Mappings and local mappings table
    $localRowsForDb = [];
    // LAUNCH_CHECKLIST.md §2.1 (12 Sep 2026) - a listing whose price couldn't be read (Airbnb
    // omitted default_daily_price, or its details call failed) correctly gets no fabricated
    // price and no channel mapping, parked at sync_status='pending_price' - but this response
    // used to say nothing about it: 'status'=>'success', 'rooms_count'=>count(ALL listings),
    // and a generic "imported" message, with the unpriced unit simply absent from what actually
    // got mapped. Same fix as channex_channel_save_mapping's skipped_no_price (router.php,
    // same day) - still skip (there's genuinely no rate plan to bind yet), but say so.
    $pendingPriceUnits = [];
    foreach ($roomMappingsToSave as $m) {
        $localRoomId = $m['local_room_id'];
        $listingId = $m['external_room_code'];

        $mapStmt = $pdo->prepare("SELECT channex_rate_plan_id FROM channex_mappings WHERE property_id = ? AND (room_id = ? OR (room_id IS NULL AND ? IS NULL)) LIMIT 1");
        $mapStmt->execute([$propertyId, $localRoomId, $localRoomId]);
        $ratePlanId = $mapStmt->fetchColumn();

        if ($ratePlanId) {
            $channelClient->createChannelMapping($conn['channex_channel_id'], (string)$ratePlanId, ['listing_id' => $listingId]);
            $localRowsForDb[] = [
                'local_room_id' => $localRoomId,
                'channex_rate_plan_id' => $ratePlanId,
                'external_room_code' => $listingId,
                'external_rate_code' => $listingId,
            ];
        } else {
            $nameStmt = $pdo->prepare("SELECT name FROM properties WHERE id = ?");
            $nameStmt->execute([$localRoomId ?: $propertyId]);
            $pendingPriceUnits[] = [
                'room_id' => $localRoomId,
                'room_name' => $nameStmt->fetchColumn() ?: ($localRoomId ? "Room #{$localRoomId}" : 'This property'),
            ];
        }

        // Build room configuration payload from listing details
        $L = $m['details'];
        $listingData = $m['listing'];
        $occ = array_values(array_filter(array_map('intval', (array)($listingData['occupancies'] ?? [])), fn($n) => $n > 0));
        $maxCap = $occ ? max($occ) : 2;

        $bs = is_array($L['booking_settings'] ?? null) ? $L['booking_settings'] : [];
        $ci = airbnbNormalizeHour($bs['check_in_time_start'] ?? null);
        $co = airbnbNormalizeHour($bs['check_out_time'] ?? null);

        $PS = is_array($L['pricing_settings'] ?? null) ? $L['pricing_settings'] : $L;

        // Cleaning fee fallback to standard_fees
        $cleaningFee = $PS['cleaning_fee'] ?? null;
        if ($cleaningFee === null || $cleaningFee === '') {
            foreach ((array)($PS['standard_fees'] ?? []) as $fee) {
                if (!is_array($fee)) continue;
                if (($fee['fee_type'] ?? '') !== 'PASS_THROUGH_CLEANING_FEE') continue;
                if (($fee['amount_type'] ?? 'flat') !== 'flat') continue;
                if (isset($fee['amount']) && is_numeric($fee['amount']) && (float)$fee['amount'] > 0) {
                    $cleaningFee = (float)$fee['amount'];
                    break;
                }
            }
        }

        $targetRoomId = $localRoomId ?: $propertyId;
        $roomConf = [
            'room_id' => $targetRoomId,
            'max_capacity' => $maxCap,
        ];

        if (!empty($PS['default_daily_price']) && is_numeric($PS['default_daily_price']) && (float)$PS['default_daily_price'] > 0) {
            $roomConf['default_tariff'] = (float)$PS['default_daily_price'];
        }
        if (!empty($PS['guests_included']) && is_numeric($PS['guests_included']) && (int)$PS['guests_included'] > 0) {
            $roomConf['included_occupancy'] = (int)$PS['guests_included'];
        }
        if (!empty($PS['price_per_extra_person']) && is_numeric($PS['price_per_extra_person'])) {
            $roomConf['extra_guest_charge'] = (float)$PS['price_per_extra_person'];
        }
        if ($cleaningFee !== null && is_numeric($cleaningFee)) {
            $roomConf['cleaning_fee'] = (float)$cleaningFee;
        }
        if (!empty($PS['security_deposit']) && is_numeric($PS['security_deposit'])) {
            $roomConf['security_deposit'] = (float)$PS['security_deposit'];
        }
        if ($ci) $roomConf['checkin_time'] = $ci;
        if ($co) $roomConf['checkout_time'] = $co;

        if (!empty($L['directions']) && is_string($L['directions'])) $roomConf['instructions'] = trim($L['directions']);
        if (!empty($L['house_manual']) && is_string($L['house_manual'])) $roomConf['house_manual'] = trim($L['house_manual']);
        if (!empty($L['wifi_network']) && is_string($L['wifi_network'])) $roomConf['wifi_network'] = trim($L['wifi_network']);
        if (!empty($L['wifi_password']) && is_string($L['wifi_password'])) $roomConf['wifi_password'] = trim($L['wifi_password']);

        $DS = is_array($L['descriptions'] ?? null) ? $L['descriptions'] : [];
        if (!empty($DS['description']) && is_string($DS['description'])) $roomConf['description'] = trim($DS['description']);
        if (!empty($DS['house_rules']) && is_string($DS['house_rules'])) $roomConf['house_rules'] = trim($DS['house_rules']);

        if (isset($L['bedrooms']) && is_numeric($L['bedrooms'])) $roomConf['bedrooms'] = (int)$L['bedrooms'];
        if (isset($L['beds']) && is_numeric($L['beds'])) $roomConf['beds_count'] = (int)$L['beds'];
        if (isset($L['bathrooms']) && is_numeric($L['bathrooms'])) $roomConf['bathrooms'] = (float)$L['bathrooms'];

        $AR = is_array($L['availability_rules'] ?? null) ? $L['availability_rules'] : [];
        if (isset($AR['default_min_nights']) && is_numeric($AR['default_min_nights']) && (int)$AR['default_min_nights'] > 0) {
            $roomConf['default_min_nights'] = (int)$AR['default_min_nights'];
        }
        if (isset($AR['default_max_nights']) && is_numeric($AR['default_max_nights']) && (int)$AR['default_max_nights'] > 0) {
            $roomConf['default_max_nights'] = (int)$AR['default_max_nights'];
        }

        // Amenities
        $amenityKeys = [];
        foreach ((array)($L['amenities'] ?? []) as $aKey => $aVal) {
            if (is_array($aVal) && !empty($aVal['is_present'])) $amenityKeys[] = (string)$aKey;
        }
        if ($amenityKeys) {
            $roomConf['amenities'] = $amenityKeys;
        }

        // Bed configurations
        $bedRooms = [];
        foreach ((array)($L['rooms'] ?? []) as $r) {
            if (!is_array($r) || empty($r['beds'])) continue;
            $beds = [];
            foreach ((array)$r['beds'] as $b) {
                if (!is_array($b) || empty($b['type'])) continue;
                $beds[] = ['type' => (string)$b['type'], 'quantity' => max(1, (int)($b['quantity'] ?? 1))];
            }
            if ($beds) $bedRooms[] = ['room_type' => (string)($r['room_type'] ?? 'room'), 'beds' => $beds];
        }
        if ($bedRooms) {
            $roomConf['bed_configuration'] = $bedRooms;
        }

        $confirmedRooms[] = $roomConf;
    }

    if (!empty($localRowsForDb)) {
        saveChannexChannelRoomMappings($pdo, (int)$conn['id'], $localRowsForDb);
    }

    // Step 4: Apply configuration to properties and rooms
    if (function_exists('applyAirbnbRoomConfig')) {
        applyAirbnbRoomConfig($pdo, $confirmedRooms, $propertyId, !empty($propertyFields) ? $propertyFields : null);
    }

    // Step 5: STOP HERE. This is an IMPORT - the channel is left INACTIVE on purpose.
    //
    // HARD RULE (9 Sep 2026, explicit instruction: "no matter what ... no availability is
    // pushed from app end but only imported"). Adding a property from an OTA must never write
    // to that OTA's calendar, and ACTIVATING IS A WRITE - Channex documents activate as "the
    // connection starts exchanging data with the channel: a full synchronisation pushes
    // availability, rates and restrictions". So there is no version of "activate but push
    // nothing":
    //
    //   - push Ground Code's own view  -> reopens dates the host blocked directly on Airbnb
    //                                     (CHANNEX.md 5.2 - this already happened once) and
    //                                     flattens per-date pricing we cannot even read back
    //                                     (CHANNEX.md 6: "Airbnb's per-date calendar prices
    //                                     CANNOT be read")
    //   - push nothing                 -> Channex syncs its own empty state, leaving AVL=0 on
    //                                     every room and every date (the 3 Sep 2026 Patel
    //                                     Colony incident)
    //
    // Both are outward-facing damage caused by an action the owner only asked to *import*, so
    // this path does neither. The connection is parked at 'ready_to_activate' and the owner
    // goes live later, deliberately, via `channex_channel_activate` - which is where the
    // readiness check, the two consent gates and the pre-activation ARI push correctly live
    // (router.php), and which is reached from ChannelConnectWizard's own "Go Live" step.
    //
    // DO NOT re-add an activateChannel() or enqueueOutboxItem() call here. If a future change
    // needs a push, it belongs behind the owner's own Go Live action, never inside an import.
    upsertChannexChannelConnection($pdo, $propertyId, 'AirBNB', [
        'status' => 'ready_to_activate',
        'last_error' => null,
    ]);

    // Pull reservations that predate the connection. This is a READ, not a push: Channex
    // documents load_future_reservations as running in the background and NOT triggering guest
    // notifications or availability changes, so it is safe on an inactive channel and is
    // exactly the "only imported" half being asked for. Nothing else fetches these - the
    // revisions feed only ever holds unacknowledged events, so a listing's existing bookings
    // never show up on their own (CHANNEX.md 6). Non-fatal: a failed pull must not fail an
    // import that has already written rooms and mappings.
    $reservationsPullStarted = false;
    try {
        $pullRes = $channelClient->loadFutureReservations($conn['channex_channel_id']);
        $reservationsPullStarted = !empty($pullRes['success']);
    } catch (Throwable $e) {}

    // Fetch latest slug for redirect
    $slugStmt = $pdo->prepare("SELECT slug FROM properties WHERE id = ?");
    $slugStmt->execute([$propertyId]);
    $finalSlug = $slugStmt->fetchColumn() ?: $property['slug'];

    $baseMessage = 'Property and rooms imported from Airbnb. Nothing has been sent to Airbnb - '
        . 'the channel is not live yet. Review your rates and blocked dates, then use Go Live '
        . 'when you are ready to start syncing.';
    if (!empty($pendingPriceUnits)) {
        $names = implode(', ', array_map(fn($u) => $u['room_name'], $pendingPriceUnits));
        $baseMessage .= " Note: " . count($pendingPriceUnits) . " unit"
            . (count($pendingPriceUnits) === 1 ? '' : 's') . " could not be mapped yet because "
            . (count($pendingPriceUnits) === 1 ? 'it has' : 'they have') . " no price set ({$names}) - "
            . "add a base price on the Go Live Status page, then re-import to finish mapping.";
    }

    return [
        'status' => 'success',
        'message' => $baseMessage,
        'property_id' => $propertyId,
        'property_slug' => $finalSlug,
        'redirect_url' => "/{$finalSlug}",
        'rooms_count' => count($roomMappingsToSave),
        'mapped_count' => count($localRowsForDb),
        'pending_price_units' => $pendingPriceUnits,
        'channel_active' => false,
        'reservations_pull_started' => $reservationsPullStarted,
    ];
}

/**
 * Auto-create missing rooms from Airbnb listings for an existing property.
 * Used in ChannelConnectWizard Step 3 so hosts don't have to leave the wizard.
 *
 * @param PDO $pdo
 * @param int $propertyId
 * @return array
 */
function autoCreateRoomsFromAirbnbListings(PDO $pdo, int $propertyId): array {
    if ($propertyId <= 0) {
        return ['status' => 'error', 'message' => 'Invalid property ID'];
    }

    $conn = getChannexChannelConnection($pdo, $propertyId, 'AirBNB');
    if (!$conn || empty($conn['channex_channel_id'])) {
        return ['status' => 'error', 'message' => 'No active Airbnb connection for this property'];
    }

    $channelClient = new ChannexChannelClient();
    $listingsRes = $channelClient->getChannelListings($conn['channex_channel_id']);
    if (empty($listingsRes['success'])) {
        return ['status' => 'error', 'message' => 'Could not read listings from Airbnb: ' . ($listingsRes['error'] ?? 'Unknown error')];
    }

    $rawListings = $listingsRes['data']['listing_id_dictionary']['values'] ?? [];
    if (empty($rawListings)) {
        return ['status' => 'error', 'message' => 'No Airbnb listings found'];
    }

    $propStmt = $pdo->prepare("SELECT * FROM properties WHERE id = ? AND is_deleted = 0");
    $propStmt->execute([$propertyId]);
    $property = $propStmt->fetch(PDO::FETCH_ASSOC);
    if (!$property) {
        return ['status' => 'error', 'message' => 'Property not found'];
    }

    // If only 1 listing and single property, nothing to create
    if (count($rawListings) <= 1 && $property['property_type'] === 'SINGLE') {
        return ['status' => 'success', 'message' => 'Single unit property already matches listing count', 'created_count' => 0];
    }

    // Existing mappings - same retry-safe, position-independent matching as
    // autoProvisionPropertyFromAirbnb() above (found 8 Sep 2026: this
    // function had the identical index-based matching risk).
    $existingMappingByListingId = [];
    foreach (getChannexChannelRoomMappings($pdo, (int)$conn['id']) as $m) {
        if (!empty($m['external_room_code']) && $m['local_room_id'] !== null) {
            $existingMappingByListingId[(string)$m['external_room_code']] = (int)$m['local_room_id'];
        }
    }

    $pdo->beginTransaction();
    try {
        // Upgrade to MULTI_KEY if not already
        if ($property['property_type'] !== 'MULTI_KEY') {
            $pdo->prepare("UPDATE properties SET property_type = 'MULTI_KEY', unit_count = ? WHERE id = ?")
                ->execute([count($rawListings), $propertyId]);
            if (function_exists('populateDefaultExpenses')) {
                populateDefaultExpenses($pdo, $propertyId);
            }
        }

        // Fetch existing child rooms
        $roomStmt = $pdo->prepare("SELECT id, name, slug FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0 ORDER BY room_order ASC, id ASC");
        $roomStmt->execute([$propertyId]);
        $existingRooms = $roomStmt->fetchAll(PDO::FETCH_ASSOC);

        $createdCount = 0;
        $updatedMappings = [];
        $claimedRoomIds = [];

        foreach ($rawListings as $idx => $listing) {
            $listingId = (string)$listing['id'];
            $listingTitle = normalizeOtaListingTitle((string)($listing["title"] ?? "Room " . ($idx + 1)));

            $roomId = null;
            if (isset($existingMappingByListingId[$listingId])) {
                $candidateId = $existingMappingByListingId[$listingId];
                foreach ($existingRooms as $er) {
                    if ((int)$er['id'] === $candidateId && !isset($claimedRoomIds[$candidateId])) {
                        $roomId = $candidateId;
                        break;
                    }
                }
            }
            if ($roomId === null) {
                foreach ($existingRooms as $er) {
                    $erId = (int)$er['id'];
                    if (!isset($claimedRoomIds[$erId])) {
                        $roomId = $erId;
                        break;
                    }
                }
            }

            if ($roomId !== null) {
                $claimedRoomIds[$roomId] = true;
                $pdo->prepare("UPDATE properties SET name = ? WHERE id = ?")->execute([$listingTitle, $roomId]);
            } else {
                // No blanket catch here either (found 8 Sep 2026, same class
                // of bug as the sibling function above) - a real failure
                // (10-room cap, slug collision) surfaces as a real error.
                $roomSlug = $property['slug'] . '-room-' . ($idx + 1) . '-' . substr(md5($listingId), 0, 4);
                // Same fix as the sibling function above (11 Sep 2026) - no fabricated 2500
                // placeholder. 0 defers this room's rate-plan creation to
                // sync_status='pending_price' in content_sync.php instead of pushing a fake price.
                $added = addMultiKeyRoomCore($pdo, $propertyId, $listingTitle, $roomSlug, (float)($property['default_tariff'] ?: 0));
                $roomId = (int)$added['room_id'];
                $claimedRoomIds[$roomId] = true;
                $createdCount++;
            }
            $updatedMappings[(string)$roomId] = [
                'external_room_code' => $listingId,
                'external_rate_code' => $listingId,
            ];
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        return ['status' => 'error', 'message' => 'Could not create rooms: ' . $e->getMessage()];
    }

    // Run content sync so new rooms exist on Channex
    $syncer = new ChannexContentSyncer($pdo, $channelClient->client ?? new ChannexClient());
    $syncer->syncProperty($propertyId);

    // Fetch updated local rooms. default_tariff included 12 Sep 2026 to match
    // channex_channel_connection_status's own local_rooms shape - the mapping step reads it
    // to tell "this unit has no price" apart from "content was never synced", and this
    // response feeds the same setCurrentLocalRooms() state in ChannelConnectWizard.tsx.
    $statusStmt = $pdo->prepare("
        SELECT p.id AS local_room_id, p.name, p.default_tariff, m.channex_rate_plan_id
        FROM properties p
        LEFT JOIN channex_mappings m ON m.property_id = ? AND m.room_id = p.id
        WHERE p.parent_property_id = ? AND p.property_type = 'MULTI_KEY_ROOM' AND p.is_deleted = 0
        ORDER BY p.room_order ASC, p.id ASC
    ");
    $statusStmt->execute([$propertyId, $propertyId]);
    $localRooms = $statusStmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($localRooms as &$lr) {
        // PDO hands DECIMAL back as a string; the UI does `> 0` on it.
        $lr['default_tariff'] = $lr['default_tariff'] !== null ? (float)$lr['default_tariff'] : null;
    }
    unset($lr);

    return [
        'status' => 'success',
        'message' => "Successfully matched/created {$createdCount} room(s) from Airbnb listings",
        'created_count' => $createdCount,
        'local_rooms' => $localRooms,
        'suggested_mappings' => $updatedMappings,
    ];
}
