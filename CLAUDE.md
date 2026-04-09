# Project Context

Sistema de gestión de consultorios médicos. Full-stack Next.js 15 con Prisma ORM, Auth.js v5, MySQL, Docker y shadcn/ui.

Migración de un backend Express.js + frontend React (CRA) separados a una app unificada en Next.js.

## Tech Stack

- Next.js ^15.2.3 (App Router, Turbopack)
- React ^19.0.0
- TypeScript ^5
- Prisma ^6.2.1 (ORM) — MySQL
- Auth.js / NextAuth ^5.0.0-beta.25
- MySQL 8.0 (via Docker)
- Tailwind CSS ^4.0.0
- shadcn/ui (Radix UI + CVA)
- React Hook Form + Zod
- bcryptjs (password hashing)
- Sonner (toast notifications)

## Domain Model

- **Users** — Médicos y secretarias con roles
- **Patients** — Pacientes con datos personales, DNI, obra social
- **Shifts** — Turnos/citas (pendiente, confirmado, ausente, finalizado, cancelado)
- **HealthInsurance** — Obras sociales
- **UserPreferences** — Horarios de atención por día (AM/PM)
- **BlockDays** — Días bloqueados por médico
- **Roles** — medic, secretary, admin

## Project Structure

App Router with route groups:

- `app/(auth)/` — Login, register pages
- `app/(dashboard)/` — Protected dashboard pages
- `app/api/` — API routes (auth, patients, shifts, os, preferences, stats)
- `components/` — React components
- `lib/` — Utilities, Prisma client, validations
- `types/` — TypeScript type definitions
- `prisma/` — Prisma schema and seed file
- `auth.ts` — Auth.js configuration
- `auth.config.ts` — Auth.js provider config
- `middleware.ts` — Auth middleware for route protection
- `docker-compose.yml` — MySQL + phpMyAdmin containers

## Getting Started

```bash
pnpm install
docker compose up -d
npx prisma generate
npx prisma db push
pnpm run dev
```

## Key Commands

```bash
pnpm run dev          # Start dev server with Turbopack
pnpm run build        # Production build
pnpm run db:generate  # Generate Prisma client
pnpm run db:push      # Push schema to database
pnpm run db:migrate   # Run Prisma migrations
pnpm run db:studio    # Open Prisma Studio
pnpm run db:seed      # Seed database
pnpm run docker:up    # Start MySQL container
pnpm run docker:down  # Stop MySQL container
```

## Important Patterns

- Auth.js v5 config split between `auth.ts` and `auth.config.ts`
- Prisma schema with MySQL provider and `@auth/prisma-adapter`
- Credentials auth uses bcryptjs for password hashing
- Route groups: `(auth)` for public, `(dashboard)` for protected pages
- Role-based access: medic, secretary, admin
- Soft deletes on User and Patient (deletedAt field)
- Spanish locale for UI

## Environment Variables

- `DATABASE_URL` — MySQL connection string
- `AUTH_SECRET` — Auth.js secret
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — GitHub OAuth
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — Google OAuth
- `NEXTAUTH_URL` — App base URL (default: `http://localhost:3000`)
