# Contrato verificable de respuesta comercial v0.1

Estado: **propuesta de diseño y pruebas locales con datos sintéticos**. Complementa el PR #29, sobre la solicitud v0.1 existente, sin cambiar G0, D0 ni las condiciones de liberación del PR #28. No incorpora endpoint, skill operativa, exportador, conexión de base, interfaz de chat, infraestructura, despliegue ni llamadas de IA.

## Archivos y compatibilidad

- Solicitud existente, sin cambios: `contracts/conversational-client-ranking.request.schema.json`.
- Respuesta: `contracts/conversational-client-ranking.response.schema.json` (Draft 2020-12, `schema_version: "0.1"`, `metric_version: "cotiza-client-ranking/0.1"`).
- Ejemplos de los seis estados, fuente y autorización ficticias: `contracts/fixtures/client-ranking-v0.1/`.
- Oráculo local y verificaciones: `tests/contracts/`. Especifican el comportamiento esperado; **no son el adaptador productivo de Cotiza**.

El schema de respuesta referencia la solicitud por `urn:cotiza:conversational-client-ranking:request:0.1`. El consumidor registra ese URN con el archivo local existente, como hace la suite; no descarga schemas por red. No se agrega `$id` ni campos de identidad a la solicitud. Versiones desconocidas se rechazan; cambiar campos requeridos, significado, selección financiera o precisión exige una versión explícita nueva y nueva matriz de compatibilidad. No interpretar silenciosamente una versión futura como v0.1.

Este incremento limita importes a **MXN y USD**, con dos decimales, sin conversión. La solicitud permite códigos de tres letras, pero un catálogo aprobado por el origen debe validar su soporte: en estos fixtures, EUR y ZZZ devuelven `UNSUPPORTED_CURRENCY`. No se afirma que EUR sea una moneda inválida ni que el catálogo productivo esté implementado. Ampliar monedas/escala requiere acordar y probar ese contrato. Los identificadores son referencias opacas; no contienen credenciales ni URLs arbitrarias.

## Estados y precedencia

| Estado | Condición | Importe y presentación |
| --- | --- | --- |
| `ok` | Universo autorizado completo, evidencia suficiente y snapshot fresco | Total oficial del conjunto elegible; tabla, barras o pastel elegible |
| `partial` | Hay resultados sustentados, pero faltan registros elegibles o cobertura del periodo | `known_subtotal`, cobertura y exclusiones visibles; tabla |
| `no_data` | Universo completo y fresco confirma **cero operaciones elegibles**, sin exclusiones sin resolver | Total `0.00`, filas vacías y tabla; no confundir con ventas cuyo importe neto es cero |
| `insufficient_evidence` | No puede sustentarse un resultado, la solicitud es inválida, falla integridad o la selección de versiones es ambigua | `result: null`, sin filas/evidencia de resultados; códigos de error |
| `forbidden` | Falta habilitación, identidad vigente, tenant efectivo o permiso | Respuesta mínima uniforme: sin consulta, tenant efectivo, snapshot, cantidades, evidencia ni causas que revelen objetos |
| `stale` | Resultado sustentable cuya edad supera el máximo autorizado | Snapshot/edad explícitos, tabla y advertencia; cobertura conserva su estado completo/parcial |

Orden: autorización primero; luego solicitud/catálogo, integridad y versión fuente; luego suficiencia; después frescura del resultado sustentable. Un snapshot viejo sin evidencia suficiente sigue siendo `insufficient_evidence`, con su frescura separada. Si no hay autorización, la edad y la existencia del snapshot no se revelan. El diseño no prescribe códigos HTTP ni crea una API.

## Sobre de respuesta y permisos efectivos

