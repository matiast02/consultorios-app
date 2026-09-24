# API para la app móvil (Flutter)

Guía para consumir la API desde la app Android/iOS y para generar el cliente Dart.
La referencia completa de endpoints está en `contracts/openapi.json` (visor en
`/dashboard/administracion/api-docs` como admin); `contracts/openapi.mobile.json`
contiene solo las operaciones marcadas para la app (`x-mobile: true`).

## 1. Modelo: una instancia por consultorio

Cada consultorio corre su propio servidor (base URL propia, base de datos propia,
claves propias). La app es una sola y debe saber a qué servidor hablar:

- **Pendiente de implementar**: resolución "código de consultorio → base URL" (un
  endpoint público en un dominio nuestro, o un QR que el consultorio le da al
  profesional). Hasta entonces la app pide la base URL en la primera pantalla.
- Toda la API vive bajo `https://<host>/api/...`. Solo HTTPS en producción (HSTS).

## 2. Convenciones

- Respuestas propias: `{ "success": true, "data": … }` o
  `{ "success": false, "error": "mensaje en español", "code"?: "CODIGO", "details"?: … }`.
  `error` se puede mostrar tal cual; `code` es estable para lógica del cliente.
- Listados paginados: `data: [...]` + `pagination: { page, limit, total, totalPages }`.
- Fechas: ISO 8601 UTC (`2026-09-24T14:30:00.000Z`); fechas calendario `YYYY-MM-DD`.
  Mostrarlas en `America/Argentina/Buenos_Aires`.
- 404 uniforme en datos clínicos: "no existe" y "no tenés acceso" responden igual.
- Rate limit: 100 req / 10 s por IP; login 6 / 10 s. Respuesta `429`.

## 3. Autenticación (Better Auth, bearer)

Los endpoints de Better Auth **no** usan el envoltorio `success`; sus errores son
`{ "message": "…", "code": "…" }`.

### Login

```http
POST /api/auth/sign-in/email
Content-Type: application/json

{ "email": "dra@consultorio.com", "password": "********" }
```

Respuesta `200`:

```http
set-auth-token: hFJTw5aCC2…/sIq2os=        ← token FIRMADO, guardarlo
set-cookie: better-auth.session_token=…    ← ignorar en la app

{ "redirect": false, "token": "hFJTw5aCC2…", "user": { "id", "name", "email", … } }
```

- Guardar el token del header `set-auth-token` (también viene en `token` del body)
  en almacenamiento seguro (`flutter_secure_storage`). Nunca en SharedPreferences.
- Errores: `401` credenciales inválidas (`INVALID_EMAIL_OR_PASSWORD`), `403` cuenta
  deshabilitada, `429` rate limit por IP o bloqueo de 5 minutos por email tras 5 fallos.

### Requests autenticados

```http
GET /api/patients?page=1&limit=20
Authorization: Bearer hFJTw5aCC2…/sIq2os=
```

### Sesión actual y cierre

```http
GET /api/auth/get-session        → { "session": {…}, "user": { …, "role": "medic" } }
                                    o `null` (200) si venció/revocaron: volver a loguear
POST /api/auth/sign-out  {}       → { "success": true }  (revoca en el servidor)
```

- `user.role` (`medic` | `secretary` | `admin`) define qué pantallas mostrar.
- Sesión: 12 h sin actividad, renovación por uso, tope absoluto 7 días.
- Cambio de contraseña (`POST /api/auth/change-password`) revoca las demás sesiones.
- Un `401` en cualquier ruta propia significa sesión inválida: borrar el token y volver al login.

### Interceptor `dio` (referencia)

```dart
class AuthInterceptor extends Interceptor {
  AuthInterceptor(this._storage);
  final FlutterSecureStorage _storage;

  @override
  Future<void> onRequest(RequestOptions o, RequestInterceptorHandler h) async {
    final token = await _storage.read(key: 'session_token');
    if (token != null) o.headers['Authorization'] = 'Bearer $token';
    h.next(o);
  }

  @override
  void onResponse(Response r, ResponseInterceptorHandler h) {
    final t = r.headers.value('set-auth-token');      // solo en el login
    if (t != null) _storage.write(key: 'session_token', value: t);
    h.next(r);
  }

  @override
  void onError(DioException e, ErrorInterceptorHandler h) {
    if (e.response?.statusCode == 401) _storage.delete(key: 'session_token'); // → login
    h.next(e);
  }
}
```

