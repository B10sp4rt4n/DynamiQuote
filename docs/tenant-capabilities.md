# Capacidades por tenant

La importación de PDF ThreatDown usa la capacidad `threatdown_pdf_import`. Una fila ausente o deshabilitada bloquea tanto la interfaz como la API, incluso para superadmin. Los permisos de acceso a cotizaciones siguen aplicando.

Sólo superadmin puede guardar la habilitación en Configuración → Tenant → Capacidades. El tenant se toma del contexto autenticado seleccionado; el endpoint rechaza un tenant enviado en el payload. Owner, admin y seller no pueden habilitarla ni deshabilitarla.

Antes de desplegar el código, aplicar `cotiza-web/prisma/manual/20261022_tenant_capabilities.sql` a una rama de validación y después a producción. Es aditiva e idempotente: habilita inicialmente sólo SynAppsSys, y volver a ejecutarla no revierte una deshabilitación posterior. Los tenants nuevos permanecen deshabilitados.

Cada cambio efectivo se guarda con estado anterior, usuario y fecha en `tenant_capability_events`, dentro de la misma transacción que la configuración. Una actualización repetida al mismo estado no duplica el historial. El registro inicial identifica la migración como actor.

## Modalidad de operación y canales opcionales

Configuración → Operación y canales (`/configuracion?tab=operation`) separa el perfil
operativo del tenant y sus canales. Sólo un superadmin Clerk activo confirmado en
`app_users` puede guardar ambos. Owner/admin consultan el perfil y administran la
conexión de un canal que ya esté habilitado; no pueden concedérselo.

- Modalidades: `consultative` (Venta consultiva, valor predeterminado), `pos`
  (Punto de venta) y `mixed` (Mixta). Cambiar de modalidad guarda el perfil; no
  construye caja, arqueos, inventario ni un conector POS. La interfaz declara ese
  alcance. Este incremento conserva la navegación y los procesos comerciales
  existentes; la adaptación del inicio y menús operativos depende de integrar el POS.
- El canal `mercadolibre_channel` es opcional en las tres modalidades. No se
  selecciona por cambiar de modalidad y una modificación del canal no cambia el perfil.
  Sin habilitación, no aparece el enlace de conexión y la API rechaza el acceso.
  Superadmin sí puede ver el control para otorgar o revocar la capacidad.
- Cada empresa conecta su propia cuenta mediante el conector. Guardar configuración
  no inicia OAuth ni importa ventas, crea oportunidades o genera comprobantes.
- PATCH de modalidad y de capacidades toman empresa/actor de sesión y requieren
  `X-Tenant-Context` coincidente con esa empresa. Es una precondición de pantalla,
  nunca un selector: si cambió el contexto, responden 409 sin escribir. Payloads
  con IDs de empresas o claves no soportadas se rechazan.

Aplicar `cotiza-web/prisma/manual/20261109_tenant_operation.sql` antes de publicar.
Administra sus tablas mediante SQL parametrizado, igual que la extensión Mercado
Libre, sin regenerar Prisma ni usar `db push`. Es aditiva e idempotente, sin
backfill ni activaciones. Los tenants sin fila conservan Venta consultiva. Los
cambios se serializan por tenant y guardan estado anterior, nuevo, actor y fecha
en `tenant_operation_events` en la misma transacción. Repetir el mismo guardado no
duplica eventos. Deshabilitar el canal conserva la conexión y las ventas existentes;
el acceso se vuelve a comprobar en cada petición y puede rehabilitarse.

Validación: suites de API, React, disponibilidad y PostgreSQL (`tenant-operation.integration.test.ts`).
La suite de base usa únicamente una base local desechable `cotiza_ml_synthetic`
indicada con `COTIZA_ML_TEST_DATABASE_URL`. Verifica migraciones repetibles,
aislamiento, independencia de canal/perfil, auditoría e idempotencia; concurrencia
en PostgreSQL real. `scripts/check_tenant_operation_ui.mjs` verifica el componente
real a 1360/390 px con respuestas sintéticas, error/reintento, guardado por separado,
cambio de empresa y acceso de sólo lectura. El workflow Mercado Libre ejecuta ambas
verificaciones y conserva las capturas. Las pruebas no acreditan un OAuth real.
