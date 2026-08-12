# Calendar sync service

This service is deliberately separate from the existing PHP/MySQL application. It requires PostgreSQL for range exclusion constraints and Redis for BullMQ.

1. Create the availability schema with `sql/001_availability.sql` after migrating the target `rooms` table.
2. Copy `.env.example` to `.env`, then set PostgreSQL/Redis URLs and every channel signing secret.
3. Implement `CALENDAR_SYNC_SESSION_AUTH_URL` in PHP: validate the forwarded application session and return `{"authorized": true}` only when it can access the submitted property ID.
4. Run `npm install` and `npm run start` in this directory. Reverse-proxy `/webhooks/*` and `/ws/calendar` to the service on the PMS origin.
5. Set `VITE_CALENDAR_SYNC_WS_URL=wss://your-pms.example/ws/calendar`, then rebuild the frontend.

The generic webhook ingress expects adapters to normalize verified provider payloads into `CalendarChange`. Add a provider-specific adapter before exposing each OTA endpoint; do not map raw OTA payload fields without validating event version and room mapping.
