# Project Context

Sistema de gestión de consultorios médicos. Full-stack Next.js 15 con Prisma ORM, Better Auth, MySQL, Docker y shadcn/ui.

Migración de un backend Express.js + frontend React (CRA) separados a una app unificada en Next.js.

## Tech Stack

- Next.js ^15.2.3 (App Router, Turbopack)
- React ^19.0.0
- TypeScript ^5
- Prisma ^6.2.1 (ORM) — MySQL
- Better Auth ^1.7 (sesiones en DB, plugin bearer para clientes nativos)
- MySQL 8.0 (via Docker)
- Tailwind CSS ^4.0.0
- shadcn/ui (Radix UI + CVA)
- React Hook Form + Zod
- bcryptjs (password hashing)
- Sonner (toast notifications)

## Domain Model

- **Users** — Médicos y secretarias con roles
- **Patients** — Pacientes con datos personales, DNI, obra social
- **Shifts** — Turnos/citas (pendiente, confirmado, ausente, finalizado, cancelado)
- **HealthInsurance** — Obras sociales
- **UserPreferences** — Horarios de atención por día (AM/PM)
- **BlockDays** — Días bloqueados por médico
- **Roles** — medic, secretary, admin

## Project Structure

App Router with route groups:

- `app/(auth)/` — Login, register pages
- `app/(dashboard)/` — Protected dashboard pages
- `app/api/` — API routes (auth, patients, shifts, os, preferences, stats)
- `components/` — React components
- `lib/` — Utilities, Prisma client, validations
- `types/` — TypeScript type definitions
- `prisma/` — Prisma schema and seed file
- `auth.ts` — Better Auth server config + `getSession()` helper
- `lib/auth-client.ts` — Better Auth client (`useSession`, `signIn`, `signOut`)
- `lib/credentials.ts` — Único punto que escribe/verifica hashes de contraseña (bcrypt, tabla Account)
- `lib/clinical-access.ts` — Política de acceso a datos clínicos (lista blanca medic/admin, aislamiento por autor); TODA ruta clínica pasa por acá
- `lib/sessions.ts` — Revocación de sesiones (cambio/reset de contraseña, baja de usuario)
- `lib/roles.ts` — Roles y rol efectivo determinista (admin > secretary > medic si hubiera varios); `lib/auth-utils.ts` `getUserRole` y el `customSession` de `auth.ts` lo usan
- `lib/shift-access.ts` — Política de turnos: médico solo los propios (ajeno → 404) y sin asignar a otros; secretaria/admin todos; sin rol → 403
- `lib/agenda-access.ts` — Política de agenda (horarios y días bloqueados): objetivo médico activo; editan el propio médico, el admin y la secretaria salvo `User.agendaLocked`
- `lib/shift-coverage.ts` — Cobertura con la que se atiende un turno (obra social aceptada por el profesional o particular); la usan `POST /api/shifts`, las series, la reserva online y el `PUT` al cambiar paciente o profesional
- `lib/clinic-time.ts` — Día del consultorio (`America/Argentina/Buenos_Aires`) independiente de la `TZ` del servidor; usarlo para todo cálculo "por día"
- `lib/format.ts`, `lib/names.ts`, `lib/shift-status.ts` — Únicas versiones de HH:mm / dd/mm/aaaa / edad / «en N min» / DNI, de «Dr./Dra. Apellido» / «Apellido, Nombre» / iniciales / color de avatar, y de la etiqueta y paleta por estado de turno (`ShiftStatusBadge` en `components/shifts/`). No redeclarar helpers locales en cards ni rutas; `components/pacientes/shared.tsx` y `components/calendar/calendar-helpers.ts` solo re-exportan
- `hooks/` — `useCurrentUser` (id y rol tipados de la sesión, sin casts), `useModules` (módulos cacheados con SWR), `usePatientSearch` (búsqueda con debounce, recientes y paciente fijado; lo usan `PatientCombobox` del diálogo de turno y el registro de llegadas), `useCachedFetch`
- `lib/waiting-room/*` — Módulo «Sala de espera y llamado» (`waiting_room`): números de sala (`WaitingTicket`), llamado y pantalla pública. Diseño en `docs/SALA-DE-ESPERA.md`
- `instrumentation.ts` — Validación de entorno al arrancar: en producción exige HC_ENC_KEY, AUTH_SECRET ≥ 32 y NEXTAUTH_URL https
- `middleware.ts` — Auth middleware for route protection
- `docker-compose.yml` — MySQL + phpMyAdmin containers

## Getting Started

```bash
pnpm install
docker compose up -d
npx prisma generate
npx prisma db push
pnpm run dev
```

## Key Commands

