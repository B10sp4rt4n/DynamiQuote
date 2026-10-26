# Preparación de recuperación independiente — Cotiza y Digestor Fiscal

Estado: **plan revisable, sin ejecución productiva**. Complementa la [auditoría G0](crm-g0-audit-20261025.md) y conserva sus condiciones. No autoriza conexiones SQL, activación de compute/rama, backups reales, despliegues, cambios de variables o restauración productiva. Los IDs `src-*` se resuelven en [el expediente](evidence/crm-g0-audit-20261025.json).

## Destinos identificados y vínculo pendiente

| Componente | Identidad verificada por metadatos | Estado y límite |
| --- | --- | --- |
| Cotiza habitual | Vercel `prj_DJT883Ac7UNuSKMrZUD1rPjZdsOd`; alias `dynami-quote.vercel.app`; producción `main/55760ab4` | `READY`; no es el PR #28. No equivale a un smoke comercial/fiscal |
| Servicio fiscal identificado | Railway proyecto `911f84ed-a4df-40ec-a122-f77d26da261c`, entorno `f8cd837c-8769-46c8-9f1f-c84fbbdc7cdc`, servicio `ef6c5593-5099-48e0-9da5-b78bcd66a845` | `environment_status` reporta **offline**, `activeDeployments: []`, sin trabajo pendiente. No se reinició |
| Dominio fiscal configurado | `https://digestorfiscal-production.up.railway.app`, targetPort 8080 | Dominio de ese servicio Railway; no prueba salud HTTP ni que coincida con el valor sensible de Cotiza |
| Base CRM | Neon `cool-resonance-22906937`, production `br-quiet-morning-ahkomhhi` | Endpoint directo `ep-falling-wind-ah1tb7pk.c-3.us-east-1.aws.neon.tech`; metadato compute `idle` |
| Candidato histórico de base fiscal | Neon `dry-unit-51861475` (`Fiscal_Context`), production `br-jolly-credit-amrmuf99` | Rama `archived`; endpoint directo `ep-crimson-sun-amjpdtcq.c-5.us-east-1.aws.neon.tech`, metadato compute `idle`. La asociación actual con Digestor sigue sin revalidar |

Fuentes: `src-vercel-production-current`, `src-fiscal-neon-metadata`, `src-fiscal-service-domain-status`, `src-recovery-endpoint-metadata`. Un dominio configurado, un endpoint existente y un contador de réplicas no prueban un proceso en ejecución. No se hicieron peticiones HTTP al servicio fiscal ni conexiones a endpoints de base.

### Comparaciones mínimas para cerrar el vínculo

1. Cotiza → servicio: comparar únicamente **host normalizado** de `DIGESTOR_FISCAL_BASE_URL` con el dominio Railway identificado. La API de Vercel lo devuelve vacío por ser `sensitive`; la existencia de la variable no demuestra la igualdad. Si el valor es distinto, identificar su servicio antes de continuar.
2. Servicio → base: leer del panel de configuración de ese servicio/entorno únicamente **hostname y nombre de base** efectivos de `DB_URL`/`DATABASE_URL`, respetando la precedencia del código desplegado. Comparar host directo o pooled con el endpoint fiscal identificado. Un nombre de proyecto parecido no sustituye esa comparación.
3. Conservar solo resultado, identificadores, fecha, operador y referencias del deployment/configuración. No conservar usuario, contraseña, URL completa con credenciales, claves PAC, tokens ni capturas con secretos.
4. La consola/runtime está apagada. No desplegar ni arrancar `main` para disponer de un script de inspección: su arranque histórico puede crear tablas/seed o iniciar workers. La lectura del panel debe ser de configuración, sin guardar cambios. Si la variable está sellada o no puede verse, mantener el vínculo pendiente; no recrearla ni rotarla por inferencia.

Las dos comparaciones son independientes. Aun si `Fiscal_Context` coincide con la configuración persistida, el servicio offline no queda certificado como un runtime sano. Sigue pendiente el smoke posterior sobre el candidato compatible y dentro de la ventana aprobada.

## Qué se debe recuperar por separado

| Perfil | Base/esquema y evidencia mínima | Elementos complementarios |
| --- | --- | --- |
| CRM | Dump consistente completo; tenants, identidades/membresías, clientes/contactos, cotizaciones/propuestas/versiones, relaciones CRM, evidencia comercial/AUP y documentos/metadatos fiscales preservados | Configuración recuperable del servicio, identidad/roles, logos/documentos y cualquier almacenamiento externo inventariado; fuente/build son recuperación distinta |
| Fiscal | Dump consistente completo del backend confirmado; al menos `billing_draft`, `billing_draft_item`, `product_catalog`, `evento_facturacion`, `app_user`, `document_jobs`, `document_sync_events`, `audit_logs` y demás tablas presentes | XML/UUID/fechas, `stamp_status` y reservas `stamping`/`unknown`, relaciones por `company_id`, usuarios, colas y archivos externos necesarios |

Los nombres fiscales se revisaron en modelos del candidato `38f064a7`, **no mediante SQL en producción**. Deben contrastarse con el esquema realmente respaldado; la lista no es un filtro de exportación ni una autorización para omitir tablas. `src-fiscal-recovery-models`.

