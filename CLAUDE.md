# Project Context

Sistema de gestión de consultorios médicos. Full-stack Next.js 15 con Prisma ORM, Better Auth, MySQL, Docker y shadcn/ui.

Migración de un backend Express.js + frontend React (CRA) separados a una app unificada en Next.js.

## Tech Stack

- Next.js ^15.2.3 (App Router, Turbopack)
- React ^19.0.0
- TypeScript ^5
- Prisma ^6.2.1 (ORM) — MySQL
- Better Auth ^1.7 (sesiones en DB, plugin bearer para clientes nativos)
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
- `auth.ts` — Better Auth server config + `getSession()` helper
- `lib/auth-client.ts` — Better Auth client (`useSession`, `signIn`, `signOut`)
- `lib/credentials.ts` — Único punto que escribe/verifica hashes de contraseña (bcrypt, tabla Account)
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

- Better Auth server instance in `auth.ts`; rutas y Server Components usan `await getSession()` (devuelve `{ user: { id, name, email, image, role } }` o null)
- Client components usan `useSession()` / `signOut()` de `lib/auth-client.ts`
- La contraseña NO vive en `User`: está en `Account.password` (`providerId: "credential"`), hash bcrypt vía `lib/credentials.ts`
- Login: lockout anti fuerza bruta + audit logs `LOGIN_*` implementados como hooks de Better Auth en `auth.ts`
- Route groups: `(auth)` for public, `(dashboard)` for protected pages
- Role-based access: medic, secretary, admin
- Soft deletes on User and Patient (deletedAt field)
- Spanish locale for UI

## Environment Variables

- `DATABASE_URL` — MySQL connection string
- `AUTH_SECRET` — Better Auth secret (también acepta `BETTER_AUTH_SECRET`)
- `NEXTAUTH_URL` — App base URL usada por Better Auth (también acepta `AUTH_URL` / `BETTER_AUTH_URL`)
- `HC_ENC_KEY` — Clave AES-256 (base64, 32 bytes) para cifrado de datos clínicos
