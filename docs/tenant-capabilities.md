# Capacidades por tenant

La importación de PDF ThreatDown usa la capacidad `threatdown_pdf_import`. Una fila ausente o deshabilitada bloquea tanto la interfaz como la API, incluso para superadmin. Los permisos de acceso a cotizaciones siguen aplicando.

Sólo superadmin puede guardar la habilitación en Configuración → Tenant → Capacidades. El tenant se toma del contexto autenticado seleccionado; el endpoint rechaza un tenant enviado en el payload. Owner, admin y seller no pueden habilitarla ni deshabilitarla.

Antes de desplegar el código, aplicar `cotiza-web/prisma/manual/20261022_tenant_capabilities.sql` a una rama de validación y después a producción. Es aditiva e idempotente: habilita inicialmente sólo SynAppsSys, y volver a ejecutarla no revierte una deshabilitación posterior. Los tenants nuevos permanecen deshabilitados.

Cada cambio efectivo se guarda con estado anterior, usuario y fecha en `tenant_capability_events`, dentro de la misma transacción que la configuración. Una actualización repetida al mismo estado no duplica el historial. El registro inicial identifica la migración como actor.
