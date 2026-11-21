# Servicios recurrentes en Cotiza
Estado: diseño y contratos de preparación v0.1. No es una capacidad activa.
Fecha: 16 de noviembre de 2026. Piloto propuesto: tenant SynAppsSys (slug sys).
Base revisada: main, commit 0c1a58c2e312b5ec3d5ea067348711fc398072aa.

## Resultado que se busca
Registrar una vez lo contratado con un cliente y preparar sus periodos de facturación.
La oportunidad sirve para contratar, ampliar o renovar; un periodo mensual no es una
nueva venta ganada. Un contrato anual pagadero mensualmente y un servicio mes a mes
tienen calendarios y compromisos diferentes.

Primera entrega funcional propuesta: alta revisada de cliente y acuerdo, calendario
de periodos, pendientes, preparación explícita e importación referencial de facturas
existentes. La preparación nunca timbra, cobra ni envía correo por sí sola.

## Evidencia de arquitectura y decisión de integración
Se revisaron en main:
- cotiza-web/prisma/schema.prisma: Client, opportunities, proposals,
  proposal_integrated_node, client_contacts y tasks.
- cotiza-web/lib/db/clients.ts: altas/ediciones por tenant.
- cotiza-web/lib/db/proposal-invoices.ts: una referencia fiscal actual en la propuesta.
- cotiza-web/app/api/proposals/[proposalId]/invoice/route.ts: preparación y recuperación,
  protección de UUID previo, sesión y capacidad fiscal.
- cotiza-web/lib/integrations/proposal-payments.ts: pagos y operaciones fiscales
  asociados al documento y protegidos por tenant, rol y capacidades.
- docs/won-consolidation.md: aceptación y consolidación previas a nuevas facturas.
- docs/recordia-mcp-premium-pilot.md: preservación por fuentes explícitas; no incluye
  aún las nuevas tablas de acuerdos y periodos.

La rama predeterminada es feat/cotiza-nextjs-foundation, anterior a main. Esta entrega
se propone sobre main. El PR #112 de autorización verificable sigue separado.
La revisión de estas rutas no acredita configuración ni despliegue de producción.

DECISIÓN: añadir identidad propia de acuerdo y periodo. No reciclar cada mes los
campos invoice_* de una propuesta existente ni reiniciar su estado para emitir otra.
La integración fiscal necesita un adaptador de sujeto facturable:
proposal existente o recurring_period nuevo, con identidades distintas. Reutilizar
validaciones y cliente Digestor; conservar las rutas actuales de propuestas.

No fabricar oportunidades ni cierres históricos para dar de alta un servicio vigente.
El alta de legado requiere evidencia y aprobación administrativa explícitas. No se
modifican cierres consolidados. Este alta no dispara compras ni avisos de ganada.

## Experiencia del usuario
Menú propuesto: Servicios recurrentes, al lado del flujo comercial existente.
1. Buscar cliente dentro de la empresa actual; resolver identidad antes de crear.
2. Registrar servicio, responsable, evidencia de contratación y condiciones.
3. Ver calendario y pendientes; completar faltantes antes de activar.
4. Preparar el periodo explícitamente, revisar partidas, impuestos y destinatario.
5. Vincular una factura existente o autorizar una nueva por el flujo fiscal.
6. Registrar comprobantes y conciliar aplicaciones; revisar renovación por separado.

Vistas:
- Cartera: cliente, servicio, vigencia, frecuencia, próximo periodo, moneda, pendientes.
- Acuerdo: condiciones versionadas, documentos, autorizaciones y periodos.
- Periodo: lo esperado, borrador, factura, pagos aplicados, REP y evidencia.
- Pendientes: datos faltantes, preparación, vencimiento comercial, cobranza y renovación.
No mostrar un único semáforo que confunda servicio vigente con factura pagada.

## Modelo propuesto
Nombres de tablas y endpoints son de diseño; no se ha entregado SQL ejecutable.

| Entidad | Función e invariantes |
|---|---|
| recurring_agreements | Cliente real del tenant, modalidad contractual, responsable y estado. Folio único por tenant. |
| recurring_agreement_versions | Condiciones y partidas inmutables, revisión, fecha efectiva, autor y evidencia. |
| recurring_periods | Intervalo canónico semiabierto [inicio, fin), versión aplicada y fecha de preparación. |
| recurring_invoice_links | Relación periodo-documento, origen importado/emitido y cadena de sustituciones. |
| recurring_evidence | Referencias a documentos, Gmail u otras fuentes autorizadas; hash de bytes cuando estén disponibles. |
| recurring_events | Actos y transiciones append-only con actor, UTC, correlación y versión esperada. |

Reutilizar clients y client_contacts: una persona de contacto no sustituye la razón
social del receptor. Coincidencia de nombre o dominio de correo no basta para unir
clientes. Detectar RFC repetido dentro del tenant y presentar candidatos, sin fusionar
automáticamente. Una empresa como cliente de SynAppsSys no se confunde con esa misma
empresa en su propio tenant.