## 4. Generar el cliente Dart

El cliente se genera desde `contracts/openapi.mobile.json` con
[OpenAPI Generator](https://openapi-generator.tech) (`dart-dio`: modelos inmutables
con `built_value`/`json_serializable` + cliente `dio`).

### Requisitos

- Java 11+ (OpenAPI Generator corre sobre la JVM), **o** Docker.
- El repo del backend clonado (para leer `contracts/openapi.mobile.json`).

### Comando

Desde la raíz del backend, generando dentro del proyecto Flutter como paquete local:

```bash
npx @openapitools/openapi-generator-cli generate \
  -i contracts/openapi.mobile.json \
  -g dart-dio \
  -o ../consultorio_app/packages/consultorio_api \
  --additional-properties=pubName=consultorio_api,pubVersion=1.0.0,serializationLibrary=json_serializable,useEnumExtension=true
```

Equivalente con Docker (sin instalar Java):

```bash
docker run --rm -v "$PWD:/local" -v "$PWD/../consultorio_app:/app" openapitools/openapi-generator-cli generate \
  -i /local/contracts/openapi.mobile.json -g dart-dio -o /app/packages/consultorio_api \
  --additional-properties=pubName=consultorio_api,pubVersion=1.0.0,serializationLibrary=json_serializable,useEnumExtension=true
```

Después, en el paquete generado:

```bash
cd ../consultorio_app/packages/consultorio_api
dart pub get
dart run build_runner build --delete-conflicting-outputs
```

Y en el `pubspec.yaml` de la app:

```yaml
dependencies:
  consultorio_api:
    path: packages/consultorio_api
```

Uso:

```dart
final api = ConsultorioApi(
  basePathOverride: 'https://consultorio.example.com',
  interceptors: [AuthInterceptor(storage)],
);
final res = await api.getPatientsApi().getPatients(page: 1, limit: 20);
```

Los nombres de método salen del `operationId` de cada operación (`signIn`,
`getSession`, `getPatientsByIdAttachments`, …) y las clases de los DTO con nombre
(`ClinicalAttachment`, `Pagination`, `Error`, …). Las respuestas binarias
(descarga de adjuntos, miniaturas) llegan como `Uint8List`.

### Cuándo y cómo regenerar

1. Cambió una ruta en el backend → quien la cambió corre `pnpm api:docs` y commitea
   los JSON (el test `__tests__/openapi.test.ts` no deja olvidarlo).
2. En la app: volver a correr el comando de generación y `build_runner`. Los cambios
   incompatibles aparecen como errores de compilación en Dart, no en producción.
3. `info.version` del documento sigue semver: MAJOR ante cambios incompatibles.
   La app puede mostrar "actualizá la app" si el servidor informa un MAJOR mayor
   (`GET /api/docs/openapi.json` es solo admin; para esto conviene un endpoint
   público de versión, pendiente).

### Alternativa sin JVM

`-g dart` (cliente con `http`, sin `dio`) tiene los mismos requisitos. Generadores
100 % Dart como `openapi_generator` (pub.dev) envuelven la misma JVM. No hay
generador Dart maduro sin Java; Docker resuelve la instalación.

## 5. Qué usa la app (tag por tag)

Operaciones marcadas `x-mobile: true`. Resumen por rol:

- **Médico**: sesión; agenda del día y turnos; pacientes (búsqueda, ficha, alta);
  historia clínica (evoluciones, recetas, órdenes, planes) y adjuntos (subida desde
  cámara/galería, miniaturas, descarga); notificaciones.
- **Recepción**: sesión; turnos (alta, edición, llegada, confirmación); pacientes
  (sin datos clínicos); recordatorios y reservas online pendientes; notificaciones.
- **Admin**: lo mismo que recepción; no hay tareas de administración pensadas para el móvil.

Fuera de la app: rutas públicas de la landing y la reserva web, cron, administración
del catálogo, auditoría e integridad, documentación.

## 6. Pendientes para la app

- Resolución del consultorio por código (sección 1).
- Endpoint público de versión de la API para el aviso de "actualizá la app".
- Notificaciones push (hoy las notificaciones son internas, por polling).
- Subida de adjuntos con progreso: la API acepta multipart estándar; `dio` informa
  progreso con `onSendProgress`.
