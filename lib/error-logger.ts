export function logError(error: Error, context?: Record<string, unknown>) {
  // In production, this would send to Sentry/LogRocket
  console.error("[ConsultorioApp Error]", {
    message: error.message,
    stack: error.stack,
    ...context,
    timestamp: new Date().toISOString(),
  });
}
