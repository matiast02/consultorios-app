import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import {
  checkLoginAllowed,
  recordFailedLogin,
  recordSuccessfulLogin,
  applyDelay,
} from "@/lib/login-protection";
import { logAudit } from "@/lib/audit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Credentials({
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Brute-force protection: check if login is allowed
        const loginCheck = checkLoginAllowed(email);
        if (!loginCheck.allowed) {
          logAudit({
            userId: "unknown",
            action: "LOGIN_BLOCKED",
            resource: "auth",
            resourceId: email,
            details: { reason: "brute_force_lockout", remainingAttempts: 0 },
          });
          throw new Error(loginCheck.message ?? "Cuenta bloqueada temporalmente");
        }

        // Apply progressive delay (slows down automated attacks)
        await applyDelay(loginCheck.delayMs);

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) {
          recordFailedLogin(email);
          logAudit({
            userId: "unknown",
            action: "LOGIN_FAILED",
            resource: "auth",
            resourceId: email,
            details: { reason: "user_not_found" },
          });
          return null;
        }

        const passwordsMatch = await bcrypt.compare(password, user.password);
        if (!passwordsMatch) {
          recordFailedLogin(email);
          logAudit({
            userId: user.id,
            action: "LOGIN_FAILED",
            resource: "auth",
            resourceId: email,
            details: { reason: "wrong_password", remainingAttempts: loginCheck.remainingAttempts - 1 },
          });
          return null;
        }

        // Success: reset failed attempts counter and log
        recordSuccessfulLogin(email);
        logAudit({
          userId: user.id,
          action: "LOGIN_SUCCESS",
          resource: "auth",
          resourceId: email,
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Fetch role from DB on sign-in
        const userRoles = await prisma.userRole.findMany({
          where: { userId: user.id as string },
          include: { role: true },
        });
        token.role = userRoles[0]?.role?.name ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as { role?: string | null }).role = token.role as string | null;
      }
      return session;
    },
  },
});
