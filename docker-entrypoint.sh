#!/bin/sh
set -e

echo "🚀 Starting consultorio-app..."

# Run database migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma
echo "✅ Migrations applied"

# Seed base data (idempotent — uses upserts, safe to run every deploy)
echo "🌱 Seeding base data (roles, profesiones, especialidades, etc.)..."
node prisma/seed-base.cjs
echo "✅ Base data seeded"

# Start Next.js server
echo "🌐 Starting Next.js server..."
exec node server.js
