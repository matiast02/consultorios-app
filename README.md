# consultorio-app

later

**Author:** matias <terradasmatias@gmail.com>

## Stack

- [Next.js 15](https://nextjs.org/) — React framework with App Router and Turbopack
- [Prisma](https://www.prisma.io/) — Type-safe ORM for PostgreSQL
- [Auth.js v5](https://authjs.dev/) — Authentication with Credentials, GitHub, and Google
- [Tailwind CSS v4](https://tailwindcss.com/) — Utility-first CSS framework
- [shadcn/ui](https://ui.shadcn.com/) — Accessible component library
- [Zod](https://zod.dev/) — Schema validation
- [Docker Compose](https://docs.docker.com/compose/) — Local PostgreSQL database

## Getting Started

### 1. Start the database

```bash
docker compose up -d
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Generate `AUTH_SECRET`:

```bash
openssl rand -base64 32
```

### 4. Push the database schema

```bash
pnpm run db:push
```

### 5. Run the development server

```bash
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Database Commands

| Command | Description |
|---------|-------------|
| `pnpm run db:generate` | Generate Prisma client |
| `pnpm run db:push` | Push schema changes (no migration file) |
| `pnpm run db:migrate` | Create and apply migration |
| `pnpm run db:studio` | Open Prisma Studio UI |
| `pnpm run docker:up` | Start PostgreSQL container |
| `pnpm run docker:down` | Stop PostgreSQL container |

## OAuth Setup

### GitHub

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set the callback URL to `http://localhost:3000/api/auth/callback/github`
4. Copy the Client ID and Client Secret into `.env.local`

### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Create OAuth 2.0 credentials
5. Set the callback URL to `http://localhost:3000/api/auth/callback/google`
6. Copy the Client ID and Client Secret into `.env.local`

## Project Structure

```
├── app/
│   ├── (auth)/          # Auth pages (login, register)
│   ├── (dashboard)/     # Protected dashboard pages
│   ├── api/             # API routes
│   └── globals.css      # Global styles
├── auth.ts              # Auth.js configuration
├── auth.config.ts       # Edge-compatible auth config
├── middleware.ts         # Route protection middleware
├── components/          # React components
│   └── ui/              # shadcn/ui components
├── lib/
│   ├── prisma.ts        # Prisma client singleton
│   └── auth-utils.ts    # Auth helper functions
├── prisma/
│   └── schema.prisma    # Database schema
├── types/               # TypeScript type declarations
└── docker-compose.yml   # Local database setup
```

## License

MIT
