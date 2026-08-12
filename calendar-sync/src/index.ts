import http from 'node:http';
import { Pool } from 'pg';
import { buildIngress } from './ingress.js';
import { attachRealtimeGateway, publishOutbox } from './outbox.js';
import { startCalendarWorker } from './worker.js';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const app = buildIngress(db);
const server = http.createServer(app);
const gateway = attachRealtimeGateway(server);
startCalendarWorker(db);

setInterval(() => { void publishOutbox(db, gateway).catch(console.error); }, 250);
server.listen(Number(process.env.CALENDAR_SYNC_PORT ?? 4100), () => console.log('Calendar sync service ready'));
