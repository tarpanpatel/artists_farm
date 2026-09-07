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
// Needed for the same readiness-check + pre-activation ARI push
// channex_channel_activate already requires (router.php) - this file used to
// call activateChannel() directly with none of that, which is exactly how the
// 3 Sep 2026 Patel Colony incident (AVL=0 for every room, every date) happened
// (found 8 Sep 2026 during code review; see the activation step below).
if (is_file(__DIR__ . '/outbox.php')) {
    require_once __DIR__ . '/outbox.php';
}
if (is_file(__DIR__ . '/ari_drain_worker.php')) {
    require_once __DIR__ . '/ari_drain_worker.php';
}

if (!function_exists('airbnbNormalizeHour')) {
    function airbnbNormalizeHour($raw): ?string {
        if ($raw === null || $raw === '') return null;
        if (!is_numeric($raw)) return null;
        $h = (int)$raw;
        if ($h < 0 || $h > 23) return null;
        return str_pad((string)$h, 2, '0', STR_PAD_LEFT) . ':00';
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
 * @param bool $confirmedExistingBookings Same consent gate `channex_channel_activate` requires
 *   before going live - the caller (the onboarding wizard) must have the host explicitly confirm
 *   any pre-existing bookings on this OTA before this function will activate the channel.
 * @param bool $confirmedRateFallback Same consent gate for the flat-default-rate-fallback risk.
 * @return array
 */
function autoProvisionPropertyFromAirbnb(
    PDO $pdo,
    int $propertyId,
    array $selectedListingIds = [],
    ?string $customPropertyName = null,
    bool $confirmedExistingBookings = false,
    bool $confirmedRateFallback = false
): array {
    if ($propertyId <= 0) {
        return ['status' => 'error', 'message' => 'Invalid property ID'];
    }
    // Same two consent gates channex_channel_activate enforces server-side
    // (router.php) - checked here too, up front, so a caller cannot reach
    // activation below without them regardless of which action invokes this
    // function. loadFutureReservations() further down does pull in Airbnb's
    // own existing reservations automatically, but that does not cover a
    // manually-set block on Airbnb's own calendar with no reservation behind
    // it - the host still needs to confirm that themselves.
    if (!$confirmedExistingBookings) {
        return ['status' => 'error', 'message' => 'Confirm any existing bookings on this OTA are already entered in Ground Code before going live', 'http_code' => 422];
    }
    if (!$confirmedRateFallback) {
        return ['status' => 'error', 'message' => 'Confirm you understand dates with no explicit rate will push at this property\'s default rate before going live', 'http_code' => 422];
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
                $listingTitle = trim((string)($listing['title'] ?? "Room " . ($idx + 1)));
                $det = $detailsByListingId[$listingId] ?? null;
                $L = ($det && !empty($det['success'])) ? ($det['data']['listing'] ?? []) : [];
                $PS = is_array($L['pricing_settings'] ?? null) ? $L['pricing_settings'] : $L;
                $defaultTariff = (float)($PS['default_daily_price'] ?? $property['default_tariff'] ?: 2500);

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

    // Step 5: Activate channel connection
    $channelClient->activateChannel($conn['channex_channel_id']);
    upsertChannexChannelConnection($pdo, $propertyId, 'AirBNB', [
        'status' => 'active',
        'last_error' => null,
    ]);

    // Background pull of pre-existing reservations
    try {
        $channelClient->loadFutureReservations($conn['channex_channel_id']);
    } catch (Throwable $e) {}

    // Fetch latest slug for redirect
    $slugStmt = $pdo->prepare("SELECT slug FROM properties WHERE id = ?");
    $slugStmt->execute([$propertyId]);
    $finalSlug = $slugStmt->fetchColumn() ?: $property['slug'];

    return [
        'status' => 'success',
        'message' => 'Property and rooms successfully imported and activated from Airbnb!',
        'property_id' => $propertyId,
        'property_slug' => $finalSlug,
        'redirect_url' => "/{$finalSlug}",
        'rooms_count' => count($roomMappingsToSave),
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

    foreach ($rawListings as $idx => $listing) {
        $listingId = (string)$listing['id'];
        $listingTitle = trim((string)($listing['title'] ?? "Room " . ($idx + 1)));

        if ($idx < count($existingRooms)) {
            $roomId = (int)$existingRooms[$idx]['id'];
            $pdo->prepare("UPDATE properties SET name = ? WHERE id = ?")->execute([$listingTitle, $roomId]);
        } else {
            $roomSlug = $property['slug'] . '-room-' . ($idx + 1) . '-' . substr(md5($listingId), 0, 4);
            try {
                $added = addMultiKeyRoomCore($pdo, $propertyId, $listingTitle, $roomSlug, (float)($property['default_tariff'] ?: 2500));
                $roomId = (int)$added['room_id'];
                $createdCount++;
            } catch (Throwable $e) {
                $maxOrderStmt = $pdo->prepare("SELECT COALESCE(MAX(room_order), 0) FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'");
                $maxOrderStmt->execute([$propertyId]);
                $nextOrder = ((int)$maxOrderStmt->fetchColumn()) + 1;

                $ins = $pdo->prepare("
                    INSERT INTO properties (tenant_id, name, slug, property_type, parent_property_id, room_order, default_tariff, status)
                    VALUES (?, ?, ?, 'MULTI_KEY_ROOM', ?, ?, ?, 'active')
                ");
                $ins->execute([$property['tenant_id'], $listingTitle, $roomSlug, $propertyId, $nextOrder, (float)($property['default_tariff'] ?: 2500)]);
                $roomId = (int)$pdo->lastInsertId();
                $createdCount++;
            }
        }
        $updatedMappings[(string)$roomId] = [
            'external_room_code' => $listingId,
            'external_rate_code' => $listingId,
        ];
    }

    // Run content sync so new rooms exist on Channex
    $syncer = new ChannexContentSyncer($pdo, $channelClient->client ?? new ChannexClient());
    $syncer->syncProperty($propertyId);

    // Fetch updated local rooms
    $statusStmt = $pdo->prepare("
        SELECT p.id AS local_room_id, p.name, m.channex_rate_plan_id
        FROM properties p
        LEFT JOIN channex_mappings m ON m.property_id = ? AND m.room_id = p.id
        WHERE p.parent_property_id = ? AND p.property_type = 'MULTI_KEY_ROOM' AND p.is_deleted = 0
        ORDER BY p.room_order ASC, p.id ASC
    ");
    $statusStmt->execute([$propertyId, $propertyId]);
    $localRooms = $statusStmt->fetchAll(PDO::FETCH_ASSOC);

    return [
        'status' => 'success',
        'message' => "Successfully matched/created {$createdCount} room(s) from Airbnb listings",
        'created_count' => $createdCount,
        'local_rooms' => $localRooms,
        'suggested_mappings' => $updatedMappings,
    ];
}
