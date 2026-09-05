<?php
/**
 * Channex Channel API Client
 *
 * Thin wrappers over ChannexClient for the Channel API (connecting/mapping/
 * activating an OTA channel) - a separate surface from ChannexAdapter.php's
 * ARI-push contract (ChannelManagerAdapter). Verified live against the
 * sandbox 3 Sep 2026 before this was written - see
 * scratch/channex_channel_api_access_verification.php and
 * scratch/channex_channel_api_adapter_probe.php for the actual proof
 * (test_connection returned HTTP 200, not 401/403 - Channel API access is
 * NOT gated on this account).
 */

require_once __DIR__ . '/ChannexClient.php';

class ChannexChannelClient {
    private ChannexClient $client;

    public function __construct(?ChannexClient $client = null) {
        $this->client = $client ?? new ChannexClient();
    }

    /** GET /channels/list - every supported adapter, with its own params/rate_params schema. */
    public function listAdapters(): array {
        return $this->client->get('channels/list');
    }

    /** GET /channels/adapter?code=X - one adapter's descriptor. */
    public function getAdapter(string $code): array {
        return $this->client->get('channels/adapter', ['code' => $code]);
    }

    /** POST /channels/test_connection - {"success": bool, "errors": ...}. */
    public function testConnection(string $code, array $settings): array {
        return $this->client->post('channels/test_connection', [
            'channel' => $code,
            'settings' => $settings,
        ]);
    }

    /** POST /channels/mapping_details - rooms/rates the channel exposes for this connection's settings. */
    public function getMappingDetails(string $code, array $settings): array {
        return $this->client->post('channels/mapping_details', [
            'channel' => $code,
            'settings' => $settings,
        ]);
    }

    /**
     * GET /groups - the groups this API key can access. Cache the result
     * (per-request is fine; this changes only when the account's own team
     * structure changes) rather than calling it on every channel operation.
     */
    public function getGroups(): array {
        return $this->client->get('groups');
    }

    /**
     * Resolve the group that owns a given Channex property UUID -
     * POST /channels' group_id is required, and an inaccessible/missing one
     * 422s with "You not have access to requested group" (confirmed in the
     * skill doc's own gotchas list). Returns null if no group claims this
     * property - the caller should surface a real error, not guess.
     */
    public function resolveGroupIdForProperty(string $channexPropertyId): ?string {
        $res = $this->getGroups();
        foreach ($res['data'] ?? [] as $group) {
            $props = $group['relationships']['properties']['data'] ?? [];
            foreach ($props as $p) {
                if (($p['id'] ?? null) === $channexPropertyId) {
                    return $group['id'] ?? ($group['attributes']['id'] ?? null);
                }
            }
        }
        return null;
    }

    /** GET /channels - list existing connections, optionally filtered. */
    public function listChannels(array $filters = []): array {
        $params = [];
        foreach ($filters as $k => $v) {
            $params["filter[$k]"] = $v;
        }
        return $this->client->get('channels', $params);
    }

    /** GET /channels/:id */
    public function getChannel(string $channelId): array {
        return $this->client->get("channels/{$channelId}");
    }

    /**
     * POST /channels - created disabled by default (Channex's own behavior,
     * not something this needs to set explicitly). $ratePlans is the
     * room_type_code/rate_plan_code mapping array per the verified shape
     * (channel-api reference: room_type_code/rate_plan_code must be
     * INTEGERS, not strings - a string silently lands the mapping under
     * "removed rates" instead of erroring, so callers must cast before
     * calling this).
     */
    public function createChannel(string $code, string $groupId, array $propertyUuids, array $settings, array $ratePlans = [], ?string $title = null): array {
        $payload = [
            'channel' => [
                'channel' => $code,
                'group_id' => $groupId,
                'properties' => $propertyUuids,
                'settings' => $settings,
            ],
        ];
        if ($title) $payload['channel']['title'] = $title;
        if (!empty($ratePlans)) $payload['channel']['rate_plans'] = $ratePlans;
        return $this->client->post('channels', $payload);
    }

    /** PUT /channels/:id - omitted fields retain stored values; rate_plans with settings:null removes a mapping. */
    public function updateChannel(string $channelId, array $channelFields): array {
        return $this->client->put("channels/{$channelId}", ['channel' => $channelFields]);
    }

    /**
     * GET /channels/:id/action/listings - the real Airbnb listings on the
     * now-authorized account (confirmed against Channex's own docs 3 Sep
     * 2026: Airbnb has NO mapping_details endpoint at all - listings are
     * discovered this way instead, once the channel/tokens exist).
     */
    public function getChannelListings(string $channelId): array {
        return $this->client->get("channels/{$channelId}/action/listings");
    }

