# Loom: vínculo privado al expediente comercial

## Resultado de la primera entrega

Cliente 360° y expediente de oportunidad muestran “Reuniones y videos · Loom” exclusivamente en el piloto de superadmin. Se pega un enlace share/embed HTTPS, se consulta la grabación y se confirma una copia privada. Los componentes de Loom son evidencia de origen; no confirman compromisos comerciales.

La primera entrega usa URL explícita. Selección de videoteca, tareas desde fragmentos, responsables independientes, OAuth por usuario y grabación desde Cotiza corresponden a entregas posteriores. La conexión de ChatGPT no se reutiliza como credencial del servidor.

## Preparación y activación

1. Revisar/aplicar la migración aditiva `cotiza-web/prisma/manual/20261110_loom_context.sql` sobre PostgreSQL 15+; conservar revisión de índices/FK. No habilitar el módulo antes de migrar.
2. Configurar la identidad de lectura autorizada del workspace de SynAppsSys, vinculado al sitio Atlassian. El administrador debe permitir autenticación MCP con API token y scope `read:loom:agent-interface`. No se necesita escritura en Loom.
3. Configurar en el servidor, nunca con prefijo NEXT_PUBLIC:
   - `COTIZA_LOOM_TENANT_ID`: ID exacto del único tenant piloto.
   - `COTIZA_LOOM_CLOUD_ID`: UUID del sitio Atlassian asociado al workspace.
   - `COTIZA_LOOM_EMAIL` y `COTIZA_LOOM_API_TOKEN`: identidad y secreto de lectura.
   - `COTIZA_LOOM_PREVIEW_KEY`: secreto aleatorio de 32 bytes, codificado como 64 caracteres hexadecimales; distinto de otras integraciones.
   - `COTIZA_LOOM_APP_ORIGIN`: origen HTTPS canónico de Cotiza, sin ruta ni parámetros.
   - `COTIZA_LOOM_ENABLED=true`.
4. Superadmin habilita `loom_context_pilot` en el tenant explícito mediante Configuración > Tenant. La ausencia de capacidad significa deshabilitado, también para superadmin.
5. Validar desde un entorno de prueba una grabación expresamente seleccionada. Medir permisos, latencia y créditos Rovo antes del piloto real.
6. Desactivar flag o capacidad retira el acceso, sin borrar copias históricas. Rotar token con la misma identidad conserva la conexión lógica. Cambiar email/sitio separa las copias por fingerprint de conexión.

No se configuraron secretos, aplicaron migraciones ni habilitaron capacidades como parte del PR. Para distribución a clientes, implementar OAuth 2.1 por usuario y revisar retención/consentimiento antes de ampliar acceso.

## Recorrido y datos

GET en las rutas `/api/clients/[id]/loom` y `/api/opportunities/[id]/loom` solo lee copias locales (últimas 20 del expediente). No consulta al proveedor.

POST `preview` consulta el endpoint fijo de Atlassian mediante Streamable HTTP MCP; solicita únicamente `getLoomObjectsContent` y `transcript`. El cliente acotado implementa initialize, initialized, tools/call y cierre de sesión con el protocolo 2025-11-25. Un protocolo incompatible falla de forma explícita. No ofrece ejecución arbitraria de herramientas ni URLs remotas.

La vista previa lleva HMAC y caduca a los diez minutos. Vincula tenant, actor, identidad de conexión, cliente, oportunidad, video, hash de contenido y revisión local. POST `link` verifica la firma, vuelve a leer el origen y rechaza cambios de contenido antes de persistir.

Cada copia se guarda en `loom_recording_links` y cada cambio confirmado añade una fila inmutable en `loom_recording_versions`. Confirmaciones simultáneas del mismo contenido convergen en un solo vínculo. Una revisión concurrente diferente exige revisar de nuevo. La transacción revalida rol, tenant activo, capacidad y pertenencia cliente/oportunidad antes de escribir. Las FK compuestas refuerzan el aislamiento en PostgreSQL.

El piloto conserva la copia solo para su importador superadmin. Una copia exportada no hereda automáticamente las ACL futuras de Loom: la UI indica que es histórica y muestra fecha de consulta. Revocar el token impide nuevas consultas; no elimina copias existentes. Deben definirse retención/eliminación y compartición antes de habilitar otros roles. El video permanece en Loom.

## Estados y límites

- Una transcripción ausente no impide vincular metadatos; se informa al usuario.
- Transcripciones paginadas: hasta cuatro páginas y 200.000 caracteres; se respetan cursores opacos. Una lectura parcial, repetida o excesiva se rechaza completa.
- Una indisponibilidad posterior nunca sustituye una copia completa anterior.
- La fecha de creación en Loom no equivale necesariamente a la fecha de reunión.
- Datos de texto se muestran escapados por React; no se inserta HTML del proveedor.
- Cambio de contexto desmonta la vista y cancela la petición en curso. Servidor exige X-Tenant-Context y mismo origen para POST.
- No existe cron, webhook, descarga MP4, envío de mensajes ni generación por otro modelo de IA en este alcance. Las llamadas MCP pueden consumir créditos Rovo.

## Verificación

La suite nueva cubre identidad de enlace, HMAC, expiración, cambio de contexto/fuente, privacidad, lectura sin escritura, errores del proveedor, JSON/SSE y paginación. El workflow `Loom context pilot (synthetic)` ejecuta TypeScript, suite general, ESLint de los módulos, build, PostgreSQL desechable y el panel real a 1360/390 px con HTTP sintético.

Pruebas PostgreSQL solo aceptan `COTIZA_LOOM_TEST_DATABASE_URL` en localhost/127.0.0.1 y base `cotiza_loom_synthetic`. Aplican la migración dos veces y prueban concurrencia, versiones, permisos revocados y FK entre empresas. No leen .env ni datos productivos.

La evidencia de CI es sintética. La prueba real de conexión propia desde Cotiza requiere la configuración indicada y no queda acreditada por la lectura previa desde ChatGPT.

## Referencias oficiales

- https://support.atlassian.com/loom/docs/loom-mcp-tools/
- https://developer.atlassian.com/cloud/rovo-mcp/guides/supported-tools/
- https://developer.atlassian.com/cloud/rovo-mcp/guides/configuring-authentication-via-api-token/
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
