# Multitenant: requisito previo a integrar CRM

## Contrato

Cotiza es la autoridad de identidad y pertenencia. Clerk autentica al usuario;
una fila activa en `app_users` cuyo `user_id` coincide exactamente con Clerk
concede rol y tenant. Sin fila, usuario inactivo, tenant ausente o inactivo:
acceso denegado. No se reconcilian cuentas en un GET por nombres, alias o correo.
El webhook firmado y el flujo administrativo existente vinculan IDs explícitos.
La corrección no modifica usuarios ni permisos existentes automáticamente.

Superadmin puede seleccionar otro tenant activo. Owner/admin operan solo en su
tenant; vendedores mantienen las reglas comerciales existentes. Cada cambio
por el endpoint y cada restablecimiento se registra con actor, origen, destino
y fecha antes de emitir/eliminar la cookie. El fallo de auditoría bloquea el cambio.
La cookie expresa selección, nunca rol: cada petición vuelve a resolver la
identidad y membresía exactas. Su edición por un usuario común no cambia tenant.
La auditoría registra solicitudes aceptadas; no prueba que el navegador haya
recibido la cookie y no es un ledger WORM.

Sin credenciales Clerk, producción y pruebas deniegan acceso. Solo desarrollo
puede habilitar `ALLOW_BOOTSTRAP_AUTH=true` para una demo local. Las cookies del
harness solo funcionan en desarrollo con `ALLOW_DEV_COOKIE_AUTH=true` y una fila
local exacta activa; no habilitar estas opciones en un despliegue compartido.

Clientes, contactos, oportunidades, tareas e interacciones se consultan por
tenant. Tareas e interacciones solo pueden apuntar a una oportunidad del mismo
cliente y tenant. Los servicios validan referencias incluso para llamadas
internas; la migración refuerza los vínculos en PostgreSQL para cubrir concurrencia
y escritores ajenos a HTTP. Quotes/proposals no pueden enlazar oportunidades
ni clientes de otro tenant. Un contacto o cliente no se copia al cambiar tenant.

## Implementación y pruebas de este cambio

- Resolución de sesión exacta; sin ascenso de permisos por coincidencias de identidad.
- Sin fallback anónimo a owner en producción ni fallback al primer tenant.
- Cambio de contexto reservado a superadmin y auditado.
- Validación de padres en servicios de contactos, tareas, interacciones y alta de oportunidades.
- Consultas de autores de interacciones limitadas al tenant.
- Migración aditiva con claves compuestas y validación de relaciones históricas.
- Pruebas unitarias de identidad, roles, cookies, padres entre dos tenants y fallo de auditoría.

## Despliegue: condiciones obligatorias

1. Identificar el despliegue activo y su proyecto/rama/base de Neon sin exponer secretos.
2. Confirmar que cada usuario legítimo (incluido superadmin) está vinculado por
   `app_users.user_id` a su ID Clerk real. Resolver cuentas pendientes mediante
   el flujo administrativo/webhook, nunca mediante coincidencias de nombres.
   Este cambio puede denegar cuentas que dependían del antiguo fallback.
3. En una rama aislada ejecutar `20261022_multitenant_foundation.sql`. Si alguna
   validación falla, toda la transacción se revierte. Revisar los registros;
   no asignar tenants por conveniencia ni borrar datos para hacerla pasar.
4. Probar alta de cotización, versión, propuesta, cierre, reapertura, contactos,
   tareas e interacciones con dos tenants, owner/admin/vendedor y superadmin.
   No enviar correos ni timbrar facturas reales para esta validación.
5. Aplicar migración a la base destino antes de desplegar el código: la tabla
   de cambios de contexto no se crea al vuelo. Desplegar de forma controlada.
6. Conservar las claves y auditoría ante rollback de código. Un rollback al
   resolver anterior reintroduce los huecos de acceso; preferir corregir la
   vinculación de usuarios y mantener el resolver estricto.

## Pendiente para declarar completado el aislamiento de toda la plataforma

Este PR establece la base y corrige bloqueos; no certifica todo el sistema.
Faltan la conciliación de datos reales, prueba con Clerk real, revisión completa
de descargas/PDF/XLSX, reportes/KPIs, procesos de fondo y rutas legacy Python.
Confirmar las reglas de visibilidad por vendedor en la vista 360: varias lecturas
actuales usan alcance de tenant, distinto de alcance por propietario.
No integrar ni migrar el CRM anterior hasta cerrar esa evidencia.

RLS no se activa en este cambio. Evaluarlo con rol de aplicación sin BYPASSRLS,
contexto transaccional compatible con el pool y tratamiento explícito de
superadmin y procesos internos. No usar SET de sesión persistente con pool de
transacciones. Las claves compuestas protegen relaciones; no sustituyen RLS ni
los filtros/autorización de lectura.

## Evidencia de validación (22 octubre 2026)

- `vitest`: 428 pruebas pasan; 18 casos de integración opt-in omitidos. Se
  excluyó `validate-quote-lifecycle.e2e.test.ts`, que requiere DATABASE_URL y
  acceso a una base real. La suite completa sin excluirlo falla por falta de
  esa variable, no por una aserción de aislamiento.
- 39 pruebas nuevas de identidad, contexto y relaciones pasan.
- TypeScript sin errores y ESLint en archivos modificados sin errores.
- PGlite/PostgreSQL aislado: migración ejecutada dos veces, operaciones válidas
  y auditoría aceptadas, nueve escrituras cruzadas rechazadas; datos históricos
  inconsistentes abortan toda la migración sin borrar el registro original.
- Proyecto Neon DynamiQuote, rama aislada `crm-multitenant-validation-20261022`
  (`br-old-pond-ahe5jto3`): las diez claves foráneas pasan VALIDATE con una copia
  de los datos actuales. Expiración configurada para 23 octubre 2026, 20:25 UTC.
  No se aplicó DDL ni se modificaron registros en producción.
- Conteos de origen: 4 tenants, 62 clientes, 163 oportunidades.
- Usuarios activos: cinco con ID de formato Clerk (incluye un superadmin),
  tres pendientes de invitación y un superadmin con identificador legacy.
  El formato no acredita por sí solo existencia en Clerk; revisar el vínculo
  exacto de ese superadmin antes de activar el resolver estricto.

Para repetir la validación SQL sin Neon ni datos reales, instalar PGlite en
un directorio temporal y ejecutar `scripts/check_multitenant_migration.mjs`
con `PGLITE_MODULE` apuntando al `dist/index.js` de esa instalación, o instalar
`@electric-sql/pglite` temporalmente sin guardar dependencias y ejecutar el script.
No necesita DATABASE_URL ni claves de producción.