    /**
     * GET /channels/:id/action/listing_details?listing_id=X - everything Airbnb
     * knows about ONE listing (confirmed against Channex's Airbnb channel docs
     * 5 Sep 2026).
     *
     * Carries the two things Ground Code has no other source for:
     *   guests_included         - how many guests the base nightly price covers
     *   price_per_extra_person  - the surcharge per guest beyond that
     * plus default_daily_price, weekend_price, cleaning_fee, security_deposit
     * and a `rooms` array with real bed configuration.
     *
     * That pair is exactly the occupancy-pricing model the PMS needs, already
     * filled in by the host on Airbnb - so it can be imported rather than
     * re-entered by hand.
     */
    public function getListingDetails(string $channelId, string $listingId): array {
        return $this->client->get("channels/{$channelId}/action/listing_details", ['listing_id' => $listingId]);
    }

    /**
     * POST /channels/:id/mappings - map ONE local room's rate plan to ONE
     * external listing/room. This is Airbnb's actual mapping call (one
     * request per room, no bulk rate_plans array like updateChannel()) -
     * $settings carries whatever the channel needs to identify the match
     * (Airbnb: {"listing_id": "..."}).
     */
    public function createChannelMapping(string $channelId, string $ratePlanId, array $settings): array {
        return $this->client->post("channels/{$channelId}/mappings", [
            'mapping' => [
                'rate_plan_id' => $ratePlanId,
                'settings' => $settings,
            ],
        ]);
    }

    /**
     * POST /meta/airbnb/connection_link - the real way to connect Airbnb.
     * Per Channex's own docs (confirmed 3 Sep 2026): NOT a hand-built Airbnb
     * OAuth URL - Channex generates and tracks a real, 2-hour-valid link
     * server-side. The property owner opens it, signs into Airbnb and
     * authorizes; Channex creates the channel connection automatically
     * (inactive, ready to map) and redirects the browser to $redirectUri
     * with ?success=true&channel_id={id}&token={token} appended (or
     * $failureRedirectUri on failure) - $token is our own free-form
     * correlation value, echoed back verbatim, not a value Channex assigns.
     */
    public function getAirbnbConnectionLink(string $groupId, array $propertyUuids, string $redirectUri, string $failureRedirectUri, string $token): array {
        return $this->client->post('meta/airbnb/connection_link', [
            'group_id' => $groupId,
            'properties' => $propertyUuids,
            'redirect_uri' => $redirectUri,
            'failure_redirect_uri' => $failureRedirectUri,
            'token' => $token,
        ]);
    }

    /** POST /channels/:id/check_readiness - the authoritative "is Activate safe" gate. Empty list = ready. */
    public function checkReadiness(string $channelId): array {
        return $this->client->post("channels/{$channelId}/check_readiness", []);
    }

    /** POST /channels/:id/activate */
    public function activateChannel(string $channelId): array {
        return $this->client->post("channels/{$channelId}/activate", []);
    }

    /** POST /channels/:id/deactivate */
    public function deactivateChannel(string $channelId): array {
        return $this->client->post("channels/{$channelId}/deactivate", []);
    }

    /** DELETE /channels/:id - Channex rejects with 422 {"channel":["is active"]} unless already deactivated. */
    public function deleteChannel(string $channelId): array {
        return $this->client->delete("channels/{$channelId}");
    }

    /**
     * POST /channels/:id/execute/load_future_reservations - Airbnb-specific
     * action (confirmed against Channex's own Airbnb integration guide,
     * https://docs.channex.io/channel-api-examples/airbnb.md, 3 Sep 2026):
     * "A freshly connected account usually already holds future reservations.
     * Pull them into Channex." This is the real, documented mechanism for
     * getting a listing's pre-existing reservations INTO Channex after
     * connecting - nothing does this automatically at connection/mapping
     * time (confirmed: booking_revisions/feed came back empty for a
     * property with real, confirmed Airbnb bookings that predated the
     * connection). Runs in the background on Channex's side; the imported
     * reservations then flow through the normal booking_revisions pipeline
     * (same feed/webhook path as any new booking), not returned directly in
     * this call's response. Per listing_id when given, otherwise every
     * mapped listing on the connection.
     */
    public function loadFutureReservations(string $channelId, ?string $listingId = null): array {
        $body = $listingId !== null ? ['listing_id' => $listingId] : [];
        return $this->client->post("channels/{$channelId}/execute/load_future_reservations", $body);
    }
}
