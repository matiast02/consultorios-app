// ─── Shift Reminders ────────────────────────────────────────────────────────

export interface ShiftReminder {
  shiftId: string;
  patientName: string;
  patientEmail: string | null;
  patientPhone: string | null;
  professionalName: string;
  date: string;
  time: string;
  message: string;
}

/**
 * Genera el mensaje de recordatorio para un turno.
 */
export function generateReminderMessage(reminder: Omit<ShiftReminder, "message">): string {
  return `Hola ${reminder.patientName}, le recordamos que tiene un turno el ${reminder.date} a las ${reminder.time} con ${reminder.professionalName}. Consultorio App.`;
}
