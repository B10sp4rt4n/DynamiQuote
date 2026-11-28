# Aceptación de servicios recurrentes

Estado: matriz del objetivo completo. No todos los escenarios están entregados en R1.
Los resultados comprobados y pendientes se detallan en [la entrega R1](../recurring-services-r1.md).
R0 validó únicamente la forma de los ejemplos y el plan.
El JSON Schema es un contrato de preparación, no un API desplegado ni una autorización.
Los archivos no contienen identificadores o condiciones de clientes reales.

## Puertas por entrega
| ID | Escenario | Resultado exigido | Entrega |
|---|---|---|---|
| A01 | Falta cliente o RFC dudoso | Borrador con pendientes; no fusionar por nombre/contacto | R1 |
| A02 | Contacto tiene otra marca/dominio | Conservar receptor fiscal y contacto por separado | R1 |
| A03 | Cliente también existe como tenant | Usar Client del tenant vendedor; no entrar al tenant comprador | R1 |
| A04 | Contrato anual, cobro mensual | 12 periodos y una contratación, sin 12 oportunidades ganadas | R1/R4 |
| A05 | Servicio mes a mes | Renovación y preaviso según condiciones explícitas | R1 |
| A06 | Fechas, precio o aceptación faltantes | No activar ni preparar factura | R1 |
| A07 | 31 enero -> febrero -> marzo | Último día febrero, luego 31 marzo; año bisiesto correcto | R1 |
| A08 | Trimestral/anual y cambio de año | Periodos semiabiertos sin solapamiento o deriva | R1 |
| A09 | Cambio de zona/UTC y DST | Calendario local conservado e instantes UTC válidos | R1 |
| A10 | Alta/baja parcial | Revisión explícita; ningún prorrateo automático | R1 |
| A11 | Pausa y reanudación | Sin borrar cartera ni facturas; omitidos visibles, sin cargo retroactivo automático | R1 |
| A12 | Editar precio después de preparar | Nueva versión futura; snapshot previo intacto | R1/R3 |
| A13 | Vigencia de cotización vs licencia vs cobro | Tres campos/fuentes, sin sustituciones | R1 |
| A14 | Dos preparaciones concurrentes | Un periodo; la revisión de términos no habilita otro duplicado | R1/R3 |
| A15 | Intervalos diferentes pero solapados | Rechazo transaccional por acuerdo | R1 |
| A16 | Repetir una importación XML | Mismo UUID/tenant: misma evidencia, cero timbrados | R2 |
| A17 | UUID de otro tenant/receptor incorrecto | No vincular ni revelar documento ajeno | R2 |
| A18 | Factura externa sin fecha de servicio | Mantener pendiente; timbrado no determina cobertura | R2 |
| A19 | CFDI cubre varios acuerdos | Bloquear reparto automático y exigir asignación explícita | R2 |
| A20 | Factura ya importada del periodo | No emitir otra; mantener PDF/XML y hash originales | R2/R3 |
| A21 | Timeout después de aceptación Digestor | unknown bloquea reemisión, consulta recupera el mismo UUID | R3 |
| A22 | Propuesta original timbrada | Periodo siguiente usa identidad distinta; no resetear invoice_* | R3 |
| A23 | Pago parcial y un pago a varias facturas | Aplicaciones precisas, sin sobreaplicación ni duplicados | R3/R4 |
| A24 | Comprobante o CFDI PUE sin conciliación | Evidencia recibida no implica cobro confirmado | R2/R4 |
| A25 | Saldo pagado con REP pendiente | Mostrar ambos estados sin cerrar obligación fiscal | R3 |
| A26 | Cancelación/sustitución | Cadena histórica, vínculo al periodo y original preservados | R3 |
| A27 | Cambio de tenant/rol/revisión durante acción | Revalidación en transacción y rechazo seguro | R1/R3 |
| A28 | RFC repetido dentro del tenant | Resolver candidato; no crear doble cliente silenciosamente | R1 |
| A29 | Datos históricos ya cerrados | No reclasificar ganadas ni editar hechos anteriores | R2/R4 |
| A30 | MRR, IVA, divisas y variables | Neto fijo normalizado por moneda; exclusiones explícitas, sin tipo de cambio implícito | R4 |
| A31 | Renovación comercial | Nueva oportunidad explícita cuando procede, sin reiniciar acuerdo histórico | R4 |
| A32 | Reintento exportación CIMA | Mismo evento/documento no duplica ingresos ni aplicaciones | R4 |
| A33 | Consulta de tablero/Recordia | Cero emisiones, correos, cargos o cambios de estado | R4 |
| A34 | Recordia sin nuevas fuentes instaladas | Declarar sin cobertura de estas entidades; no fingir preservación | R4 |
| A35 | Flag apagado / otro tenant | UI y API inaccesibles; controles server-side | R1 |
| A36 | Datos bancarios o condiciones sin evidencia | Pending, nunca completar por contexto de otro cliente | R2 |
| A37 | Revocar preparación aprobada | Bloquear emisión si cambió huella, actor o facultades | R3 |

