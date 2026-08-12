import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import express from 'express';
import type { Pool } from 'pg';
import { calendarQueue } from './queue.js';
import type { CalendarChange } from './types.js';

function validSignature(raw: Buffer, signature: string | undefined, secret: string) {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const supplied = signature.replace(/^sha256=/, '');
  return supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function normalize(channel: string, payload: unknown): CalendarChange {
  const value = payload as Partial<CalendarChange>;
  if (!value.propertyId || !value.roomId || !value.externalEventId || value.revision === undefined || !value.startAt || !value.endAt || !value.state) {
    throw new Error('Webhook payload cannot be normalized to a calendar change');
  }
  return { ...value, propertyId: Number(value.propertyId), roomId: Number(value.roomId), revision: Number(value.revision), source: channel } as CalendarChange;
}

export function buildIngress(db: Pool) {
  const app = express();
  app.post('/webhooks/:channel', express.raw({ type: '*/*', limit: '1mb' }), async (req, res, next) => {
    try {
      const channel = String(req.params.channel).toLowerCase();
      const secret = process.env[`${channel.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_WEBHOOK_SECRET`] ?? '';
      const raw = req.body as Buffer;
      if (!validSignature(raw, req.header('x-signature') ?? undefined, secret)) {
        return res.status(401).json({ error: 'invalid webhook signature' });
      }

      const payload = JSON.parse(raw.toString('utf8'));
      const deliveryId = req.header('x-delivery-id') ?? createHmac('sha256', secret).update(raw).digest('hex');
      const inbox = await db.query<{ id: string; payload: unknown }>(
        `INSERT INTO calendar_inbox (id, channel, delivery_id, payload, signature_valid)
         VALUES ($1, $2, $3, $4::jsonb, true)
         ON CONFLICT (channel, delivery_id) DO NOTHING RETURNING id, payload`,
        [randomUUID(), channel, deliveryId, JSON.stringify(payload)],
      );
      // Re-enqueue duplicates as well. This repairs the narrow failure window
      // where Postgres committed the inbox record but Redis was unavailable
      // before the first queue add completed.
      const persisted = inbox.rowCount ? inbox.rows[0] : (await db.query<{ id: string; payload: unknown }>(
        `SELECT id, payload FROM calendar_inbox WHERE channel = $1 AND delivery_id = $2`,
        [channel, deliveryId],
      )).rows[0];
      if (!persisted) throw new Error('Calendar inbox record was not found');

      const change = normalize(channel, persisted.payload);
      await calendarQueue.add('calendar-change', change, { jobId: persisted.id });
      return res.status(202).json({ status: inbox.rowCount ? 'accepted' : 'duplicate', deliveryId });
    } catch (error) { next(error); }
  });
  return app;
}
