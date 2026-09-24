# Backups, restauración y custodia de claves

Obligación de seguridad de los datos (Ley 25.326 art. 9; Res. AAIP 47/2018).
La historia clínica debe conservarse **mínimo 10 años** (Ley 26.529 art. 18):
un backup perdido es un incumplimiento, no solo un problema técnico.

## Qué hay que resguardar (las tres cosas, siempre juntas)

| Activo | Dónde vive | Sin él… |
|---|---|---|
| Base de datos MySQL (`consultorio`) | contenedor `mysql` (volumen Docker) | se pierde todo |
| Adjuntos de la HC (`ATTACHMENTS_DIR`, default `./storage/attachments`) | volumen Docker de la app | se pierden los archivos (PDF/imágenes) de las historias clínicas |
| `HC_ENC_KEY` (y `HC_ENC_KEY_2…` si hubo rotación) | `.env` del servidor | la HC es **irrecuperable**: los campos clínicos están cifrados con AES-256-GCM |
| `AUTH_SECRET` | `.env` del servidor | se invalidan todas las sesiones (molesto, no grave) |

Los dumps contienen datos clínicos cifrados pero **datos personales en claro**
(nombre, DNI, teléfono, obra social): el archivo del dump también hay que
cifrarlo y tratarlo como dato sensible.

## Backup diario (cron en el host)

```bash
#!/usr/bin/env bash
# /opt/consultorio/backup.sh — correr por cron, p.ej. 03:00
set -euo pipefail
cd /opt/consultorio            # carpeta del docker-compose
STAMP=$(date +%F_%H%M)
OUT=/var/backups/consultorio
mkdir -p "$OUT"

# 1. Dump consistente (InnoDB, sin bloquear)
docker compose exec -T mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers consultorio' \
  | gzip > "$OUT/consultorio_$STAMP.sql.gz"

# 2. Cifrar el dump (age: https://github.com/FiloSottile/age; o gpg)
age -r "$(cat /opt/consultorio/backup-public-key.txt)" -o "$OUT/consultorio_$STAMP.sql.gz.age" "$OUT/consultorio_$STAMP.sql.gz"
rm "$OUT/consultorio_$STAMP.sql.gz"

# 3. Copiar fuera del servidor (S3, Backblaze, otro host). Ejemplo con rclone:
rclone copy "$OUT/consultorio_$STAMP.sql.gz.age" remoto:consultorio-backups/

# 3b. Adjuntos de la HC: ya están cifrados por archivo (clave envuelta con HC_ENC_KEY),
#     alcanza con sincronizarlos tal cual (rclone sync incremental)
rclone sync /opt/consultorio/storage/attachments remoto:consultorio-backups/attachments/

# 4. Retención local: 14 días (la copia remota conserva 10 años)
find "$OUT" -name "*.age" -mtime +14 -delete
```

- **Frecuencia**: diario como mínimo; antes de cada deploy con migración, uno manual.
- **Retención**: remota ≥ 10 años (o el plazo legal vigente); local 14 días.
- **Claves**: `HC_ENC_KEY` y `AUTH_SECRET` se guardan en un gestor de secretos o
  sobre cerrado, **separados** de los dumps y con acceso de al menos dos
  personas. Nunca en el repo, nunca en el mismo bucket que los dumps.

## Restauración (probarla cada 3 meses, no solo cuando hace falta)

```bash
# En un servidor limpio:
docker compose up -d mysql
age -d -i backup-private-key.txt consultorio_2026-09-23_0300.sql.gz.age | gunzip \
  | docker compose exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" consultorio'
# Restaurar también los adjuntos en ATTACHMENTS_DIR (mismo layout <patientId>/<id>.hca)
# Configurar .env con la MISMA HC_ENC_KEY y AUTH_SECRET (sin ella, los adjuntos tampoco se abren)
pnpm db:migrate:deploy        # no debería aplicar nada si el dump es actual
pnpm start
```

Verificación post-restauración:

1. Login con un usuario real.
2. Abrir una historia clínica como el médico autor: si el texto aparece, la
   clave es la correcta. Si aparece `enc:…` o error de descifrado, la clave no
   coincide: **no seguir**, buscar la clave correcta.
3. `GET /api/admin/integrity` (como admin): el ledger de la HC y las cadenas
   del audit log deben verificar OK.
4. Dashboard de admin → "Salud del catálogo" sin alertas inesperadas.

## Rotación de la clave de cifrado

1. Generar clave nueva: `openssl rand -base64 32`.
2. Agregar `HC_ENC_KEY_2="…"` y `HC_ENC_ACTIVE_KEY="2"` (mantener `HC_ENC_KEY`).
3. Reiniciar la app: lo nuevo se cifra con la clave 2; lo viejo sigue
   descifrando con la 1.
4. Opcional: re-cifrar todo con `pnpm db:backfill-encryption` (solo cifra lo
   que está en claro; para re-cifrar con la clave nueva hay que extenderlo).
5. Guardar ambas claves en el backup de secretos.

## Incidentes

Ante sospecha de acceso indebido: revisar `Actividad reciente` del dashboard de
admin (logins fallidos, accesos a datos sensibles), revocar sesiones del usuario
afectado (deshabilitarlo revoca todas), rotar `AUTH_SECRET` si se sospecha del
servidor, y documentar el incidente (fecha, alcance, medidas). La Ley 25.326 no
fija plazo de notificación, pero la AAIP recomienda notificar a los titulares
afectados cuando el incidente compromete datos sensibles.