Todos los vínculos usan tenant_id y validan pertenencia en servidor y transacción.
FK compuestas o trigger equivalente deben cubrir incluso tablas antiguas sin clave
compuesta; índices por tenant no sustituyen esa validación. Cliente, acuerdo y periodo
no pueden cambiar de tenant. Un superadmin no evita las reglas del tenant actual.

## Calendarios y versiones
- Vigencia contractual: inicio, fin, renovación automática si fue pactada y preaviso.
- Frecuencia de cobro: mensual, trimestral o anual, por adelantado o vencido.
- Cobertura de licencias del fabricante: atributo separado con su propia evidencia.
- Vigencia de cotización: atributo comercial; no sustituye ninguna de las anteriores.
- Fecha de pago esperada: condición de cobranza; no acredita un depósito.

Fechas de periodos en calendario local; instantes y auditoría UTC; zona IANA por acuerdo,
predeterminada America/Mexico_City para el piloto y comprobada en ejecución.
Ancla día 31: ajustar al último día del mes y volver al ancla original en el siguiente,
sin deriva 31 enero -> 28 febrero -> 31 marzo. Cubrir bisiestos y cambios de año.
Intervalos contiguos sin huecos ni solapamientos. Preparar no exige que el periodo haya
terminado cuando el cobro pactado es por adelantado.

El MVP factura sólo periodos completos. Altas/bajas a mitad de periodo, prorrateos,
cambios retroactivos y consumos variables quedan en revisión explícita. No se inventa
un importe proporcional. Pausar detiene preparación futura; no borra deudas ni facturas.
Reanudar conserva calendario y enumera periodos omitidos; no genera cargos retroactivos
automáticos. Terminar impide periodos fuera de vigencia y mantiene historial.

Cambios de precio/cantidad rigen desde un límite de periodo y crean nueva versión.
Un periodo preparado conserva snapshot y huella. Cambiar condiciones, partida fiscal,
cliente, moneda o fecha requiere revalidación; no altera documentos ya emitidos.
Una edición tardía no modifica un contrato cerrado ni aplica precio nuevo al pasado.

## Estados independientes y reglas de operación
Acuerdo: draft -> active -> paused / ended. Reanudar requiere aprobación y revisión.
Periodo comercial: planned -> ready -> prepared -> closed; blocked es un diagnóstico.
Documento fiscal: none / draft / processing / unknown / stamped / rejected / cancelled.
Cobranza: no_document / pending / partial / reconciled; comprobante recibido es evidencia,
no saldo cero. Obligación REP: not_applicable / pending / issued / cancelled.

No derivar pago del campo PUE ni de un correo de agradecimiento. No derivar activación
de licencia de una factura. El saldo utiliza únicamente aplicaciones confirmadas y
reversiones; una aplicación múltiple tiene importe por factura y control de sobrepago.
PPD/REP, cancelaciones y sustituciones se delegan al flujo fiscal existente extendido,
no se implementan de nuevo en el planificador.

Clave estable de generación: tenant + agreement_id + coverage_start + coverage_end.
La revisión de condiciones NO forma parte de esa clave: cambiarla no habilita duplicado.
Reserva y snapshot atómicos, unique en esa clave y CAS sobre revisión. Excluir periodos
solapados por acuerdo aunque tengan intervalos diferentes. Dos peticiones simultáneas
obtienen el mismo periodo o conflicto recuperable, nunca dos documentos.
Si la emisión resulta incierta: bloquear nueva emisión, consultar y recuperar por
identidad estable; no emitir otra factura para resolver un timeout.

Para MVP: un documento primario por periodo. Una sustitución agrega enlace a la misma
cadena y conserva el cancelado. Factura que cubre varios acuerdos/periodos se importa
como evidencia sin reparto automático y queda bloqueada hasta tener asignación revisada.
No repartir un total global por partes iguales ni deducirlo del nombre de la factura.

## Importación histórica sin doble emisión
1. Cargar XML original y PDF opcional; identificar emisor, receptor, UUID y moneda.
2. Validar que el emisor corresponde al tenant y resolver el cliente dentro del tenant.
3. Proponer correspondencia de servicio/periodo con evidencia; no inferir fecha de
   servicio desde fecha de timbrado. Confirmación humana si falta intervalo.
4. Conservar bytes originales y hashes; deduplicar por tenant + UUID normalizado.
5. Vincular el documento ya emitido y bloquear el botón de nueva emisión del periodo.
6. El comprobante puede vincularse, pero conciliación y estado SAT son verificaciones
   independientes. Mostrar su fecha/fuente; no anunciar SAT vigente sin consulta.

No llamar al PAC al importar ni reescribir XML/PDF anteriores. UUID de otro tenant,
receptor distinto, dos CFDI primarios o documento sin periodo inequívoco bloquean el
vínculo automático. Permitir registrar evidencia pendiente sin activar el servicio.

