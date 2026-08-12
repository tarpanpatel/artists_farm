import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { WebSocket, WebSocketServer } from 'ws';
import type { AvailabilityChangedEvent } from './types.js';

type Client = WebSocket & { propertyId?: number };

async function authorize(req: import('node:http').IncomingMessage, propertyId: number): Promise<boolean> {
  const url = process.env.CALENDAR_SYNC_SESSION_AUTH_URL;
  if (!url) return false; // Secure-by-default: do not expose availability without a session verifier.
  const response = await fetch(url, {
    method: 'POST',
    headers: { cookie: req.headers.cookie ?? '', 'content-type': 'application/json' },
    body: JSON.stringify({ propertyId }),
  });
  return response.ok && (await response.json() as { authorized?: boolean }).authorized === true;
}

export function attachRealtimeGateway(server: Server) {
  const gateway = new WebSocketServer({ noServer: true });
  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const propertyId = Number(url.searchParams.get('propertyId'));
    if (url.pathname !== '/ws/calendar' || !Number.isInteger(propertyId) || !(await authorize(req, propertyId))) {
      socket.destroy();
      return;
    }
    gateway.handleUpgrade(req, socket, head, (client: Client) => {
      client.propertyId = propertyId;
      gateway.emit('connection', client, req);
    });
  });
  return gateway;
}

export async function publishOutbox(db: Pool, clients: WebSocketServer) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const records = await client.query<{ id: string; payload: AvailabilityChangedEvent }>(
      `SELECT id, payload FROM outbox_event
       WHERE published_at IS NULL
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED LIMIT 100`,
    );
    for (const record of records.rows) {
      const frame = JSON.stringify(record.payload);
      clients.clients.forEach((socket: Client) => {
        if (socket.readyState === WebSocket.OPEN && socket.propertyId === record.payload.propertyId) socket.send(frame);
      });
      await client.query('UPDATE outbox_event SET published_at = now() WHERE id = $1', [record.id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
