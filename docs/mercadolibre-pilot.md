# Conector Mercado Libre México: bandeja de ventas

## Resultado y alcance

Superadmin habilita el canal opcional para una empresa desde Configuración →
Operación y canales. Un owner o administrador de esa empresa conecta su cuenta
mediante OAuth con PKCE y consulta/importa sus ventas desde esa pestaña. Cada
consulta lee hasta 50 órdenes; puede continuar la paginación y volver a consultar
las recientes. La interfaz diferencia órdenes pagadas, pendientes y canceladas,
muestra productos/importes y conserva la última consulta. Es consulta manual;
no promete actualización automática ni sincronización histórica completa.

La bandeja conserva el origen Mercado Libre. No crea clientes, oportunidades,
cotizaciones ni propuestas; no incrementa los KPI. No emite, cancela, registra
pagos ni entrega comprobantes. La siguiente fase resolverá las ventas externas
como origen fiscal sin inventar una propuesta comercial previa.

## Configuración y publicación

1. Registrar una aplicación en la cuenta propietaria de la solución; configurar
   OAuth, PKCE S256, renovación de tokens y permisos de lectura necesarios para
   `/users/me` y `/orders/search` según los permisos actuales de Mercado Libre.
2. Revisar y aplicar explícitamente
   `cotiza-web/prisma/manual/20261109_mercadolibre.sql` y
   `cotiza-web/prisma/manual/20261109_tenant_operation.sql` antes de publicar.
   Las capacidades requieren la tabla de `20261022_tenant_capabilities.sql`, ya
   usada por Cotiza. La nueva migración no habilita canales para ninguna empresa.
   El cambio es aditivo e idempotente; no se aplica en el build ni desde el Site.
   Esta extensión se consume mediante SQL parametrizado; sus tablas se administran
   con el archivo manual, sin regenerar el cliente Prisma. No usar `db push` para
   administrar esta extensión.
3. Configurar en el entorno correspondiente, mediante el administrador de secretos:

   | Variable | Contenido |
   | --- | --- |
   | `MERCADOLIBRE_ENABLED` | `true` para poner en servicio el conector; ausente/apagado por defecto. No concede acceso a ninguna empresa |
   | `MERCADOLIBRE_CLIENT_ID` | ID de la aplicación |
   | `MERCADOLIBRE_CLIENT_SECRET` | Secreto de la aplicación, sólo servidor |
   | `MERCADOLIBRE_REDIRECT_URI` | URL HTTPS exacta de `/api/integrations/mercadolibre/callback` en Cotiza |
   | `MERCADOLIBRE_TOKEN_KEY` | Clave aleatoria de 32 bytes expresada en 64 caracteres hexadecimales |

   No introducir credenciales en chat, navegador, archivos de prueba o repositorio.
   La clave debe conservarse en el gestor de secretos. Cambiarla sin una migración
   de cifrado obliga a reconectar las cuentas existentes.
4. Publicar el código, verificar acceso sin habilitación y después habilitar sólo
   la empresa piloto desde Configuración → Operación y canales (superadmin).
   La capacidad `mercadolibre_channel` ausente o apagada bloquea página/API incluso
   para superadmin. La variable anterior `MERCADOLIBRE_TENANT_IDS` deja de conceder
   acceso: no hay habilitación automática ni migración de su lista.
   Un usuario Clerk activo con rol owner/admin de esa empresa,
   o superadmin confirmado en `app_users`, autoriza la cuenta. Bootstrap no opera.
5. La conexión comprueba `site_id=MLM`, identidad del vendedor y cuenta ya vinculada.
   Una cuenta pertenece a una empresa; una empresa conserva una cuenta. El cambio
   de vendedor se rechaza incluso tras desconectar para conservar la procedencia.
   Para revocar el permiso remoto, el propietario usa Mercado Libre; desconectar
   en Cotiza elimina las credenciales locales y conserva ventas/historial.

No se han configurado credenciales, aplicado tablas ni conectado cuentas reales
como parte del desarrollo de este PR. La autorización real depende del propietario.

## Identidad, persistencia y recuperación

- El servidor resuelve empresa/actor y verifica el rol activo en base de datos.
  Las mutaciones exigen el origen HTTPS configurado. No se aceptan IDs de cuenta
  o empresa enviados por el cliente.
- Estado OAuth aleatorio con hash persistido, caducidad de 10 minutos, uso único,
  actor/empresa y cookie Secure/HttpOnly/SameSite=Lax. El verificador PKCE está
  cifrado y ligado a ese intento. Desconectar invalida incluso callbacks en vuelo.
- Tokens cifrados con AES-256-GCM y contexto de empresa/vendedor. No se retornan a
  la interfaz, ni se copian cuerpos de errores del proveedor en respuestas/logs.