| Campo | Significado verificable |
| --- | --- |
| `request_id`, `response_id`, `query` | Correlación y parámetros tipados exactos aceptados; query nula ante rechazo de solicitud o autorización |
| `authorization` | Decisión efectiva, referencia, versión de política, evaluación y expiración, capacidades, permisos, principal, tenant y alcance realmente resueltos |
| `snapshot` | ID y versión del contrato fuente, sistema, revisión, `as_of`, exportación, watermark `data_until`, vínculo al alcance y referencia de atestación |
| `freshness` | Edad entera en segundos desde `as_of` hasta `generated_at`, máximo definido por política confiable y estado |
| `coverage` | Completitud del periodo, candidatos, elegibles, excluidos únicos, motivos y magnitudes conocidas, referencias legacy separadas |
| `financial_rule` | Autoridad Cotiza, identificador y versión de regla financiera, selección oficial, antes de IVA y sin FX |
| `result` | Total o subtotal conocido, moneda, ventas/costos/utilidad/margen compatibles, top, Otros y conciliación |
| `evidence` | Referencias de propuestas, ventas, linajes, versiones y evidencia financiera/de fechas de los clientes top |
| `errors`, `warnings` | Códigos tipados y posibilidad de reintento; sin SQL, rutas internas, mensajes del proveedor ni secretos |
| `trace` | Referencia de auditoría, SHA-256 de parámetros, política de lectura privada con revalidación y procedencia/custodia declaradas |

`commercial_chat_read` ausente implica denegación, incluso si el actor es superadmin. Su habilitación real sigue pendiente. `ranking.read`, `revenue.read` y `evidence.read` son necesarios para resultados; `gross_profit.read` también lo es para consultar utilidad. Sin este último, una consulta de ventas devuelve costos, utilidad y margen **nulos tanto en resumen como en evidencia**, y la proyección hasheada excluye los costos. La lista de permisos explica la ocultación; no se inventa una ausencia de costo.

Los nombres de permisos son vocabulario propuesto, no roles ya desplegados. El adaptador futuro deberá mapearlo al contexto autenticado de Cotiza, nunca a instrucciones del chat. Un vendedor queda limitado a sí mismo; un lector autorizado de tenant consulta únicamente ese tenant. Superadmin tampoco agrega varios tenants por defecto.

Filtrar antes de contar faltantes, seleccionar versiones, calcular hashes, construir Otros o agregar. Revalidar identidad, habilitación, pertenencia, permisos y expiración al consultar un snapshot guardado, abrir evidencia, paginar Otros, exportar o leer caché. Una revocación invalida acceso a una fotografía anterior. El futuro cache key debe incluir tenant, principal/alcance, permisos efectivos y versión de política, consulta tipada y snapshot/revisión; nunca una caché pública. Aquí **no se implementa una caché**.

## Reglas financieras y temporales normativas

1. Cotiza es la autoridad financiera y transaccional. Ventas ganadas son desenlaces `won`, antes de IVA: no creación, aprobación, factura ni cobro. CRM Agent presenta afirmaciones del origen y puede verificar aritmética, pero no inventa sus precios ni selección oficial.
2. Intervalos `[start_date, end_date_exclusive)` en `America/Mexico_City`. Para 2025: desde `2025-01-01T06:00:00Z` hasta antes de `2026-01-01T06:00:00Z`. Validar fechas reales y orden; los timestamps del sobre usan UTC con `Z`, hasta seis decimales de segundo, sin leap seconds.
3. La fecha de creación nunca sustituye por sí sola un cierre. La política legacy exige además un acto `historical_creation_reference` auditable del origen; el fixture usa `legacy_act_ref` como referencia ficticia. Fecha, base y acto se conservan; conteo e importe legacy se muestran aparte, sin atribuir precisión de cierre observado.
4. La selección de propuesta/versión por venta la afirma el **origen** con regla y evidencia. Debe existir exactamente una selección inequívoca por venta en el universo; no elegir simplemente la revisión de mayor número. Alternativas/revisiones no duplican la venta; ventas independientes del mismo cliente se conservan. No incluir una versión registrada después de `as_of`. Las correcciones crean snapshots/revisiones nuevos; una consulta histórica conserva su versión fuente y no se reescribe con la corrección actual.
5. No mezclar monedas ni atribuir moneda desconocida. Registros de otra moneda conocida quedan fuera del universo consultado; moneda desconocida es una exclusión no resuelta. Su importe se conserva como desconocido para la moneda consultada, sin convertirlo ni sumarlo.
6. Costos desconocidos permanecen nulos. Con permiso financiero, puede haber ranking completo de ventas con costo/utilidad/margen nulos y advertencia `MISSING_COST`. Para utilidad, esas ventas se excluyen y producen cobertura parcial, o insuficiencia si no queda evidencia elegible. El esquema admite nulos por falta de datos o por permisos; permisos/advertencias permiten distinguirlos.
7. Utilidad = venta menos costo para **el mismo conjunto elegible**. Margen = utilidad / venta × 100, sobre sumas compatibles; denominador cero implica nulo. No promediar márgenes por propuesta. Se conservan importes negativos; no se corrigen a cero.
8. El adaptador compara totales oficiales del origen con el desglose autorizado usando aritmética decimal, nunca floats. El oráculo hace esa conciliación con valores ficticios; **no certifica la regla financiera actual de Cotiza**. Importe monetario: cadena con dos decimales, cero canónico `0.00`. Porcentajes: seis decimales, `ROUND_HALF_UP`.
9. Orden: importe descendente, empate por ID estable. No fusionar clientes por su nombre. Top N respeta `top_n` (1–4); Otros conserva el resto, incluso si su suma es cero. `top + Otros = total`, diferencia exacta `0.00`. La participación usa el total autorizado elegible, nunca solo el top. El redondeo puede diferir de 100% hasta `0.0000005 × número de filas`; no modificar importes ni renormalizar para ocultarlo.
10. Pastel únicamente con datos completos y frescos, total positivo y ninguna contribución negativa, incluso una oculta dentro de Otros. Cero, negativos, cobertura incompleta y antigüedad producen tabla con motivo explícito. Un conjunto con operaciones que suman cero es `ok` con tabla y participaciones nulas; **no** `no_data`.

