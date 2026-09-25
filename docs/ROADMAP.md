# Roadmap y pendientes

Estado al 24-sep-2026, después de la migración a Better Auth y las tres fases de
seguridad / Ley 25.326 (ramas `feature/better-auth` → `feature/seguridad-fase-1`).
Complementa a [`mejoras.md`](../mejoras.md) (visión de producto original).

Leyenda: ☐ pendiente · ◐ en curso · ☑ hecho · ✎ no es código (gestión / legal)

## A. Bloqueantes para salir a producción

| # | Ítem | Estado | Notas |
|---|---|---|---|
| A1 | Proveedor de email (Resend o SMTP) | ☐ | Destraba recuperación de contraseña, copias de HC por email y recordatorios. La abstracción `lib/notifications/*` queda lista; solo falta configurar `EMAIL_PROVIDER` + credenciales. |
| A2 | Recordatorios reales de turnos + confirmación del paciente | ☑ | Email automático (proveedor configurable), WhatsApp manual (click-to-chat) desde recepción, link público de confirmación/cancelación/opt-out, cron con `CRON_SECRET`, configuración por consultorio. Falta solo configurar el proveedor de email (A1). SMS queda para cuando haya proveedor. |
| A3 | CI (GitHub Actions) | ☐ | `tsc`, `vitest`, `pnpm audit --prod`, lint, chequeo de drift de migraciones (`prisma migrate diff`). |
| A4 | Operación mínima | ☐ | `/api/health` para Dokploy; error tracking con scrubbing de datos personales; `TZ=America/Argentina/Buenos_Aires` explícita en app y MySQL; backups programados + ensayo de restauración (`docs/BACKUPS.md`). |
| A5 | Forzar cambio de contraseña en el primer login de usuarios migrados | ☐ | Flag `mustChangePassword` en `User`; las contraseñas del sistema viejo pueden ser débiles. |
| A6 | Ensayo de `db:migrate-legacy` en base scratch y pase a producción | ☐ | Merge a `develop` hecho el 24-sep-2026. El usuario decide cuándo migrar (ver `prisma/MIGRATION-LEGACY.md`). |

## B. Seguridad pendiente (de la auditoría del 23-sep-2026)

| # | Ítem | Estado | Notas |
|---|---|---|---|
| B1 | 2FA (TOTP) para admin y médicos | ☐ | Plugin `twoFactor` de Better Auth. |
| B2 | Contraseñas comprometidas (HIBP) y `.max(72)` (bcrypt) | ☐ | En `setUserPassword`, no en el plugin (las rutas propias no pasan por él). |
| B3 | IP real detrás del proxy | ☐ | `trustedProxies` / header del proxy (Dokploy/Traefik) para `lib/rate-limit.ts`, audit y rate limit de Better Auth. Hoy `x-forwarded-for` se toma sin validar. |
| B4 | Inmutabilidad a nivel base | ☐ | Usuario MySQL sin UPDATE/DELETE sobre `ClinicalEntryVersion` y `AuditLog` (o triggers). HMAC con clave y timestamp en el hash del audit. |
| B5 | Sesiones visibles al usuario + "cerrar otras sesiones"; auto-logout por inactividad en el cliente | ☐ | PCs compartidas de recepción. |
| B6 | Enumeración: el 403 "cuenta deshabilitada" sale antes de validar la contraseña | ☐ | Mover a `databaseHooks.session.create.before`. |
| B7 | CSP con nonces (hoy `unsafe-inline` en scripts) | ☐ | |
| B8 | 8 vulnerabilidades altas transitivas (undici, vite, postcss, deepmerge-ts) | ☐ | `pnpm.overrides` o actualizar. |
| B9 | `user/export` (portabilidad del profesional): revisar alcance | ☐ | |
| B10 | Rate limit de login: 6 intentos cada 10 s por IP (Better Auth, `customRules` en `auth.ts`) + lockout por email (5 fallos → 5 min). Ajustar si una recepción con muchas PCs detrás de un mismo IP lo alcanza | ☑ | Subido de 3 a 6 el 24-sep-2026. |
| B11 | Turnos sin control de autoría | ☑ | Resuelto el 24-sep-2026 (`lib/shift-access.ts`): el médico solo ve, edita y borra sus turnos (ajeno → 404) y no puede crear ni reasignar para otro (403); secretaria y admin ven y asignan todo; usuario sin rol → 403. El detalle devuelve del paciente solo lo que usa la ficha del turno. Altas, series, llegada y consulta auditan. |
| B12 | Agenda sin control de pertenencia | ☑ | Resuelto el 24-sep-2026 (`lib/agenda-access.ts`): el objetivo debe ser un médico activo; editan el propio médico, el admin y la secretaria. Nuevo candado `User.agendaLocked` («Solo yo modifico mi agenda», Configuración → Horarios): con él la secretaria recibe 403, el admin no. `DELETE` de días bloqueados aplica la misma regla sobre el dueño. |
| B13 | Permisos y auditoría desparejos en rutas menores | ☑ | Resuelto el 24-sep-2026: audit en horarios/settings del consultorio, módulos, accesos por módulo y solicitudes de contacto; `PUT /api/modules` solo módulos existentes (404); `PUT .../users` valida el usuario (404); `PUT /api/notifications/{id}/read` responde 404 uniforme; `getUserRole` y el `customSession` resuelven el rol por prioridad (`lib/roles.ts`); el 503 del cron no revela configuración. `GET /api/modules` queda abierto a cualquier sesión a propósito (la UI de todos los roles lo usa). |

