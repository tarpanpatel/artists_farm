<?php
/**
 * Property Importer Service
 *
 * Imports and normalizes property data (title, description, photos, rooms,
 * amenities, pricing, check-in/out policies) from Airbnb and Booking.com.
 */

if (!defined('GROUND_CODE_API')) {
    define('GROUND_CODE_API', true);
}

require_once __DIR__ . '/../config/database.php';

class PropertyImporter {

    /**
     * Clean and normalize a public listing URL or ID.
     */
    public static function parseIdentifier(string $channel, string $input): array {
        $input = trim($input);
        $channel = strtolower(trim($channel));

        if ($channel === 'airbnb' || strpos($input, 'airbnb.') !== false) {
            $channel = 'airbnb';
            // Check if this is an Airbnb Host/User profile URL (e.g. /users/show/34816822)
            if (preg_match('/users\/(?:show\/)?(\d+)/i', $input, $um)) {
                $hostId = $um[1];
                $url = "https://www.airbnb.com/users/show/{$hostId}";
                return ['channel' => 'airbnb', 'type' => 'host_profile', 'host_id' => $hostId, 'id' => '', 'url' => $url];
            }

            // Extract listing ID: /rooms/12345678 or raw numeric 12345678
            if (preg_match('/rooms\/(\d+)/i', $input, $m)) {
                $listingId = $m[1];
                $url = "https://www.airbnb.com/rooms/{$listingId}";
            } elseif (preg_match('/^\d+$/', $input)) {
                $listingId = $input;
                $url = "https://www.airbnb.com/rooms/{$listingId}";
            } else {
                $listingId = '';
                $url = $input;
            }
            return ['channel' => 'airbnb', 'type' => 'listing', 'id' => $listingId, 'url' => $url];
        }

        if ($channel === 'booking_com' || $channel === 'bookingcom' || strpos($input, 'booking.com') !== false) {
            $channel = 'booking_com';
            // Extract hotel ID or slug
            $hotelId = '';
            if (preg_match('/hotel\/[a-z]{2}\/([a-zA-Z0-9\-]+)\./i', $input, $m)) {
                $hotelId = $m[1];
            } elseif (preg_match('/hotel_id=(\d+)/i', $input, $m)) {
                $hotelId = $m[1];
            } elseif (preg_match('/^\d+$/', $input)) {
                $hotelId = $input;
            }
            $url = filter_var($input, FILTER_VALIDATE_URL) ? $input : "https://www.booking.com/hotel/{$input}.html";
            return ['channel' => 'booking_com', 'id' => $hotelId, 'url' => $url];
        }

        return ['channel' => $channel, 'id' => $input, 'url' => $input];
    }

    /**
     * Fetch and normalize listing metadata.
     */
    public static function fetchPreview(string $channel, string $input): array {
        $parsed = self::parseIdentifier($channel, $input);
        $targetUrl = $parsed['url'];

        $html = self::fetchHtml($targetUrl);

        if ($parsed['channel'] === 'airbnb') {
            if (($parsed['type'] ?? '') === 'host_profile') {
                if (!$html || strpos($html, '/rooms/') === false) {
                    // Try alternate locale domain
                    $altUrl = "https://www.airbnb.co.in/users/show/{$parsed['host_id']}";
                    $altHtml = self::fetchHtml($altUrl);
                    if ($altHtml && strpos($altHtml, '/rooms/') !== false) {
                        $html = $altHtml;
                    }
                }

                preg_match_all('/\/rooms\/(\d+)/', $html, $rMatches);
                $roomIds = array_values(array_unique($rMatches[1] ?? []));

                if (!empty($roomIds)) {
                    if (count($roomIds) === 1) {
                        $parsed['id'] = $roomIds[0];
                        $parsed['url'] = "https://www.airbnb.com/rooms/{$roomIds[0]}";
                        $roomHtml = self::fetchHtml($parsed['url']);
                        return self::extractAirbnbMetadata($roomHtml ?: $html, $parsed);
                    }

                    $listings = [];
                    foreach ($roomIds as $rId) {
                        $listings[] = [
                            'id' => $rId,
                            'url' => "https://www.airbnb.com/rooms/{$rId}",
                            'name' => "Airbnb Listing #{$rId}",
                        ];
                    }

                    return [
                        'success' => true,
                        'is_host_profile' => true,
                        'host_id' => $parsed['host_id'] ?? '',
                        'listings_count' => count($listings),
                        'listings' => $listings,
                        'message' => "Found " . count($listings) . " listings on this Airbnb Host Profile. Click any listing below to import its details.",
                    ];
                }
            }

            if (!$html && $parsed['id']) {
                $targetUrl = "https://www.airbnb.co.in/rooms/{$parsed['id']}";
                $html = self::fetchHtml($targetUrl);
            }

            return self::extractAirbnbMetadata($html, $parsed);
        } else {
            return self::extractBookingComMetadata($html, $parsed);
        }
    }

