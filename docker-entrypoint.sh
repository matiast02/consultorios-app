#!/bin/sh
set -e

echo "🚀 Starting consultorio-app..."

# Run database migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "✅ Migrations applied"

# Start Next.js server
echo "🌐 Starting Next.js server..."
exec node server.js
