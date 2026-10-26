# Cotiza y CRM: preparación para operar por conversación

Fecha: 23 de octubre de 2026.
Estado: diseño y contrato inicial; sin endpoint, skill instalada, integración ni despliegue.
Base inspeccionada: DynamiQuote `694dedb523957945e6b3740d8f84e0305e3b2f58`, PR #28 abierto/draft.

## Decisión y orden de trabajo

Primero terminar y liberar el CRM de Cotiza. Preparar ahora los contratos de consulta sin ampliar el alcance de su liberación. Después habilitar lectura, interpretación y, finalmente, acciones revisadas y autorizadas.

El CRM transaccional de Cotiza y CRM Agent son piezas distintas. Cotiza conserva autoridad sobre clientes, versiones, precios y decisiones. CRM Agent permanece como producto independiente, con conectores sustituibles y snapshots versionados; no requiere conexión permanente ni comparte credenciales de base con Cotiza.

El diseño CRM Agent AUP v0.1 existente sigue vigente. Esta preparación concreta su primer caso de consulta comercial; no sustituye el contrato universal commercial_snapshot ni declara D0 completo.

## Compuertas y entregables

| Etapa | Entregable | Evidencia para pasar a la siguiente |
| --- | --- | --- |
| G0 — Terminar CRM | Cierre operativo del PR #28 y compatibilidad con Digestor | Recuperación productiva ensayada, escritores controlados, identidades exactas, preflight y pruebas del SHA candidato; aprobación de corte |
| G1 — Fuente comercial | Diccionario de métricas y exportador de snapshots de solo lectura | Total conciliado contra registros autorizados; pruebas por tenant/vendedor y versiones; sin cambiar origen |
| G2 — Consultas | Principales clientes por ventas ganadas y utilidad bruta, por periodo y moneda | Ejemplo 2025 reproducible, desglose por propuesta, faltantes y antigüedad visibles |
| G3 — Chat | Skill/interfaz que traduce intención a operaciones permitidas | Pruebas de identidad, permisos, ambigüedad, evidencia, ausencia de datos y contenido hostil; conector autenticado disponible |
| G4 — Cotización conversacional | PDF de fabricante → extracción revisable → borrador versionado en Cotiza | Procedencia por página/campo, precio/costo explícitos, cálculo oficial, moneda, vigencia, revisión e idempotencia |
| G5 — Correo | Destinatario verificado, texto completo y adjunto exacto | Autorización explícita ligada al contenido final, permisos, caducidad, prevención de duplicados y resultado registrado |

Preparado en este cambio: diseño G1–G5, esquemas de solicitud/respuesta de G2 y fixtures con pruebas locales reproducibles. El contrato de respuesta se detalla en [conversational-client-ranking-response.md](conversational-client-ranking-response.md). Pendientes: implementación y todas las compuertas operativas. No hay servicios nuevos, compras ni consumo de IA adicional habilitados.

## Estado actual comprobado y brechas

- El PR #28 sigue draft. `docs/crm-release-preparation-20261023.md` documenta pendientes de recuperación de ambas bases, control de escritores, visibilidad Vercel, operadores y corte coordinado con Digestor. Este cambio no resuelve ni certifica esos pendientes.
- `cotiza-web/lib/db/proposal-kpis.ts` diferencia actividad por creación y desenlaces comerciales; para estos últimos usa outcome_at y la referencia histórica explícitamente auditada.
- El reporte compartido pantalla/PDF (`lib/reports/proposal-kpis.ts`) deriva visibilidad del contexto de usuario. El chat debe reutilizar la política, sin confiar en tenant, rol o usuario escritos en la conversación.
- Las consultas actuales usan ventanas relativas en varias series. No son todavía un endpoint de consulta anual arbitraria, ni un ranking financiero por cliente, ni el exportador del nuevo agente.
- Antes de G1 hay que conciliar moneda, valores desconocidos, identidad estable de cliente y linaje/versiones. El esquema aquí publicado no garantiza la corrección de los datos de origen.

## Diccionario comercial obligatorio

