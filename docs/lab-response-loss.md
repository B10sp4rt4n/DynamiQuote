# Respuesta perdida entre Digestor y Cotiza

Ensayo optativo: rutas reales de Cotiza, SQL local desechable y el servicio
independiente de Cotiza Lab conectado al PAC sandbox. No modifica el código ni
la base comercial publicada. La identidad local tiene la forma del contexto
Clerk; no acredita una sesión Clerk real ni el recorrido del navegador publicado.

El arnés ejecuta una sola emisión remota por factura. Después de recibir la
aceptación y conservar su XML como evidencia, descarta deliberadamente la respuesta.
Dos solicitudes simultáneas a la ruta de Cotiza deben devolver 502 y 409; un
reintento posterior debe devolver 409 sin otra llamada de emisión.

La primera consulta de recuperación se interrumpe localmente antes de salir.
Cotiza debe conservar `stamping`. La segunda consulta lee `stamp-result` del
Digestor de pruebas y guarda el mismo UUID y XML. Lecturas posteriores, XML/PDF,
recuperación repetida y rechazo de un UUID diferente completan el ensayo.

Este corte ocurre después de que Digestor guardó el timbrado. No simula pérdida
entre PAC y Digestor ni requiere `ObtieneCFDI` del PAC. Para ese otro límite
existe el ensayo público separado en `digestor__fiscal/scripts/run_public_invoice_recovery.py`.
El escenario de factura no acredita clics reales de navegador, autenticación
productiva, sellos criptográficos ni comportamiento de un PAC productivo.
La variante de REP se describe al final.

## Ejecución autorizada

La suite corriente omite este caso. Para ejecutarlo se requieren el argumento
`--execute-lab-sandbox`, un archivo privado de credenciales de operador del tenant
Cotiza Lab, una carpeta nueva de evidencia y el módulo local esbuild.
No registrar ni publicar el archivo de credenciales. No pasar secretos por argumentos.

```sh
COTIZA_LAB_RECOVERY_AUTO=true \
COTIZA_LAB_CREDENTIALS_FILE=/ruta/privada/credenciales-lab.json \
COTIZA_LAB_RECOVERY_EVIDENCE=/ruta/nueva/evidencia \
ESBUILD_MODULE=/ruta/instalada/esbuild/lib/main.js \
node scripts/run_lab_response_loss.mjs --execute-lab-sandbox
```

PGlite y su servidor socket deben estar instalados localmente para el arnés.
La base se crea a partir de Prisma y agrega exclusivamente en esa base la columna
operativa `proposal_approvals.executed_by_user_id`, documentada en `prisma/manual/README.md`.
Las credenciales principales de Digestor se vacían en el proceso de pruebas.
El cliente existente verifica tenant y estado del PAC antes de cada operación.
El arnés bloquea cualquier destino distinto del Digestor Lab y una segunda
emisión remota. No cambia habilitadores ni credenciales de servicios publicados.

El modo sin `COTIZA_LAB_RECOVERY_AUTO=true` expone un panel local para revisión,
solo si el navegador puede alcanzar el loopback de ese proceso. El modo HTTP
automático evita depender de ese acceso y registra explícitamente `browser_tested:false`.

Si un ensayo se detiene después de una aceptación, no repetir la emisión.
`COTIZA_LAB_RECOVERY_RESUME` permite conservar el identificador y XML del
checkpoint verificado y reconstruir únicamente el registro local pendiente.
Se exige la misma factura y tenant, estatus remoto `stamped` y conteo original 1.
Esta recuperación de checkpoint se identifica como `resumed:true`; no sustituye
una ejecución limpia desde el inicio.

## Resultado del 9 de noviembre de 2026

- Ejecución limpia: borrador `2ebe82f5-98a9-407a-bd79-a03061fb5aee`, UUID
  `df13fa5a-a01d-4ea5-b0d1-24aa0b05cd28`, 116.00 MXN, una emisión remota.