## C. Cumplimiento y gestión

| # | Ítem | Estado | Notas |
|---|---|---|---|
| C1 | Inscripción de la base de datos ante la AAIP (Ley 25.326 art. 21) | ✎ ☐ | Por consultorio (cada instancia es un responsable distinto). |
| C2 | Política de privacidad y términos publicados en la landing | ☐ | Hoy solo está el texto legal en el formulario de contacto. |
| C3 | Acuerdos de confidencialidad del personal; designación de responsable | ✎ ☐ | |
| C4 | Procedimiento escrito de incidentes | ✎ ☐ | Borrador en `docs/BACKUPS.md`. |
| C5 | Recetas electrónicas (Ley 27.553): registro de la plataforma ante el Ministerio de Salud y firma digital / electrónica del profesional | ✎ ☐ | **Verificar requisitos antes de venderlo**: el módulo de recetas hoy no tiene validez como receta electrónica. |
| C6 | Firma digital de las copias de HC (hoy firma manual del responsable) | ☐ | Ley 25.506. |
| C7 | Historia clínica digital interoperable (Ley 27.706) | ✎ ☐ | Seguir la reglamentación. |

## D. Producto

| # | Ítem | Estado | Notas |
|---|---|---|---|
| D1 | Turnos online para pacientes | ☑ | v1 sin OTP: el turno entra PENDING `source: ONLINE` y recepción confirma; sin texto libre (minimización); anti-abuso; link de gestión. Pendiente menor: `POST /api/shifts` (recepción) no toma el mismo bloqueo por médico que la reserva online, queda una carrera mínima. |
| D2 | Adjuntos en la historia clínica (PDF, imágenes) | ☑ | Cifrados en reposo por archivo (clave envuelta con `HC_ENC_KEY`), acceso por `lib/clinical-access.ts`, descarga auditada, límite de tamaño y tipo, hash en el ledger y en la copia de HC. Miniaturas cifradas para imágenes (sep 2026). |
| D3 | Cobros y liquidación por obra social | ☐ | No hay modelo de pagos (copagos, caja diaria, liquidación). |
| D4 | Sala de espera y llamado (módulo `waiting_room`) | ☑ | Hecho el 25-sep-2026 (diseño en [`SALA-DE-ESPERA.md`](SALA-DE-ESPERA.md)): módulo apagado por defecto, `WaitingTicket` con número de sala diario al registrar llegadas y walk-ins, llamado a consultorio con consultorio desde recepción y desde «Turnos de hoy» del médico, «volver a llamar», pestaña «En consulta», cierre del número al finalizar/ausentar/cancelar, pantalla pública `/sala` con clave de dispositivo (solo números y consultorios, campanilla y voz opcionales) y su administración en Configuración → Consultorio. Quedan para más adelante: prefijo por profesional y modo «Apellido, N.», impresora de tickets, push al celular (D5). |
| D5 | App móvil Flutter | ☐ | Instancia por consultorio, bearer firmado (ya configurado), documentación OpenAPI con `x-mobile` + cliente Dart generable (`docs/API-MOBILE.md`, sep 2026). Pendiente: resolución del consultorio por código, endpoint público de versión, FCM. |
| D6 | Impresión de recetas con formato legal | ☐ | Depende de C5. |

