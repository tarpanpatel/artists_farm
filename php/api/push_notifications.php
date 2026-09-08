<?php
/**
 * Web Push for the operational app - the kitchen alert channel.
 *
 * Added 8 Sep 2026, replacing the KDS audio chime outright. The chime was a
 * synthesized Web Audio tone played by whichever browser happened to have the
 * KDS open, which made it close to useless in a real kitchen: it only ever
 * sounded on the one device already looking at the screen, mobile browsers
 * refuse to play audio on a page nobody has tapped, and iOS mutes Web Audio
 * entirely when the ring/silent switch is on. A push notification has none of
 * those problems - it reaches the phone in a pocket, uses the device's own
 * alert sound and vibration, and survives the app being closed.
 *
 * Deliberately reuses php/errors/web_push.php rather than reimplementing the
 * protocol: that file already carries a working, dependency-free RFC 8291 +
 * RFC 8292 implementation (and its hard-won Windows/OpenSSL workarounds), and
 * a second copy of the crypto is exactly the kind of drift that leaves one
 * half of the app quietly broken. Only the SUBSCRIPTION STORE is new here.
 *
 * Why a MySQL table when Telescope's subscriptions live in a flat JSON file:
 * Telescope's store is deliberately DB-free so a SQL error can still raise an
 * alert about itself, and it needs no identity at all (one admin, one device).
 * This one has to answer "which subscriptions belong to a kitchen-role user at
 * THIS property" on every send, which is a query rather than a file scan - and
 * unlike Telescope, it is useless anyway if the database is already down.
 */

require_once __DIR__ . '/../errors/web_push.php';

