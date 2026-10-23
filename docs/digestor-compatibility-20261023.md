# Compatibilidad fiscal del CRM con Digestor

El PR #2 de Digestor continúa en borrador. Se validó código y contrato aislados;
queda preparar y aprobar su liberación antes del CRM. No se publicó producción.

## Fuente y resultados

- Digestor: código 074523e5d6647f8b4b92d34a590b13525d966d91, árbol
  52cabb5f0bb1b1503cec5eafecfb59a89df82d84. Documentación posterior en dbb32977.
- CI completa success: **32 aprobadas, cero omitidas**, PostgreSQL 17.11 sintético,
  https://github.com/B10sp4rt4n/digestor__fiscal/actions/runs/39982889270.
- Dos conexiones independientes y lecturas sincronizadas: solo una solicitud
  llega al proveedor simulado; la otra recibe 409. PATCH queda bloqueado durante
  la emisión y un PATCH previo se serializa antes de reservar y construir XML.
- Consulta HTTP FastAPI sin llamar al PAC: 401 sin sesión, 403 por rol/tenant,
  404 de borrador ajeno y respuesta GET con stamp_status, uuid, xml_base64.
- Cotiza: **25 pruebas aprobadas**, tres archivos (cliente Digestor y handlers
  stamp/reconcile), árbol 047a07c306fcd7fde3d8b453432769b630122ca3, versión remota
  equivalente 96875214. Emisor simulado, sin conexión a producción.
- Digestor local: 29 aprobadas y tres PostgreSQL omitidas; esas tres se ejecutaron
  en CI. SOAP probado con respuestas sintéticas directas y escapadas.

## Correcciones encontradas durante la validación

La regresión en Digestor a6cc68f reprodujo ocho fallos entre 19 casos. Una
respuesta incompleta o error HTTP podía parecer rechazo y permitir otro intento;
un texto con palabras UUID/TFD podía aparentar XML timbrado, y evidencia histórica
incoherente no cerraba siempre edición/emisión.

El candidato conserva unknown si no confirma un CFDI estructurado con UUID o
un rechazo PAC explícito reconocido. No convierte fallos HTTP de SOAP en rechazo
comercial. XML/fecha previos y estados timbrados bloquean edición y reenvío aunque
los otros campos sean incoherentes. Validación estructural no significa comprobar
sellos, firma, SAT ni veracidad comercial. El trabajo de reserva/conciliación del
CRM anterior se conserva; esta continuación no cambió su runtime.

La primera definición CI falló por comillas de un literal SQLite; la siguiente
por un fixture RFC genérico que normaliza el nombre a PUBLICO EN GENERAL. Se
corrigió el fixture nominal, sin modificar esa regla ni debilitar la aserción.
El éxito citado corresponde a la ejecución final, no a esos intentos fallidos.

## Límites y siguiente corte

GET stamp-result solo lee evidencia guardada. No recupera automáticamente un
resultado unknown desde el PAC ni autoriza volver a timbrar. El procedimiento
manual de Digestor exige mantener el bloqueo, conservar identificadores/horas y
obtener evidencia previa del PAC mediante el canal autorizado antes de proponer
una recuperación local. No se agregó un endpoint para liberar unknown.

Railway Digestor tiene source main; su deployment fced17d8-aa0b-4ca1-a1c5-692c138de8e5
se observó SUCCESS sin cambios preparados tras el push a la rama del PR. No se
modificaron configuración, credenciales, base ni servicios. La lectura de estos
metadatos no certifica el SHA exacto del runtime ni su compatibilidad fiscal nueva.

Queda contrastar una respuesta real anterior redactada sin remitir CFDI,
verificar destino/tenant y preparar recuperación y smoke checks. Liberar Digestor
compatible antes de Cotiza; después cumplir respaldo recuperable, operadores
reales, inventario y drenado de escritores y preflight final del runbook CRM.
Los registros de prueba identificados pueden seguir excluidos sin invitaciones,
vínculos por correo o borrados inferidos. Recordia comercial sigue local_only;
esta validación no agrega actos fiscales al contrato AUP ni custodia externa.

Referencias fijadas:
- [PR fiscal](https://github.com/B10sp4rt4n/digestor__fiscal/pull/2)
- [Informe y conciliación manual](https://github.com/B10sp4rt4n/digestor__fiscal/blob/dbb32977ad44e94734df3a599f827378efea6fa0/docs/fiscal-safety-validation-20261023.md)
- [Evidencia estructurada](https://github.com/B10sp4rt4n/digestor__fiscal/blob/dbb32977ad44e94734df3a599f827378efea6fa0/docs/evidence/fiscal-safety-validation-20261023.json)
- [Runbook CRM](crm-cutover-runbook.md)
