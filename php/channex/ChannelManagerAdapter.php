<?php
/**
 * Channel Manager Adapter Interface
 *
 * Provides a vendor-agnostic abstraction layer so PMS business logic
 * interacts with channel managers (Channex, SiteMinder, STAAH, etc.)
 * through a unified contract.
 */

interface ChannelManagerAdapter {
    /**
     * Idempotently provision or sync property, room types, and rate plans.
     * Returns mapping metadata (property UUID, room type UUIDs, rate plan UUIDs).
     */
    public function syncContent(int $propertyId): array;

    /**
     * Push availability date ranges for a property/room.
     *
     * @param int $propertyId Local property ID
     * @param ?int $roomId Local room ID (or null for single whole property)
     * @param array $ranges Array of ['date_from' => 'Y-m-d', 'date_to' => 'Y-m-d', 'availability' => 0|1]
     */
    public function pushAvailability(int $propertyId, ?int $roomId, array $ranges): array;

    /**
     * Push rate and restriction date ranges for a property/room.
     *
     * @param int $propertyId Local property ID
     * @param ?int $roomId Local room ID (or null for single whole property)
     * @param array $restrictions Array of rate and restriction records
     */
    public function pushRestrictions(int $propertyId, ?int $roomId, array $restrictions): array;

    /**
     * Acknowledge an inbound booking revision after database commit.
     */
    public function acknowledgeRevision(string $revisionId): bool;
}
