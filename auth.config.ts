import type { NextAuthConfig } from "next-auth";

// Edge-compatible auth config — no Prisma adapter here (not edge-compatible)
// This config is used by middleware.ts for route protection
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    jwt({ token, user }) {
      // This runs on the edge — just pass through existing token fields.
      // The full jwt callback in auth.ts adds role on first sign-in.
      // On subsequent requests, token.role is already there from the stored JWT.
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as { role?: string | null }).role = (token.role as string) ?? null;
      }
      return session;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      const isOnAdmin = nextUrl.pathname.startsWith("/dashboard/administracion");

      if (isOnDashboard) {
        if (!isLoggedIn) return false; // Redirect to login

        // Protect admin routes — only admin and secretary
        if (isOnAdmin) {
          // In the authorized callback, auth is the session object.
          // The role is on auth.user.role (set by the session callback in auth.ts)
          const user = auth?.user as { role?: string } | undefined;
          const role = user?.role;
          if (role !== "admin" && role !== "secretary") {
            return Response.redirect(new URL("/dashboard", nextUrl));
          }
        }

        return true;
      } else if (isLoggedIn && nextUrl.pathname.startsWith("/login")) {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    },
  },
  providers: [], // Providers are configured in auth.ts
};
