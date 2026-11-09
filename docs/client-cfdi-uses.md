# Uso CFDI en Clientes

El campo es un selector de clave y descripción, organizado en gastos, inversiones, deducciones personales y usos especiales. Inicialmente muestra opciones compatibles con RFC y régimen; **Ver todo el catálogo (24 claves)** incluye también las no compatibles, deshabilitadas.

CP01 (complementos de pago) y CN01 (recibos de nómina) se muestran como referencia; no son preferencias seleccionables para facturas comerciales. No se asigna G03 automáticamente. El cliente puede quedar pendiente de información fiscal.

Un valor legado o incompatible sigue visible con aviso; no se borra ni se convierte silenciosamente. El usuario debe elegir una clave compatible o dejarla pendiente antes de Guardar. Cambiar datos fiscales invalida el resultado de validación anterior. La carga de CSF no determina el uso que dará el receptor al comprobante.

El snapshot `cotiza-web/lib/data/sat-uso-cfdi.json` coincide byte por byte con `digestor__fiscal/app/data/sat-uso-cfdi.json`. Al actualizarlo se revisan ambos consumidores, sus pruebas y su despliegue. El catálogo funciona sin consultar un servicio en cada apertura del formulario.

Referencias consultadas el 9 de noviembre de 2026:

- [SAT, regla 2.7.1.29](https://wwwmat.sat.gob.mx/articulo/68429/regla-2.7.1.32): correspondencia entre uso y régimen.
- [Referencia de catálogo SAT 4.0](https://omawww.sat.gob.mx/tramitesyservicios/Paginas/documentos/catCFDI_V_4_20260903.xls).
- [Documentación de integración de gigstack](https://blog.gigstack.pro/post/usocfdi-cfdi-40-catalogo-regimen-receptor-2026): 24 claves y relaciones con regímenes. La descarga directa del XLS del SAT respondió 503 en esta revisión; no se afirma haber descargado ese archivo. Se contrastaron las claves y descripciones con la referencia publicada por el Hospital Civil de Guadalajara (https://ciam23.hcg.gob.mx/ciam/node/949), y las relaciones por régimen con la documentación de integración citada.

Esta modificación cubre el formulario de Clientes y el catálogo del validador de receptor. No habilita nómina ni nuevos escenarios de timbrado.