## Cobertura, exclusiones y trazabilidad

`candidate_count` cuenta ventas seleccionadas `won` posiblemente atribuibles al periodo y moneda solicitados **dentro del alcance**. Una fecha o moneda desconocida impide demostrar que están fuera; por eso se contabilizan como candidatos no resueltos. `candidate_count = eligible_count + excluded_count`. Los motivos pueden solaparse: una operación sin fecha ni cliente cuenta una sola vez como excluida y en ambos motivos. No sumar los conteos por motivo para obtener excluidos.

Cada `known_amount_decimal` de un motivo se expresa como **venta antes de IVA** (`known_amount_basis: revenue_before_vat`), incluso al consultar utilidad. Es nulo si alguna operación del motivo carece de venta/moneda comparable; nunca cero por defecto. La magnitud conocida puede corresponder a candidatos cuya fecha se desconoce: no se presenta como venta perdida comprobada del periodo. Los legacy sí incluidos tienen conteo y monto de la métrica separados.

`period_complete` exige atestación de cobertura del origen y watermark que cubra el fin del intervalo; un watermark posterior por sí solo no demuestra completitud. Frescura es independiente: un corte histórico completo puede estar obsoleto hoy. No completar un periodo futuro con ceros.

Cada fila top concilia exactamente con su evidencia. Una referencia enlaza venta independiente, cliente, propuesta, linaje, versión, moneda, importes autorizados, fecha aplicable y evidencia de selección. Otros no incluye una lista de propuestas: contiene solo una referencia opaca de desglose. Su resolución futura debe ser paginada, autorizada nuevamente y ligada al mismo snapshot, consulta, moneda, regla y alcance; la suma de todas sus páginas debe conciliar con Otros, sin duplicados ni cambiar denominador. Este trabajo **no publica ni implementa** esa operación. La prueba local concilia Otros contra el conjunto ficticio completo.

## Integridad y confianza

Perfil local `sorted-json-utf8/v1`: JSON sin whitespace, claves ordenadas, UTF-8 sin escape ASCII obligatorio, sin normalizar texto Unicode, strings monetarios, enteros/bools/null y **sin floats, NaN o Infinity**. El digest SHA-256 se aplica al payload fuente ya proyectado al alcance y permisos, sin el propio digest. En los fixtures incluye `as_of`, `exported_at`, `data_until`, `period_complete`, registros/versiones autorizados, selección oficial y alcance. Los arrays conservan su orden fuente. La suite comprueba el digest contra la fuente sintética y resuelve cada referencia de evidencia.