if (!function_exists('pushKitchenRoleClause')) {

    /**
     * Self-healing schema (see CLAUDE.md - a table added on one environment
     * must never need a manual migration step on another).
     *
     * `endpoint` is the natural key: it is the push service's own unique URL
     * for one browser on one device, so re-subscribing after a reload has to
     * UPDATE that row rather than pile up duplicates that would each deliver
     * the same notification. It is far too long for a plain unique index at
     * utf8mb4 (the 767-byte prefix limit on older InnoDB), so uniqueness is
     * enforced on a SHA-256 of it, stored alongside.
     */
    function ensurePushSubscriptionSchema(PDO $pdo): void {
        if (isSchemaVerified('schema_push_subscriptions_v1')) {
            return;
        }
        try {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `push_subscriptions` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `property_id` INT NOT NULL,
                `user_id` VARCHAR(64) DEFAULT NULL,
                `username` VARCHAR(128) DEFAULT NULL,
                `role` VARCHAR(64) DEFAULT NULL,
                `endpoint` TEXT NOT NULL,
                `endpoint_hash` CHAR(64) NOT NULL,
                `p256dh` VARCHAR(255) NOT NULL,
                `auth` VARCHAR(255) NOT NULL,
                `user_agent` VARCHAR(255) DEFAULT NULL,
                `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
                `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY `uniq_push_endpoint` (`endpoint_hash`),
                KEY `idx_push_property_role` (`property_id`, `role`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
            markSchemaVerified('schema_push_subscriptions_v1');
        } catch (\Throwable $e) {
            // Never let a schema hiccup take down the request that triggered
            // it - the actions below fail loudly on their own if the table
            // genuinely isn't there.
        }
    }

    /**
     * Staff are shared across a MULTI_KEY property's rooms (they live on the
     * parent row), so a send triggered from inside a room has to look upward
     * or it finds nobody. Same resolution router.php already does for modules.
     */
    function pushResolveStaffPropertyId(PDO $pdo, int $propertyId): int {
        try {
            $stmt = $pdo->prepare("SELECT property_type, parent_property_id FROM properties WHERE id = ?");
            $stmt->execute([$propertyId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($row && $row['property_type'] === 'MULTI_KEY_ROOM' && !empty($row['parent_property_id'])) {
                return (int) $row['parent_property_id'];
            }
        } catch (\Throwable $e) {
        }
        return $propertyId;
    }

    /**
     * Who counts as kitchen ("only kitchen staff and chef should get that
     * notification", 8 Sep 2026).
     *
     * Matched on the role's SHAPE rather than a list of exact strings, because
     * this project has accumulated several spellings of the same job over time.
     * A first draft of this used `LOWER(role) = 'chef'` and was caught by a
     * smoke test against the real staff_users table, which turned out to hold:
     *
     *     Admin | Staff Kitchen | Staff | Super Admin | Staff Supervisor
     *     Manager | Chef/Cook | Housekeeping | Manager/Reception
     *
     * The chef role is actually spelled 'Chef/Cook' - an exact match would
     * have silently excluded every chef in the system, which is precisely the
     * half of "only kitchen staff and chef" that was asked for. Substring
     * matching on kitchen/chef/cook covers 'Staff Kitchen', 'Chef/Cook',
     * 'Kitchen Assistant' (in the TypeScript role union), demo data's 'Chef',
     * and any future variant, while still excluding every non-kitchen role
     * above - which is the other half of the instruction.
     *
     * If a new role is ever added that contains one of these words but must
     * NOT be alerted, this is the one place to narrow.
     */
    function pushKitchenRoleClause(): string {
        return "(LOWER(role) LIKE '%kitchen%' OR LOWER(role) LIKE '%chef%' OR LOWER(role) LIKE '%cook%')";
    }

    function pushSubscriptionFromInput(array $input): ?array {
        $endpoint = trim((string) ($input['endpoint'] ?? ''));
        $p256dh   = trim((string) ($input['p256dh'] ?? ($input['keys']['p256dh'] ?? '')));
        $auth     = trim((string) ($input['auth'] ?? ($input['keys']['auth'] ?? '')));
        if ($endpoint === '' || $p256dh === '' || $auth === '') {
            return null;
        }
        return ['endpoint' => $endpoint, 'p256dh' => $p256dh, 'auth' => $auth];
    }

    /**
     * Deliver one payload to a set of subscription rows. Shared by the manual
     * bell and by every automatic order notification, so those two can never
     * drift apart on retry or pruning behaviour.
     *
     * One broken subscription must never stop the rest of the kitchen being
     * told, so each failure is counted rather than thrown.
     */
    function pushDeliverToSubscriptions(PDO $pdo, array $subs, array $payload): array {
        $sent = 0;
        $failed = 0;
        $recipients = [];
        foreach ($subs as $sub) {
            try {
                $result = sendWebPush([
                    'endpoint' => $sub['endpoint'],
                    'p256dh'   => $sub['p256dh'],
                    'auth'     => $sub['auth'],
                ], $payload);
                if (!empty($result['ok'])) {
                    $sent++;
                    $name = $sub['username'] ?: ($sub['role'] ?: 'kitchen');
                    if (!in_array($name, $recipients, true)) {
                        $recipients[] = $name;
                    }
                } else {
                    $failed++;
                    // 404/410 is the push service saying this browser has
                    // permanently dropped the subscription (site data cleared,
                    // app uninstalled). Prune it, or it counts as a failure
                    // forever and quietly inflates every later send's tally.
                    if (in_array((int) ($result['status'] ?? 0), [404, 410], true)) {
                        try {
                            $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint_hash = ?")
                                ->execute([hash('sha256', $sub['endpoint'])]);
                        } catch (\Throwable $e) {
                        }
                    }
                }
            } catch (\Throwable $e) {
                $failed++;
            }
        }
        return ['sent' => $sent, 'failed' => $failed, 'recipients' => $recipients];
    }

    /**
     * The kitchen's subscriptions for a property, optionally leaving out one
     * user's own devices.
     *
     * That exclusion is the difference between a notification system people
     * trust and one they mute. "No order event should land silently" does not
     * mean a chef gets buzzed by the button they just pressed - an echo like
     * that is pure noise, and noise is exactly what teaches staff to swipe
     * every alert away unread, including the one that mattered. Everyone who
     * did NOT cause the change is still told, every time.
     */
    function pushKitchenSubscriptions(PDO $pdo, int $staffPropertyId, ?string $excludeUserId = null): array {
        $sql = "SELECT endpoint, p256dh, auth, username, role
                FROM push_subscriptions
                WHERE property_id = ? AND " . pushKitchenRoleClause();
        $params = [$staffPropertyId];
        if ($excludeUserId !== null && $excludeUserId !== '') {
            $sql .= " AND (user_id IS NULL OR user_id <> ?)";
            $params[] = $excludeUserId;
        }
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * A short human label for an order - who it is for - so the notification
     * body is actionable without opening the app.
     */
    function pushDescribeOrder(PDO $pdo, $orderId): string {
        try {
            // The room comes from a JOIN, not a column: guests.room_id is a
            // foreign key into `properties` (the room IS a property row - see
            // CLAUDE.md's multi-key hierarchy), and there is no `room_number`
            // column on guests at all. A first draft of this selected
            // `g.room_number`, which threw on every guest-attached order and
            // was swallowed by the catch below - so every notification would
            // have silently lost its guest label while looking fine. Caught by
            // smoke test 8 Sep 2026; same join webhook_handler.php uses.
            $stmt = $pdo->prepare("SELECT o.guest_id, o.walk_in_tab_id, g.guest_name,
                                          rp.name AS room_name,
                                          gp.name AS guest_prop_name,
                                          gp.property_type AS guest_prop_type
                                   FROM orders o
                                   LEFT JOIN guests g ON g.id = o.guest_id
                                   LEFT JOIN properties rp ON rp.id = g.room_id
                                   LEFT JOIN properties gp ON gp.id = g.property_id
                                   WHERE o.id = ?");
            $stmt->execute([$orderId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row) {
                return '';
            }
            if (!empty($row['guest_name'])) {
                $room = trim((string) ($row['room_name'] ?? ''));

                // Not every booking carries room_id. Checked against the live
                // data 8 Sep 2026 - of the three property shapes, only
                // MULTI_KEY guests have it set (70/70); SINGLE (12/12) and
                // MULTI_KEY_ROOM (2/2) guests all have it NULL.
                //
                // For a guest booked directly ONTO a room row, their own
                // property IS the room ("Room 101"), so fall back to it -
                // otherwise the cook gets a bare name and no idea where to
                // take the food, which is most of the point of the alert.
                //
                // For a SINGLE property, deliberately nothing: there is no
                // room, and appending the property's own name would just
                // repeat something the kitchen already knows, on every alert.
                if ($room === '' && ($row['guest_prop_type'] ?? '') === 'MULTI_KEY_ROOM') {
                    $room = trim((string) ($row['guest_prop_name'] ?? ''));
                }

                return $row['guest_name'] . ($room !== '' ? ' - ' . $room : '');
            }
            if (!empty($row['walk_in_tab_id'])) {
                $tab = $pdo->prepare("SELECT label FROM walk_in_tabs WHERE id = ?");
                $tab->execute([$row['walk_in_tab_id']]);
                $label = $tab->fetchColumn();
                return $label ? 'Walk-in - ' . $label : 'Walk-in';
            }
        } catch (\Throwable $e) {
        }
        return '';
    }

    /**
     * Where tapping the notification should land: that property's kitchen tab,
     * with the specific ticket highlighted.
     *
     * Returns a ROOT-RELATIVE path, not an absolute URL, unlike the Telegram
     * equivalent (appendAppUrlToMessage in sender.php) which has to be
     * absolute to work inside a chat message. A service worker resolves this
     * against its own origin, so a relative path is both sufficient and safer
     * here - an absolute one would bake in whatever $_SERVER['HTTP_HOST'] said
     * at send time, which is not trustworthy when the send was triggered by a
     * webhook or a cron rather than by a browser request.
     *
     * `order_id` + the `kitchen` hash are the same two things App.tsx's
     * existing deep-link effect already reads, so this reuses that machinery
     * rather than adding a second convention.
     */
    function pushOrderDeepLink(PDO $pdo, int $propertyId, $orderId): string {
        try {
            $stmt = $pdo->prepare("SELECT p.slug AS prop_slug, t.slug AS tenant_slug
                                   FROM properties p JOIN tenants t ON t.id = p.tenant_id
                                   WHERE p.id = ?");
            $stmt->execute([$propertyId]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC);
            if (!$row || empty($row['prop_slug']) || empty($row['tenant_slug'])) {
                return '';
            }
            $query = $orderId ? '?order_id=' . rawurlencode((string) $orderId) : '';
            return '/' . $row['tenant_slug'] . '/' . $row['prop_slug'] . '/' . $query . '#kitchen';
        } catch (\Throwable $e) {
            return '';
        }
    }

    /**
     * THE automatic order alert (8 Sep 2026: "new order or any order updates
     * shouldn't land silently... always with notification").
     *
     * Call this from every path that creates or changes an order. It is
     * best-effort by design and swallows everything: a push that fails must
     * never roll back or fail the order itself - the same rule the Telegram
     * dispatch beside it already follows.
     *
     * The HTTP response is flushed first where the server allows it, so a cook
     * tapping "Ready" is not left waiting on one HTTPS round trip per
     * subscribed device before the KDS updates. Without that, adding this
     * would make the screen measurably slower on every single action - the
     * classic way a well-meant notification feature gets blamed for a sluggish
     * app and torn back out again.
     */
    function notifyKitchenOfOrderEvent(PDO $pdo, int $propertyId, array $event): void {
        try {
            // Opt-out, because flushing is only safe where this is genuinely
            // the last thing the request does. The Telegram webhook handler
            // calls this MID-flow and still has to edit the original message
            // afterwards, so it passes flush => false; ending the response
            // there would discard whatever it writes next.
            $flush = !array_key_exists('flush', $event) || $event['flush'] !== false;
            if ($flush && function_exists('fastcgi_finish_request')) {
                @fastcgi_finish_request();
            }

            ensurePushSubscriptionSchema($pdo);
            $staffPropertyId = pushResolveStaffPropertyId($pdo, $propertyId);

            // Whoever triggered the change is not told about their own action.
            $actor = $event['actor_user_id'] ?? ($_SESSION['user_id'] ?? null);
            $subs = pushKitchenSubscriptions($pdo, $staffPropertyId, $actor !== null ? (string) $actor : null);
            if (empty($subs)) {
                return;
            }

            $orderId = $event['order_id'] ?? null;

            // Derived once here rather than at each call site, so every order
            // notification is tappable without three copies of the same logic
            // (and without a caller quietly forgetting it).
            $url = (string) ($event['url'] ?? '');
            if ($url === '' && $orderId) {
                // Deliberately the STAFF (parent) property, not the request's
                // own. An order raised from inside a multi-key room carries
                // that room's id, but the kitchen is a parent-level thing -
                // the KDS, the menu and the staff all live there, and a room's
                // own slug has no kitchen tab to land on. Verified by smoke
                // test: unresolved, the link pointed at
                // /tenant/winter-garen-room-1/#kitchen, which is not a screen.
                $url = pushOrderDeepLink($pdo, $staffPropertyId, $orderId);
            }

            pushDeliverToSubscriptions($pdo, $subs, [
                'title' => (string) ($event['title'] ?? 'Kitchen update'),
                'body'  => (string) ($event['body'] ?? ''),
                'url'   => $url,
                // Tagged per ORDER, not per event: successive updates to the
                // same ticket replace each other (the kitchen wants that
                // ticket's current state, not a stack of its history), while a
                // different ticket still arrives as its own alert and can never
                // be swallowed by an unrelated one.
                'tag'   => $orderId ? 'kitchen-order-' . $orderId : 'kitchen-alert',
            ]);
        } catch (\Throwable $e) {
            // Deliberately silent - see the doc block above.
        }
    }

    function handlePushNotificationRequests(PDO $pdo, string $method, string $action, int $propertyId): void {
        ensurePushSubscriptionSchema($pdo);
        $input = json_decode((string) file_get_contents('php://input'), true) ?: [];

        switch ($action) {

            // The browser needs the server's VAPID public key to subscribe at
            // all. It is public by design (it travels in every push request's
            // Authorization header); the private half never leaves the server.
            case 'get_vapid_public_key': {
                try {
                    $keys = getVapidKeys();
                    echo json_encode(['status' => 'success', 'data' => ['publicKey' => $keys['public_raw_b64url'] ?? '']]);
                } catch (\Throwable $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Push keys unavailable: ' . $e->getMessage()]);
                }
                return;
            }

            case 'save_push_subscription': {
                $sub = pushSubscriptionFromInput($input);
                if (!$sub) {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'Incomplete push subscription.']);
                    return;
                }

                // Identity comes from the SESSION, never from the request body -
                // otherwise any caller could declare itself a chef and subscribe
                // to another property's kitchen traffic.
                $staffPropertyId = pushResolveStaffPropertyId($pdo, $propertyId);
                $userId   = $_SESSION['user_id'] ?? null;
                $username = $_SESSION['username'] ?? null;
                $role     = (string) ($_SESSION['role'] ?? '');

                // The session's role is set at login, so a role changed since
                // then would be stale - prefer the live staff_users row.
                if ($userId) {
                    try {
                        $stmt = $pdo->prepare("SELECT role FROM staff_users WHERE id = ? AND property_id = ?");
                        $stmt->execute([$userId, $staffPropertyId]);
                        $liveRole = $stmt->fetchColumn();
                        if ($liveRole) {
                            $role = (string) $liveRole;
                        }
                    } catch (\Throwable $e) {
                    }
                }

                try {
                    $stmt = $pdo->prepare("INSERT INTO push_subscriptions
                        (property_id, user_id, username, role, endpoint, endpoint_hash, p256dh, auth, user_agent)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            property_id = VALUES(property_id),
                            user_id     = VALUES(user_id),
                            username    = VALUES(username),
                            role        = VALUES(role),
                            p256dh      = VALUES(p256dh),
                            auth        = VALUES(auth),
                            user_agent  = VALUES(user_agent)");
                    $stmt->execute([
                        $staffPropertyId,
                        $userId,
                        $username,
                        $role,
                        $sub['endpoint'],
                        hash('sha256', $sub['endpoint']),
                        $sub['p256dh'],
                        $sub['auth'],
                        substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
                    ]);
                    echo json_encode(['status' => 'success', 'data' => ['role' => $role]]);
                } catch (\Throwable $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Could not save push subscription: ' . $e->getMessage()]);
                }
                return;
            }

            case 'delete_push_subscription': {
                $endpoint = trim((string) ($input['endpoint'] ?? ''));
                if ($endpoint === '') {
                    http_response_code(400);
                    echo json_encode(['status' => 'error', 'message' => 'Missing endpoint.']);
                    return;
                }
                try {
                    $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint_hash = ?")
                        ->execute([hash('sha256', $endpoint)]);
                    echo json_encode(['status' => 'success']);
                } catch (\Throwable $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
                }
                return;
            }

            /**
             * The bell on the KDS toolbar. Sends one notification to every
             * kitchen-role device registered at this property.
             *
             * The response separates "nobody is subscribed" from "sent" on
             * purpose, and says which of the two reasons applies: silence is
             * the failure mode of any notification system, and a button that
             * cheerfully reports success into an empty room is worse than one
             * that admits nobody is listening.
             */
            case 'send_kitchen_push': {
                $staffPropertyId = pushResolveStaffPropertyId($pdo, $propertyId);
                $title = trim((string) ($input['title'] ?? '')) ?: 'Kitchen alert';
                $body  = trim((string) ($input['body'] ?? '')) ?: 'Please check the kitchen order screen.';
                $url   = trim((string) ($input['url'] ?? ''));

                try {
                    $stmt = $pdo->prepare("SELECT endpoint, p256dh, auth, username, role
                                           FROM push_subscriptions
                                           WHERE property_id = ? AND " . pushKitchenRoleClause());
                    $stmt->execute([$staffPropertyId]);
                    $subs = $stmt->fetchAll(PDO::FETCH_ASSOC);
                } catch (\Throwable $e) {
                    http_response_code(500);
                    echo json_encode(['status' => 'error', 'message' => 'Could not read subscriptions: ' . $e->getMessage()]);
                    return;
                }

                if (empty($subs)) {
                    // Explain WHY it is empty - the two causes need completely
                    // different fixes (assign someone a kitchen role, vs. have
                    // that person turn alerts on), and staff cannot tell them
                    // apart from a bare "0 sent".
                    $eligible = 0;
                    try {
                        $stmt = $pdo->prepare("SELECT COUNT(*) FROM staff_users
                                               WHERE property_id = ? AND " . pushKitchenRoleClause());
                        $stmt->execute([$staffPropertyId]);
                        $eligible = (int) $stmt->fetchColumn();
                    } catch (\Throwable $e) {
                    }
                    echo json_encode([
                        'status' => 'success',
                        'data'   => [
                            'sent'           => 0,
                            'failed'         => 0,
                            'recipients'     => [],
                            'eligible_staff' => $eligible,
                            'message'        => $eligible === 0
                                ? 'No kitchen staff or chef is set up at this property yet.'
                                : 'Kitchen staff exist, but none has turned on notifications on their own device yet.',
                        ],
                    ]);
                    return;
                }

                $stats = pushDeliverToSubscriptions($pdo, $subs, [
                    'title' => $title,
                    'body'  => $body,
                    'url'   => $url,
                    'tag'   => 'kitchen-alert',
                ]);

                echo json_encode(['status' => 'success', 'data' => $stats]);
                return;
            }
        }

        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Unknown push action: ' . $action]);
    }
}