## Permisos y piloto
Capacidad propuesta recurring_services_pilot apagada por defecto, sólo para SynAppsSys.
Tenant y rol salen de sesión Clerk revalidada; Origin y revisión esperada en mutaciones.
Roles concretos se asignarán al habilitar: lector, capturista, aprobador y operador
fiscal, reutilizando las facultades vigentes y sin atribuirlas automáticamente al owner.
Capturar no activa contrato, preparar no timbra, aceptar servicio no autoriza correos.
No hay cobro automático, suspensión técnica de licencias ni cambio de contratos externos.

Recordia: emitir actos de alta, activación, cambios, preparación, importación y vínculo
de pago. Se requiere ampliar sus fuentes/triggers y verificar aislamiento antes de
afirmar que esta historia se preserva. Reutilizar la auditoría transaccional mínima
sin convertir una lectura en escritura. El diseño no activa #112 ni otorga facultades
WebAuthn adicionales. HotVault no se anuncia integrado.

Los ejemplos del repositorio son sintéticos/anonimizados. La relación de las cinco
cuentas reales permanece en la conversación privada; no publicar RFC, correos, precios,
comprobantes ni contratos. Sus importes, días de cobro y vigencias faltantes siguen null.
Cliente inexistente en Cotiza: pendiente de alta, no tenant nuevo.

## KPI y conexión con CIMA
Presentar por moneda sin sumar MXN con USD ni inferir tipo de cambio.
- Compromiso contratado, proyección de periodos, facturado y cobrado: medidas separadas.
- Una oportunidad ganada se cuenta una vez; cada mensualidad no incrementa cierres.
- MRR normalizado sólo de cuotas fijas activas con condiciones completas: mensual,
  trimestral /3 o anual /12, por moneda, sin IVA; no es ingreso contable devengado.
- Contrato anual con cobro mensual se cuenta por cuota mensual UNA vez. No sumar además
  el total anual normalizado. Variable, parcial, pausado o sin datos: fuera del MRR fijo,
  visible como exclusión. ARR = MRR*12 es run-rate, no compromiso anual garantizado.
- CIMA consumirá eventos/documentos con origen, tenant, versión e identidad estable.
  Exportación idempotente primero; no afirmar cobro hasta conciliación confirmada.

Totales y margen se obtienen de los nodos integrados del proyecto. El planificador no
agrega su propia calculadora de impuestos, descuentos, margen o conversión monetaria.

## Entregas y dependencias
| Orden | Entrega | Criterio de salida |
|---|---|---|
| R0 preparada aquí | Plan, contratos de datos, expedientes pendientes anonimizados y matriz | JSON válido, ejemplos conformes y base de integración identificada. |
| R1 | Alta de acuerdo/versiones + calendario visible y tareas internas | Piloto aislado, faltantes bloquean activación, migración probada en PostgreSQL desechable, sin emisión. |
| R2 | Importación de CFDI y vínculo por periodo | Dedupe UUID, originales conservados y reconstrucción de los cinco casos revisada. |
| R3 | Preparación fiscal por periodo | Adaptador separado, nodos integrados, aprobación vigente y recuperación sin duplicados. |
| R4 | Tablero + exportación CIMA/Recordia | Estados independientes, MRR por moneda y lectura autorizada trazable. |
| R5 opcional | Preparación periódica asistida | Usa infraestructura existente, mismo núcleo idempotente, sólo borradores; sin autoenvío/timbrado. |

R1 y R2 requieren resolver catálogo real del piloto; R3 depende de ambos y de la
consolidación del acuerdo. No exigir una oportunidad artificial a un contrato legado.
Cada entrega es un PR independiente; no modificar ramas paralelas.
Preparación manual primero: no requiere IA, servicios nuevos ni scheduler contratado.

## Implementación del primer pendiente
R1 comienza por migración ADITIVA y validación de dominio. Proponer nuevo namespace
cotiza-web/lib/domain/recurring-services.ts y repositorio
cotiza-web/lib/db/recurring-services.ts, con UI /servicios-recurrentes y API
/api/recurring-services, todas aún inexistentes en esta entrega.
No usar prisma db push en producción. Probar SQL dos veces, FKs/solapamientos,
transacciones y RLS donde aplique al rol real; verificar rutas además de SQL.
Orden de liberación: migración en copia -> tests -> aprobación -> migración objetivo
-> despliegue -> flag por tenant -> recorrido revisado. Revertir UI/flag preserva
acuerdos, eventos, facturas y pagos; no rollback destructivo de historia.

## Documentos de preparación
- [Contrato de datos](recurring-services/agreement.schema.json)
- [Cinco expedientes anonimizados](recurring-services/pilot-intake.example.json)
- [Ejemplos sintéticos completos](recurring-services/synthetic-agreements.example.json)
- [Criterios de aceptación](recurring-services/acceptance.md)

Ninguno de estos archivos habilita rutas, crea clientes ni modifica bases o contratos.
