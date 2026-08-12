import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { CalendarChange } from './types.js';

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const calendarQueue = new Queue<CalendarChange>('calendar-sync', {
  connection: redis,
  defaultJobOptions: {
    attempts: 8,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: 1_000,
    removeOnFail: false,
  },
});