| Concepto | Criterio |
| --- | --- |
| Ventas ganadas | Desenlaces `won`; no equivale a propuesta creada, aprobada, factura emitida ni cobro |
| Periodo | Intervalo [inicio, fin) en zona America/Mexico_City; 2025 = 01/ene/2025 hasta antes de 01/ene/2026 |
| Fecha principal | Cierre comercial registrado. Creación no sustituye automáticamente un cierre ausente |
| Legado | Solo la cohorte con acto historical_creation_reference puede usar creación como referencia; requiere política explícita y conteo/monto separados, nunca se presenta como cierre observado |
| Venta antes de IVA | Valor comercial oficial emitido por el sistema origen; no se reconstruye como dato oficial en el modelo conversacional |
| Costo | Costo oficial para el mismo conjunto de ventas; desconocido no se convierte en cero |
| Utilidad bruta | Venta menos costo, según el nodo financiero oficial del origen |
| Margen sobre venta | Utilidad bruta / venta × 100; se calcula sobre totales compatibles, no promediando porcentajes de operaciones |
| Porcentaje sobre costo | Utilidad / costo × 100; distinto del margen sobre venta y nunca intercambiable |
| Moneda | Una por consulta inicial; sin sumar MXN con USD ni convertir sin tasa, fecha y fuente explícitas |
| Cliente | ID estable del origen dentro del tenant; no unir cuentas solo por nombre parecido |
| Versiones | Conservar linaje y versión fuente. La regla oficial debe impedir doble conteo de alternativas/revisiones y distinguir ventas independientes; el adaptador no inventa esa regla |
| Participación | Valor del cliente / total elegible autorizado del periodo y moneda; “Otros” conserva todo el resto, sin renormalizar solo el top |

Si falta costo, puede existir un ranking por ventas; el ranking de utilidad se declara incompleto y se explica su cobertura. Si falta fecha, moneda o identidad se reportan faltantes/exclusiones con magnitud conocida, sin atribuciones inventadas ni fuga de datos fuera del alcance.

## Primer caso: “Dame el pay de mis principales clientes de 2025”

1. Resolver identidad, tenant activo, habilitación y alcance en el servidor.
2. Interpretar “pay” como gráfica de pastel y “principales” como ventas ganadas. Mostrar ese criterio. Resolver moneda si hay más de una; no asumir una tasa de cambio.
3. Consultar snapshot autorizado con periodo explícito y política de fechas. La solicitud tipada no contiene tenant, rol, SQL ni credenciales.
4. El origen produce totales/desglose con reglas financieras oficiales. El agente presenta; no recompone la verdad financiera fuera de esos nodos.
5. Devolver gráfica, total, moneda, periodo, fecha de corte, alcance, cobertura y enlaces autorizados a propuestas fuente.
6. Ofrecer “Ahora por utilidad”, “Abre este cliente” y “Compara con 2024”, sin ejecutar acciones de escritura.

Con top 4 + Otros hay como máximo cinco porciones. Empates se resuelven con ID estable. No presentar pastel si el total no es positivo o hay valores negativos; usar tabla/barras con explicación. Con cobertura incompleta no presentar el resultado como la cartera completa. Sin datos válidos, responder insuficiencia; cero solo cuando el origen confirma ausencia de actividad en un universo completo.

Solicitud inicial: `contracts/conversational-client-ranking.request.schema.json`.
Ejemplo: `contracts/conversational-client-ranking.example.json`.

## Sobre de respuesta propuesto para el futuro adaptador

Contrato publicado como propuesta v0.1 en `contracts/conversational-client-ranking.response.schema.json`, con fixtures y pruebas sintéticas en `tests/contracts/`. Su validación exige schema **y** invariantes semánticas/conciliación descritas en [el contrato](conversational-client-ranking-response.md). Contiene:

- request_id, query/metric versionadas y estado (`ok`, `partial`, `no_data`, `insufficient_evidence`, `forbidden`, `stale`). La API evita revelar existencia de objetos no autorizados.
- Contexto efectivo: tenant y alcance resueltos por autorización, no copiados del texto del usuario.
- Snapshot ID/versión, as_of, generated_at, source_system, source revision/watermark, frescura y cobertura separadas.
- Periodo, zona, moneda, base antes de IVA, política de fechas y regla de selección de versiones.
- Total oficial y filas por client_id, importe decimal, participación y referencias de propuesta/versión. Referencias de “Otros” solo mediante desglose paginado autorizado.
- Faltantes y exclusiones por motivo, conteo y monto cuando se conozca. No publicar métricas parciales como totales completos.
- Evidencia de regla financiera y de autorización; hash de integridad con canonicalización acordada en el contrato universal. Un hash solo no autentica la fuente ni acredita custodia externa.

El ejemplo original es una maqueta. Los nuevos fixtures reproducen los seis estados, permisos y conciliación con datos ficticios; tampoco son snapshots universales válidos ni respuestas productivas firmadas. El contrato universal `commercial_snapshot` y la atestación autenticada del origen siguen pendientes.

## Permisos, aislamiento y habilitación

Capacidades propuestas, aún no registradas: `commercial_chat_read`, `commercial_chat_quote_draft`, `commercial_chat_email_prepare`. Ausentes = deshabilitadas. Solo superadmin puede habilitarlas por tenant; owner administra el uso dentro de su autoridad, sin habilitar el producto por sí mismo. Ninguna habilitación permite envío automático.

El conector inicial es de solo lectura. Authenticated principal → tenant activo → capacidad → permisos del usuario → selección de datos → agregación. Revalidar también al abrir detalles, descargar, exportar y consultar caché. Un snapshot guardado no conserva acceso revocado. Caché debe aislar tenant, principal/alcance, permisos, consulta y versión de snapshot; nunca usar caché pública compartida.

