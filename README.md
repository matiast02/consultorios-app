# Consultorio App

Medical office management system built with Next.js 15, Prisma ORM, Auth.js v5, MySQL, and shadcn/ui.

## Tech Stack

- **Framework:** Next.js 15 (App Router, Turbopack, standalone output)
- **Language:** TypeScript 5
- **Database:** MySQL 8.0 + Prisma ORM 6
- **Auth:** Auth.js v5 (credentials-based)
- **Styling:** Tailwind CSS 4 + shadcn/ui (Radix UI)
- **Forms:** React Hook Form + Zod
- **Deployment:** Docker + Dokploy

## Features

- **Role-based access control** — Admin, Secretary, Health Professional (medic)
- **Patient management** — Demographics, health insurance, clinical records
- **Appointment scheduling** — Calendar views, recurring shifts, overbooking
- **Clinical records** — Evolutions, prescriptions, study orders
- **Profession-based configuration** — Custom labels, modules, and clinical fields per profession type
- **User management** — Enable/disable users (soft delete), admin password reset
- **Audit logging** — Track all system actions

### Role Permissions

| Action | Admin | Secretary | Professional |
|--------|-------|-----------|--------------|
| Manage all users | Yes | No | No |
| Manage professionals | Yes | Create/Edit/Delete | No |
| View secretaries | Yes | Read-only | No |
| Manage secretaries | Yes | No | No |
| Reference data (specialties, etc.) | Yes | No | No |
| Schedule config (hours, blocked days) | No | No | Yes |
| Patient CRUD | Yes | Yes | Yes |
| Appointments | Yes | Yes | Yes |

## Getting Started (Development)

### Prerequisites

- Node.js 20+
- pnpm
- Docker (for MySQL)

### Setup

```bash
# Clone the repository
git clone https://github.com/matiast02/consultorios-app.git
cd consultorios-app

# Install dependencies
pnpm install

# Start MySQL (Docker)
docker compose up -d

# Copy environment variables
cp .env.example .env
# Edit .env and set AUTH_SECRET (generate with: openssl rand -base64 32)

# Generate Prisma client and apply migrations
npx prisma generate
npx prisma migrate dev

# Seed database with base data + test data
pnpm run db:seed

# Start development server
pnpm run dev
```

The app will be available at `http://localhost:3000`.

### Test Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@consultorio.com | password123 |
| Secretary | maria@consultorio.com | password123 |
| Professional | dr.gervilla@consultorio.com | password123 |
| Professional | dra.lopez@consultorio.com | password123 |

### Commands

```bash
pnpm run dev             # Start dev server (Turbopack)
pnpm run build           # Production build
pnpm run start           # Start production server
pnpm run lint            # Run ESLint
pnpm run test            # Run tests
pnpm run db:generate     # Generate Prisma client
pnpm run db:push         # Push schema to database (dev only)
pnpm run db:migrate      # Create and apply migration (dev)
pnpm run db:migrate:deploy # Apply pending migrations (production)
pnpm run db:studio       # Open Prisma Studio
pnpm run db:seed         # Seed base data + test data
pnpm run db:seed-base    # Seed base data only (production-safe)
pnpm run docker:up       # Start MySQL container
pnpm run docker:down     # Stop MySQL container
```

## Production Deployment (Dokploy)

### Architecture

```
Push to main --> Dokploy detects change --> Docker build --> Deploy
                                              |
                                              |-- Stage 1: Install dependencies (pnpm)
                                              |-- Stage 2: Generate Prisma client + build Next.js
                                              +-- Stage 3: Minimal runner (~150MB)
                                                    |
                                                    +-- Entrypoint:
                                                        1. prisma migrate deploy
                                                        2. node seed-base.cjs (idempotent)
                                                        3. node server.js
```

### First-Time Setup

1. **Create a MySQL database** in Dokploy (or use an external MySQL 8.0 instance).

2. **Create the application** in Dokploy pointing to this repository, branch `main`, using the Dockerfile.

3. **Configure environment variables** in Dokploy:

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `DATABASE_URL` | Yes | MySQL connection string: `mysql://user:pass@host:3306/consultorio` |
   | `AUTH_SECRET` | Yes | Generate with `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | Yes | Your production URL: `https://your-domain.com` |
   | `ADMIN_EMAIL` | First deploy | Email for the initial admin account |
   | `ADMIN_PASSWORD` | First deploy | Password for the initial admin (min 8 chars, 1 uppercase, 1 number) |

4. **Deploy.** The entrypoint will automatically:
   - Run all pending database migrations
   - Seed base data (roles, professions, specialties, health insurances, consultation types, medications)
   - Create the admin user if `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set
   - Start the Next.js server

5. **After the first deploy:** remove `ADMIN_EMAIL` and `ADMIN_PASSWORD` from the environment variables. They are no longer needed — the admin user is already created and can manage all other users from the dashboard.

### Subsequent Deploys

Every push to `main` triggers an automatic deployment:

1. Docker rebuilds the image
2. The entrypoint runs pending migrations (if any)
3. Base data seed runs (idempotent — uses upserts, safe to run every time)
4. The app restarts

No manual intervention needed.

### Database Migrations

Migrations are managed with Prisma Migrate:

- **Development:** `pnpm run db:migrate` creates a new migration file and applies it
- **Production:** migrations are applied automatically on deploy via `prisma migrate deploy`
- Migration files are committed to the repository under `prisma/migrations/`

### Seed Data

The system uses two seed files:

| File | Purpose | When to use |
|------|---------|-------------|
| `prisma/seed-base.ts` | Master data (roles, professions, specialties, health insurances, consultation types, medications). Idempotent. | Runs automatically on every deploy |
| `prisma/seed.ts` | Base data + test users, patients, appointments | Development only (`pnpm run db:seed`) |

## Project Structure

```
app/
|-- (auth)/                    # Public pages (login)
|-- (dashboard)/               # Protected pages
|   +-- dashboard/
|       |-- administracion/    # Admin pages
|       |   |-- profesionales/ # Health professional CRUD
|       |   |-- secretarias/   # Secretary CRUD
|       |   |-- usuarios/      # All users (admin-only)
|       |   |-- especialidades/
|       |   |-- obras-sociales/
|       |   |-- tipos-consulta/
|       |   |-- profesiones/   # Read-only
|       |   |-- auditoria/
|       |   +-- modulos/
|       |-- calendario/        # Appointment calendar
|       |-- configuracion/     # User profile and schedule
|       |-- estadisticas/      # Statistics
|       +-- pacientes/         # Patient management
+-- api/                       # API routes

components/
|-- admin/                     # Admin dialogs and forms
|-- calendar/                  # Calendar views
|-- clinical/                  # Clinical record components
|-- shifts/                    # Appointment components
|-- ui/                        # shadcn/ui components
+-- ...

prisma/
|-- schema.prisma              # Database schema
|-- migrations/                # Migration files (committed)
|-- seed-base.ts               # Production seed (master data)
+-- seed.ts                    # Development seed (test data)

lib/                           # Utilities, validations, auth helpers
types/                         # TypeScript type definitions
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://app_user:app_password_2024@localhost:3307/consultorio` |
| `AUTH_SECRET` | Auth.js secret key | — |
| `NEXTAUTH_URL` | Application base URL | `http://localhost:3000` |
| `ADMIN_EMAIL` | Initial admin email (first deploy only) | — |
| `ADMIN_PASSWORD` | Initial admin password (first deploy only) | — |

## License

Private project.
