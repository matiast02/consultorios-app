# Mejoras Planificadas — Consultorio App

## Prioridad Alta

### 1. Historia Clínica (HC)
- Ficha clínica por paciente: antecedentes personales, familiares, alergias, medicación habitual, grupo sanguíneo
- Evoluciones médicas por consulta (vinculadas al turno): motivo de consulta, examen físico, diagnóstico (CIE-10), plan/tratamiento, indicaciones
- Adjuntar archivos (estudios, imágenes, PDFs de laboratorio)
- Timeline de evoluciones con búsqueda y filtro por fecha/diagnóstico
- Firma digital del médico en cada evolución

### 2. Recetas médicas digitales
- Generar receta desde la consulta con: medicamento, dosis, frecuencia, duración
- Vademécum básico integrado (búsqueda de medicamentos)
- Exportar receta a PDF para imprimir
- Historial de recetas por paciente

### 3. Órdenes de estudios y laboratorio
- Crear órdenes de estudios (laboratorio, imágenes, interconsultas)
- Template de estudios frecuentes
- Marcar como "resultados recibidos" y adjuntar archivo
- Alertas de estudios pendientes de resultado

### 4. Agenda mejorada
- Vista semanal y diaria (hoy solo está mensual)
- Turnos recurrentes (ej: paciente cada 15 días)
- Sobreturno / turno de urgencia
- Duración configurable por tipo de consulta
- Lista de espera cuando no hay turnos disponibles
- Arrastrar y soltar para mover turnos

### 5. Notificaciones y recordatorios
- Recordatorio de turno por email/WhatsApp al paciente (24hs antes)
- Notificación al médico de turnos del día al iniciar sesión
- Alerta de pacientes que no vienen hace X meses (seguimiento)
- Notificación de estudios pendientes

## Prioridad Media

### 6. Facturación y cobros
- Registro de cobro por consulta (monto, método de pago, obra social/particular)
- Coseguros y copagos por obra social
- Reporte de facturación mensual por médico/obra social
- Exportar datos para el contador

### 7. Reportes avanzados
- Cantidad de consultas por diagnóstico/patología
- Pacientes atendidos por período y médico
- Tasa de ausentismo por día/horario
- Ranking de obras sociales por volumen
- Exportar reportes a Excel/PDF

### 8. Gestión de múltiples consultorios/sucursales
- Soporte para más de un consultorio físico
- Asignar médico a consultorio por día
- Vista de disponibilidad por consultorio

### 9. Comunicación con el paciente
- Portal del paciente (ver sus turnos, resultados, recetas)
- Solicitud de turno online por el paciente
- Mensajería interna médico-paciente
- Envío de indicaciones post-consulta por email

### 10. Plantillas de consulta
- Templates por especialidad (control de rutina, primera vez, etc.)
- Autocompletar campos frecuentes
- Frases predefinidas para evoluciones

## Prioridad Baja

### 11. Sala de espera virtual
- Estado en tiempo real: "en espera", "en consultorio", "atendido"
- Orden de llegada y tiempo de espera estimado
- Pantalla para la sala de espera (TV)

### 12. Auditoría y seguridad
- Log de acciones (quién vio/editó qué y cuándo)
- Consentimiento informado digital
- Backup automático de datos
- Cumplimiento de Ley de Protección de Datos Personales (Ley 25.326 Argentina)

### 13. Integración con sistemas externos
- Integración con PAMI/obras sociales para validación de afiliados
- Integración con sistemas de facturación electrónica (AFIP)
- Exportar HC en formato HL7/FHIR (estándar médico)

### 14. App móvil / PWA
- Versión móvil para que el médico vea su agenda del día
- Push notifications de turnos
- Consulta rápida de HC desde el celular

### 15. Inteligencia y automatización
- Sugerencias de diagnóstico basadas en síntomas ingresados
- Alertas de interacciones medicamentosas en recetas
- Detección de pacientes con turnos frecuentes (posible emergencia)

## Mejoras Técnicas (para producción)

### CI/CD Pipeline
- GitHub Actions para correr tests en cada PR
- Build check automático antes de merge
- Deploy automático a staging/production (Vercel, AWS, etc.)

### Error Boundaries y manejo global de errores
- React Error Boundaries en layout principal
- Página de error personalizada (500, 404)
- Logging de errores a servicio externo (Sentry)
- Retry automático en fetches fallidos

### Rate Limiting y Caching
- React Query o SWR para cachear fetches del cliente
- Rate limiting en APIs sensibles (login, register)
- Cache de profession configs (no cambian frecuentemente)
- Redis o in-memory cache para sesiones
- CDN para assets estáticos
