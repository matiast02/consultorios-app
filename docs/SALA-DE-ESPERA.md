# Módulo «Sala de espera y llamado» (`waiting_room`)

Diseño para el ítem D4 del roadmap. Estado: implementado en sus tres fases (25-sep-2026). Lo
implementado difiere del diseño en los detalles anotados con «Implementado:».

Cierra el circuito de recepción: hoy «Registrar llegada» pone al paciente en sala y
«Llamar a consultorio» lo pasa a consulta (`Shift.consultationStartedAt`), pero nada
le avisa al paciente. El módulo agrega un **número de sala** que se entrega al llegar,
una **pantalla pública** para el televisor de la sala y el **llamado desde el dashboard
del médico**.

Todo queda detrás de un módulo (`ModuleConfig.module = "waiting_room"`), apagado por
defecto. Con el módulo apagado la app se comporta exactamente como hoy.

## 1. Qué cambia para cada rol

| Rol | Con el módulo activo |
|---|---|
| Recepción | Al registrar una llegada (turno o walk-in) el diálogo muestra el número en grande. La sala de espera y «Próximo a llamar» llevan el número como badge. Aparece la pestaña «Llamados» con «Volver a llamar» y «Marcar ausente». Puede elegir el consultorio al llamar (por defecto `User.defaultRoom`). |
| Médico | En «Turnos de hoy» los pacientes en sala muestran «En sala · 07 · 12 min» y un botón «Llamar» que los pasa a consulta y los publica en la pantalla. Solo sobre turnos propios (política de `lib/shift-access.ts`). |
| Admin | Activa el módulo en Administración → Módulos. En Configuración → Consultorio genera la clave de la pantalla y obtiene el link `/sala?k=…` para el televisor. |
| Paciente | Ve en la pantalla «07 → Consultorio 2», los últimos llamados y la hora. Nunca su nombre. |

Override por usuario (`UserModuleAccess`, ya existe en el sistema de módulos): si un
profesional tiene el módulo deshabilitado, sus llamados **no salen en la pantalla**
(llama a viva voz) pero sus pacientes reciben número igual, porque el número es del
consultorio y no del médico.

## 2. El número

- **Ticket de sala, no número de turno.** Se emite al registrar la llegada, no al
  reservar. Quien reserva y no viene no consume número. Walk-ins también reciben uno.
- **Correlativo diario** desde 01. Dos dígitos alcanzan para un consultorio.
- **Identifica, no promete orden.** Con varios médicos en paralelo el 07 puede pasar
  antes que el 05. La pantalla muestra a quién se llamó, no «tu posición». Queda para
  una segunda etapa un modo con prefijo por profesional (A-03, B-03) si algún
  consultorio lo pide.
- **El «día» es el del consultorio**, no el del servidor: `lib/clinic-time.ts` con
  `Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" })`
  devuelve `YYYY-MM-DD` sin depender de `TZ` (útil después para los hallazgos de huso
  horario de E5).
- **No se reutilizan** números anulados; el hueco no molesta. No hace falta cron para
  reiniciar: la fecha es parte de la clave.

## 3. Modelo de datos

```prisma
model WaitingTicket {
  id           String    @id @default(cuid())
  date         String    // YYYY-MM-DD en hora del consultorio
  number       Int
  shiftId      String?   @unique
  walkInId     String?   @unique
  medicId      String?   // profesional que atiende (walk-in sin asignar: null)
  room         String?   // consultorio al que se lo llamó
  issuedAt     DateTime  @default(now())
  calledAt     DateTime? // primer llamado
  lastCalledAt DateTime? // último (re)llamado
  callCount    Int       @default(0)
  closedAt     DateTime?
  closedReason String?   // ATTENDED | ABSENT | LEFT | VOID

  shift  Shift?         @relation(fields: [shiftId], references: [id], onDelete: SetNull)
  walkIn WalkInArrival? @relation(fields: [walkInId], references: [id], onDelete: SetNull)

  @@unique([date, number])
  @@index([date, calledAt])
}
```

