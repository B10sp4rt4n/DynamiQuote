# Cobertura funcional de facturación Cotiza / Digestor

## Conclusión de revisión

Facturación **parcial**. Hay un flujo de propuesta ganada → prefactura →
timbrado de ingreso → persistencia de UUID/XML → PDF. Las protecciones contra
repetición e incertidumbre del PR #28/Digestor #2 no completan los escenarios
fiscales del negocio. La afirmación de Salvador de haber emitido una factura
real acredita un caso operativo; no se examinó aquí ese XML ni se atribuyen
moneda/método/impuestos a esa factura por inferencia.

Se revisaron Cotiza 694dedb523957945e6b3740d8f84e0305e3b2f58 y Digestor
38f064a706461a9fcbad541bd9e421e2f73545da. Ambos PR siguen draft. No se inspeccionó
el runtime productivo en esta revisión. Los modelos/esquemas comerciales y el
constructor XML de Digestor no cambian frente a su base main/9e251d76; los cambios
recientes se concentran en seguridad/conciliación y mantenimiento.

## Matriz de capacidades y brechas

"Implementado" significa camino de código, no aceptación fiscal/productiva.
"Ausente" se refiere al flujo integrado de Cotiza, no a lo que un PAC podría
hacer si un tercero le enviara XML distinto por la API genérica.

| Escenario | Estado observado | Brecha concreta | Prioridad propuesta |
| --- | --- | --- | --- |
| Ingreso nacional MXN/PUE/IVA 16 | Implementado básico | Validar perfiles fiscales/partidas y matriz completa, no solo timbrado exitoso | Base F0 |
| Claves SAT y unidades por producto/servicio | Backend permite atributos; Cotiza no los envía | Se usa 78101800/E48 sin selección fiscal de cada partida | F0 |
| Validación receptor, uso/régimen y pago | Parcial | La generación acepta cadenas inválidas; el servicio de validación existente no es una compuerta obligatoria del generador | F0 |
| Decimales de cantidad/precio | Defecto reproducido | Importe calculado con más precisión que cantidad/precio serializados; revisar cálculo y persistencia Float | F0 |
| USD u otra divisa | Parcial | Moneda llega al XML, pero no hay modelo/entrada/XML TipoCambio | F1 si se requiere |
| Cotización USD → factura MXN | Sin operación fiscal explícita | No hay elección independiente de moneda/FX de factura que preserve la propuesta original y concilie importes | F1 si se requiere |
| PPD inicial | Campo disponible, ciclo incompleto | Método/forma se eligen independientemente; PPD+03 llega al builder y se marca listo | F1 |
| Cobros diferidos/parciales + REP | Ausente | Sin entidad de aplicación de pago, parcialidad, saldo previo/insoluto ni CFDI P/Pagos 2.0 integrado | F1 |
| Cancelación | Ausente | Sin solicitud/motivo/acuse/aceptación/seguimiento de estado SAT desde Cotiza | F1 |
| Sustitución por error posterior al timbrado | Ausente | Sin CFDI relacionados, referencia al sustituto ni cadena cancelación/sustitución | F1 |
| XML descargable/entrega | Parcial | XML se conserva y GET autenticado devuelve Base64; pantalla timbrada ofrece solo PDF, sin descarga XML/paquete/envío fiscal integrado | F1 |
| Retenciones | Sin flujo de partidas facturables | El XML demo contiene ejemplo, pero el builder de prefacturas no modela/genera retenciones | Según operación |
| IVA 0, exento, no objeto y combinaciones | Parcial | Digestor acepta tasa/objeto, pero cero omite nodo de impuestos; no hay TipoFactor configurable; Cotiza impone tasa default 16 | Según operación; excluir de F0 mientras no se soporte |
| Receptor extranjero / global | Rama incompleta/riesgosa | XEXX se transforma a PUBLICO EN GENERAL con InformacionGlobal mensual y cambia nombre/régimen/uso | Según operación; sin declarar soporte |
| Nota de crédito / devoluciones | Ausente integrado | TipoDeComprobante está fijo en I; no hay egreso E ni relaciones/afectación a saldo | Según operación |
| Anticipo y aplicación posterior | Ausente integrado | Sin relaciones y ciclo de aplicación; no equivale a renombrar una partida ordinaria | Según operación |
| Facturar una propuesta en varias facturas | Ausente integrado | Propuesta almacena un solo draft/UUID/XML; no hay asignación de partidas/importes facturados/restantes | Según operación |
| Serie/folio y varias facturas simultáneas | Parcial | Backend acepta serie/folio, Cotiza no los configura y el default usa timestamp a segundos; falta política de consecutivos/control de duplicidad humana | F1 |
| Varias versiones ganadas de un trato | Riesgo a resolver | Reserva protege una propuesta/draft, no dos revisiones diferentes de la misma venta; definir política antes de permitir doble emisión | F0/F1 según uso |
| Estados inciertos/reintentos | Protección desarrollada y probada en candidatos | unknown no se libera automáticamente; consulta actual lee lo persistido, no consulta SAT/PAC ni resuelve todos los casos operativos | Conservar protección |

