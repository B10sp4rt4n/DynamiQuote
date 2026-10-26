# Cotiza: captura PPD y pagos de factura

Esta entrega conecta el flujo sandbox de Digestor PR4: https://github.com/B10sp4rt4n/digestor__fiscal/pull/4 . Se apila sobre el perfil fiscal explícito de Cotiza PR35; no sustituye las revisiones/migraciones previas.

## Flujo del usuario

Con DIGESTOR_FISCAL_PPD_ENABLED=true en un entorno de validación, la captura permite PPD y selecciona forma99; cambiar a PUE vuelve a una forma conocida. La API valida la combinación y el flag por su cuenta. Mantiene moneda MXN, claves explícitas y huella de partidas del cambio anterior.

Después de timbrar una factura PPD, se muestra total, cobros declarados y saldo. La persona captura importe, referencia, fecha/hora con la zona de su dispositivo y forma real del pago. El importe se envía como cadena decimal, nunca se calcula el saldo en el navegador. La fecha se normaliza con offset UTC y Digestor conserva ese original además del orden UTC.

Cada solicitud lleva UUID de idempotencia estable mientras se reintenta el mismo contenido. Ante un error se conserva la captura; Consultar saldo y estado recupera lo persistido sin registrar otro pago ni emitir un complemento. La referencia se valida en Digestor con unicidad por empresa. No es conexión bancaria y cambiar deliberadamente referencia/clave puede evadir la detección de un mismo movimiento.

El pago registrado y su recibo son independientes: not_sent, processing, unknown, rejected o stamped. XML preliminar se identifica como sin timbrar; sólo un recibo stamped permite descargar XML timbrado. Los botones de emisión dicen explícitamente pruebas y sólo aparecen cuando el servicio lo habilita y el complemento anterior figura emitido. Processing/unknown requieren consulta y conciliación; no se repiten automáticamente.

## Autoridad y aislamiento

Todas las rutas exigen sesión, capacidad fiscal del tenant, flag PPD, visibilidad de la propuesta por vendedor/administrador y una factura local timbrada. Resuelven draftId desde el registro local; el cuerpo no admite tenant, draftId, tasas ni saldos. Digestor vuelve a comprobar JWT/rol/empresa, perfil del XML y reglas de pago. Una clave paymentId de otra factura no evita ese alcance.

La preparación, emisión y descarga se separan en endpoints. Consultar estado sólo llama GET; no hay conciliación externa automática con el PAC. La descarga usa no-store y el XML almacenado; no arma otro comprobante.

## Activación y pendientes

Por defecto el flag no está habilitado. El backend requiere FISCAL_PPD_ENABLED y, para emitir recibos, FISCAL_REP_STAMP_ENABLED. También fuerza sandbox aun con flags. Coordinar migración20261025_02 en mantenimiento y pruebas en una base aislada; esta entrega no los aplica a producción ni usa comprobantes reales.

Antes de liberar faltan: validar XSD/catálogos/matriz fiscal y aceptación real sandbox; ampliar redondeos conservadores; conciliación externa de estados inciertos; correcciones/reversiones de cobros y cancelación/sustitución. El PDF del complemento, pagos agrupados, anticipos, retenciones y moneda extranjera siguen pendientes. Esta interfaz descarga el XML de REP; el PDF existente de la factura original sigue disponible.

## Verificación

Pruebas de permisos recorren las rutas nuevas con sesión ausente, tenant sin capacidad, propuesta ajena y alcance de vendedores/administradores. Pruebas de proxy cubren importes decimales como cadenas, idempotencia, campos inyectados, fecha sin zona, consulta sin reemisión, XML preliminar/timbrado y error de proveedor sin reintento automático. Vitest, TypeScript, ESLint de archivos cambiados y build Next se ejecutan con mocks o dirección local sintética. No hubo validación manual de navegador ni aceptación del PAC real; no presentar estas pruebas como certificación fiscal.
