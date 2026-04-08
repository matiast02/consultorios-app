import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function Home() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="container flex max-w-[64rem] flex-col items-center gap-6 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          Welcome to{" "}
          <span className="bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
            consultorio-app
          </span>
        </h1>
        <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
          later
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {session ? (
            <Button asChild size="lg">
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg">
                <Link href="/login">Get Started</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Sign In</Link>
              </Button>
            </>
          )}
        </div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-6 text-left shadow-sm">
            <h3 className="mb-2 font-semibold">Prisma ORM</h3>
            <p className="text-sm text-muted-foreground">
              Type-safe database access with auto-generated client and schema migrations.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-6 text-left shadow-sm">
            <h3 className="mb-2 font-semibold">Auth.js v5</h3>
            <p className="text-sm text-muted-foreground">
              Full authentication with credentials, GitHub, and Google OAuth providers.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-6 text-left shadow-sm">
            <h3 className="mb-2 font-semibold">Next.js 15</h3>
            <p className="text-sm text-muted-foreground">
              App Router, Server Components, and Turbopack for fast development.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