No se asigna un porcentaje global de completitud: las prioridades dependen de
las operaciones reales de SynAppsSys. Nómina, transporte u otros complementos
no se incluyen como requisitos del MVP por el simple hecho de existir.

## Hallazgos reproducidos sin PAC ni base

Evidencia JSON: `docs/evidence/billing-scenario-observations.json`.
Script de caracterización: `scripts/probe_billing_scenarios.py`. Genera objetos
sintéticos en memoria y llama al constructor real; bloquea socket.connect,
SQLAlchemy Engine.connect, requests y la llamada al PAC. Usa checkout fijado,
limpia variables y cwd, no importa app.main ni ejecuta su lifespan.

Se ejecutaron **9 escenarios de caracterización**, no nueve certificaciones
fiscales ni nuevas pruebas de aceptación aprobadas:

1. MXN/PUE/16%: subtotal 100, IVA 16, total 116; código de partida default 78101800.
2. PPD con forma 03: `_missing_fields` no lo detiene y XML conserva ambos valores.
3. USD: XML Moneda=USD sin TipoCambio; también queda listo según validación local.
4. IVA 0 con ObjetoImp=02: impuesto cero y sin nodo de impuesto del concepto.
5. No objeto: backend admite ObjetoImp=01 y no calcula impuesto; Cotiza no ofrece
   ese dato en su flujo de generación. No equivale a demostrar exento/0% completos.
6. XEXX: el nombre ficticio extranjero se reemplaza con PUBLICO EN GENERAL;
   aparecen régimen 616, uso S01 y nodo global mensual.
7. Cantidad 1.234 × precio 100: el subtotal/Importe es 123.40, pero el XML imprime
   Cantidad=1.23 y ValorUnitario=100.00: producto 123.00, diferencia 0.40.
8. Cantidad 100 × precio 1.234: mismo desacuerdo 123.40 vs 123.00 por precio
   serializado a dos decimales. No se envió ese XML al PAC para provocar rechazo.
9. Clave explícita 80101500 en backend: el XML sí la conserva; el obstáculo está
   también en el adaptador Cotiza, que no envía esos campos.

El schema de creación de Digestor descarta silenciosamente `exchange_rate`,
`cfdi_type`, `related_uuid` y `discount` enviados como extras. Que el request
no falle no significa que los campos hayan sido aplicados.

También se ejecutó el validador TypeScript real de Cotiza: acepta PPD+03 y,
sin acudir a catálogos ni al servicio receptor, acepta cadenas ficticias como
RFC=BAD, CP=X, régimen=BAD, uso=BAD, forma=ZZ. Es prueba de que no valida esas
reglas en generación; no afirma que el PAC certifique esas cadenas.

Reproducción con el venv fiscal existente de Digestor:

```bash
/ruta/venv/bin/python scripts/probe_billing_scenarios.py --digestor-root /ruta/checkout-digestor-38f064a > /tmp/billing-observations.json
```

## Evidencia de código fijada

