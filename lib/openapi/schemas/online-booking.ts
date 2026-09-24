// DTO de reservas online vistos por recepción (lib/online-booking.ts,
// `toStaffItem`): /api/online-bookings/** y el bloque `reservasOnline` del
// dashboard de recepción. Las vistas públicas (/api/public/**) no van acá.

import { z } from "zod";
import { onlineBookingStatusEnum } from "@/lib/validations";
import { IsoDateTime } from "../registry";

export const OnlineBookingStatusSchema = onlineBookingStatusEnum.openapi({
  ref: "OnlineBookingStatus",
  description:
    "Estado EFECTIVO (derivado del turno): una reserva pendiente o confirmada cuyo turno se canceló por otra vía llega como CANCELLED; una pendiente cuyo turno ya empezó, como EXPIRED.",
});

export const OnlineBookingRequesterSchema = z
  .object({
    firstName: z.string(),
    lastName: z.string(),
    dni: z.string(),
    phone: z.string(),
    email: z.string().nullable(),
    healthInsuranceText: z.string().nullable().describe("Obra social tal como la escribió el solicitante (texto libre, no es un catálogo)."),
  })
  .openapi({
    ref: "OnlineBookingRequester",
    description: "Lo que cargó el solicitante en el formulario web. Recepción lo usa para verificar por teléfono antes de confirmar; nunca se copia sobre un paciente existente.",
  });

export const OnlineBookingStaffItemSchema = z
  .object({
    id: z.string().describe("ID de la solicitud (OnlineBookingRequest)."),
    shiftId: z.string().describe("Turno PENDING creado con `source: ONLINE`."),
    status: OnlineBookingStatusSchema,
    createdAt: IsoDateTime.describe("Cuándo se pidió la reserva."),
    start: IsoDateTime.describe("Inicio del turno."),
    medicShortName: z.string(),
    medicColor: z.string().nullable().describe("Color de la especialidad del profesional."),
    consultationTypeName: z.string().nullable(),
    requester: OnlineBookingRequesterSchema,
    patientId: z.string().describe("Paciente vinculado: existente por DNI o alta mínima creada por la reserva."),
    matchedExisting: z.boolean().describe("true si el DNI ya existía y el turno se vinculó a esa ficha sin modificarla."),
    patientDataMismatch: z
      .boolean()
      .describe(
        "Hay que verificar: el DNI existía con otro nombre, o la ficha nueva quedó sin DNI porque ese DNI pertenece a un paciente archivado.",
      ),
  })
  .openapi({ ref: "OnlineBookingStaffItem" });

/** Resumen para el dashboard de recepción: pendientes de confirmar. */
export const SecretaryOnlineBookingsSchema = z
  .object({
    pending: z.number().int().describe("Total de reservas pendientes de confirmar (turno futuro, no cancelado)."),
    items: z.array(OnlineBookingStaffItemSchema).describe("Las 5 más antiguas."),
  })
  .openapi({ ref: "SecretaryOnlineBookings" });
