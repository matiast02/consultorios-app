// Validación de entorno al arrancar el servidor (Next.js instrumentation hook).
// Si falta configuración crítica en producción, el proceso no levanta:
// es preferible a correr con datos clínicos sin cifrar o con auth débil.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;

  const errors: string[] = [];

  const encKey = process.env.HC_ENC_KEY;
  if (!encKey) {
    errors.push("HC_ENC_KEY no configurada: los datos clínicos quedarían sin cifrar.");
  } else if (Buffer.from(encKey, "base64").length !== 32) {
    errors.push("HC_ENC_KEY debe ser una clave base64 de 32 bytes (AES-256).");
  }

  const secret = process.env.AUTH_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    errors.push("AUTH_SECRET debe tener al menos 32 caracteres.");
  }

  const baseUrl =
    process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? process.env.BETTER_AUTH_URL;
  if (!baseUrl) {
    errors.push("NEXTAUTH_URL no configurada (URL pública de la app).");
  } else if (!baseUrl.startsWith("https://")) {
    errors.push("NEXTAUTH_URL debe ser https en producción (cookies Secure).");
  }

  if (errors.length > 0) {
    throw new Error(
      "Configuración de producción inválida:\n - " + errors.join("\n - "),
    );
  }
}