## E. Calidad técnica

| # | Ítem | Estado | Notas |
|---|---|---|---|
| E1 | Tests end-to-end (Playwright): login, atender, permisos por rol, concesiones, copia de HC | ☐ | Los 338 tests actuales son unitarios con Prisma mockeado. |
| E2 | Accesibilidad básica (botones sin nombre accesible en sidebar y header) | ☐ | |
| E3 | Logging estructurado con request id; `logAudit` con await en `VIEW_SENSITIVE` (hoy fire-and-forget) | ☐ | |
| E4 | Base de dev: dos usuarios sueltos sin credencial (`test-admin@test.com`, `admin@test.local`) | ☐ | No vienen del seed; borrar o darles credencial. |
| E5 | Inconsistencias encontradas al documentar la API (24-sep-2026) | ☐ | Ver lista debajo. Ninguna bloquea la app móvil: el registro documenta el comportamiento real. |

### E5. Detalle de inconsistencias de la API

- **500 donde corresponde 404/400**: `POST` de recetas, órdenes, planes e insurances con `patientId`/`shiftId`/`affiliateNumber` inválidos (FK/tipo). Resueltos el 24-sep-2026: `PATCH /api/admin/contact-requests/{id}`, `DELETE /api/shifts/{id}/arrival`, `PUT /api/shifts/{id}` con paciente inexistente, `PUT /api/modules/{module}/users` con usuario inexistente y `PUT /api/modules` con módulos arbitrarios.
- **Huso horario del servidor** (con el proceso en UTC-3 vs UTC difieren): block-days (`new Date("YYYY-MM-DD")` vs `getDate()` local: la ventana de conflicto cae en el día anterior), filtro mes/año de `GET /api/shifts`, chequeo de horario de atención (`getHours()`), armado de series (`setHours`), `to` de `/api/audit-logs`, el "hoy" del dashboard médico. Definir `TZ` explícita (A4) y usar `date-fns-tz` donde se calcula por día.
- **Paginación**: `GET /api/shifts` sin paginar (todo el histórico sin filtros); `GET /api/patients/{id}/shifts` con `parseInt` sin validar (`limit=0` → `totalPages: null`); `GET /api/online-bookings` corta en 200 sin paginación; `GET /api/hc-copy-requests` devuelve `{ items, count, overdue }` (forma distinta al resto).
- **Reglas de negocio desparejas**: `POST /api/study-orders` y `/api/meal-plans` no exigen `isMedic` (admin puede crear); `DELETE` de recetas y planes no chequean módulo (órdenes sí); no-autor recibe 403 (admin) / 404 (otro médico) en recetas, planes y evoluciones, pero 404 para todos en órdenes; `PUT /api/shifts/{id}` solo revisa solapamiento si cambia `start`/`end`, no valida `patientId`, no admite `consultationTypeId` ni transiciones de estado; `PATCH /api/shifts/reminders/{id}` `mark_failed` no valida estado; `DELETE /api/health-insurance/{id}` borra en cascada `PatientInsurance`/`UserInsurance` sin aviso; `HealthInsurance.name` no es único; `updateHealthInsuranceSchema` y `updateSpecializationSchema` no son parciales.
- **Campos ignorados o inalcanzables**: `userId` obligatorio en `createStudyOrderSchema`/`createMealPlanSchema` pero la ruta usa la sesión; `updateMealPlanSchema` acepta `userId`/`patientId` ignorados; `updatePatientSchema.birthDate` nunca puede quedar en null; `createProfessionConfigSchema`/`updateProfessionConfigSchema` y `blockDaysQuerySchema` sin uso; `_hp`/`_elapsedMs` de las rutas públicas no están en sus Zod.
- **Turnos que no se pudieron reprogramar** al bloquear un día quedan en silencio (ni en `rescheduledShifts` ni notificación). `POST /api/shifts/recurring` responde 201 aunque no cree ninguna ocurrencia.
- **Dashboards**: `noShowRateMonth.deltaPctVsPrevMonth` es diferencia en puntos, no %; `trends.cancellationByMonth.noShowPct` (cancelados + ausentes) vs `stats.noShowRateMonth.pct` (solo ausentes) con la misma palabra; `healthInsurancesUnused90d` mira la OS actual del paciente y no la del turno; recepción: `recordatorios.context` siempre `"tomorrow"`, `isPinned` siempre `false`, `proximoALlamar.kind` siempre `"scheduled"`; médico: consulta `finishedRecentWithEvolution` y la descarta; `GET /api/stats` sin filtro por médico logueado.
- **`types/index.ts` desactualizado respecto a las rutas** (el registro OpenAPI sigue a las rutas): `Patient`, `HealthInsurance`, `ConsultationType`, `Specialization`, `ProfessionConfig`, `UserPreference`, `BlockDay`, `ClinicSettings`, `ClinicHoursDay`, `ClinicContactRequest` omiten campos que se devuelven (`createdAt/updatedAt`, `createdById`, recordatorios/reservas, `ipAddress`…); `Prescription`/`StudyOrder`/`MealPlan`/`Evolution.shift` sin campos de anulación o `id/status`; `StatsData` y `AppNotification` no coinciden; `AuditAction` sin `EXPORT_HC`, `GRANT_ACCESS`, `REQUEST_ACCESS`; `Shift.confirmedVia` incluye `"PHONE"` que nada escribe. Conviene derivar los tipos del front de los Zod del registro (`z.infer`) y borrar los duplicados.
- **Formato**: `POST /api/register` no usa el envoltorio `success` (201 `{ message, user }`, errores `{ error }`); el 409 de `POST /api/public/turno/{token}` no trae `code` (el de reservas sí); `PATCH /api/online-bookings/{id}` 400 sin `details`.

## Hecho recientemente (para contexto)

- ☑ Better Auth (sesiones en DB, bearer firmado, bcrypt, hooks de lockout y audit).
- ☑ Fase 1: revocación de sesiones, lista blanca clínica, evoluciones desde "Finalizar atención", audit robusto, fail-closed de cifrado, purga/archivo de pacientes.
- ☑ Fase 2: headers, open redirect, rate limit en DB, forgot-password con hash.
- ☑ Fase 3: concesiones de acceso, copia de HC en PDF, consentimiento, cifrado ampliado, purga programada, backups documentados.
- ☑ Dashboards de médico, recepción y admin; migración desde el sistema legacy (tooling listo, sin ejecutar).
- ☑ Recordatorios con confirmación del paciente, reservas online y adjuntos de HC cifrados (sep 2026).
- ☑ Documentación de la API generada del código (registro Zod → OpenAPI 3.1, test de cobertura, visor Scalar) y guía para la app móvil con generación del cliente Dart (sep 2026).
