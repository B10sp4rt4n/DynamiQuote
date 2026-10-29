# Archivo de borradores y seguimiento de oportunidades

## Comportamiento

- **Archivar borrador** afecta únicamente la versión seleccionada en estado `draft`, sin propuesta vinculada. Conserva ID, versión, partidas, importación y totales. Exige motivo. No cambia el desenlace de la oportunidad. Archivar/restaurar queda en `Quote.input_metadata.archiveHistory`, junto con actor y fecha.
- Una versión archivada es consultable en el historial y puede reactivarse sin crear otra versión. Los escritores de partidas, plantillas/Excel/PDF y creación de propuesta rechazan una fuente archivada. El listado de cotizaciones oculta archivadas por defecto y ofrece **Mostrar archivadas**. El selector toma el estado fresco del historial para corregir el rótulo Borrador/Cerrada.
- **Revisar oportunidad**, en Pipeline/CRM y en Cliente 360, abre el detalle. **Descartar** está disponible únicamente dentro de esa revisión y ofrece Pausada, Cerrada sin decisión o Perdida. Requiere motivo. Pausar exige fecha de hoy o posterior (calendario CDMX) y cliente asociado; crea una tarea de seguimiento en el sistema existente. La fecha no reactiva automáticamente la oportunidad.
- Pausadas y cerradas sin decisión se consultan mediante filtros propios y quedan fuera del total abierto y de la tasa ganado/perdido. Una pérdida de oportunidad sí aparece en la tasa del pipeline; no altera las métricas históricas basadas en propuestas.
- Reactivar conserva el inicio original y todo el historial. Finaliza únicamente el recordatorio creado por la pausa anterior; conserva tareas ajenas.
- Una decisión real `won`/`lost` en propuestas tiene prioridad y se corrige por el flujo existente de Propuestas. Esta nueva acción no modifica aprobaciones, desenlaces de propuestas, facturas ni entrega.
- Las opciones comerciales explícitas actúan como una oportunidad: se exige acceso a todos sus miembros, se cambia el estado de los miembros en una transacción y se conserva el agrupamiento canónico y sus importes independientes.

## Persistencia y permisos

Sin migraciones. Se reutilizan `opportunities.stage`, `closed_at` y `intake_metadata` (clave `commercialDisposition`, historial acumulativo `commercialDispositionHistory`) y la tabla `tasks`. Se preservan las demás claves del alta comercial. Revisionado optimista rechaza solicitudes obsoletas y duplicación de recordatorios; bloquear/guardar comparte el advisory lock del alta de oportunidades. Tenants y actores se toman de la sesión, con acceso para admin/owner/superadmin o el propietario efectivo. El archivo usa el lock común del grupo; generación de propuestas comparte ese lock y las transiciones existentes usan comparación del estado previo.

No hay reclasificación masiva, borrados, cambios de precios, correos ni escrituras de prueba sobre clientes reales. La elección de qué oportunidad cerrar pertenece al ejecutivo.

## Validación

- Suite general Vitest, controles de API (sesión, inyección, validación y conflictos) e interfaz en jsdom (motivo, fecha condicional, permisos, error visible).
- Integración opt-in `COTIZA_DISPOSITION_INTEGRATION=1` sobre una base local desechable: archivo/restauración, bloqueo de ediciones/importaciones, conservación de partidas/metadatos, aislamiento tenant/propietario, protección de decisiones, pausa con un recordatorio, rechazo de reintento obsoleto y reactivación.
- Regresiones de alternativas y plantillas con base local: agrupamiento único, cierre/reactivación de todos los miembros sin marcar perdidas las propuestas y primera importación en v1.
- La base de prueba utiliza PGlite con transporte PostgreSQL y Prisma. No certifica concurrencia nativa entre procesos en un servidor PostgreSQL de producción.
- TypeScript, ESLint de archivos modificados y `next build`.

## Operación

El despliegue habilita los controles; no archiva ni cierra registros comerciales automáticamente. Para deshacer una clasificación usar Reactivar/cambiar estado; para un borrador usar Reactivar borrador. Una reversión de código a una versión anterior no interpreta los estados nuevos: reactivar los registros afectados antes de volver a código anterior si se requiere recuperar su visibilidad activa.