## Validación antes de activar un acuerdo
El Schema comprueba estructura, nulls explícitos, decimales como cadenas y campos
obligatorios según estado. El runtime debe comprobar además:
- IDs existentes, mismo tenant y facultades reales del actor.
- Fechas válidas/ordenadas, límites contractuales e IANA real.
- IDs de línea únicos, cantidades >0 y precisión/rangos DECIMAL del motor integrado.
- Evidencia accesible y aprobación vinculada a la revisión y huella exactas.
- Cliente fiscal completo al preparar; clasificación SAT vigente por partida.
- Ausencia de periodos solapados, duplicidad UUID y conflictos concurrentes.

Un esquema válido no confirma aceptación, pago, licencia o cumplimiento fiscal.
Los ejemplos active son exclusivamente sintéticos y no pueden usarse como carga
productiva. Los cinco expedientes de intake siguen en draft.

## Contrato HTTP implementado en R1
- GET /api/recurring-services: 50 acuerdos por página, cursor before y búsqueda de clientes del tenant.
- GET /api/recurring-services?requestId={uuid}: recuperación idempotente de una alta incierta.
- GET /api/recurring-services/{id}: estado vigente y últimos 120 periodos.
- POST /api/recurring-services: unión estricta de acciones create, revise, activate,
  pause, resume, end y generate. Toda acción salvo create exige expectedRevision.
Todas las consultas y mutaciones revalidan el operador; las mutaciones exigen Origin
configurado y X-Tenant-Context. generate sólo registra planeación, nunca preparación fiscal.
R2/R3 agregarán importación y fiscalidad sin reutilizar ciegamente la ruta propuesta.
El JSON Schema R0 documenta el modelo objetivo, más amplio que el runtime R1 Zod.

## Verificación reproducible de esta preparación
Desde la raíz, con Python y jsonschema disponibles:
```sh
python - <<'PY'
import json
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
p = Path("docs/recurring-services")
schema = json.loads((p/"agreement.schema.json").read_text())
Draft202012Validator.check_schema(schema)
v = Draft202012Validator(schema, format_checker=FormatChecker())
for name in ["pilot-intake.example.json", "synthetic-agreements.example.json"]:
    v.validate(json.loads((p/name).read_text()))
    print(name, "válido")
PY
```
La verificación no usa base de datos, PAC, correo, bancos ni credenciales.

## Evidencia para liberar R1
SQL aplicado dos veces en PostgreSQL desechable, pruebas de aislamiento/concurrencia
y recorrido de alta/calendario en escritorio y móvil. Registrar resultados y límites.
Los escenarios R2-R4 permanecen pendientes aunque R0 sea válido. La activación con
datos reales exige revisión de las cinco fichas y autorización específica.
