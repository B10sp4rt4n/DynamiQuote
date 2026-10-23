# Corte de integración CRM / Cotiza

Estado: preparado para revisión; **no autorizado para ejecución productiva**.
El PR #28 sigue en borrador. Este documento no autoriza migraciones, cambios de
permisos, interrupciones de servicios, correos, facturación ni publicación.

## Criterio de salida

| Frente | Evidencia existente | Condición restante |
| --- | --- | --- |
| Memoria AUP local | Cierre y reapertura con contenido verificado; transacción y alteraciones probadas | Sin acuse externo Recordia ni custodia HotVault |
| Notas y contexto | Notas QA persistidas; otra empresa no puede abrir la misma ficha | Completar ensayo visual de vendedor/owner con permiso específico |
| Documentos históricos | Muestra PDF previa y 12 documentos reparados en copia | No certifica todos los documentos ni una moneda original NULL |
| Emisor nuevo | Tres escenarios de integración y PROP-2026-0283 ficticia en navegador/PDF | No designa razón social ni perfil default por el usuario |
| Identidad | 5 IDs con formato Clerk; login real del superadmin | Verificar otros IDs; resolver 3 pendientes y superadmin legacy por ID exacto |
| Otros escritores | Inventario de rutas, catálogo Neon y servicio Railway | Confirmar conexión/código del servicio antiguo; inventario externo no cerrado |
| Manifiestos | 7 comprobaciones sin discrepancias en producción/copia; control negativo detectado | Repetir en destino al corte, dentro de ventana sin escrituras |

La muestra nueva guardó venta 100/costo 60 y usa emisor DynamiQuote sin logo
cuando solo hay copias históricas no predeterminadas. Su PDF de dos páginas se
descargó y renderizó completo. Quedó en borrador y sin desenlace. Un fallo previo
de guardado no se reprodujo después de iniciar sesión en la preview vigente;
la lógica de guardado no cambió y no se atribuye una causa sin logs.

Comprobaciones de código: 40 casos de integración local y TypeScript pasan.
ESLint de página 360 y prueba nueva pasa. La revisión completa de client-shell
encuentra un error anterior `react-hooks/set-state-in-effect` al sincronizar logos;
no fue introducido por la línea `timeZone`, no se ocultó ni se declara corregido.

No convertir una condición pendiente en aprobación implícita. Las seis
propuestas `default-tenant` y sus dependencias permanecen aisladas. Los 39
desenlaces sin fecha no se rellenan por suposición. No se importan datos QA.

## Preparación antes de solicitar la liberación

1. Fijar SHA exacto de aplicación y hashes de los cuatro SQL de abajo. Identificar
   despliegue productivo, proyecto y rama de base por valores de conexión
   comparados de forma privada; no copiar credenciales al expediente.
2. Resolver y probar las identidades habilitadas. Los tres `pending_*` actuales
   son `e.hdz` en fumicontrol, `ma.glz` y `ruben.arroyo` en salsa. El alias `admin`
   de DynamiQuote usa un ID legacy distinto del superadmin real. No fusionarlos.
   Reenviar acceso genera correo y requiere autorización independiente.
3. Confirmar qué atiende `cotiza-web` en Railway: servicio
   `7b8c668c-d093-42e0-a418-ce2ddc7c652d`, proyecto
   `1980096f-8e39-416b-8a12-45b5815af5a6`, entorno production
   `79506dd6-a076-4104-911a-9167da50040d`. Está SUCCESS con despliegue antiguo y
   variable DATABASE_URL; OAuth oculta su valor y no expone el commit fuente.
   No asumir que está desconectado o que tiene los filtros actuales. No detenerlo
   ni sustituir su configuración sin identificar su función y autorizar el cambio.
4. Inventariar integraciones, scripts y puestos que conservan credenciales de
   base. El guard de `app.py` contiene ese entrypoint legacy, no llamadas directas
   a bibliotecas Python. Las FK protegen relaciones; no autorizan lecturas ni
   impiden a un escritor antiguo omitir el contrato AUP. RLS permanece desactivado.
5. Completar los ensayos visuales pendientes y dejar listo un artefacto de
   recuperación que conserve el resolver estricto, el aislamiento y el escritor
   AUP. No se ha ensayado aquí un rollback productivo ni un modo de mantenimiento.
