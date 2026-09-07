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
 * @param string|null $customPropertyName Optional custom name for the property
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

    // Determine parent property title
    $parentName = trim((string)$customPropertyName);
    if ($parentName === '') {
        $existingName = trim((string)$property['name']);
        // If current name is generic placeholder, use first listing title or clean homestay title
        if (preg_match('/^(My Property|Rajesh\'s Property|New Property|Property \d+|.*\'s Property)$/i', $existingName)) {
            $firstTitle = trim((string)($rawListings[0]['title'] ?? ''));
            $parentName = $firstTitle !== '' ? $firstTitle : $existingName;
        } else {
            $parentName = $existingName;
        }
    }

    if ($isMultiListing) {
        // Upgrade to MULTI_KEY if not already
        if ($property['property_type'] !== 'MULTI_KEY') {
            $pdo->prepare("UPDATE properties SET property_type = 'MULTI_KEY', unit_count = ?, name = ? WHERE id = ?")
                ->execute([count($rawListings), $parentName, $propertyId]);
            if (function_exists('populateDefaultExpenses')) {
                populateDefaultExpenses($pdo, $propertyId);
            }
        } else {
            $pdo->prepare("UPDATE properties SET name = ?, unit_count = ? WHERE id = ?")
                ->execute([$parentName, count($rawListings), $propertyId]);
        }

        // Fetch existing child rooms
        $roomStmt = $pdo->prepare("SELECT id, name, slug, room_order FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM' AND is_deleted = 0 ORDER BY room_order ASC, id ASC");
        $roomStmt->execute([$propertyId]);
        $existingRooms = $roomStmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rawListings as $idx => $listing) {
            $listingId = (string)$listing['id'];
            $listingTitle = trim((string)($listing['title'] ?? "Room " . ($idx + 1)));
            $det = $detailsByListingId[$listingId] ?? null;
            $L = ($det && !empty($det['success'])) ? ($det['data']['listing'] ?? []) : [];
            $PS = is_array($L['pricing_settings'] ?? null) ? $L['pricing_settings'] : $L;
            $defaultTariff = (float)($PS['default_daily_price'] ?? $property['default_tariff'] ?: 2500);

            if ($idx < count($existingRooms)) {
                // Update/adopt existing room
                $roomId = (int)$existingRooms[$idx]['id'];
                $pdo->prepare("UPDATE properties SET name = ? WHERE id = ?")->execute([$listingTitle, $roomId]);
            } else {
                // Create new room
                $roomSlug = $property['slug'] . '-room-' . ($idx + 1) . '-' . substr(md5($listingId), 0, 4);
                try {
                    $added = addMultiKeyRoomCore($pdo, $propertyId, $listingTitle, $roomSlug, $defaultTariff);
                    $roomId = (int)$added['room_id'];
                } catch (Throwable $e) {
                    // Fallback direct insert if addMultiKeyRoomCore limit is hit
                    $maxOrderStmt = $pdo->prepare("SELECT COALESCE(MAX(room_order), 0) FROM properties WHERE parent_property_id = ? AND property_type = 'MULTI_KEY_ROOM'");
                    $maxOrderStmt->execute([$propertyId]);
                    $nextOrder = ((int)$maxOrderStmt->fetchColumn()) + 1;

                    $ins = $pdo->prepare("
                        INSERT INTO properties (tenant_id, name, slug, property_type, parent_property_id, room_order, default_tariff, status)
                        VALUES (?, ?, ?, 'MULTI_KEY_ROOM', ?, ?, ?, 'active')
                    ");
                    $ins->execute([$property['tenant_id'], $listingTitle, $roomSlug, $propertyId, $nextOrder, $defaultTariff]);
                    $roomId = (int)$pdo->lastInsertId();
                }
            }

            $roomMappingsToSave[] = [
                'local_room_id' => $roomId,
                'external_room_code' => $listingId,
                'listing' => $listing,
                'details' => $L,
            ];
        }
    } else {
        // Single unit property
        $listing = $rawListings[0];
        $listingId = (string)$listing['id'];
        $det = $detailsByListingId[$listingId] ?? null;
        $L = ($det && !empty($det['success'])) ? ($det['data']['listing'] ?? []) : [];

        $pdo->prepare("UPDATE properties SET name = ? WHERE id = ?")->execute([$parentName, $propertyId]);

        $roomMappingsToSave[] = [
            'local_room_id' => null,
            'external_room_code' => $listingId,
            'listing' => $listing,
            'details' => $L,
        ];
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