```bash
pnpm run dev          # Start dev server with Turbopack
pnpm run build        # Production build
pnpm run db:generate  # Generate Prisma client
pnpm run db:push      # Push schema to database
pnpm run db:migrate   # Run Prisma migrations
pnpm run db:studio    # Open Prisma Studio
pnpm run db:seed      # Seed database
pnpm api:docs         # Regenera contracts/openapi.json y openapi.mobile.json desde lib/openapi
pnpm run docker:up    # Start MySQL container
pnpm run docker:down  # Stop MySQL container
```

## Important Patterns

- Better Auth server instance in `auth.ts`; rutas y Server Components usan `await getSession()` (devuelve `{ user: { id, name, email, image, role } }` o null)
- Client components usan `useSession()` / `signOut()` de `lib/auth-client.ts`
- La contraseña NO vive en `User`: está en `Account.password` (`providerId: "credential"`), hash bcrypt vía `lib/credentials.ts`
- Login: lockout anti fuerza bruta + audit logs `LOGIN_*` implementados como hooks de Better Auth en `auth.ts`
- Sesiones: inactividad 12 h, renovación por uso, tope absoluto 7 días; `getSession()` rechaza usuarios inactivos/borrados y revoca sus sesiones
- Datos clínicos: secretaria nunca (salvo alergias en solo lectura); médico solo asientos propios; admin todo, siempre auditado con `VIEW_SENSITIVE`. Nunca poner contenido clínico en `AuditLog.details` ni en `Shift.observations` (eso es nota administrativa visible por recepción)
- Pacientes: `DELETE ?mode=purge` solo sin asientos clínicos ni turnos de otros (admin, secretaria o médico creador); `?mode=archive` conserva la HC 10 años (médico creador sin terceros, o admin); `POST /restore` solo admin
- Turnos: toda ruta de `/api/shifts/**` pasa por `getShiftActor` (`lib/shift-access.ts`); el detalle devuelve del paciente solo identificación, contacto, nacimiento, sexo y obra social. Altas, series, llegada y consulta auditan (`CREATE`/`UPDATE` con ids)
- Cobertura del turno (`Shift.coverageInsuranceId` / `Shift.isPrivate`, `lib/shift-coverage.ts`): al crear o reasignar se guarda la obra social del paciente que el profesional acepta (la principal si la acepta, si no la primera aceptada) o `isPrivate` si no tiene obra social o ninguna es aceptada (con aviso `INSURANCE_MISMATCH`); sin lista de obras sociales configurada se asume la principal. Turnos anteriores tienen ambos vacíos y la UI muestra la obra social del paciente. El diálogo de turno muestra la cobertura antes de guardar; la ficha rápida, la sala de espera y «Turnos de hoy» muestran la cobertura, no la obra social del paciente
- Walk-in con ficha → turno: desde «Registrar llegada» («Asignar turno ahora») o desde la fila de la sala, el diálogo de turno abre con el paciente preseleccionado (se carga aparte si no está entre los recientes), hoy y la hora actual; al crearlo, `PATCH /api/walk-ins/{id}` con `assignedShiftId` vincula el walk-in, traslada el número de sala y marca la llegada en el turno, así el paciente sigue en sala bajo su profesional
- Atención del médico = la ficha del paciente en modo consulta (`lib/consultation-flow.ts`, `components/pacientes/consultation-bar.tsx`): «Atender», «Llamar» e «Iniciar consulta» del dashboard registran el pase a consulta (con el módulo de sala, tras el diálogo de consultorio) y abren `/dashboard/pacientes/{id}?turno=<shiftId>`; sin parámetro la ficha detecta sola el turno de hoy del médico (en consulta > en sala > agendado). La barra fija muestra fase, hora, cobertura, número de sala y minutos, y ofrece Nueva evolución (vinculada al turno vía `shiftId`), Receta, Orden, Volver a llamar y Finalizar (reusa `QuickAttendDialog`; con la evolución ya cargada solo cierra el turno y vuelve al panel). `GET /api/shifts/{id}` devuelve `ticket` (número abierto) para eso. El check de la fila del dashboard queda como cierre rápido («Finalizar atención»); las filas en consulta tienen «Continuar»
- Agenda: `POST/PUT /api/preferences` y `/api/preferences/block-days` pasan por `canEditAgenda`; el médico activa «Solo yo modifico mi agenda» (`agendaLocked`) desde Configuración → Horarios y la secretaria recibe 403 (el admin no)
- Respuestas uniformes: lo ajeno responde 404 igual que lo inexistente (turnos, notificaciones, datos clínicos); nunca 403 que revele existencia
- Headers de seguridad (CSP, HSTS, nosniff, frame-ancestors) en `next.config.ts`
- Consentimiento: `Patient.consentType/consentGivenAt/consentNote` (Ley 25.326 art. 5-6) se carga en el paso 2 del alta; el formulario público exige `privacyAccepted` con el texto de la Disp. DNPDP 10/2008
- Acceso cruzado entre médicos solo vía `ClinicalAccessGrant` (solicitud → aprobación con consentimiento → vigencia acotada → revocable); copia de HC para el paciente vía `HcCopyRequest` (48 hs, PDF con hashes del ledger, audit `EXPORT_HC`)
- Operación: backups, restauración y custodia de claves en `docs/BACKUPS.md`; purga programada `pnpm db:purge-expired`
- Adjuntos de HC (`lib/attachments/*`, `ClinicalAttachment`): cifrado por archivo (DEK envuelta con `HC_ENC_KEY`, formato HCA1), tipo real por magic bytes (PDF/JPEG/PNG/WebP), acceso como asiento clínico (kind `attachment`, sección `estudios`), descarga siempre por ruta autenticada con `nosniff` y `CSP: sandbox` en inline, sin borrado físico (anulación lógica), ledger y copia de HC. Miniaturas solo de imágenes (`lib/attachments/thumbnail.ts`, sharp → WebP ≤ 384 px, sin EXIF) cifradas con la misma DEK en `<id>.thumb.hca`, servidas por `/api/attachments/[id]/thumbnail` con el mismo perímetro y sin audit propio (lo cubre el `VIEW_SENSITIVE` del listado con `thumbnails`); `pnpm db:backfill-thumbnails` genera las que falten
- Sala de espera (módulo `waiting_room`, apagado por defecto, se activa en Administración → Módulos): al registrar la llegada (`POST /api/shifts/{id}/arrival`, `POST /api/walk-ins`) se emite un número de sala diario (`WaitingTicket`, `@@unique([date, number])`, correlativo con `SELECT MAX … FOR UPDATE` + reintento en P2002) que identifica al paciente sin exponer su nombre y no promete orden. Un turno/walk-in tiene un solo ticket: repetir la llegada devuelve el mismo número, deshacerla lo anula (`VOID`) y volver a registrarla lo reabre. Llamado: `POST /api/shifts/{id}/start-consultation` (recepción, o el médico sobre sus turnos) acepta `{ room? }` y sella el ticket (`calledAt`, `room`, `callCount`); `POST /api/shifts/{id}/recall` repite el aviso; `PUT /api/shifts/{id}` cierra el número al pasar a FINISHED/ABSENT/CANCELLED. Pantalla del televisor `/sala?k=<clave>`: la clave la genera el admin en Configuración → Consultorio (`/api/admin/waiting-room-display-key`, solo el hash en `ClinicSettings`), la página la guarda en `localStorage` y consulta `GET /api/public/waiting-room/feed` (header `X-Display-Key`) cada 5 s; el feed lee SOLO `WaitingTicket` (números, consultorios, horas; nunca nombres), excluye a los médicos con el módulo deshabilitado por usuario y responde 404 uniforme con módulo apagado o clave inválida. Con el módulo apagado todo se comporta como antes (`ticket: null`, sin diálogo de consultorio, `/sala` sin feed)
- Reservas online (`/reservar`, `lib/online-booking.ts`, `lib/availability.ts`): el turno entra PENDING con `source: "ONLINE"` y recepción confirma; sin texto libre de motivo; si el DNI existe se vincula sin revelar ni modificar datos (`OnlineBookingRequest` guarda lo cargado + `patientDataMismatch`); link de gestión `/reserva/<token>`; transacción con bloqueo por médico
- Recordatorios de turnos: `lib/reminders/scheduler.ts` (plan + dispatch), email por `lib/notifications/email.ts` (Resend/SMTP/consola según env), WhatsApp manual click-to-chat desde recepción, link público `/turno/<token>` (token derivado de `AUTH_SECRET` + id, solo hash en DB) para confirmar/cancelar/opt-out; cron `POST /api/cron/reminders` con `CRON_SECRET` o `pnpm reminders:run`. Los mensajes y la página pública nunca llevan contenido clínico
- Documentación de la API: registro en `lib/openapi/paths/*.ts` (una entrada por ruta, con los MISMOS schemas Zod de `lib/validations.ts`; DTO con `.openapi({ ref })`; `mobile: true` para lo que usa la app Flutter). `pnpm api:docs` genera `contracts/openapi.json` + `openapi.mobile.json`; `__tests__/openapi.test.ts` falla si una ruta no está registrada o los JSON están viejos. Visor: `/dashboard/administracion/api-docs` (admin). Guía móvil y generación del cliente Dart: `docs/API-MOBILE.md`. Toda ruta nueva o modificada se registra en el mismo commit
- Route groups: `(auth)` for public, `(dashboard)` for protected pages
- Role-based access: medic, secretary, admin
- Soft deletes on User and Patient (deletedAt field)
- Spanish locale for UI

## Environment Variables

- `DATABASE_URL` — MySQL connection string
- `AUTH_SECRET` — Better Auth secret (también acepta `BETTER_AUTH_SECRET`)
- `NEXTAUTH_URL` — App base URL usada por Better Auth (también acepta `AUTH_URL` / `BETTER_AUTH_URL`)
- `HC_ENC_KEY` — Clave AES-256 (base64, 32 bytes) para cifrado de datos clínicos
