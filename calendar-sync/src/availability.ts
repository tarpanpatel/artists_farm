import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { AvailabilityChangedEvent, CalendarChange } from './types.js';

async function lockRooms(client: PoolClient, propertyId: number, roomIds: number[]) {
  const ids = [...new Set(roomIds)].sort((a, b) => a - b);
  const result = await client.query(
    `SELECT id FROM rooms
     WHERE property_id = $1 AND id = ANY($2::bigint[])
     ORDER BY id FOR UPDATE`,
    [propertyId, ids],
  );
  if (result.rowCount !== ids.length) throw new Error('Room not found for property');
}

export async function applyCalendarChange(db: Pool, change: CalendarChange) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Locks retries/replays for this external event before calculating state.
    const current = await client.query<{ id: string; room_id: number; revision: string }>(
      `SELECT id, room_id, revision FROM availability_hold
       WHERE source = $1 AND external_event_id = $2 FOR UPDATE`,
      [change.source, change.externalEventId],
    );
    const existing = current.rows[0];
    if (existing && Number(existing.revision) >= change.revision) {
      await client.query('COMMIT');
      return { status: 'stale' as const };
    }

    // Always lock in numeric order; room moves cannot deadlock one another.
    await lockRooms(client, change.propertyId, [change.roomId, ...(existing ? [existing.room_id] : [])]);

    let holdId = existing?.id;
    if (change.state === 'cancelled' && !existing) {
      await client.query('COMMIT');
      return { status: 'already-cancelled' as const };
    }

    if (existing) {
      await client.query(
        `UPDATE availability_hold
         SET room_id = $1, state = $2,
             stay = tstzrange($3::timestamptz, $4::timestamptz, '[)'),
             revision = $5, updated_at = now()
         WHERE id = $6`,
        [change.roomId, change.state, change.startAt, change.endAt, change.revision, existing.id],
      );
    } else {
      holdId = randomUUID();
      await client.query(
        `INSERT INTO availability_hold
          (id, property_id, room_id, source, external_event_id, state, stay, revision)
         VALUES ($1, $2, $3, $4, $5, $6,
                 tstzrange($7::timestamptz, $8::timestamptz, '[)'), $9)`,
        [holdId, change.propertyId, change.roomId, change.source, change.externalEventId,
          change.state, change.startAt, change.endAt, change.revision],
      );
    }

    const sequence = await client.query<{ sequence: string }>(
      `INSERT INTO property_event_sequence (property_id, sequence) VALUES ($1, 1)
       ON CONFLICT (property_id) DO UPDATE
       SET sequence = property_event_sequence.sequence + 1
       RETURNING sequence`,
      [change.propertyId],
    );
    const event: AvailabilityChangedEvent = {
      id: randomUUID(), type: 'availability.changed', propertyId: change.propertyId,
      roomId: change.roomId, sequence: Number(sequence.rows[0].sequence),
      changedBookingIds: [holdId!], occurredAt: new Date().toISOString(),
    };
    await client.query(
      `INSERT INTO outbox_event (id, topic, aggregate_id, payload)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [event.id, event.type, change.roomId, JSON.stringify(event)],
    );
    await client.query('COMMIT');
    return { status: 'applied' as const, event };
  } catch (error: any) {
    await client.query('ROLLBACK');
    // 23P01 is the PostgreSQL exclusion constraint: an active interval overlaps.
    if (error.code === '23P01') throw new Error('Availability conflict: room is already blocked');
    throw error;
  } finally {
    client.release();
  }
}