`scope_fingerprint` liga tenant/principal/modo/vendedores; no sustituye permisos ni su revalidación. `request_sha256` liga los parámetros exactos recibidos. `source_attestation_ref` apunta a la futura atestación del exportador, **no es una firma**. Un hash sin clave acredita comparación de contenido, no autenticidad, permisos, inmutabilidad ni custodia externa. Aquí la procedencia es `synthetic`, la integridad `integrity_only` y la custodia `local_only`.

El futuro adaptador debe validar al emisor y su revisión/reglas/versión fuente mediante un mecanismo autenticado, además de integridad y autorización. No se permite aceptar como autoridad un digest y datos proporcionados por el propio usuario. El contrato universal de snapshots todavía debe fijar ese mecanismo y canonicalización interoperable; `ranking-fixture/0.1` es **solo formato de prueba**, no un reemplazo de `commercial_snapshot`.

## Pruebas reproducibles

Desde la raíz del repositorio, con Python 3.12 (biblioteca `zoneinfo` y tzdata del sistema):

```bash
python3 -m venv /tmp/cotiza-contract-venv
/tmp/cotiza-contract-venv/bin/python -m pip install -r tests/contracts/requirements.txt
/tmp/cotiza-contract-venv/bin/python -m pytest -q tests/contracts --confcutdir=tests/contracts
```

No requiere variables de entorno ni credenciales. Tras instalar dependencias de prueba, la ejecución es local y sin red; el registro de schemas es local y el oráculo no importa la aplicación ni clientes de servicios. No modifica `requirements.txt` ni dependencias de despliegue. Se usa validador Draft 2020-12 real con comprobación explícita de fechas/timestamps; los formatos no quedan a merced de dependencias opcionales ausentes.

| Área | Evidencia sintética incluida |
| --- | --- |
| Estados | Los seis ejemplos checked-in se validan y se reproducen exactamente |
| Conciliación | Venta 5,000,000; costo 3,350,000; utilidad 1,650,000 MXN; margen 33%; top 4 + Otros 750,000 |
| Aislamiento | Cambiar ventas/faltantes de otro tenant o vendedor no cambia respuesta, contadores ni digest del lector |
| Vendedor | Seller one: 3,000,000 MXN; seller two: 2,000,000; sin IDs de ventas ajenas |
| Permisos | Deshabilitado, inactivo, revocado, vencido, intento de ampliar vendedor y permiso de utilidad ausente |
| Fechas | Cuatro bordes del año CDMX, fecha de creación distinta, fechas imposibles/invertidas/vacías, legacy condicionado |
| Monedas y costos | USD 999 separado; moneda desconocida sin monto comparable; costo desconocido; precisión de centavos |
| Versiones | Selección oficial única, venta independiente preservada, histórico 4,600,000 vs actual 5,000,000, versión posterior al corte rechazada |
| Frescura/cobertura | Umbral exacto, snapshot obsoleto, futuro, periodo incompleto con/sin filas, revocación posterior |
| Respuestas alteradas | Total, porcentajes, Otros, moneda, consulta, alcance, edad, margen, fechas, evidencia, referencias de fuente y digest |
| Presentación | Ceros, totales negativos, contribución negativa escondida en Otros, empates y etiquetas hostiles como datos |

Los tests de autorización usan un **contexto confiable ficticio**; no prueban Clerk, consultas SQL, caché real, paginación, UI, adaptadores ni aislamiento de bases de producción. `integrity_valid: false` simula un fallo reportado por el exportador; no equivale a verificación criptográfica de una fuente real. No se ejecutan integraciones de aplicación porque no se modifica código de aplicación.

Validación local de este incremento: **88 pruebas aprobadas, cero omitidas**; schemas Draft 2020-12 y seis respuestas validados, y `git diff --check` sin errores. La suite incluye ejecución con sockets bloqueados y sin clave de IA. Este resultado no constituye CI remota ni validación de despliegue.

## Continuidad después de G0

Mantener CRM Agent independiente, conectado por snapshots versionados y adaptadores sustituibles, sin acceso permanente ni credenciales de base de Cotiza. Después del cierre de seguridad del CRM: acordar el schema universal y el mecanismo autenticado, implementar el exportador de solo lectura en Cotiza y ensayar la misma matriz contra su autorización y nodos financieros oficiales. Luego construir consultas; chat, PDFs/borradores y correos siguen sus compuertas y autorizaciones originales. Este diseño no habilita ninguna de ellas.