Inventariar archivos referenciados por `UPLOAD_DIR` y documentos/entregas antes de afirmar recuperación completa. Si existen certificados/llaves o secretos necesarios para volver a operar, registrar únicamente su custodio y procedimiento de recuperación separado. No copiarlos al expediente, a GitHub o a la conversación. No afirmar que el dump incluye automáticamente archivos, credenciales del PAC, roles PostgreSQL o configuración de Clerk.

## Compatibilidad de la herramienta preparada

`scripts/backup_neon_encrypted.sh` del CRM, en `694dedb5`, permite una exportación cifrada y restore únicamente local, pero `verify`/`restore-test` exigen las tablas `tenants`, `quotes`, `proposals`, `formal_proposals` y usan nomenclatura CRM. **No usar esa herramienta sin adaptación validada para certificar una base fiscal.** No se cambió su contrato ni el código de liberación. `src-backup-tool-profile`.

Para CRM se conserva [el procedimiento existente](neon-backup-recovery.md). Para fiscal debe prepararse, después de confirmar backend, un perfil/herramienta aislado que valide sus tablas y estados, nombres de archivo propios y restauración local vacía. No basta con renombrar el archivo ni quitar las comprobaciones CRM. Un export JSON HTTP que omita usuarios, archivos o evidencia fiscal tampoco sustituye el dump completo y el ensayo de recuperación.

## Secuencia de ejecución futura, con puntos de parada

1. **Cerrar identidad y alcance.** Comparaciones de host/base realizadas; backend fiscal y estado archived/idle revisados por el operador. Fijar proyectos/ramas/base exactos. No conectar ni activar recursos desde esta preparación.
2. **Elegir equipo y custodia.** Equipo confiable ya existente, almacenamiento privado durable con espacio, custodio de la clave de descifrado y segunda ubicación privada acordada. Verificar herramientas locales; no asumir Bash/WSL, PostgreSQL 17, GPG ni un PostgreSQL desechable ya disponibles.
3. **Completar perfiles de verificación.** CRM con herramienta existente; fiscal con perfil propio probado con datos ficticios antes de usar datos reales. Ninguna reducción de verificaciones por comodidad.
4. **Preparar recuperación del acceso al backend archivado.** Acordar con el proveedor el procedimiento aplicable y su impacto; cualquier reactivación de rama/compute queda fuera de esta autorización. No convertir la lectura de metadatos en conexión SQL para probar suerte.
5. **Presentar ejecución concreta.** Equipo/operador, destinos, huella de clave recuperable, dos perfiles, ventana y tratamiento de escritores/procesos, alcance y costos. Obtener autorización específica para backup real y cualquier activación necesaria. La autorización de desarrollo/auditoría no la sustituye.
6. **Copia consistente cifrada de cada base.** Exportación de lectura mediante mecanismo aprobado, cifrada en stream, archivos separados y checksums. Credenciales fuera de argumentos, historial y repositorio. No usar este runtime temporal ni un runner público como almacén de datos reales. Conservar fecha de snapshot lógico y alcance del dump; un backup no acredita por sí mismo drenado para el corte.
7. **Ensayo local separado y sin efectos externos.** Restaurar cada archivo en una base local existente, vacía, desechable, con nombres distintos por perfil. No restaurar en Neon productivo ni importar la aplicación con credenciales reales. Deshabilitar conectividad saliente/PAC/correos y seed/auto-workers antes de cualquier smoke local.
8. **Conciliar.** Comparar entidades, FK, aislamiento por tenant y evidencias frente a un manifiesto de la copia. Fiscal: XML/UUID conservados y estados/reservas idénticos, sin resolver `unknown` ni emitir CFDI. CRM: versiones, documentos y decisiones conservados, sin completar fechas o monedas por suposición.
9. **Aceptar recuperación.** Archivo cifrado y hash, clave recuperable bajo custodia, restore comprobado, archivos externos y acceso/roles contemplados, responsables y ubicación registrados. No equivale todavía a rollback probado del hosting ni a autorización de liberar G0.

## Registro mínimo por respaldo — completar solo con evidencia ejecutada

| Campo | Estado en esta preparación |
| --- | --- |
| Perfil, proyecto/rama y base | CRM identificado; fiscal histórico pendiente de vincular |
| Operador y equipo | Pendiente de elección |
| Almacén privado y segunda copia | Pendiente de elección |
| Clave/huella y custodio | Pendiente de elección; no se creó una clave |
| Backend fiscal y disponibilidad de lectura | Pendientes de confirmar; sin reactivación |
| Inicio/fin de exportación y consistencia | No ejecutados |
| Archivo, tamaño, SHA-256 | No generados para datos reales |
| Restore local, integridad, aislamiento y evidencia fiscal | No ejecutados con datos reales |
| Estado de archivos externos y secretos recuperables | Inventario pendiente |
| Autorización de corte | No solicitada ni concedida por este plan |

Este plan convierte los pendientes en pasos comprobables. No declara un respaldo existente, un vínculo verificado, pérdida de datos o una recuperación concluida.
