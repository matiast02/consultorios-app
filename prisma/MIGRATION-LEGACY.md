# Migración del sistema viejo → producción

Herramienta one-shot para poblar una base de producción **vacía** con los datos
del sistema viejo (Express + Sequelize) a partir de su dump SQL (phpMyAdmin).

- Script: [`prisma/migrate-legacy.ts`](./migrate-legacy.ts)
- Parser del dump: [`prisma/legacy-dump-parser.ts`](./legacy-dump-parser.ts)

## Qué migra

| Origen (dump) | Destino | Notas |
|---|---|---|
| `os` (619) | `HealthInsurance` | `code` int → string |
| `users` (6) | `User` + `UserRole` + `Specialization` | Hashes bcrypt `$2a$` compatibles → **las contraseñas siguen funcionando** (se guardan en `Account.password` con `providerId: "credential"`, como espera Better Auth). Email inválido `admin` → `admin@consultorio.com`. Médicos quedan con `slotDurationMinutes: 15` (el sistema viejo usaba turnos de 15 min) |
| `userpreferences` (42) | `UserPreference` | Día viejo 1=Lunes…7=Domingo → nuevo 0=Domingo…6=Sábado. Sentinel `"24:00"` (cerrado) → `null` |
| `patients` (1.445) | `Patient` | Strings vacíos → `null`. Soft-deletes preservados. **DNI duplicados**: lo conserva el mejor candidato (no borrado, más reciente); el resto queda sin DNI (queda asentado en el reporte) |
| `shifts` (2.778) | `Shift` (+ `ClinicalRecord`/`Evolution`) | `state` 1→PENDING, 2→CONFIRMED, 3→ABSENT, 4→FINISHED |
| `blockdays`, `statuses`, `roles`, `resetTokens`, `SequelizeMeta` | — | Se descartan (vacíos u obsoletos) |

### Notas clínicas → Evoluciones

El sistema viejo guardaba las evoluciones médicas dentro de `shifts.observations`.
Como en el nuevo sistema las observaciones del turno **las ve la secretaria**,
la migración separa:

- Observación de turno **finalizado** que parece nota clínica (≥ 200 caracteres
  o contiene marcadores `AP:`, `CX:`, `MC:`, `EF:`, `FUM:`, `RS:`, `IOE:`, etc.)
  → se convierte en `Evolution.notes` (cifrada AES-256-GCM, visible solo para el
  médico autor) y el turno queda sin observación. (~1.824 casos)
- Notas cortas administrativas → quedan como observación del turno. (~582)

### Fechas y zona horaria

Los datetimes del dump están en **hora local argentina** (verificado con el
histograma de horarios de turnos: 14–22 hs con pico 18–20 y tope en las 21:00
de las preferencias). El script los convierte a UTC con offset fijo `-03:00`
(Argentina no tiene DST).

## Runbook — pase a producción

```bash
# 0. Requisitos en el entorno de producción (.env):
#    DATABASE_URL     → la base de producción, VACÍA
#    HC_ENC_KEY       → base64 de 32 bytes (openssl rand -base64 32) — OBLIGATORIA
#    ADMIN_EMAIL / ADMIN_PASSWORD → (opcional) admin inicial extra vía seedBase

# 1. Crear el esquema
pnpm db:migrate:deploy        # o pnpm db:push si no usás migraciones

# 2. Ensayo sin escrituras (parsea el dump y reporta):
pnpm db:migrate-legacy -- --dump /ruta/consultorios.sql --dry-run

# 3. Migración real (siembra base + importa + cifra + ledger):
pnpm db:migrate-legacy -- --dump /ruta/consultorios.sql

# 4. Revisar migration-report.json (queda gitignoreado):
#    - conteos migrados
#    - anomalías: DNIs duplicados resueltos, turnos omitidos, emails corregidos
```

El paso 3 corre automáticamente al final `prisma/backfill-ledger.ts`, que sella
todas las evoluciones migradas en el ledger de inalterabilidad (idempotente).

### Flags

| Flag | Efecto |
|---|---|
| `--dump <ruta>` | Ruta al `.sql` del sistema viejo (obligatorio) |
| `--dry-run` | Solo parsea y reporta; no escribe nada |
| `--force` | Permite correr aunque la base ya tenga pacientes/turnos |
| `--report <ruta>` | Dónde escribir el reporte JSON (default `migration-report.json`) |
| `--skip-ledger` | No corre el backfill del ledger al final |
| `--allow-unencrypted` | Permite correr sin `HC_ENC_KEY` (solo para pruebas locales) |

### Salvaguardas

- Aborta si la base destino ya tiene pacientes o turnos (salvo `--force`).
- Aborta si `HC_ENC_KEY` no está configurada (salvo `--allow-unencrypted`).
- Es **una migración one-shot**, no es idempotente: si algo falla a mitad de
  camino, vaciar la base y volver a correr desde cero.

## Verificación post-migración sugerida

1. Login con un usuario del sistema viejo (misma contraseña).
2. Buscar un paciente conocido por DNI y revisar sus datos.
3. Abrir la historia clínica de un paciente con evoluciones como el médico
   autor → el texto clínico del sistema viejo debe verse en las evoluciones.
4. Como secretaria: el mismo paciente NO debe mostrar contenido clínico.
5. Calendario: un turno conocido debe verse en el horario correcto (ej. un
   turno de las 18:00 del sistema viejo debe seguir mostrándose 18:00).
6. `SELECT notes FROM Evolution LIMIT 5` en la base → debe verse el prefijo
   `enc:` (cifrado activo).
