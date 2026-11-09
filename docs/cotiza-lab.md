# Cotiza Lab: tenant fiscal de pruebas

Tenant `cotiza-lab` / `90dbf915-de98-4ebb-b88c-f27b6e8c645a`, creado por solicitud
de Salvador el 9 de noviembre de 2026. Se administra con su sesión existente de
superadmin mediante Cambiar empresa; no se mueve su cuenta ni se envían invitaciones.

Incluye perfil Mixta, política de margen de 10–35% y preaprobación alta de 55%,
perfil gráfico de emisor marcado PRUEBAS, tres receptores de ensayo (completo,
incompleto, extranjero) y tres plantillas PUE/PPD/venta directa. Las identidades
fiscales de ejemplo son exclusivamente para el PAC de QA. No son nuevos clientes
comerciales ni acreditan operaciones económicas. Mercado Libre permanece apagado.

## Separación de recursos

- El emisor principal conserva su destino y sus credenciales. Sólo la sesión cuyo
  tenant coincide exactamente con el laboratorio utiliza la conexión QA.
- Digestor del laboratorio: servicio Railway `digestor-cotiza-lab`, base Neon
  independiente `digestor_cotiza_lab`, rol `digestor_cotiza_lab_runtime` sin
  superusuario, creación de roles ni creación de bases. Se verificó que este rol
  no tiene SELECT sobre `neondb.public.clients`.
- La base QA nace vacía y aplica las migraciones revisadas hasta `20261107_02`.
  Conserva UUID, XML, cobros y actos históricos en PostgreSQL, incluso si el
  servicio duerme. El servicio queda fijado al commit revisado de Digestor.
- JWT, cuenta administrativa de arranque y cuenta operadora del conector son
  independientes. Los secretos quedan en los administradores de variables, nunca
  en este documento, el SQL de provisión, respuestas del navegador ni evidencia.
- PAC: host exacto `pruebas.timbracfdi33.mx`, API v2 por HTTPS. Sin token productivo,
  sin flags fiscales productivos, sin alta pública de usuarios y sin IA activada.
  La documentación del proveedor distingue expresamente los destinos y tokens:
  https://developers.timbracfdi33.mx/docs/pase-a-producci%C3%B3n

## Configuración de Cotiza

| Variable | Uso |
| --- | --- |
| `DIGESTOR_FISCAL_SANDBOX_ENABLED` | `true` habilita la conexión del laboratorio |
| `DIGESTOR_FISCAL_SANDBOX_TENANT_ID` | ID exacto del tenant; también muestra el aviso de laboratorio |
| `DIGESTOR_FISCAL_SANDBOX_BASE_URL` | Origen HTTPS del Digestor QA, distinto del principal |
| `DIGESTOR_FISCAL_SANDBOX_USERNAME` | Cuenta operadora QA |
| `DIGESTOR_FISCAL_SANDBOX_PASSWORD` | Secreto de la cuenta QA, sólo servidor |

Una configuración incompleta bloquea el laboratorio; nunca vuelve a las credenciales
principales. El login comprueba que el token pertenece al tenant QA. Antes de cada
petición autenticada, incluso con un token en caché, Cotiza consulta el estado del
proveedor con `probe=false`: exige entorno sandbox, host/ruta QA exactos y ausencia
de configuración productiva. No sigue redirecciones. Los tokens en caché se
separan por entorno, URL, usuario y tenant.

La cabecera del tenant muestra «Laboratorio fiscal · PAC de pruebas · Sin validez
fiscal». Un tenant de laboratorio no implementa por sí mismo una caja POS ni el
nuevo flujo de venta directa; esas funciones conservan su estado de desarrollo.

## Validación y límites

`digestor-sandbox.test.ts` verifica selección desde sesión, destinos independientes,
separación de tokens, ausencia de fallback, identidad del token, cambios de entorno
del proveedor, PDF/vista previa/CSF y rechazo de destinos engañosos. El workflow
`tenant-fiscal-sandbox.yml` ejecuta TypeScript, regresión y build sin proveedor real.

La preparación de recursos no declara completos USD, notas de crédito, cancelaciones
ni sustituciones. Los ensayos contra el PAC se registran por separado: un resultado
incierto se consulta por UUID y nunca se resuelve retransmitiendo el timbrado.

Para detener el laboratorio, deshabilitar únicamente
`DIGESTOR_FISCAL_SANDBOX_ENABLED` y desplegar esa configuración. No cambiar la
conexión principal ni borrar XML, pagos, perfiles o actos para revertir software.
