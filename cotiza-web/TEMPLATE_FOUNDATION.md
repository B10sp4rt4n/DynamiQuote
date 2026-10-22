# Plantillas y entrada de partidas V1

El cotizador permite guardar la versión persistida como plantilla, asignándole
un nombre y una descripción. Sólo copia las partidas; no copia identidad fiscal,
cliente, contacto ni estado comercial. La plantilla conserva la cotización y
versión de origen en `packages.source_metadata`.

«Usar plantilla» muestra una revisión con cantidades independientes por partida,
costos/precios guardados y totales. El usuario confirma la aplicación. Se crea una
nueva versión en borrador que agrega las partidas a las existentes, conserva la
oportunidad y deja intactas la versión y las propuestas anteriores. Una partida
de servicio fijo conserva su cantidad hasta que el usuario la cambie. Se exige
guardar los cambios del editor antes de usar/guardar plantillas.

La inserción usa `final_price_unit`, `line_type` y `service_origin`, igual que el
editor. El código anterior escribía campos ajenos al esquema y no recalculaba los
totales ni preservaba la versión. Los identificadores versionados son válidos.
El número PKG es global porque la restricción existente es global; se asigna
bajo bloqueo transaccional y orden numérico para evitar colisiones entre tenants.

## Entrada común y reintentos

`lib/domain/quote-input.ts` define las partidas normalizadas y recalcula precios,
extensiones y margen. V1 usa cantidades enteras como el editor y rechaza valores
fraccionarios o totales fuera del rango de la base, sin redondear cantidades.
`lib/db/quote-input.ts` crea el borrador atómicamente para plantillas (agregar) y
Excel (reemplazar en una versión nueva). Los adaptadores futuros deben traducir
sus datos a este contrato; no hay conexión externa ni autenticación máquina a
máquina nueva en esta entrega.

Cada operación de la interfaz manda un UUID estable durante sus reintentos. Se
comprueba tenant, permiso sobre la cotización, revisión de la plantilla y hash de
los datos. Repetir una clave devuelve la versión existente; cambiar sus datos
devuelve 409. Se conservan procedencia, versión/hash de plantilla, valores de las
partidas recibidas, cotización base, fecha de captura y clave en
`quotes.input_metadata`. Los índices parciales impiden claves repetidas por
tenant; los bloqueos serializan reintentos y numeración de versiones.

El endpoint Excel mantiene compatibilidad con clientes sin clave (reciben una
operación nueva); la interfaz actual sí manda la clave. Las rutas sólo admiten
sesiones y permisos existentes. Los campos tenant/actor no se aceptan del cuerpo.

## Publicación y validación

Aplicar `prisma/manual/20261022_template_input_metadata.sql` antes del despliegue.
Agrega dos campos JSONB opcionales y dos índices parciales; las filas anteriores
conservan sus datos y el código previo es compatible. No usar `db push`.

Comprobaciones: pruebas de contrato y rutas, TypeScript, lint; migración repetible
en rama aislada Neon y pruebas funcionales en PostgreSQL local desechable (PGlite
0.5.3 / pglite-socket 0.2.6 con Prisma). La conexión directa del ejecutor a Neon
está bloqueada por DNS: no se afirma una integración de aplicación contra Neon
desde ese ejecutor. La concurrencia local usa el multiplexor de PGlite; su
semántica no reemplaza una prueba concurrente en PostgreSQL multisesión real.

La prueba opt-in `lib/db/template-foundation.integration.test.ts` sólo acepta
localhost. Crea datos propios y los
retira al terminar. Cubre guardar/reintentar, cantidades variables/cargos fijos,
aislamiento, conflictos, totales, conservación de versión/oportunidad, Excel,
desbordamiento y números de paquete entre tenants.

## Siguiente corte

Seleccionar una plantilla real y validar su política de cantidades y precios.
La moneda sigue perteneciendo al flujo comercial existente: no se infiere ni se
convierte automáticamente. Costos vigentes, reglas por plazo, cambio de moneda,
edición/versionado de plantillas, mapeos de ERP/CRM/RiskFlow y credenciales para
sistemas externos requieren su propio contrato y validación antes de habilitarse.