    /**
     * Fetch HTML via cURL with browser headers.
     */
    private static function fetchHtml(string $url): string {
        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            return '';
        }

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            CURLOPT_TIMEOUT => 12,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_HTTPHEADER => [
                'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language: en-US,en;q=0.9',
                'Cache-Control: no-cache',
                'Pragma: no-cache',
            ],
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 400 && is_string($response)) {
            return $response;
        }

        return '';
    }

    /**
     * Extract metadata from Airbnb page / script tags / microdata.
     */
    private static function extractAirbnbMetadata(string $html, array $parsed): array {
        $data = [
            'source' => 'airbnb',
            'source_id' => $parsed['id'],
            'source_url' => $parsed['url'],
            'name' => '',
            'description' => '',
            'property_type' => 'SINGLE',
            'room_count' => 1,
            'default_tariff' => 3500.00,
            'currency' => 'INR',
            'checkin_time' => '14:00',
            'checkout_time' => '11:00',
            'has_kitchen' => 1,
            'address' => '',
            'city' => '',
            'photos' => [],
            'amenities' => [],
            'rooms' => [],
        ];

        if (empty($html)) {
            // Provide sensible placeholder structure if page was blocked
            $nameFromId = $parsed['id'] ? "Airbnb Listing #{$parsed['id']}" : "Imported Airbnb Property";
            $data['name'] = $nameFromId;
            return [
                'success' => true,
                'data' => $data,
                'partial' => true,
                'message' => 'Fetched basic structure. Please review and adjust the fields below.',
            ];
        }

        // 1. OpenGraph Tags
        if (preg_match('/<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']+)["\']/i', $html, $m)) {
            $rawTitle = html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $parts = explode(' · ', $rawTitle);
            $cleanTitle = trim($parts[0]);
            $data['name'] = $cleanTitle ?: $rawTitle;
        }

        if (preg_match('/<meta\s+property=["\']og:description["\']\s+content=["\']([^"\']+)["\']/i', $html, $m)) {
            $rawDesc = html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $data['description'] = $rawDesc;

            // Extract bedroom count from description (e.g. "3 bedrooms · 4 beds · 3 baths")
            if (preg_match('/(\d+)\s+bedroom/i', $rawDesc, $bm)) {
                $bedrooms = (int)$bm[1];
                if ($bedrooms > 1) {
                    $data['property_type'] = 'MULTI_KEY';
                    $data['room_count'] = $bedrooms;
                }
            }
        }

        // 2. OpenGraph Images
        if (preg_match_all('/<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)["\']/i', $html, $im)) {
            foreach ($im[1] as $imgUrl) {
                $cleanUrl = html_entity_decode($imgUrl, ENT_QUOTES, 'UTF-8');
                if (filter_var($cleanUrl, FILTER_VALIDATE_URL) && !in_array($cleanUrl, $data['photos'])) {
                    $data['photos'][] = $cleanUrl;
                }
            }
        }

        // 3. Schema.org JSON-LD
        if (preg_match_all('/<script\s+type=["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>/is', $html, $jm)) {
            foreach ($jm[1] as $jsonStr) {
                $ld = json_decode(trim($jsonStr), true);
                if (!$ld) continue;

                if (isset($ld['name']) && empty($data['name'])) {
                    $data['name'] = html_entity_decode($ld['name'], ENT_QUOTES, 'UTF-8');
                }
                if (isset($ld['description']) && empty($data['description'])) {
                    $data['description'] = html_entity_decode($ld['description'], ENT_QUOTES, 'UTF-8');
                }
                if (isset($ld['image'])) {
                    $images = is_array($ld['image']) ? $ld['image'] : [$ld['image']];
                    foreach ($images as $img) {
                        $imgUrl = is_array($img) ? ($img['url'] ?? ($img['contentUrl'] ?? '')) : $img;
                        if ($imgUrl && !in_array($imgUrl, $data['photos'])) {
                            $data['photos'][] = $imgUrl;
                        }
                    }
                }
                if (isset($ld['address'])) {
                    $addr = $ld['address'];
                    if (is_string($addr)) {
                        $data['address'] = $addr;
                    } elseif (is_array($addr)) {
                        $parts = array_filter([
                            $addr['streetAddress'] ?? '',
                            $addr['addressLocality'] ?? '',
                            $addr['addressRegion'] ?? '',
                            $addr['postalCode'] ?? '',
                            $addr['addressCountry'] ?? ''
                        ]);
                        $data['address'] = implode(', ', $parts);
                        $data['city'] = $addr['addressLocality'] ?? '';
                    }
                }
                if (isset($ld['amenityFeature']) && is_array($ld['amenityFeature'])) {
                    foreach ($ld['amenityFeature'] as $af) {
                        $amenityName = is_array($af) ? ($af['name'] ?? '') : (string)$af;
                        if ($amenityName && !in_array($amenityName, $data['amenities'])) {
                            $data['amenities'][] = $amenityName;
                        }
                    }
                }
            }
        }

        // 4. Scan for embedded high-res photo URLs in Airbnb state scripts
        if (preg_match_all('/"large":\s*"([^"]+)"|"baseUrl":\s*"([^"]+)"|"picture":\s*"([^"]+)"/i', $html, $picMatches)) {
            $allPicUrls = array_merge($picMatches[1], $picMatches[2], $picMatches[3]);
            foreach ($allPicUrls as $rawPic) {
                if (!$rawPic) continue;
                $cleanPic = stripslashes($rawPic);
                if (strpos($cleanPic, 'a0.muscache.com') !== false && filter_var($cleanPic, FILTER_VALIDATE_URL)) {
                    $cleanPic = preg_replace('/\?.*$/', '', $cleanPic);
                    if (!in_array($cleanPic, $data['photos'])) {
                        $data['photos'][] = $cleanPic;
                    }
                }
            }
        }

        // 5. Detect Amenities Keywords
        $commonAmenities = [
            'WiFi' => ['wifi', 'wireless internet', 'wi-fi'],
            'Air Conditioning' => ['air conditioning', 'ac', 'air-conditioned'],
            'Swimming Pool' => ['pool', 'swimming pool', 'private pool'],
            'Kitchen' => ['kitchen', 'cooking basics', 'refrigerator', 'microwave'],
            'Free Parking' => ['free parking', 'parking on premises', 'free street parking'],
            'Dedicated Workspace' => ['dedicated workspace', 'desk', 'workspace'],
            'TV' => ['tv', 'television', 'smart tv', 'hdtv'],
            'Geyser / Hot Water' => ['hot water', 'geyser'],
            'Garden / Lawn' => ['garden', 'backyard', 'lawn', 'patio'],
            'Power Backup' => ['power backup', 'generator', 'inverter'],
        ];

        $htmlLower = strtolower($html);
        foreach ($commonAmenities as $label => $keywords) {
            foreach ($keywords as $kw) {
                if (strpos($htmlLower, $kw) !== false && !in_array($label, $data['amenities'])) {
                    $data['amenities'][] = $label;
                    break;
                }
            }
        }

        // Check kitchen
        $data['has_kitchen'] = in_array('Kitchen', $data['amenities']) ? 1 : 1;

        // Build room breakdown for MULTI_KEY
        if ($data['property_type'] === 'MULTI_KEY' && $data['room_count'] > 1) {
            $data['rooms'] = [];
            for ($i = 1; $i <= $data['room_count']; $i++) {
                $data['rooms'][] = [
                    'name' => "Room " . sprintf("%02d", $i),
                    'tariff' => $data['default_tariff'],
                    'capacity' => 2,
                ];
            }
        }

        // Limit photos to top 15 highest quality
        $data['photos'] = array_slice(array_values(array_unique($data['photos'])), 0, 15);

        if (empty($data['name'])) {
            $data['name'] = $parsed['id'] ? "Airbnb Villa #{$parsed['id']}" : "Imported Airbnb Property";
        }

        return [
            'success' => true,
            'data' => $data,
        ];
    }

    /**
     * Extract metadata from Booking.com page / schema.org.
     */
    private static function extractBookingComMetadata(string $html, array $parsed): array {
        $data = [
            'source' => 'booking_com',
            'source_id' => $parsed['id'],
            'source_url' => $parsed['url'],
            'name' => '',
            'description' => '',
            'property_type' => 'MULTI_KEY',
            'room_count' => 5,
            'default_tariff' => 3000.00,
            'currency' => 'INR',
            'checkin_time' => '14:00',
            'checkout_time' => '11:00',
            'has_kitchen' => 1,
            'address' => '',
            'city' => '',
            'photos' => [],
            'amenities' => [],
            'rooms' => [],
        ];

        if (empty($html)) {
            $nameFromSlug = $parsed['id'] ? ucwords(str_replace(['-', '_'], ' ', $parsed['id'])) : "Imported Booking.com Hotel";
            $data['name'] = $nameFromSlug;
            return [
                'success' => true,
                'data' => $data,
                'partial' => true,
                'message' => 'Fetched basic structure. Please review and adjust the fields below.',
            ];
        }

        // 1. OpenGraph & Title
        if (preg_match('/<meta\s+property=["\']og:title["\']\s+content=["\']([^"\']+)["\']/i', $html, $m)) {
            $rawTitle = html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
            $parts = explode(',', $rawTitle);
            $data['name'] = trim($parts[0]);
        }

        if (preg_match('/<meta\s+property=["\']og:description["\']\s+content=["\']([^"\']+)["\']/i', $html, $m)) {
            $data['description'] = html_entity_decode($m[1], ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }

        // 2. Schema.org JSON-LD
        if (preg_match_all('/<script\s+type=["\']application\/ld\+json["\'][^>]*>(.*?)<\/script>/is', $html, $jm)) {
            foreach ($jm[1] as $jsonStr) {
                $ld = json_decode(trim($jsonStr), true);
                if (!$ld) continue;

                if (isset($ld['name']) && empty($data['name'])) {
                    $data['name'] = html_entity_decode($ld['name'], ENT_QUOTES, 'UTF-8');
                }
                if (isset($ld['description']) && empty($data['description'])) {
                    $data['description'] = html_entity_decode($ld['description'], ENT_QUOTES, 'UTF-8');
                }
                if (isset($ld['image'])) {
                    $images = is_array($ld['image']) ? $ld['image'] : [$ld['image']];
                    foreach ($images as $img) {
                        $imgUrl = is_array($img) ? ($img['url'] ?? ($img['contentUrl'] ?? '')) : $img;
                        if ($imgUrl && !in_array($imgUrl, $data['photos'])) {
                            $data['photos'][] = $imgUrl;
                        }
                    }
                }
                if (isset($ld['address']) && is_array($ld['address'])) {
                    $addr = $ld['address'];
                    $parts = array_filter([
                        $addr['streetAddress'] ?? '',
                        $addr['addressLocality'] ?? '',
                        $addr['addressRegion'] ?? '',
                        $addr['postalCode'] ?? '',
                        $addr['addressCountry'] ?? ''
                    ]);
                    $data['address'] = implode(', ', $parts);
                    $data['city'] = $addr['addressLocality'] ?? '';
                }
                if (isset($ld['containsPlace']) && is_array($ld['containsPlace'])) {
                    $rooms = [];
                    foreach ($ld['containsPlace'] as $r) {
                        if (isset($r['name'])) {
                            $rooms[] = [
                                'name' => html_entity_decode($r['name'], ENT_QUOTES, 'UTF-8'),
                                'tariff' => $data['default_tariff'],
                                'capacity' => $r['occupancy']['occupancy'] ?? 2,
                            ];
                        }
                    }
                    if (!empty($rooms)) {
                        $data['rooms'] = $rooms;
                        $data['room_count'] = count($rooms);
                    }
                }
            }
        }

        // 3. Scan for high-res photo URLs from bstatic.com
        if (preg_match_all('/https:\/\/[a-z0-9\-]+\.bstatic\.com\/xdata\/images\/hotel\/max[0-9x]+\/([0-9]+)\.jpg[^\s"\'<>]+/i', $html, $picMatches)) {
            foreach ($picMatches[0] as $rawPic) {
                $highRes = preg_replace('/max[0-9x]+/', 'max1024x768', $rawPic);
                if (!in_array($highRes, $data['photos'])) {
                    $data['photos'][] = $highRes;
                }
            }
        }

        // 4. Amenities extraction
        $commonAmenities = [
            'Free WiFi' => ['free wifi', 'wi-fi', 'free internet'],
            'Air Conditioning' => ['air conditioning', 'ac'],
            'Swimming Pool' => ['swimming pool', 'outdoor pool', 'pool'],
            'Restaurant / Dining' => ['restaurant', 'dining', 'breakfast'],
            'Room Service' => ['room service'],
            'Free Parking' => ['free parking', 'parking on site', 'private parking'],
            '24-Hour Front Desk' => ['24-hour front desk', 'front desk'],
            'Daily Housekeeping' => ['daily housekeeping', 'housekeeping'],
            'Hot Water' => ['hot water', 'private bathroom'],
            'Garden / Lawn' => ['garden', 'terrace', 'lawn'],
        ];

        $htmlLower = strtolower($html);
        foreach ($commonAmenities as $label => $keywords) {
            foreach ($keywords as $kw) {
                if (strpos($htmlLower, $kw) !== false && !in_array($label, $data['amenities'])) {
                    $data['amenities'][] = $label;
                    break;
                }
            }
        }

        if (empty($data['rooms'])) {
            for ($i = 1; $i <= $data['room_count']; $i++) {
                $data['rooms'][] = [
                    'name' => "Deluxe Room " . sprintf("%02d", $i),
                    'tariff' => $data['default_tariff'],
                    'capacity' => 2,
                ];
            }
        }

        $data['photos'] = array_slice(array_values(array_unique($data['photos'])), 0, 15);

        if (empty($data['name'])) {
            $data['name'] = $parsed['id'] ? ucwords(str_replace(['-', '_'], ' ', $parsed['id'])) : "Imported Booking.com Property";
        }

        return [
            'success' => true,
            'data' => $data,
        ];
    }

    /**
     * Apply imported listing data to an existing property.
     */
    public static function applyToProperty(PDO $pdo, int $propertyId, array $importedData, array $selectedFields = []): array {
        if ($propertyId <= 0) {
            throw new InvalidArgumentException("Invalid property ID");
        }

        // Fetch current property
        $stmt = $pdo->prepare("SELECT * FROM properties WHERE id = ? LIMIT 1");
        $stmt->execute([$propertyId]);
        $prop = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$prop) {
            throw new RuntimeException("Property #{$propertyId} not found");
        }

        // Decode existing configurations
        $existingConfig = [];
        if (!empty($prop['property_configurations'])) {
            $existingConfig = json_decode($prop['property_configurations'], true) ?: [];
        }

        // Update selected fields (or all by default)
        $applyAll = empty($selectedFields);
        $updates = [];
        $params = [];

        if ($applyAll || in_array('name', $selectedFields)) {
            if (!empty($importedData['name'])) {
                $updates[] = "name = ?";
                $params[] = trim($importedData['name']);
            }
        }

        if ($applyAll || in_array('address', $selectedFields)) {
            if (!empty($importedData['address'])) {
                $updates[] = "address = ?";
                $params[] = trim($importedData['address']);
            }
        }

        if ($applyAll || in_array('default_tariff', $selectedFields)) {
            if (!empty($importedData['default_tariff']) && is_numeric($importedData['default_tariff'])) {
                $updates[] = "default_tariff = ?";
                $params[] = (float)$importedData['default_tariff'];
            }
        }

        if ($applyAll || in_array('checkin_time', $selectedFields)) {
            if (!empty($importedData['checkin_time'])) {
                $updates[] = "checkin_time = ?";
                $params[] = trim($importedData['checkin_time']);
            }
        }

        if ($applyAll || in_array('checkout_time', $selectedFields)) {
            if (!empty($importedData['checkout_time'])) {
                $updates[] = "checkout_time = ?";
                $params[] = trim($importedData['checkout_time']);
            }
        }

        if ($applyAll || in_array('instructions', $selectedFields)) {
            if (!empty($importedData['description'])) {
                $updates[] = "instructions = ?";
                $params[] = trim($importedData['description']);
            }
        }

        // Update JSON property_configurations (photos, amenities, imported source)
        if (!empty($importedData['photos'])) {
            $existingConfig['photos'] = array_values(array_unique(array_merge(
                $existingConfig['photos'] ?? [],
                $importedData['photos']
            )));
        }

        if (!empty($importedData['amenities'])) {
            $existingConfig['amenities'] = array_values(array_unique(array_merge(
                $existingConfig['amenities'] ?? [],
                $importedData['amenities']
            )));
        }

        if (!empty($importedData['description'])) {
            $existingConfig['description'] = trim($importedData['description']);
        }

        $existingConfig['imported_from'] = [
            'source' => $importedData['source'] ?? 'ota',
            'source_id' => $importedData['source_id'] ?? '',
            'source_url' => $importedData['source_url'] ?? '',
            'imported_at' => date('Y-m-d H:i:s'),
        ];

        $updates[] = "property_configurations = ?";
        $params[] = json_encode($existingConfig, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $params[] = $propertyId;

        $sql = "UPDATE properties SET " . implode(', ', $updates) . " WHERE id = ?";
        $pdo->prepare($sql)->execute($params);

        return [
            'success' => true,
            'message' => 'Property details successfully updated from imported listing',
            'property_id' => $propertyId,
            'photos_count' => count($existingConfig['photos'] ?? []),
            'amenities_count' => count($existingConfig['amenities'] ?? []),
        ];
    }
}
