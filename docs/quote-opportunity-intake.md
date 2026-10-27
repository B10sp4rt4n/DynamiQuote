# Oportunidad desde una cotización, con alta comercial diferida

Al crear una cotización se puede declarar «Nueva oportunidad» (opción inicial) o elegir una oportunidad abierta del cliente seleccionado del catálogo. La nueva nace junto con la cotización, sin formulario CRM previo. Nombre de propuesta, si existe, sirve de nombre inicial de oportunidad. La empresa y el responsable se conservan del contexto de creación.

El aviso «Datos de oportunidad pendientes» indica los campos que faltan: nombre de oportunidad, necesidad y origen. «Completar datos de la oportunidad» abre el formulario sin salir del cotizador; admite guardar avances. Próximo paso es una nota opcional, no crea una tarea ni un recordatorio. La alerta persiste al recargar o abrir otra revisión y desaparece sólo al completar esos tres campos. En pipeline también se muestra un acceso a la cotización de origen mientras exista el pendiente. Completar datos no cambia autorización, envío, desenlace ni facturación.

## Identidad y permisos

La creación inicial es transaccional. El cliente conserva un UUID de creación para reintentos del mismo formulario y evita doble envío; el servidor reutiliza la cotización persistida con ese ID y comprueba actor, tenant y datos. Una petición que reutiliza ese ID con otros datos se rechaza. La asignación de folios usa el mismo lock de creación por tenant y lee mediante el cliente de transacción. Esto cubre reintentos mientras el registro original se conserve, no una cola durable tras borrados o recargas completas del navegador.

Para vincular una oportunidad existente se validan tenant, cliente del catálogo, visibilidad del vendedor y estado comercial derivado. No se seleccionan cerradas, completamente descartadas ni alias de alternativas agrupadas. Los administradores y superadmin actúan sólo dentro del tenant de sesión. Guardar el alta requiere sesión identificada, acceso al trato y revisión vigente; un guardado concurrente obsoleto devuelve 409. El payload no acepta actor ni tenant elegidos por el cliente.

La metadata se guarda en la oportunidad, separada de `quotes.input_metadata`: el pendiente no impide llenar la v1 vacía en su primera importación. Las revisiones heredan `opportunity_id`; no crean otro negocio. El modo explícito «Nueva oportunidad» es el único que inicia este pendiente. Llamadores heredados e históricos con metadata nula conservan su comportamiento. El texto libre de empresa permite el alta rápida, pero no crea ni vincula por parecido una cuenta del catálogo; el selector de oportunidades existentes exige una cuenta explícita.

## Publicación y reversión

Requiere aplicar primero `cotiza-web/prisma/manual/20261027_opportunity_intake.sql`, que agrega `opportunities.intake_metadata` como JSONB nullable. Es aditiva e idempotente; no rellena el histórico. Primero se prueba en una copia aislada de la base objetivo y se confirma recuperación antes de aplicar en producción. No usar `prisma db push` como sustituto. Todos los lectores Prisma del modelo esperan la columna: no publicar código antes del SQL.

Después se publica el código y se recorre: crear oportunidad desde cotización, guardar avance, recargar, completar, vincular otra cotización a una oportunidad del catálogo y verificar otra revisión. Para revertir la aplicación se vuelve al código anterior conservando la columna y la metadata; no se borra la columna ni se elimina información comercial como rollback.

Esta entrega se construye sobre main y no integra PR28/33 ni migra el CRM completo. No necesita servicios, suscripciones ni llamadas de IA adicionales. No ejecuta SQL ni cambios comerciales en producción.

## Validación local (27 de octubre de 2026)

- 500 pruebas generales aprobadas, 31 omitidas en esa fase por condiciones de integración/fixtures; se excluye el e2e heredado que necesita base real.
- 10 integraciones Prisma aprobadas por separado en PGlite mediante TCP: 7 del alta diferida y 3 de regresión v1/opciones comerciales. Incluyen reintentos, cambios con revisión obsoleta, aislamiento por tenant/vendedor, vínculo existente, importación en v1 y posterior revisión, histórico sin pendiente y rechazo de oportunidades cerradas/descartadas.
- El harness `scripts/check_opportunity_intake.mjs` aplica el SQL dos veces sobre un esquema sin la columna y compara un registro histórico antes/después. Conserva los campos previos y deja metadata NULL. No certifica concurrencia nativa entre procesos PostgreSQL.
- TypeScript, ESLint de los archivos modificados y compilación Next.js aprobados con configuración local sintética.
- Chromium sobre el build de producción y base local descartable: crear sin alta previa, aviso, guardar avance, recargar, completar y recargar sin alerta; seleccionar una cuenta del catálogo, crear una oportunidad y vincular otra cotización sin aumentar el conteo de oportunidades. API reales con respuestas 200/201, sin errores de consola. UI inspeccionada en escritorio y ancho de 390 px.
- Ese recorrido utiliza el modo bootstrap existente exclusivamente sobre datos sintéticos locales. No acredita la sesión Clerk ni el despliegue productivo. Los límites por actor/tenant también se verifican en las rutas y la integración con base.

Para repetir las integraciones, instalar las dependencias sólo en un directorio
temporal (no se agregan al producto) y ejecutar desde la raíz:

```sh
npm install --prefix /tmp/cotiza-intake-pg --no-audit --no-fund --save-exact @electric-sql/pglite@0.5.11 @electric-sql/pglite-socket@0.2.14
PGLITE_MODULE=/tmp/cotiza-intake-pg/node_modules/@electric-sql/pglite/dist/index.js \
PGLITE_SOCKET_MODULE=/tmp/cotiza-intake-pg/node_modules/@electric-sql/pglite-socket/dist/index.js \
node scripts/check_opportunity_intake.mjs
```
