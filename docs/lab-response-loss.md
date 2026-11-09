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
No acredita reintentos de REP, clics reales de navegador, autenticación productiva,
sellos criptográficos ni comportamiento de un PAC productivo.

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