- Renovación serializada mediante bloqueo PostgreSQL por empresa y confirmada en
  una transacción separada antes de importar. Un fallo posterior no restaura el
  refresh token consumido. Si la renovación queda incierta, exige reconexión;
  nunca reintenta automáticamente un refresh de un solo uso.
- Clave de venta: `(tenant_id, seller_id, order_id)`. El pack se conserva como
  relación de compra; no se confunden órdenes distintas del mismo pack. Las
  observaciones modificadas agregan revisiones; una consulta repetida sin cambios
  sólo actualiza la fecha de comprobación. Una página inválida revierte completa.
- Snapshot mínimo: IDs de orden/pack/vendedor/comprador, estado, moneda, fecha,
  importe y partidas. No se conserva el payload completo, datos de contacto,
  mensajes, direcciones ni credenciales de pagos. Importes son datos de origen:
  no se infieren impuestos, neto liquidado, clasificación SAT o condición fiscal.
- La paginación por offset puede cambiar si entran nuevas ventas; volver a revisar
  páginas es seguro por idempotencia. La API limita búsquedas: este incremento
  acota el offset a 10,000 y no afirma recuperar todo el histórico de una cuenta.

## Validación reproducible

Unitarias/API/React: `npm --prefix cotiza-web test -- lib/integrations/mercadolibre
app/api/integrations/mercadolibre components/integraciones --maxWorkers=2`.

Persistencia/concurrencia: usar exclusivamente una base local desechable cuyo
nombre incluya `cotiza_ml_synthetic`, indicar `COTIZA_ML_TEST_DATABASE_URL` y ejecutar
`lib/integrations/mercadolibre/store.integration.test.ts`. La suite crea sólo el
soporte mínimo de tenants y la extensión; todos los datos son sintéticos. Prueba
aislamiento, replay OAuth, cifrado, importación repetida, cambio de estado,
rollback, rotación, respuesta incierta y desconexión. El workflow
`mercadolibre-pilot.yml` ejecuta la suite en PostgreSQL 18, incluida concurrencia,
además de TypeScript, regresión y build.

La verificación visual usa `scripts/check_mercadolibre_ui.mjs`: renderiza el
componente real con respuestas HTTP sintéticas a 1360 y 390 px, comprueba
desbordamiento, error/reintento, estado cancelado y confirmación de desconexión.
El job `visual` guarda capturas y resultados como evidencia de prueba.

Las pruebas usan proveedor simulado. No acreditan permisos otorgados por Mercado
Libre ni autorización/consulta en una cuenta real. Antes de liberar: completar
el OAuth real, verificar IDs/campos de una orden, importar dos veces, comparar
conteos con la cuenta y probar desconectar/reconectar con su propietario.

## Próximos incrementos

1. Notificaciones `orders_v2` con recepción durable, recuperación de avisos y
   consulta del recurso autorizado. No confiar en el contenido del aviso como venta.
2. Mapeo de cliente/SKU y datos fiscales mediante `buyer.billing_info.id` y
   `/orders/billing-info/MLM/{billing_info_id}`. Faltantes explícitos, sin inferir RFC.
3. Contrato de venta externa → prefactura: descuentos, IVA incluido/desglosado,
   envío, moneda, catálogo SAT, pagos y conciliación. Hoy el flujo de Cotiza
   requiere propuesta ganada, MXN e IVA 16%; no eludir esos controles.
4. Consultar si ya existe comprobante emitido por Mercado Libre; vincular su XML y
   UUID y evitar una emisión adicional por la misma operación.
5. Timbrado autorizado en Digestor y entrega PDF/XML por pack con revisión y
   confirmación previa. Cargar comprobantes puede disparar avisos/email de Mercado
   Libre; esa acción requiere aprobación explícita y no pertenece a este incremento.
6. Comisiones, liquidaciones, devoluciones y futura lectura en CIMA. Venta bruta,
   factura, cobro y depósito conservan identidades y estados separados.

## Fuentes oficiales verificadas el 9 de noviembre de 2026

- https://developers.mercadolibre.com.mx/es_ar/como-empezar/autenticacion-y-autorizacion
- https://developers.mercadolibre.com.mx/gestiona-ventas
- https://developers.mercadolibre.com.mx/es_mx/productos-recibe-notificaciones
- https://developers.mercadolibre.com.mx/es_ar/envio/facturacion-billing-info
- https://developers.mercadolibre.com.mx/es_mx/cargar-factura
- https://developers.mercadolibre.com.mx/es_ar/como-empezar/descarga-facturas-mlm

## Reversión

Apagar `MERCADOLIBRE_ENABLED` o deshabilitar el canal de la empresa en Configuración.
Cambiar de modalidad no habilita ni revoca un canal. Conservar tablas,
cifrado y evidencias; el código anterior no depende de estas tablas. No borrar
ventas ni recrear vínculos para revertir software. Rotar/revocar credenciales
sólo con la coordinación del propietario cuando corresponda.
