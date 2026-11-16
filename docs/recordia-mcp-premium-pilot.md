# Recordia MCP Premium — memoria persistente de SynAppsSys

Autorización: Salvador pidió integrar el piloto solamente a SynAppsSys y luego
completar la memoria propia persistente. Esta entrega reemplaza la proyección de
consulta del PR #110 por un archivo independiente en PostgreSQL.

## Comportamiento implementado

Recordia conserva una copia estructurada de cada versión de los registros
incluidos. La captura ocurre automáticamente mediante triggers, dentro de la
misma transacción de negocio: no depende de abrir el panel ni de llamar MCP.
Una transacción cancelada no deja eventos; si falla la captura, tampoco se
confirma el cambio de negocio. Ese acoplamiento es deliberado para evitar huecos.

La instalación toma un **estado inicial observado**, con la fecha UTC real de la
captura. Conserva también las fechas originales como datos de origen. No afirma
que ese estado existiera antes de observarlo ni reconstruye versiones perdidas
antes de instalar Recordia. Si una reinstalación observa un estado distinto
después de un intervalo sin captura, agrega `baseline.reobserved`: conserva el
último estado observado y el actual sin inventar cambios intermedios.

Después, creaciones, ediciones, eliminaciones y salida del tenant agregan nuevos
eventos. Cada evento conserva antes/después, identidad de fuente, versión,
referencias al expediente, momento UTC, actor cuando fue declarado, rol técnico
registrador, huella SHA-256 y vínculo a la versión anterior. Volver de A a B y
luego a A mantiene las tres versiones. Una edición usa `supersedes`; no se
clasifica automáticamente como corrección si no existe una declaración de ello.

## Fuentes incluidas y límites de preservación

| Fuente | Preservación |
|---|---|
| Oportunidades | Datos y cambios de estado/relaciones guardados en la fila. |
| Cotizaciones y sus partidas | Versiones de filas, importes y descripciones estructurados. |
| Propuestas, partidas y documentos formales | Datos estructurados y relaciones explícitas. |
| Notas comerciales | Texto capturado completo; la lista puede abreviarlo y permite abrir la versión conservada. |
| Eventos y aprobaciones | Registro original y versiones posteriores, incluidas eliminaciones. |
| Tareas | Datos, pendientes y cambios registrados en la fila. |

Se excluyen los campos `pdf_file_data`, `signature_image_data` e
`invoice_xml_base64`. Se conserva una huella de la representación UTF-8 de esos
campos y se marca explícitamente que el archivo binario no se preservó. Esa
huella no se anuncia como hash binario de PDF/XML. No hay descarga, custodia ni
copia independiente del archivo original en este alcance.

No se incorporan Gmail, Loom, bancos ni otras fuentes nuevas. No se almacenan
credenciales de conectores. El archivo histórico no mantiene claves foráneas a
las filas comerciales, de modo que una eliminación no lo arrastra.

## Identidad, tiempo y relaciones

- Tenant fijo verificado: `389b6cc1-2f8d-4fe4-bc3d-f50f92df3157`, slug `sys`.
  Un CHECK del archivo impide almacenar otro tenant. Los triggers ignoran otras
  empresas; las partidas sin tenant se resuelven mediante su cotización.
- La relación con un expediente se valida por identificadores explícitos y por
  empresa. Una referencia a una oportunidad de otro tenant no se acepta.
- Una fuente que se vincula después puede mostrar sus versiones anteriores,
  identificadas como conservadas antes de ese vínculo. No se reescribe la
  asociación del evento original.
- En una salida de SynAppsSys solo se guarda la imagen anterior autorizada;
  no se copia la nueva imagen de otra empresa.
- La fecha Recordia está en UTC y se muestra en CDMX. La fecha original se
  conserva literalmente; fechas ausentes continúan ausentes.
- La versión Recordia es la versión del registro archivado, distinta del número
  de revisión comercial de una cotización.
- El autor de creación que figura en una fila no se presenta como quien la
  editó o eliminó. Sin un contexto explícito `SET LOCAL app.recordia_actor_id`,
  el actor de edición o eliminación es `unknown`. En un alta nueva se conserva
  como declaración el `created_by_user_id` o el aprobador que figure en la fuente,
  cuando exista. Un actor transmitido por la aplicación se
  etiqueta `declared`, no se certifica criptográficamente. Se conserva además
  `session_user` como registrador técnico PostgreSQL.

Las cadenas son independientes por identidad de fuente. Un bloqueo transaccional
por fuente y una restricción de versión única evitan versiones concurrentes
iguales sin serializar objetos no relacionados. El número general de evento
sirve para paginación; puede tener huecos por rollback y no pretende probar un
orden causal entre objetos distintos.

## Consulta, archivo e integridad

- Menú **Recordia · Premium**: `/recordia`, hasta 200 expedientes en la vista.
- Archivo por expediente: `/recordia/{opportunityId}`, independiente de la
  existencia actual de la oportunidad comercial.
