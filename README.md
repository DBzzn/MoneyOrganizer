# Money Organizer

> Personal finance web app for tracking income, expenses, installments, categories, dashboards, reports, and financial projections.

![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

---

## Table of Contents

- [About](#about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Running Locally](#running-locally)
- [Tailscale/VPN Access](#tailscalevpn-access)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)
- [Technical Decisions](#technical-decisions)
- [Roadmap](#roadmap)

---

## About

Money Organizer started as a personal alternative to spreadsheet-based financial control. It later evolved into a portfolio project focused on learning TypeScript, NestJS, Prisma, and React while solving a real problem.

The goal is not only to register transactions. The app is meant to help users understand their financial life more clearly:

- How is my selected month going?
- Where is my money going?
- Which expenses had the biggest impact?
- What is still pending or projected for future months?

The project currently follows a modular monolith backend with a separate frontend, keeping the architecture simple and incrementally scalable.

---

## Features

### Implemented

- JWT authentication
- User registration and login
- Protected authenticated routes
- Category CRUD
- Default categories created when a user registers
- Transaction CRUD
- Transaction types: income, debit, credit, installment credit, pix, and cash
- Installment creation with multiple generated transactions
- Accurate cent distribution for installment payments
- Unified delete flow for one or many transactions
- Ownership validation for operations using IDs
- Search and quick filters on transactions
- Month selector on transactions
- Dashboard month selector
- Dashboard with income, expenses, balance, evolution, and expenses by category
- Dashboard with top expenses, top income, and monthly signals
- Reports with monthly balance, evolution, projection, rankings, and period summary
- Light/dark theme using CSS variables
- Global themed controls, selectors, and popovers
- Swagger/OpenAPI available at `/api`
- Development support for Tailscale/VPN access

### In Progress / Next Improvements

- Real mobile responsiveness
- Layout fixes for Samsung S21 Ultra and similar devices
- Mobile sidebar/navigation
- Mobile adjustments for selectors, charts, tables, modals, and forms
- Month-over-month comparison on the Dashboard
- Better handling when deleting categories linked to transactions
- Future improvements for recurrence, goals, budgets, and exports

---

## Tech Stack

### Backend

| Technology | Purpose |
|---|---|
| NestJS 11 | Backend framework |
| TypeScript | Main language |
| Prisma ORM 7 | ORM |
| PostgreSQL 15 | Database |
| Docker Compose | Local database and pgAdmin |
| JWT + Passport | Authentication |
| bcrypt | Password hashing |
| class-validator | DTO validation |
| Swagger/OpenAPI | API documentation |

### Frontend

| Technology | Purpose |
|---|---|
| React 19 | UI |
| TypeScript | Main language |
| Vite 8 | Dev server and build tool |
| Tailwind CSS 4 | Styling |
| React Router DOM | Routing |
| Axios | HTTP client with JWT interceptor |
| React Hook Form + Zod | Forms and validation |
| Recharts | Charts |
| Lucide React | Icons |
| react-hot-toast | Notifications |

---

## Architecture

### Backend

- Modular monolith using NestJS
- Main modules:
  - auth
  - users
  - categories
  - transactions
  - prisma
- DTOs validated with `ValidationPipe`
- Prisma access centralized through `PrismaService`
- Swagger configured in the application bootstrap

### Security and Data Integrity Rules

- Every financial resource belongs to a user
- Sensitive queries are filtered by `userId`
- Ownership must be validated for every received ID
- Bulk operations fail if any ID does not belong to the current user
- Ownership failures return 404 to avoid leaking resource existence
- Monetary values use `Decimal`, never `Float`
- Installment creation uses Prisma transactions to preserve atomicity

### Frontend

- API calls centralized under `src/api`
- Authentication handled through context and JWT stored in `localStorage`
- Theme handled with CSS custom properties
- Pages and components preserve the current visual language
- Reusable global controls for inputs, selectors, and popovers
- Mobile responsiveness is the current priority for the next UI pass

---

## Running Locally

### Requirements

- Node.js 18+
- Docker Desktop
- Git

### 1. Clone the repository

```bash
git clone https://github.com/DBzzn/money-organizer.git
cd money-organizer
```

### 2. Start the database

```bash
cd money-organizer-api
docker-compose up -d
```

pgAdmin:

- URL: `http://localhost:5050`
- Email: `admin@admin.com`
- Password: `admin`

### 3. Configure and run the backend

```bash
cd money-organizer-api
npm install
cp .env.example .env
npx prisma migrate dev
npx prisma generate
npm run start:dev
```

Backend:

- API: `http://localhost:3000`
- Swagger: `http://localhost:3000/api`

### 4. Configure and run the frontend

```bash
cd money-organizer-web
npm install
cp .env.example .env
npm run dev
```

Frontend:

- App: `http://localhost:5173`

---

## Tailscale/VPN Access

The project is prepared for local development testing from other devices in the same VPN, such as a phone or another computer.

By default:

- Backend listens on `0.0.0.0:3000`
- Vite frontend listens on `0.0.0.0:5173`
- CORS allows localhost and development Tailscale origins
- The frontend can use `VITE_API_URL=auto` to call the API on the same host used to open the app

Example:

```txt
Frontend: http://<TAILSCALE_IP>:5173
Swagger:  http://<TAILSCALE_IP>:3000/api
```

To find your Tailscale IP:

```bash
tailscale ip -4
```

If the app does not open from your phone, check:

- whether backend and frontend are running
- whether Windows Firewall allows Node/Vite/Nest on private networks
- whether the phone is connected to the same tailnet
- whether `VITE_API_URL` is set to `auto` or points to the correct IP

---

## Environment Variables

### Backend (`money-organizer-api/.env`)

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/moneyorganizer"
JWT_SECRET="your_secret_key_here"
PORT=3000
APP_HOST=0.0.0.0
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ALLOW_TAILSCALE_ORIGINS=true
```

### Frontend (`money-organizer-web/.env`)

```env
VITE_API_URL=auto
```

You can also set the API URL manually:

```env
VITE_API_URL=http://localhost:3000
```

---

## API Endpoints

### Auth / Users

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/users` | Creates a user and default categories | No |
| POST | `/auth/login` | Authenticates the user and returns a JWT | No |
| GET | `/auth/me` | Returns the current authenticated user | Yes |

### Categories

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/categories` | Lists the user's categories | Yes |
| POST | `/categories` | Creates a category | Yes |
| PATCH | `/categories/:id` | Updates a category | Yes |
| DELETE | `/categories/:id` | Deletes a category | Yes |

### Transactions

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| GET | `/transactions` | Lists transactions with filters | Yes |
| POST | `/transactions` | Creates a transaction | Yes |
| POST | `/transactions/installments` | Creates an installment group | Yes |
| GET | `/transactions/:id` | Finds a transaction by ID | Yes |
| PATCH | `/transactions/:id` | Updates a transaction | Yes |
| DELETE | `/transactions/:id` | Deletes one transaction | Yes |
| DELETE | `/transactions/bulk` | Deletes multiple transactions | Yes |
| GET | `/transactions/totals/by-category` | Totals by category | Yes |
| GET | `/transactions/totals/monthly-balance` | Monthly balance | Yes |
| GET | `/transactions/reports/evolution` | Period evolution | Yes |
| GET | `/transactions/reports/projection` | Future projection | Yes |

Interactive documentation:

```txt
http://localhost:3000/api
```

---

## Technical Decisions

### Why NestJS?

NestJS provides modular architecture, dependency injection, and a consistent pattern for controllers, services, DTOs, and guards. This helps the project grow without becoming unstructured.

### Why Prisma?

Prisma provides strong typing, migrations, and a clear query API. In this project, it also helps keep `userId` filters explicit and predictable.

### Why Decimal for money?

Monetary values should not use `Float`, because floating-point arithmetic can introduce precision errors. This project uses `Decimal` to preserve financial integrity.

### Why validate ownership for every ID?

In a financial system, a user must never operate on another user's data. In operations with multiple IDs, every ID must be validated before the operation. If one ID fails, the entire operation fails.

### Why `VITE_API_URL=auto`?

When testing through Tailscale, if the user opens the app using the machine IP, the frontend also needs to call the API on that same IP. `localhost` on a phone would point to the phone itself, not to the computer running the API.

---

## Roadmap

### Done

- [x] JWT authentication
- [x] Category CRUD
- [x] Transaction CRUD
- [x] Automatic installments
- [x] Accurate cent distribution in installments
- [x] Dashboard with charts
- [x] Dashboard month selector
- [x] Top expenses, top income, and monthly signals
- [x] Reports and projections
- [x] Light/dark theme
- [x] Transaction search and quick filters
- [x] Unified single/bulk delete
- [x] Themed controls and popovers
- [x] Tailscale/VPN development access

### In Progress

- [ ] Mobile responsiveness audit
- [ ] Mobile fixes for Samsung S21 Ultra and similar screens
- [ ] Mobile sidebar/navigation
- [ ] Mobile layouts for Dashboard, Transactions, Categories, and Reports
- [ ] Mobile charts, selectors, modals, and forms

### Next Steps

- [ ] Month-over-month comparison on the Dashboard
- [ ] Better handling for deleting categories linked to transactions
- [ ] Textual insights in Reports
- [ ] Highlight negative future months in projections
- [ ] Category budgets
- [ ] Financial goals
- [ ] Automatic recurring transactions
- [ ] CSV/PDF export
- [ ] Deploy

---

## Current Status

The project is under active development. The main foundation is functional, including backend, frontend, local database, authentication, transactions, categories, dashboard, and reports.

The immediate focus is improving mobile responsiveness, because real testing through Tailscale on a Samsung S21 Ultra showed that the interface is usable but visually broken in several places.

---

## Author

Developed as a portfolio project for practical learning and incremental evolution with NestJS, React, TypeScript, Prisma, and PostgreSQL.
