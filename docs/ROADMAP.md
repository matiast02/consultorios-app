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
| A6 | Merge a `develop`, ensayo de `db:migrate-legacy` en base scratch, pase a producción | ☐ | El usuario decide cuándo (ver `prisma/MIGRATION-LEGACY.md`). |

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
| D1 | Turnos online para pacientes | ◐ siguiente | Sobre `available-slots`; identidad por DNI + código de verificación; el turno entra como solicitud (`source: ONLINE`) que recepción confirma; anti-abuso. |
| D2 | Adjuntos en la historia clínica (PDF, imágenes) | ☐ siguiente | Cifrados en reposo por archivo (clave envuelta con `HC_ENC_KEY`), acceso por `lib/clinical-access.ts`, descarga auditada, límite de tamaño y tipo, hash en el ledger y en la copia de HC. |
| D3 | Cobros y liquidación por obra social | ☐ | No hay modelo de pagos (copagos, caja diaria, liquidación). |
| D4 | Pantalla de llamado para la sala de espera | ☐ | Cierra el circuito con el dashboard de recepción. |
| D5 | App móvil Flutter | ☐ | Instancia por consultorio, `/api/mobile/v1`, endpoint de metadatos, FCM, directorio de consultorios, bearer firmado (ya configurado). |
| D6 | Impresión de recetas con formato legal | ☐ | Depende de C5. |

## E. Calidad técnica

| # | Ítem | Estado | Notas |
|---|---|---|---|
| E1 | Tests end-to-end (Playwright): login, atender, permisos por rol, concesiones, copia de HC | ☐ | Los 338 tests actuales son unitarios con Prisma mockeado. |
| E2 | Accesibilidad básica (botones sin nombre accesible en sidebar y header) | ☐ | |
| E3 | Logging estructurado con request id; `logAudit` con await en `VIEW_SENSITIVE` (hoy fire-and-forget) | ☐ | |
| E4 | Base de dev: dos usuarios sueltos sin credencial (`test-admin@test.com`, `admin@test.local`) | ☐ | No vienen del seed; borrar o darles credencial. |

## Hecho recientemente (para contexto)

- ☑ Better Auth (sesiones en DB, bearer firmado, bcrypt, hooks de lockout y audit).
- ☑ Fase 1: revocación de sesiones, lista blanca clínica, evoluciones desde "Finalizar atención", audit robusto, fail-closed de cifrado, purga/archivo de pacientes.
- ☑ Fase 2: headers, open redirect, rate limit en DB, forgot-password con hash.
- ☑ Fase 3: concesiones de acceso, copia de HC en PDF, consentimiento, cifrado ampliado, purga programada, backups documentados.
- ☑ Dashboards de médico, recepción y admin; migración desde el sistema legacy (tooling listo, sin ejecutar).
