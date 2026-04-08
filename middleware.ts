import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Use the edge-compatible config (no Prisma adapter) for middleware
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Match all routes except static files, images, and Next.js internals
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
