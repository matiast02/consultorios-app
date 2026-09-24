// Reservas online (staff): /api/online-bookings/**.
// El paciente reserva desde /reservar (rutas públicas, en paths/public.ts): queda
// un Shift PENDING con `source: ONLINE` y una OnlineBookingRequest con lo que
// cargó. Recepción la verifica y la confirma o rechaza acá.

import { onlineBookingsQuerySchema, onlineBookingStaffActionSchema } from "@/lib/validations";
import { defineRoutes, errors, IdParam, ok, TAGS } from "../registry";
import { OnlineBookingStaffItemSchema } from "../schemas/online-booking";

const receptionOnly = "Recepción (secretaria) o admin; los médicos reciben 403.";

export const onlineBookingRoutes = defineRoutes([
  {
    method: "get",
    path: "/api/online-bookings",
    summary: "Listar reservas online (para verificar y confirmar)",
    description: [
      `${receptionOnly}`,
      "Filtra por estado **efectivo** (`status`); sin filtro devuelve todas. Máximo 200. Con `status=PENDING_CONFIRMATION` vienen las más antiguas primero (cola a confirmar); en los demás casos, las más recientes primero.",
      "Incluye lo que cargó el solicitante (`requester`) para verificarlo por teléfono; `patientDataMismatch` marca las que piden revisión. Sin datos clínicos.",
    ].join("\n\n"),
    tags: [TAGS.onlineBooking],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    mobile: true,
    request: { query: onlineBookingsQuerySchema },
    responses: {
      200: { description: "Reservas online.", schema: ok(OnlineBookingStaffItemSchema.array()) },
      ...errors({ 400: "`status` no es un estado válido." }, 401, 403),
    },
  },
  {
    method: "patch",
    path: "/api/online-bookings/{id}",
    summary: "Confirmar o rechazar una reserva online",
    description: [
      `${receptionOnly} Solo sobre reservas en estado efectivo PENDING_CONFIRMATION.`,
      "- `confirm` → turno CONFIRMED (`confirmedAt`, `confirmedVia: STAFF`) y reserva CONFIRMED. Si el paciente ya lo había confirmado desde el link del recordatorio, el turno queda como está.",
      "- `reject` → turno CANCELLED, reserva CANCELLED (`cancelledBy: STAFF`) y sus recordatorios pendientes pasan a FAILED.",
      "Transaccional: si el turno cambió en el medio (otra pestaña, el paciente canceló) responde 409 `INVALID_STATE`. Audit `UPDATE` sobre el turno con `{ via: \"online_booking\", action, requestId }`. No envía email al paciente.",
    ].join("\n"),
    tags: [TAGS.onlineBooking],
    auth: { kind: "session", roles: ["secretary", "admin"] },
    mobile: true,
    request: { params: IdParam, body: onlineBookingStaffActionSchema },
    responses: {
      200: { description: "Reserva actualizada (estado efectivo).", schema: ok(OnlineBookingStaffItemSchema) },
      ...errors(
        { 400: "`action` inválida (sin `details`)." },
        401,
        403,
        { 404: "Reserva inexistente (`code: NOT_FOUND`)." },
        { 409: "La reserva ya no está pendiente: confirmada, cancelada, vencida o el turno cambió mientras se procesaba (`code: INVALID_STATE`)." },
      ),
    },
  },
]);
