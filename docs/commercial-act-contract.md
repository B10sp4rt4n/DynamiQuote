# Acto comercial AUP / memoria local, contrato 1.0

Primer alcance: asignar/quitar desenlace de una propuesta, corregir su fecha
comercial y limpiar su cierre cuando el flujo deja de admitirlo (incluida la
reapertura a borrador). El caso se identifica por la oportunidad cuando existe;
la propuesta conserva su identidad y el tenant forma parte de las referencias.

## Registro y compatibilidad

Se reutiliza `proposal_audit_events`: no se crean tablas, migraciones, servicios
ni conexiones externas. Se conservan `outcome_changed`, `outcome_date_changed`
y los campos anteriores del payload para KPIs e historial. Se añade
`commercialAct` y una huella del payload completo en `event_hash`, con el
prefijo `aup1:sha256:` para distinguir este contrato de los identificadores
aleatorios anteriores. La huella incluye también los campos antiguos que
presenta la interfaz; quitar el contrato no permite degradar una fila nueva a
"legado sin verificar".

La decisión y su memoria se escriben en la misma transacción bajo el bloqueo
de la propuesta. Un fallo de persistencia o una huella anterior inconsistente
cancela la transacción. Los reintentos idénticos no duplican actos. El número de
secuencia determina el predecesor incluso cuando dos eventos tienen el mismo
timestamp. Las correcciones apuntan al evento anterior, sin actualizarlo.
Los registros antiguos se conservan tal cual; su UUID no se convierte en una
huella criptográfica ni acredita una sincronización con Recordia.

## Campos principales

| Campo | Significado |
| --- | --- |
| `contract_version`, `recordia_version` | Versiones explícitas del contrato interoperable |
| `event_id`, `sequence`, `tenant_id`, `case_id`, `subject` | Identidad local y alcance del acto |
| `actors` | Usuario y rol recibidos del contexto; identidad declarada, sin certificación adicional |
| `state_before`, `state_after` | Estado del flujo, desenlace y fecha comercial antes/después |
| `occurred_at_utc`, `recorded_at_utc` | Momento de la acción y de su registro en la aplicación |
| `commercial_effective_time` | Fecha comercial separada; precisión y procedencia declaradas |
| `source_refs` | Referencias a la propuesta y oportunidad exactas, con tenant |
| `evidence_refs` | Vacío mientras no se aporte evidencia documental verificada |
| `policy_or_rule_refs`, `rule_snapshot` | Regla versionada y parámetros relevantes del control aplicado |
| `relations`, `previous_content_hash_sha256` | Corrección, sustitución, revocación o continuidad y huella anterior si existe |
| `memory` | `local_only`, sin referencia externa de Recordia ni custodia solicitada |

Una fecha de agosto seleccionada en octubre se conserva como declaración
comercial con precisión de día. No se presenta como venta observada en agosto.
El soporte del evento acredita la transición del sistema; no prueba por sí
solo la aceptación del cliente. Un valor sin fecha conserva esa incertidumbre.

Las referencias `legacy_refs` se reservan sin inventar valores. Este alcance
no migra el CRM anterior: su `recordia_id` se preservará con procedencia cuando
se importe y no se convertirá en un acuse externo.

## Lectura e integridad

El historial verifica la huella al leer. Un contenido inconsistente aparece
como registro pendiente de revisión; no se describe su payload como decisión
confiable. Los vendedores reciben el resultado de la comprobación y los campos
operativos permitidos, sin recibir el contrato interno ni ampliar su alcance.

SHA-256 permite detectar cambios frente a la huella guardada. No es firma,
custodia WORM, autenticación de la fuente ni protección contra un administrador
capaz de reescribir también las huellas. Este contrato no declara recepción por
Recordia, sellado por HotVault ni reconstrucción total de todo el CRM.

## Validación

`scripts/check_crm_isolation.mjs` ejecuta handlers, Prisma y PostgreSQL/PGlite
local desechable. Incluye aislamiento por tenant/vendedor, cierres y correcciones,
relaciones entre actos, lectura de integridad, rollback de decisión/reapertura
cuando falla la auditoría, rechazo de historia alterada y reintentos concurrentes.
Las pruebas puras verifican fechas declaradas, referencias, clasificación local,
JSON canónico, alteración de campos visibles y eliminación del contrato.

Pendientes posteriores: ampliar a tareas/notas/cambios de políticas, importar
referencias históricas con identidad comprobada y conectar un receptor Recordia
con reintentos/acuse verificable. La custodia HotVault es una etapa separada.