- Factura del primer ensayo conservada y recuperada: borrador
  `30d6ab84-0a61-472f-959d-f9378b8abd62`, UUID
  `12092fe1-d121-4970-9216-760d2986aa67`, una emisión remota. El primer arnés
  esperaba erróneamente un UUID directo en la respuesta y omitía la columna local;
  se corrigió el arnés y se retomó esa misma factura sin reemitir.
- Ambas verificaciones HTTP/SQL aprobaron. El navegador compartido no alcanzó
  el servidor local; no se acredita recuperación desde la interfaz publicada.
- `recuperado.xml` coincide byte por byte con `aceptacion-remota.xml`.
  El PDF proviene de la ruta real de Cotiza y conserva ese UUID.

## REP: respuesta perdida y pago conservado

El mismo ejecutor admite `COTIZA_LAB_RECOVERY_CASE=rep`. Esta variante ejecuta
automáticamente las rutas HTTP reales de pagos y complementos, con el mismo
aislamiento y opt-in. Crea una factura PPD/99 de 116.00 MXN y un pago sintético
por el total; repetir la declaración con la misma clave devuelve el mismo pago.
Se usa la misma orden anterior agregando `COTIZA_LAB_RECOVERY_CASE=rep` y una
carpeta nueva de evidencia; no requiere interacción de navegador.

Dos solicitudes concurrentes de REP llegan al Digestor: una se acepta y la otra
se bloquea con 409. Se descarta deliberadamente la respuesta aceptada antes de
que Cotiza la reciba. El reintento posterior también queda bloqueado en Digestor.
La primera lectura se interrumpe localmente y la siguiente recupera el mismo
UUID y XML. Reconciliar repetidamente no vuelve a emitir; un UUID ajeno se rechaza.
El saldo se conserva en 0.00 y existe un solo pago. El XML/PDF se descargan por
las rutas reales de Cotiza; el XML coincide con la huella SHA-256 capturada en
la aceptación y conserva parcialidad 1, pago 116.00 y saldo insoluto 0.00.

Resultado del 9 de noviembre de 2026: borrador QA
`5e1fdd46-70a9-4b33-a4db-32167a846f44`, pago
`e7da8a57-362b-4cd9-af28-37986b1fd7a2`, REP
`e96b4a33-13f0-473f-970b-3a92389d6e31`. Una aceptación de REP; tres solicitudes
HTTP de emisión en total (dos concurrentes y un reintento), dos bloqueadas.
La factura original se emitió una sola vez para preparar este caso.

Observación: `paymentFailure` convierte el 409 de Digestor en 502 hacia el
consumidor de Cotiza. El mensaje conserva la instrucción de no repetir y el
control evita la segunda emisión, pero el estado HTTP puede precisarse.
El ensayo no modifica ese comportamiento productivo.
El ajuste de estado HTTP se prepara por separado en el PR #81. El arnés de
recuperación admite el 409 corregido y el 502 histórico para rechazos recibidos,
exige 502 para la respuesta deliberadamente perdida y siempre comprueba el 409
real de Digestor. Los códigos citados arriba describen la ejecución capturada;
la corrección tiene sus propias pruebas estrictas de transporte y respuesta.

Este caso tampoco simula pérdida entre PAC y Digestor: el resultado del REP ya
está persistido en Digestor cuando se interrumpe su respuesta a Cotiza. Se valida
por separado con un test sintético el estado `unknown` y su bloqueo de reemisión.

El primer ensayo REP, borrador `8a4c0c16-05dc-47b6-9cab-f32654ccefbf`,
interrumpió la respuesta por un error del arnés: usaba el lector de facturas I
para un XML P. Se corrigió la validación y se agregó una aserción que exige
llegar al corte deliberado. El resultado citado arriba corresponde a la
repetición limpia corregida; ambos XML de aceptación y recuperación existen
y coinciden byte por byte. El primer caso no se reemitió ni se borró.
