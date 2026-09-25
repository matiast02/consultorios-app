import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/auth";

// Endpoints de Better Auth: /api/auth/sign-in/email, /sign-out, /get-session, …
// Las rutas propias (/api/auth/change-password, forgot-password, reset-password)
// son segmentos estáticos y tienen prioridad sobre este catch-all.
export const { GET, POST } = toNextJsHandler(auth);
