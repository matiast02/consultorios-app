import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  /**
   * Extend the built-in session types to include the user's database ID.
   * This is populated via the `session` callback in auth.ts.
   */
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
