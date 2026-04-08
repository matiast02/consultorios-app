# Project Context

Full-stack Next.js 15 application with Prisma ORM, Auth.js v5 (NextAuth) supporting credentials and OAuth (GitHub, Google), PostgreSQL database, Docker, and shadcn/ui.

## Tech Stack

- Next.js ^15.2.3 (Turbopack)
- React ^19.0.0
- TypeScript ^5
- Prisma ^6.2.1 (ORM)
- Auth.js / NextAuth ^5.0.0-beta.25
- PostgreSQL (via Docker)
- Tailwind CSS ^4.0.0
- shadcn/ui (Radix UI + CVA)
- React Hook Form + Zod
- bcryptjs (password hashing)
- Sonner (toast notifications)

## Project Structure

App Router with route groups:

- `app/(auth)/` — Login, register pages
- `app/(dashboard)/` — Protected dashboard pages
- `app/api/` — API routes (auth handlers)
- `components/` — React components
- `lib/` — Utilities, Prisma client
- `types/` — TypeScript type definitions
- `prisma/` — Prisma schema and seed file
- `auth.ts` — Auth.js configuration
- `auth.config.ts` — Auth.js provider config
- `middleware.ts` — Auth middleware for route protection
- `docker-compose.yml` — PostgreSQL container

## Getting Started

```bash
npm install
docker compose up -d
npx prisma generate
npx prisma db push
npm run dev
```

## Key Commands

> Replace `npm` with your package manager (pnpm, yarn, bun) if applicable.

```bash
npm run dev          # Start dev server with Turbopack
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint
npm run db:generate  # Generate Prisma client
npm run db:push      # Push schema to database
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio
npm run db:seed      # Seed database (via tsx)
npm run docker:up    # Start PostgreSQL container
npm run docker:down  # Stop PostgreSQL container
```

## Important Patterns

- Auth.js v5 config split between `auth.ts` and `auth.config.ts`
- Prisma schema in `prisma/schema.prisma` with `@auth/prisma-adapter`
- Credentials auth uses bcryptjs for password hashing
- OAuth providers: GitHub and Google (configurable)
- Route groups: `(auth)` for public auth pages, `(dashboard)` for protected pages
- Database seed file: `prisma/seed.ts` (run with `tsx`)

## Environment Variables

- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — Auth.js secret (generate with `openssl rand -base64 32`)
- `AUTH_GITHUB_ID` — GitHub OAuth client ID
- `AUTH_GITHUB_SECRET` — GitHub OAuth client secret
- `AUTH_GOOGLE_ID` — Google OAuth client ID
- `AUTH_GOOGLE_SECRET` — Google OAuth client secret
- `NEXTAUTH_URL` — App base URL (default: `http://localhost:3000`)

## Testing

No test framework included by default.