- [Cotiza → prefactura](https://github.com/B10sp4rt4n/DynamiQuote/blob/694dedb523957945e6b3740d8f84e0305e3b2f58/cotiza-web/app/api/proposals/%5BproposalId%5D/invoice/route.ts):
  exige propuesta won; transporta moneda y descripción/cantidad/precio de partidas.
- [Adaptador](https://github.com/B10sp4rt4n/DynamiQuote/blob/694dedb523957945e6b3740d8f84e0305e3b2f58/cotiza-web/lib/integrations/digestor-fiscal.ts):
  createBillingDraft envía tax_rate default .16; no sat_product_code, unit_code,
  tax_object, product_id, FX, relaciones o descuentos fiscales.
- [Validador](https://github.com/B10sp4rt4n/DynamiQuote/blob/694dedb523957945e6b3740d8f84e0305e3b2f58/cotiza-web/lib/validations/proposal-invoice.ts):
  chequeos de texto/longitud y enum PUE/PPD, sin regla conjunta método/forma.
- [Pantalla](https://github.com/B10sp4rt4n/DynamiQuote/blob/694dedb523957945e6b3740d8f84e0305e3b2f58/cotiza-web/components/propuestas/proposal-invoice-panel.tsx):
  selectores independientes, default PUE/03; timbrada muestra PDF.
- [Modelo factura por propuesta](https://github.com/B10sp4rt4n/DynamiQuote/blob/694dedb523957945e6b3740d8f84e0305e3b2f58/cotiza-web/lib/db/proposal-invoices.ts):
  un draft y conjunto de evidencia por propuesta; estados sin cancelación.
- [Modelos de Digestor](https://github.com/B10sp4rt4n/digestor__fiscal/blob/38f064a706461a9fcbad541bd9e421e2f73545da/app/models/commercial.py):
  Float, moneda/método/forma/serie/folio, sin entidades de pagos o relaciones CFDI.
- [Schema API](https://github.com/B10sp4rt4n/digestor__fiscal/blob/38f064a706461a9fcbad541bd9e421e2f73545da/app/schemas/commercial.py):
  campos de catálogo/objeto/tasa disponibles en backend, sin FX/relaciones/retenciones.
- [Builder](https://github.com/B10sp4rt4n/digestor__fiscal/blob/38f064a706461a9fcbad541bd9e421e2f73545da/app/api/routers/commercial_v1.py):
  _resolve_item_payload, _set_line_totals, _missing_fields y _build_cfdi_xml;
  TipoDeComprobante=I y Exportacion=01 fijos. Ruta genérica de timbrado no agrega
  los flujos de negocio que el builder y Cotiza no implementan.

## Referencias fiscales oficiales consultadas y alcance

- [SAT — complemento de pagos](https://wwwmat.sat.gob.mx/consultas/92764/comprobante-de-recepcion-de-pagos):
  explica la recepción diferida/parcial, versión 2.0 y datos como parcialidad,
  saldo anterior/insoluto e impuestos. Esto confirma que un selector PPD no
  completa el ciclo. No se extrapolan plazos de material histórico de CFDI 3.3.
- [SAT — proceso de cancelación](https://www.sat.gob.mx/minisitio/Factura/cancela_procesocancelacion.htm):
  solicitud, motivos, relación con sustituto y aceptación cuando corresponda.
  No equivale a cambiar localmente una etiqueta de estado.
- [SAT — Anexo 20, XSD 4.0](https://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd):
  referencia técnica a contrastar al implementar validación completa. El visor
  web rechazó su content-type; esta revisión no acredita validación XSD de
  los XML generados ni una revisión legal exhaustiva de reglas vigentes.

## Orden recomendado para cerrar operación

**F0 — Delimitar y asegurar el escenario actualmente emitido.** Perfil fiscal
explícito por partida, claves/unidades, impuestos y validación previa; aritmética
decimal y consistencia exacta XML/totales. Casos no soportados deben bloquearse
en servidor con explicación en vez de aparecer como listos. Evitar cambiar
automáticamente moneda o impuesto de propuestas/facturas existentes.

**F1 — Completar el ciclo cotidiano que se requiera.** Definir moneda de factura
y FX sin alterar el documento comercial original; PPD con cobros/saldos/REP;
cancelación y sustitución con evidencia; descarga XML/PDF y consecutivos. Separar
cobro parcial de factura emitida por etapas: son casos diferentes.

**F2 — Extensiones según la operación real.** Crédito/devoluciones, anticipo y
su aplicación, retenciones/perfiles adicionales, múltiples facturas por propuesta,
receptores extranjeros/global. Cada caso necesita evidencia, aceptación y pruebas
antes de declararse soportado, no solo agregar un campo o un botón.

Las tareas de recuperación productiva, destinos/escritores y corte del CRM
siguen vigentes en paralelo. Esta revisión no altera facturas, no hace consultas
reales al PAC/SAT sobre contribuyentes, no envía correos ni habilita escenarios.
