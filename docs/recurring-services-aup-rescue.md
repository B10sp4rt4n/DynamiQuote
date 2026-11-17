# Rescate de Suscripciones-AUP dentro de Cotiza

Fecha: 16 de noviembre de 2026. Estado: extensión de R1 en revisión, piloto apagado.
Fuente revisada: [Suscripciones-AUP, commit 51588f4](https://github.com/B10sp4rt4n/Suscripciones-AUP/tree/51588f489a278a30e9e9042ee97950c376f8159c).
Base funcional: [PR #114](https://github.com/B10sp4rt4n/DynamiQuote/pull/114), commit
baa71fdae282d52b49a4052553742998ff82df45, apilado sobre el plan #113.

## Encaje en el producto

El cliente sigue siendo `clients` dentro del tenant vendedor. El servicio contratado
es un acuerdo con identidad propia y condiciones versionadas. El calendario genera
periodos; el adaptador fiscal posterior vinculará los documentos por periodo. Una
mensualidad no crea una oportunidad ganada. Cotiza conserva sus cálculos, autorizaciones
y ciclo fiscal. No se incorpora Streamlit ni otra base, catálogo de clientes o login.

Esta revisión del repositorio fuente rescata sus decisiones y las adapta al código
TypeScript existente; no copia su SQL ni ejecuta una migración de sus datos.

| Fuente Suscripciones-AUP | Destino natural en Cotiza | Decisión y estado |
|---|---|---|
| `subscription_root` | `recurring_agreements` + FK al cliente del tenant | Cubierto por R1. Conservar la identidad comercial, sin copiar nombres/contactos como otro catálogo. |
| `subscription_version` | `recurring_agreement_versions` + snapshot del periodo | Cubierto por R1. Condiciones append-only y selección por fecha efectiva; no varias versiones activas ambiguas. |
| Alertas T-30 y T-60 | Aviso de vigencia en la cartera y detalle existentes | Implementado en esta extensión, incluyendo vigencias cumplidas y preavisos mayores a 60 días. |
| `quote_evidence` + SHA-256 | Evidencia de fabricante asociada a la fuente de Cotiza | Diseño pendiente. Reutilizar importación de ThreatDown y su procedencia; verificar conservación de bytes antes de afirmar custodia. |
| `quote_applied` | Acto explícito de usar evidencia para una revisión de acuerdo | Diseño pendiente. El quote de fabricante prueba costo/oferta, no aceptación del cliente. No activa acuerdos por sí solo. |
| `quote_line` | Partidas normalizadas de Cotiza y condiciones por periodo | Reutilizar importador/cotizador existente. No crear otra calculadora de margen, impuestos o conversión. |
| `subscription_event` | `recurring_events` con actor, tenant y transacción | Cubierto por R1. Recordia necesita ampliar sus fuentes antes de afirmar preservación premium de esos eventos. |
| JSON de programas Nebula/OneView | Metadatos del producto/fabricante | No se trasladan como catálogo comercial: son ejemplos sin validación de SKU y no se usan en la app fuente. |

## Comportamiento añadido ahora

- Los avisos se calculan en servidor con la zona IANA guardada en el acuerdo y muestran
  la fecha local de consulta. No dependen de la fecha del navegador ni de un cron.
- Cotiza utiliza fin exclusivo `[inicio, fin)`: se muestran tanto el último día cubierto
  como el primer día fuera de vigencia. T-30 comprende 1–30 días hasta ese límite;
  T-60 comprende 31–60. Desde el límite, el aviso sigue visible como vigencia cumplida.
- El preaviso se calcula desde el fin exclusivo menos los días pactados. Si vence antes
  de T-60, también se señala; no se supone que se haya enviado un aviso legal.
- Pausar no oculta la vigencia contractual. Borradores y acuerdos terminados muestran
  su estado sin generar una alerta de renovación operativa.
- Mes a mes sin fin pactado no recibe una fecha de vencimiento inventada. Un contrato
  futuro se identifica por separado. Renovación automática pactada exige revisar la
  continuidad; la consulta no prorroga el acuerdo ni cambia estados guardados.
- El aviso utiliza las condiciones guardadas. Cambiar fechas en un formulario no cambia
  la revisión visible hasta guardar y recibir la respuesta autorizada del servidor.
- El detalle permite abrir `/clientes/[clientId]`, usando la ficha y contexto de tenant
  existentes. Cada tarjeta conserva el ID del acuerdo, aunque se repitan los nombres.
- Las lecturas no crean tareas ni eventos, no envían correo, no timbran ni registran
  pagos. La cartera sigue paginada; no presenta contadores globales de una página parcial.

## Evidencia y cobertura: siguiente rescate, con límites concretos

El importador existente está en `lib/import/threatdown-pdf.ts`, el borrador normalizado
en `lib/db/quote-input.ts` y la ruta autorizada en
`app/api/quotes/[quoteId]/import-threatdown/route.ts`. Antes de extenderlo:

1. Identificar la fuente con tenant y ID estable de quote/revisión; el número del
   fabricante o nombre del cliente no bastan para resolver identidad.
2. Conservar por separado vigencia de oferta, cobertura de licencia del fabricante,
   vigencia contractual y periodicidad de facturación. El aviso añadido usa únicamente
   la vigencia contractual. No acredita activación o suspensión técnica de licencias.
3. Guardar referencias y bytes originales con hash verificado; una cadena de texto de
   aceptación o un hash sin archivo recuperable no acredita conservación documental.
4. Validar tenant, cliente, moneda, programa, validez y revisión esperada al aplicar una
   evidencia. Un quote expirado requiere una revisión explícita y justificada; nunca
   se usa automáticamente para fijar precio ni se confunde con aceptación del cliente.
5. Registrar el vínculo y su evento de decisión en la misma transacción; reintentos
   deben recuperar el mismo resultado. No borrar duplicados: conservar procedencia.

Si después se incorporan registros reales del sistema anterior, resolver el cliente
por identidad confirmada dentro del tenant y preservar IDs, fechas, hashes y actor
original. Actor desconocido permanece desconocido. Las fechas finales antiguas no se
convierten a fin exclusivo sin confirmar su significado y conservar el valor original.
Importar primero en modo revisión; no activar, crear ventas, emitir facturas ni enviar
correos como efecto de importar.

## Validación y liberación

Pruebas de dominio cubren límites T-30/T-60, preaviso, vigencia cumplida, pausa,
renovación automática, mes a mes, fin exclusivo, zonas horarias, DST y año bisiesto.
La integración prueba que HTTP y repositorio devuelven la revisión sin agregar eventos
ni cambiar el estado. DOM y recorrido sintético comprueban el aviso guardado y el enlace
al cliente; se conserva la ruta de autorización y el flag de R1.

No hay dependencias nuevas, migración adicional ni cambios de configuración productiva.
La entrega depende de #114 y conserva sus condiciones de liberación: staging con el rol
real de PostgreSQL y carreras entre backends aún requieren validación. Esta entrega no
resuelve esa deuda ni habilita por sí misma servicios recurrentes en producción.