6. Presentar versión, destino, impacto, procedimiento, responsables y evidencia;
   obtener la aprobación de liberación cuando todos los bloqueos estén cerrados.

## Ejecución propuesta, únicamente después de aprobación

1. Establecer una ventana de mantenimiento con todos los escritores identificados
   detenidos mediante su procedimiento aprobado. No hay un flag de solo lectura
   universal implementado en este alcance. Comprobar que el mecanismo elegido
   también cubre clientes directos y webhooks; un aviso visual no basta.
2. Capturar respaldo/punto de recuperación y metadatos del destino actual. Una
   restauración completa posterior podría perder operaciones nuevas, por lo que
   requiere una decisión explícita; no es una recuperación automática por defecto.
3. Ejecutar solo lectura: `scripts/audit_multitenant_readiness.sql` y
   `scripts/preflight_crm_cutover.sql`. Todos los siete contadores de discrepancia
   de preflight deben ser cero. Si cambian fuente, tenant, documento o referencia,
   detener el corte y regenerar/revisar el manifiesto; no forzar la reparación.
4. Con conexión directa al destino verificado y parada ante cualquier error,
   aplicar en este orden, respetando cada BEGIN/COMMIT del archivo:
   - `cotiza-web/prisma/manual/20261022_multitenant_foundation.sql`.
   - `cotiza-web/prisma/manual/20261022_multitenant_documents.sql`.
   - `scripts/repair_legacy_formal_tenants.sql`.
   - `scripts/repair_legacy_logo_tenants.sql`.
   Las dos migraciones son aditivas; cada reparación tiene sus propias guardas
   transaccionales. No afirmar atomicidad entre los cuatro archivos. Las
   migraciones no incorporan por sí mismas las seis propuestas de tenant inválido.
5. Antes de abrir tráfico, repetir auditoría, preflight y
   `scripts/verify_legacy_reconciliation.sql`. Comprobar 13 FK validadas,
   12 documentos conciliados, 45 copias y 132 referencias auditadas según el
   manifiesto aprobado; 0 imágenes cruzadas y originales intactos. Si la
   manifestación aprobada cambia, usar sus cantidades revisadas, no estos números.
6. Publicar/promover exclusivamente el artefacto aprobado. Conservar las variables
   de producción verificadas; no promover DATABASE_URL ni otros valores de preview.
7. Probar login exacto, tenant/vendedor, notas, cotización/versión, propuesta,
   PDF/XLSX, cierre, corrección de fecha, KPIs y reapertura con datos ficticios
   identificados. No enviar correos ni timbrar facturas reales como smoke test.
8. Registrar resultados, reabrir tráfico y observar errores, accesos denegados,
   referencias documentales y consistencia de actos. Una ruta que falla mantiene
   bloqueada su liberación; una prueba local no sustituye el resultado remoto.

## Recuperación ante fallo

| Momento | Respuesta |
| --- | --- |
| Antes de aplicar SQL | Cancelar el corte sin cambiar producción |
| Dentro de un archivo SQL | Su transacción se revierte; revisar error sin eliminar registros |
| Entre archivos | Mantener cerradas las escrituras; verificar qué transacciones se confirmaron y reanudar solo tras corregir la causa |
| Código nuevo falla | Mantener aislamiento y restricciones; corregir hacia delante o usar exclusivamente artefacto de recuperación verificado |
| Problema de pertenencia | Corregir vinculación exacta después de verificar identidad; no recuperar fallback por nombre/correo ni owner anónimo |

No quitar FK, auditorías, copias de imágenes ni actos para hacer funcionar un
rollback. No restaurar un build anterior al aislamiento o que vuelva a escribir
UUID como si fuera huella de contenido. Conservar copias y referencias reparadas
es una compatibilidad deliberada, no una razón para sobrescribir originales.
Sin un artefacto de recuperación seguro ensayado, el corte sigue bloqueado.

Evidencia de esta revisión: `docs/evidence/crm-release-followup.json` y
`docs/evidence/crm-writer-route-inventory.json`. La instantánea no demuestra
ausencia de procesos externos ni autorización para usarlos en la integración.