`ClinicSettings` suma `waitingRoomDisplayKeyHash String?` y
`waitingRoomDisplayKeyCreatedAt DateTime?` (la clave viaja una sola vez al admin; en la
base queda el SHA-256, mismo patrón que `lib/reminders/tokens.ts`).

Por qué una tabla propia y no un campo en `Shift`:

1. Unifica turnos programados y walk-ins, que son dos modelos distintos.
2. La pantalla pública lee **solo** esta tabla. No hay join a `Patient`, así que no hay
   forma de filtrar un nombre por error.
3. `@@unique([date, number])` garantiza que dos secretarias registrando llegadas a la
   vez no emitan el mismo número: se toma `MAX(number) + 1` y, si la inserción choca
   con `P2002`, se reintenta (tres intentos alcanzan con este volumen).

**Migración** `2026…_sala_de_espera`: crea la tabla, agrega las columnas de
`ClinicSettings` e inserta la fila de `ModuleConfig` (`waiting_room`, «Sala de espera y
llamado», `enabled = false`) para que las instancias ya desplegadas la tengan sin
correr el seed. `prisma/seed-base.ts` la agrega también.

## 4. Ciclo de vida del ticket

```
Registrar llegada ──► issued ──► Llamar ──► called ──► Atendido / Ausente ──► closed
      │                  │                     │
      └─ Deshacer ───────┴─► VOID              └─ Volver a llamar (callCount++)
Walk-in «Retiró» ──► LEFT
Walk-in con turno asignado ──► el ticket pasa al turno (mismo número) y el turno hereda la llegada
```

- **Emisión**: `POST /api/shifts/{id}/arrival` y `POST /api/walk-ins`, en la misma
  transacción, solo si el módulo está activo. La respuesta suma `ticket: { number, date }`.
- **Anulación**: `DELETE /api/shifts/{id}/arrival` → `VOID`.
- **Llamado**: `POST /api/shifts/{id}/start-consultation` pasa a aceptar
  `{ room?: string }` y, además de `consultationStartedAt`, sella `calledAt`,
  `lastCalledAt`, `callCount = 1` y `room` (cuerpo, o `User.defaultRoom`). Se abre al
  **médico dueño del turno** (hoy solo secretaria/admin) usando `getShiftActor` de
  `lib/shift-access.ts`, que exige tener integrada la rama `feature/seguridad-b11-b13`.
  Implementado: sin número de sala (llegada sin módulo, o pase a consulta sin llegada) el
  pase se registra igual y `ticket` es null: no se emite número en el llamado porque el
  paciente nunca lo recibió y la pantalla no tendría a quién avisar.
- **Volver a llamar**: nuevo `POST /api/shifts/{id}/recall` → `lastCalledAt = now`,
  `callCount++`, sin tocar el estado del turno. Misma política de acceso.
- **Cierre**: helper `closeTicketForShift(shiftId, reason)` invocado donde el turno
  pasa a `FINISHED` o `ABSENT` (`PUT /api/shifts/{id}`, finalización con evolución) y
  `closeTicketForWalkIn` en `PATCH /api/walk-ins/{id}` con `markLeftNow`. Es
  best-effort: la pantalla no depende del cierre, usa `calledAt` reciente.
- Sin audit propio: no hay dato clínico ni administrativo sensible y el volumen sería
  alto. Las marcas de tiempo de la tabla alcanzan.

## 5. Pantalla pública `/sala`

- Ruta `app/sala/page.tsx`, fuera de `(dashboard)`, sin sidebar, tema oscuro, tipografía
  enorme. Muestra: **número y consultorio del último llamado**, los 3 o 4 anteriores en
  una columna, cantidad de personas en sala y la hora. Nada más.
- **Autenticación de dispositivo**: el televisor no puede loguearse cada 12 horas. El
  admin genera una clave en Configuración → Consultorio; el link `/sala?k=<clave>` se
  guarda como marcador en el navegador del televisor. La página toma `k`, lo persiste en
  `localStorage`, lo quita de la URL con `history.replaceState` y lo manda en cada
  pedido como header `X-Display-Key`. Rotar la clave invalida la anterior.
