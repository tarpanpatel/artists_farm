import { Worker } from 'bullmq';
import { Pool } from 'pg';
import { applyCalendarChange } from './availability.js';
import { redis } from './queue.js';
import type { CalendarChange } from './types.js';

export function startCalendarWorker(db: Pool) {
  return new Worker<CalendarChange>(
    'calendar-sync',
    async (job) => applyCalendarChange(db, job.data),
    { connection: redis, concurrency: 20 },
  );
}