- El panel de cada oportunidad utiliza el mismo archivo persistente.
- **Ver versión conservada** devuelve el sobre exacto guardado, sin recalcular
  la historia desde las tablas comerciales.
- **Verificar integridad** comprueba las huellas y las cadenas completas de las
  fuentes vinculadas al expediente. No es un certificado externo.

MCP privado: `POST /api/opportunities/{opportunityId}/recordia/mcp`.
Herramientas: `recordia_list_memories`, `recordia_get_memory`,
`recordia_get_evidence`, `recordia_verify_integrity`.
La lectura nunca crea ni actualiza eventos. Hay paginación por cursor de número
persistente, con páginas de hasta 100 y respuestas de hasta 256 KiB. Sobres que
superen ese límite siguen conservados en PostgreSQL pero requieren extracción
administrativa; el endpoint no los trunca silenciosamente.

Cada lectura verifica el SHA-256 sobre los bytes UTF-8 exactos de
`canonical_text` y el vínculo directo con su predecesor. La comprobación integral
revisa todas las versiones de las fuentes seleccionadas. Las notas siguen siendo
declaraciones y las aprobaciones decisiones registradas. `hash_verified` describe
el sobre Recordia comprobado, no la verdad de una afirmación ni la integridad de
un archivo externo.

UPDATE, DELETE y TRUNCATE del archivo están bloqueados por triggers SQL. TRUNCATE
de fuentes con filas de SynAppsSys también se bloquea para impedir eludir la
captura por fila. Un administrador que pueda alterar funciones, restricciones o
triggers conserva poder sobre la base: esto no es WORM, custodia HotVault ni
protección contra un propietario de PostgreSQL comprometido. Se requieren las
copias de respaldo de la base; no se contrató almacenamiento adicional.

## Premium y operación

Se mantienen sesión Clerk real, superadmin activo, empresa activa, capacidad
`recordia_mcp_premium`, origen propio, cabecera de empresa coherente y revalidación
antes/después de la lectura. Bootstrap y otros tenants permanecen bloqueados.
Cada solicitud MCP tiene servidor y transporte independientes. No se habilitan
clientes externos por OAuth ni credenciales nuevas.

La lectura sigue configurada hasta `2026-12-17T06:00:00Z`, fin del 16 de diciembre
CDMX, sin cobro ni renovación automática. Revocar el acceso premium impide
consultar por MCP y por el archivo web. **La captura interna de SynAppsSys y la
preservación de lo ya registrado continúan**, para que una suspensión de lectura
no genere una pérdida silenciosa de historia. Detener o retirar la captura
requiere una decisión administrativa explícita y documentar el intervalo sin
cobertura; desactivar el acceso no elimina memoria.

## Instalación y reversión operativa

1. Probar `scripts/recordia/check_persistent_memory.mjs` en PostgreSQL WASM local.
2. Ejecutar todas las sentencias de
   `cotiza-web/prisma/manual/20261116_recordia_persistent_memory.sql` en UNA
   transacción explícita. Es aditiva, idempotente, toma un bloqueo breve de las
   fuentes para instalar captura y estado inicial sin una ventana intermedia.
   El timeout de bloqueo de 5 segundos cancela la instalación si hay contención.
3. Verificar cantidad de fuentes, ten triggers habilitados, estados iniciales y
   huellas. No editar datos comerciales reales para probar el sistema.
4. Desplegar el commit que lee el archivo. La captura comienza al confirmar la
   migración, aunque la interfaz anterior siga desplegada durante el build.

Un rollback de aplicación puede regresar a la UI anterior conservando el archivo
y sus triggers. No borrar la memoria ni deshabilitar protección para revertir
una pantalla. El build no ejecuta migraciones ni cargas iniciales automáticamente.

## Validación reproducible

La prueba PostgreSQL local comprueba baseline idempotente, versiones A→B→A,
rollback, conservación después de borrar, exclusión de otros tenants,
reasignaciones, huellas exactas, desconocimiento del autor cuando corresponde,
rechazo de mutaciones del archivo y fallo atómico si no puede capturar.

La integración usa un cliente MCP oficial con transporte HTTP real, PostgreSQL
WASM respaldado por un directorio desechable y reinicio del motor. Comprueba que
el estado inicial se recupera después de editar/eliminar el origen, cerrar la
base y abrirla de nuevo, además de paginación, referencias e integridad completa.
No utiliza DATABASE_URL ni credenciales productivas. La prueba con una sesión
Clerk real sigue siendo una aceptación separada.

Resultado de pruebas locales de esta entrega: 84 comprobaciones sobre PostgreSQL
desechable; 1.281 pruebas de aplicación aprobadas y 102 omitidas por requerir
entornos independientes. Incluye la integración MCP con reinicio del motor de
base de datos. TypeScript y ESLint de los cambios aprobados.