- **Feed**: `GET /api/public/waiting-room/feed` →
  `{ now, current: { number, room, calledAt } | null, recent: [...], waitingCount }`.
  `Cache-Control: no-store`, rate limit por IP (`lib/rate-limit.ts`), y **404 uniforme**
  si el módulo está apagado o la clave no coincide. Solo tickets con `calledAt` en los
  últimos 30 minutos, excluyendo médicos con override del módulo deshabilitado.
- **Actualización**: polling cada 5 s (hay un solo cliente por consultorio; no vale la
  pena SSE). Si el feed falla se muestra un aviso discreto y se sigue reintentando.
- **Sonido**: campanilla al cambiar `current`. Los navegadores exigen un gesto del
  usuario para reproducir audio, así que al abrir hay un botón «Tocar para activar
  sonido» que se recuerda en `localStorage`. Opcional: `speechSynthesis` para «Número
  siete, consultorio dos» (funciona offline, sin dependencias). Revisar `media-src` en la
  CSP de `next.config.ts` si el chime se sirve como archivo.
  Implementado: la campanilla es un oscilador de Web Audio (dos tonos), sin archivo ni
  cambio de CSP; el gesto del televisor se pide una vez por sesión del navegador (el
  `AudioContext` no sobrevive a la recarga). La voz (`speechSynthesis`, es-AR) se activa
  con un botón aparte y sí se recuerda. Un llamado nuevo se detecta por `id` + `callCount`
  del `current`; la pantalla también resalta el panel dos segundos y cambia el rótulo a
  «Volvemos a llamar» cuando `callCount > 1`.
- `robots: noindex`, `X-Frame-Options` heredado. La página no contiene datos personales:
  aunque alguien fotografíe la pantalla o filtre la clave, lo único expuesto son
  números y consultorios.

## 6. Cambios de UI en el dashboard

- `register-arrival-dialog.tsx`: al registrar con éxito y módulo activo, un paso final
  con el número en grande y «Listo», en lugar de cerrar de inmediato.
- `waiting-room-card.tsx`: badge con el número en cada fila; pestañas «En sala» /
  «En consulta» (así se llama en las estadísticas). En «En consulta»: hora del llamado,
  consultorio, `callCount`, acciones «Volver a llamar» y «No se presentó». Con el módulo
  activo el botón «Pasó a consulta» se convierte en «Llamar a consultorio» (diálogo con
  consultorio, `components/waiting-room/call-to-room-dialog.tsx`) y el teléfono pasa a
  llamarse «Teléfono».
- `next-to-call-card.tsx`: número en el encabezado; el botón de teléfono, hoy sin
  handler, pasa a abrir `tel:` o se quita.
- Recepción: selector de consultorio en el llamado (prellenado con `defaultRoom`).
- Médico, `today-shifts-card.tsx`: badge «En sala · 07 · 12 min» para
  `arrivedAt && !consultationStartedAt` y acción «Llamar». Requiere que
  `GET /api/dashboard/medic` devuelva `arrivedAt`, `consultationStartedAt` y
  `ticketNumber` en `DashboardShift` (hoy no los selecciona).
  Implementado (25-sep-2026): el llamado desde el dashboard del médico no se queda
  ahí: al confirmar el consultorio abre la ficha del paciente en modo consulta
  (`/dashboard/pacientes/{id}?turno=<shiftId>`), con la barra «Consulta en curso»
  (`components/pacientes/consultation-bar.tsx`) que muestra el número, el consultorio,
  los minutos y permite volver a llamar, cargar la evolución vinculada al turno, receta,
  orden y finalizar. Para eso `GET /api/shifts/{id}` devuelve `ticket` (número abierto).
  Las filas en consulta tienen «Continuar» para volver a esa ficha.
