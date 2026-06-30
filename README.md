# Money Organizer

> Personal finance web app for account-aware transactions, reports, reminders, statement imports, and financial planning.

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

Money Organizer started as a personal alternative to spreadsheet-based financial control. It is now a modular TypeScript application focused on correctness, auditability, and practical day-to-day finance workflows.

The product goal is simple: help a user understand what happened, what is pending, which account changed, and what needs attention next.

## Current Status

The app is an active local-first MVP with real authenticated QA, a PostgreSQL-backed API, and a React interface. Core finance flows are implemented and the current development focus is statement-import hardening using a private real-world Nubank corpus.

Private PRDs, checkpoints, and real statement fixtures live under the local `docs/` folder. That folder is intentionally ignored and must not be force-added to Git because it can contain sensitive financial data.

## Implemented Capabilities

### Authentication and User Settings

- User registration and login with JWT authentication.
- Protected app routes.
- Authenticated user profile loading.
- Profile update with current password confirmation.
- Password update with current password confirmation.
- Financial preference for reserve target months.
- User-owned data reset and account deletion flows guarded by password confirmation.

### Categories

- Category CRUD.
- Income, expense, and mixed category kinds.
- Category icon support with stored Lucide icons and legacy emoji compatibility.
- Category archiving when historical transactions depend on the category.
- Ownership validation on all category operations.

### Financial Accounts and Ledger

- Financial account CRUD with account type, institution, icon, color, dashboard visibility, and archive state.
- Default initial account for new users.
- Account-aware transactions, transfers, and balance adjustments.
- Current balance calculation based on effective confirmed movements.
- Unified account ledger with transactions, transfers, balance adjustments, running balances, and source actions.
- Pending movement handling so future items do not distort current balances.

### Transactions and Transfers

- Transaction CRUD.
- Transaction types for income, debit, credit, installment credit, Pix, and cash.
- Installment creation with cent-safe distribution.
- Search, month filters, quick type filters, and account filters.
- Single and bulk delete paths using ownership checks.
- Transfer creation between financial accounts.
- Transfer-aware account balances without polluting income or expense reports.

### Reminders

- Reminder CRUD for operational finance follow-up.
- Due-date driven reminder states.
- Integration with the authenticated app shell.

### Dashboard and Reports

- Dashboard month selector.
- Income, expenses, balance, evolution, top income, top expenses, and monthly signals.
- Reports with monthly summary, account filters, category totals, projection, reserve indicators, score/reserve metrics, rankings, and exports.
- HTML/PDF export path for reports.
- Light and dark theme support through CSS variables.
- App-wide copy, accessible icon-only controls, and refined hover/danger surfaces.

### Statement Imports

- Import preview and persisted import batches.
- Supported parser priority: OFX, CSV/TSV/TXT, and PDF.
- XLSX is intentionally blocked until a real fixture and dependency decision exist.
- Batch review workflow with movement editing, status changes, category review, target review, reconciliation hints, and bulk review actions.
- Apply-ready flow that creates real financial transactions/transfers only after review.
- Selective undo for applied imported movements.
- Duplicate and overlap detection using file hashes, statement metadata, movement fingerprints, and reconciliation state.
- Real Nubank parser regression coverage across private CSV, OFX, and PDF samples.
- Automatic category suggestions based on previously classified transactions and reviewed imported movements.
- Automatic account inference from previous imports with the same provider and statement account metadata.
- Parser behavior extracts account metadata from statements; production code must not hardcode personal account numbers or account-holder names.

## Architecture

### Backend

The backend is a NestJS modular monolith.

Main modules:

- `auth`
- `users`
- `categories`
- `financial-accounts`
- `transactions`
- `transfers`
- `balance-adjustments`
- `reminders`
- `statement-imports`
- `prisma`

Important patterns:

- Prisma is centralized through `PrismaService`.
- DTOs use `class-validator` and the global `ValidationPipe`.
- Global validation uses whitelisting and rejects non-whitelisted properties.
- Sensitive data access is scoped by `userId`.
- Ownership failures generally return not-found style responses to avoid leaking resource existence.
- Monetary values are represented with `Decimal`/integer cents rather than floats.
- Financial write flows use transactions where atomicity matters.
- File uploads are size-limited at the controller level.

### Frontend

The frontend is a Vite + React application.

Main routes:

- `/login`
- `/register`
- `/dashboard`
- `/categories`
- `/accounts`
- `/transactions`
- `/transfers`
- `/reminders`
- `/statement-imports`
- `/reports`
- `/settings`

Important patterns:

- API clients live under `money-organizer-web/src/api`.
- Auth state lives in context and currently stores the JWT in `localStorage`.
- Theme state uses CSS variables and local preferences.
- Route protection redirects expired sessions back to login.
- UI uses shared visual tokens for inputs, selectors, popovers, danger surfaces, and hover states.

## Security and Data Integrity Posture

Implemented safeguards:

- JWT-protected backend routes for private resources.
- User ownership filters across financial entities.
- Current-password confirmation for destructive account settings.
- DTO whitelisting and validation.
- File upload size limits for statement previews and persisted batches.
- Statement import review gate before financial records are created.
- Undo surface for applied imported movements.
- Parser regression tests for real statement formats.
- Local `docs/` folder kept out of version control because it can contain sensitive fixtures.

Known hardening backlog:

- Move production auth away from long-lived JWTs in `localStorage` toward a session/refresh strategy with an explicit CSRF model.
- Add rate limiting for login and sensitive endpoints.
- Complete an IDOR regression matrix across every controller.
- Keep dependency audit work active; the frontend audit is clean after lockfile refresh, while the backend still has upload-stack transitive advisories that require a dependency decision rather than a blind forced downgrade.
- Consider masking or minimizing visible statement metadata such as account numbers and file hashes in future production UI.
- Add observability/audit logs before any hosted multi-user deployment.

## Current Technical Debt

The biggest maintainability risks are concentrated in a few files:

- `money-organizer-web/src/pages/StatementImports.tsx` is the largest frontend surface and should be split into focused review, upload, batch, movement, modal, and hook modules.
- `money-organizer-api/src/statement-imports/statement-imports.service.ts` owns parsing orchestration, dedupe, review hints, apply/undo, reconciliation, account inference, and category inference. It should be split after the import QA baseline is stable.
- `money-organizer-web/src/pages/Reports.tsx` still mixes data shaping, UI, HTML export, and PDF export.
- `money-organizer-api/src/transactions/transactions.service.ts` has older formatting debt and should be normalized once higher-risk import work calms down.

These are not blockers for the current MVP, but they are the next places where small changes can become expensive if the project keeps growing.

## Running Locally

### Requirements

- Node.js 20+ recommended
- Docker Desktop
- Git

On Windows, prefer `npm.cmd` when running scripts from PowerShell.

### 1. Start PostgreSQL

```bash
cd money-organizer-api
docker-compose up -d
```

pgAdmin is available at `http://localhost:5050` when the compose profile is running.

### 2. Configure the Backend

```bash
cd money-organizer-api
npm install
cp .env.example .env
npx prisma migrate dev
npx prisma generate
npm run start:dev
```

Backend URLs:

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api`

### 3. Configure the Frontend

```bash
cd money-organizer-web
npm install
cp .env.example .env
npm run dev
```

Frontend URL:

- App: `http://localhost:5173`

## Environment Variables

Backend example:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/moneyorganizer"
JWT_SECRET="replace_with_a_local_secret"
PORT=3000
APP_HOST="0.0.0.0"
CORS_ORIGINS="http://localhost:5173,http://127.0.0.1:5173"
ALLOW_TAILSCALE_ORIGINS="true"
```

Frontend example:

```env
VITE_API_URL="http://localhost:3000"
```

For local device testing through Tailscale or another VPN, `VITE_API_URL=auto` makes the frontend call the backend on the same host used to open the app.

## Validation Commands

Backend:

```bash
cd money-organizer-api
npm run build
npm test -- --runInBand
npm audit --omit=dev --audit-level=high
```

Frontend:

```bash
cd money-organizer-web
npm run lint
npm run build
npm audit --omit=dev --audit-level=high
```

Repository:

```bash
git diff --check
git status --short
```

## API Surface

High-level authenticated API areas:

- `POST /auth/login`
- `GET /auth/me`
- `POST /users`
- `PATCH /users/me/profile`
- `PATCH /users/me/password`
- `PATCH /users/me/preferences`
- `DELETE /users/me/data`
- `DELETE /users/me`
- category CRUD
- financial account CRUD and account ledger
- transaction CRUD, bulk delete, reports, and projection
- transfer CRUD
- balance adjustment CRUD
- reminder CRUD
- statement import preview, batches, review, apply-ready, undo-applied, and movement updates

Swagger documents the current local API at `/api`.

## Roadmap Summary

Near-term priorities:

- Finish the statement import QA lane using the private real Nubank corpus.
- Keep XLSX blocked until there is a real fixture and an explicit dependency decision.
- Keep `BalanceAdjustment` apply from imports blocked until the domain model is decided.
- Refactor the largest import and report surfaces after the import behavior is locked down by tests.
- Expand settings QA for destructive account/data flows on disposable users.
- Add rate limiting, dependency audit follow-up, and broader ownership regression tests before any hosted deployment.

Mid-term priorities:

- Make reserve planning first-class with reserve gap and time-to-target indicators.
- Improve dashboard/report separation between account position and monthly cash flow.
- Add backup/export and privacy controls.
- Add production readiness work: deployment, observability, stricter auth/session posture, and E2E smoke tests.

Future discovery:

- Investments should be treated as a dedicated product and architecture discussion before implementation.
- Open Finance should come after the import pipeline, account model, and security posture are mature enough to absorb the complexity.
