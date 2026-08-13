# Ground Code â€” Hospitality Operations Platform

Ground Code is a multi-tenant hospitality operations platform for vacation rentals, boutique stays, and B&B properties. It supports both single-key properties (one active booking at a time) and multi-key properties with independently managed rooms.

The application combines front-desk operations, food service, finance, staff coordination, property administration, and operational reporting in one web dashboard.

## What it does

- Manage tenants, properties, licences, modules, and property-level settings.
- Run single-key and multi-key properties; multi-key rooms can each have one active booking.
- Register guests, collect ID documents, track check-ins, complete verification, and perform checkout with receipts.
- Manage menu items, kitchen orders, staff meals, stock requests, purchases, wastage, recipes, and inventory.
- Track petty cash, expense items, cash drawer activity, miscellaneous charges, salary payments, and financial ledgers.
- Manage staff, users, roles, attendance, payees, and permissions.
- Handle service requests, iCal synchronisation, Telegram notifications, audit logs, diagnostics, data export, themes, and custom navigation.

## Architecture

```
Browser
  â””â”€ React + TypeScript application (src/)
       â””â”€ PHP API client (src/services/api.ts)
            â””â”€ PHP API router (php/api/router.php)
                 â”œâ”€ Domain modules: guests, kitchen, inventory, finance, staff, billing
                 â”œâ”€ Platform modules: tenants, properties, licences, themes, configuration
                 â””â”€ MySQL database
```

### Frontend

- **React 19** with **TypeScript**
- **Vite** for local development and production builds
- **Tailwind CSS** plus application CSS overrides
- **Lucide React** for icons
- Context providers for authentication, modules, staff, kitchen, inventory, finance, and configuration data

The primary frontend entry points are:

- `src/main.tsx` â€” browser bootstrap and global client-side error capture.
- `src/App.tsx` â€” application composition, screen state, and feature orchestration.
- `src/services/api.ts` â€” API calls, property resolution, and client-side data mapping.
- `src/components/DataLoader.tsx` â€” loads property, enabled modules, navigation, and Telegram configuration before rendering the app.

### Backend

The PHP backend is organised by domain. `php/api/router.php` is the central action dispatcher; frontend calls use the form:

```
/php/api/router.php?action={action}
```

Major backend directories:

- `php/config/` â€” database connection, property resolution, testing sandbox, and system configuration.
- `php/guests/`, `php/billing/`, `php/kitchen/`, `php/inventory/`, `php/finance/`, `php/staff/` â€” operational modules.
- `php/modules/`, `php/licenses/`, `php/theme/`, `php/service_requests/` â€” platform and property configuration.
- `php/telegram/`, `php/cron/` â€” Telegram integration and scheduled tasks.
- `php/database/`, `php/schema/` â€” migrations, schema utilities, and configuration seeding.

## Multi-tenant and multi-key routing

The application resolves the current property from an explicit query parameter, request header, or URL. The normal tenant/property URL shape is:

```
/artists_farm/{tenant_slug}/{property_slug}/
```

For multi-key properties, room selection is kept in the URL hash, for example:

```
/artists_farm/{tenant_slug}/{property_slug}/#room-101
```

Property resolution is enforced on the backend so that an unknown explicit property or tenant request does not silently fall back to another property's data.

## Local development

### Prerequisites

- Node.js and npm
- PHP 8.2+
- MySQL/MariaDB
- Apache/XAMPP for the PHP application

### Install and run the frontend

```bash
npm install
npm run dev
```

Vite runs on port `3000` and proxies `/php` API requests to the local Apache instance. The current proxy configuration expects the PHP application under `/artists_farm-ai2/php`; update `vite.config.ts` if your local folder name differs.

### Configure the database

Database configuration is in `php/config/database.php`.

- Local development uses the MySQL `root` account with no password by default and the `artists_farm_resort` database.
- Production reads `DB_PASSWORD` from the environment, or from the untracked `php/config/db_pass.php` file.
- The backend runs its table-initialisation/migration helpers during connection setup.

### Production build

```bash
npm run build
```

The build is written to `dist/`. `index.php` serves that compiled application and rewrites asset paths so the SPA works from nested tenant/property URLs.

## Authentication and security model

- Login uses PHP sessions and cookie-based browser authentication.
- API write operations require an authenticated session or server-side API key, subject to the router's public-action rules.
- API requests are scoped to the resolved property.
- SQL access is expected to use prepared statements.
- The frontend no longer embeds an API key.
- A testing mode can direct requests to a separate test database where available.

## Operations and integrations

- **Telegram:** property-level bot configuration, pairing, templates, alerts, test messages, polling, and webhooks.
- **iCal:** import/export and scheduled synchronisation tools.
- **Auditing:** browser and PHP errors, operational activity, and API requests are recorded through the Telescope-style logging utilities.
- **Deployment:** SFTP and PowerShell deployment utilities are included in the project root. See `DEPLOYMENT.md` and related deployment guides.

## Project conventions

- Use Lucide React for UI icons.
- Use Tailwind utilities and include dark-mode styling for new UI.
- Display dates as `DD/MM/YYYY` unless a time is specifically needed.
- Database fields use `snake_case`; API/client models use `camelCase`.
- Preserve multi-key booking integrity: one active booking per room.
- Pass feature callbacks explicitly from `App.tsx` through components where business behaviour depends on them.

Detailed implementation conventions are maintained in `CLAUDE.md`.

## Repository layout

```
src/                 React application
  components/        Dashboard and operational UI
  contexts/          Shared client-side state providers
  services/          API and theme services
  utils/             Logging, client detection, and UI helpers
php/                 PHP/MySQL backend
  api/               Central router and supporting endpoints
  config/            Database and property-resolution configuration
  cron/              Scheduled tasks
  database/          Migrations and initialisation
  uploads/           User-uploaded images and ID documents
api/                 Legacy/platform authentication endpoints
dist/                Generated production frontend build
assets/, icons/      Static assets
```

## Validation

There is currently no configured automated test suite. Before deployment, validate the affected frontend flow in the browser, check the Network and Console panels, run the TypeScript check, and lint PHP syntax:

```bash
npm exec tsc -- --noEmit
C:\xampp\php\php.exe -l php\api\router.php
```

## Documentation

- `CLAUDE.md` â€” implementation rules and project conventions.
- `DEPLOYMENT.md`, `DEPLOYMENT_GUIDE.md`, `DEPLOY_TO_PRODUCTION.md` â€” deployment guidance.
- `MONITORING.md`, `USER_PROBLEM_DETECTION.md` â€” monitoring and diagnostics.
- `ROADMAP.md` â€” current roadmap status.