- `GET /api/dashboard/secretary`: `ticketNumber` en `WaitingRoomItem` y
  `NextToCallData`, más la lista `llamados` para la nueva pestaña.
- Configuración → Consultorio (admin): sección «Pantalla de sala de espera» con estado
  de la clave, «Generar / Rotar clave» (muestra el link una sola vez), «Abrir pantalla».
- Administración → Módulos: descripción del módulo en `MODULE_DESCRIPTIONS`.

Con el módulo apagado: sin badges, sin pestaña «Llamados», sin «Llamar» en el médico,
sin sección de pantalla, y `/sala` y el feed responden 404. «Llamar a consultorio» de
recepción sigue funcionando como hoy (solo marca el pase a consulta).

## 7. Código nuevo

| Archivo | Contenido |
|---|---|
| `lib/clinic-time.ts` | `clinicToday()`, `CLINIC_TIME_ZONE`. |
| `lib/waiting-room/tickets.ts` | `issueTicket(tx, { shiftId \| walkInId, medicId })` con reintento, `callTicket`, `recallTicket`, `closeTicketForShift`, `closeTicketForWalkIn`, `voidTicketForShift`, `moveTicketToShift`. |
| `lib/waiting-room/display-key.ts` | `generateDisplayKey()`, `hashDisplayKey()`, `verifyDisplayKey(req)`. |
| `lib/waiting-room/feed.ts` | Arma el payload del feed (solo números y consultorios). |
| `app/api/shifts/[id]/recall/route.ts` | Volver a llamar. |
| `app/api/public/waiting-room/feed/route.ts` | Feed público con clave de dispositivo. |
| `app/api/admin/waiting-room-display-key/route.ts` | `GET` estado, `POST` genera/rota (admin, audit `UPDATE clinic_settings`), `DELETE` revoca. |
| `components/configuracion/waiting-room-display-section.tsx` | Sección «Pantalla de sala de espera» (admin): generar / rotar / revocar, link una sola vez, «Abrir pantalla». |
| `app/sala/page.tsx` + `components/waiting-room/display.tsx` | Pantalla. |
| `components/dashboard/secretary/called-list.tsx` | Pestaña «En consulta» (llamados). |
| `components/waiting-room/call-to-room-dialog.tsx` | Diálogo de llamado (recepción y médico): número, paciente, consultorio. |
| Registro OpenAPI | `lib/openapi/paths/reception.ts` (recall, feed, display key) y ajustes en `shifts.ts` (arrival, start-consultation) y `dashboards.ts`; `pnpm api:docs`. `mobile: true` en recall y start-consultation. |
| Tests | Emisión con y sin módulo, correlativo por día del consultorio, reintento en `P2002`, walk-in → turno conserva el número, médico llama solo turnos propios, feed 404 sin clave/módulo y payload sin nombres, cierre por ausente/finalizado. |

## 8. Fases sugeridas

1. **Números** (backend + recepción): módulo, migración, `WaitingTicket`, emisión en
   llegadas y walk-ins, número en el diálogo, badges en sala de espera y «Próximo a
   llamar». Ya es útil sin pantalla: recepción llama por número a viva voz.
2. **Llamado**: `start-consultation` con consultorio y ticket, `recall`, cierre,
   pestaña «Llamados», médico llama desde «Turnos de hoy».
3. **Pantalla**: clave de dispositivo, feed público, `/sala`, sonido, sección en
   Configuración.

Cada fase termina con OpenAPI regenerado, tests y una fila en `docs/ROADMAP.md`.
Requisito previo: integrar `feature/seguridad-b11-b13` en `develop` para reusar
`lib/shift-access.ts` en el llamado desde el médico.

## 9. Fuera de alcance (por ahora)

- Prefijo por profesional y modo «Apellido, N.» en la pantalla (configurables a futuro).
- Impresora de tickets o tótem de autoregistro.
- Push al celular del paciente cuando lo llaman (depende de la app móvil, D5).
- SSE/WebSocket: con un televisor por consultorio, el polling alcanza.
