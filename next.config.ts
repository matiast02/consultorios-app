import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// CSP: Next.js necesita inline scripts para la hidratación (sin nonces) y
// 'unsafe-eval' solo en desarrollo (HMR). Tailwind inyecta estilos inline.
// frame-src: 'self' para previsualizar adjuntos propios (/api/attachments/…?inline=1)
// y el mapa de OpenStreetMap en la landing. frame-ancestors: nadie nos embebe.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' https://www.openstreetmap.org",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

// Adjuntos de la HC (/api/attachments/…): la ruta pone su propia CSP por
// respuesta (sandbox; frame-ancestors 'self' en la previsualización). Ojo: Next
// NO deja que un route handler pise un header ya puesto por headers(), así que
// estas rutas quedan FUERA de la regla general (lookahead negativo) y acá van
// solo los headers que no dependen de la respuesta, con SAMEORIGIN para poder
// previsualizarlos en un iframe propio.
const attachmentHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]),
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/((?!api/attachments/).*)", headers: securityHeaders },
      { source: "/api/attachments/:path*", headers: attachmentHeaders },
    ];
  },
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