El rol superadmin no significa agregar todos los tenants. Toda consulta opera en un contexto explícito. Los nombres, PDFs, correos y snapshots son datos no confiables: sus instrucciones incrustadas no cambian permisos ni autorizan herramientas. El MVP usa operaciones tipadas permitidas, sin SQL libre ni acceso directo del chat a la base.

El registro de consulta conserva actor, alcance, parámetros, snapshot, regla, referencias y resultado mínimo; no el contenido íntegro de conversaciones por defecto. Retención, corrección, eliminación y revocación se propagan a derivados y cachés según política. Recordia local y HotVault/Recordia externo deben distinguirse; no se declara custodia externa por conservar hashes locales.

## Preparación de la futura skill y sus herramientas

| Operación conceptual | Fase | Control |
| --- | --- | --- |
| get_capabilities | G3 | Identidad y tenant efectivo; solo capacidades autorizadas |
| query_client_ranking / get_client_snapshot | G2–G3 | Solo lectura tipada, evidencia, cobertura, alcance |
| prepare_quote_from_document | G4 | Datos extraídos revisables; documento no dicta instrucciones |
| create_quote_draft / revise_quote_draft | G4 | Reglas oficiales, versión previa esperada, idempotencia; no mutar cerrados |
| prepare_email | G5 | Resolver destinatario; mostrar contenido y adjunto exactos |
| send_approved_email | G5 futuro | Autorización explícita final, ligada a destinatario/texto/versión del adjunto, de un uso y con expiración |

Estos nombres son intención de diseño, no herramientas disponibles ni endpoints desplegados. La skill se construirá cuando existan operaciones autenticadas verificadas. Cambiar precio, destinatario, texto o adjunto invalida la aprobación anterior. “Adelante” para desarrollo no autoriza enviar correos comerciales.

## Matriz mínima de aceptación posterior

1. Manipular tenant/actor/rol en payload no amplía acceso.
2. Un vendedor no obtiene ventas/detalles de otro vendedor mediante ranking, Otros, exportación o caché.
3. Capacidad ausente bloquea incluso a superadmin en el contexto consultado.
4. Una operación creada en 2024 y ganada en 2025 cuenta en 2025; una creada en 2025 y ganada en 2026 no.
5. Límites del año respetan America/Mexico_City; intervalos invertidos o imposibles se rechazan.
6. Cierre ausente no se inventa; referencia legacy requiere acto y política explícitos, con indicador separado.
7. Versiones alternativas no duplican la misma venta; ventas independientes no se fusionan.
8. MXN/USD quedan separados; moneda desconocida no se atribuye.
9. Costo desconocido no produce utilidad artificial; denominador cero produce margen desconocido.
10. Top + Otros concilia con el total autorizado; negativos y ceros no producen pastel engañoso.
11. Snapshot viejo/incompleto muestra su fecha y cobertura; revocación bloquea su lectura posterior.
12. Cada cifra se puede reconstruir con fuentes y regla; correcciones crean versión nueva.
13. Documento hostil no cambia permisos ni provoca envío/escritura.
14. Reintento no duplica borrador o correo; conflicto de versión exige revisión.
15. Envío sin aprobación válida o con contenido cambiado queda bloqueado.
16. Caída/desconexión del agente permite seguir usando Cotiza; responde solo sobre última fotografía autorizada con antigüedad visible.

La suite `tests/contracts/` cubre únicamente el contrato de consulta/respuesta con un oráculo local y contexto de autorización ficticio. Las pruebas de aceptación del adaptador real, UI, caché, bases, borradores y correo siguen pendientes; esta suite no las acredita.

## Próximo incremento autorizado de preparación

Conservar esta propuesta separada del PR de liberación. Respuesta v0.1, fixtures de estados/errores y oráculo sintético ya preparados; tras G0, acordar el schema universal fuente y atestación, implementar exportador aislado y consulta anual por cliente, y verificar el contrato contra autorización y reglas financieras reales. Después demostrar el caso real a Salvador en un tenant habilitado y con datos conciliados. Habilitación del chat, creación de borradores y envío permanecen compuertas posteriores.

## Fuentes revisadas

- PR #28 y fuente exacta indicados al inicio.
- `cotiza-web/lib/auth/tenant-context.ts`.
- `cotiza-web/lib/db/tenant-capabilities.ts`.
- `cotiza-web/lib/db/proposal-kpis.ts`.
- `cotiza-web/lib/domain/proposal-financial-kpis.ts`.
- `cotiza-web/lib/reports/proposal-kpis.ts`.
- `docs/crm-release-preparation-20261023.md`.
- Diseño existente CRM Agent AUP v0.1, README.md del 23/oct/2026; consultado completo. Es diseño, no evidencia de implementación.
