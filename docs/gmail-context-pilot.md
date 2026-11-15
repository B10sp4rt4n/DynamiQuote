# Gmail: comunicaciones por oportunidad

Primer alcance: conexión OAuth de lectura, búsqueda bajo demanda por **mensaje**,
revisión antes de vincular y copias cifradas de correo y adjuntos. Dos correos con
el mismo asunto conservan identidades separadas; un correo puede vincularse a
varias oportunidades. El hilo es contexto, nunca identidad de un caso.

No modifica Gmail, envía correos, registra pagos, autoriza propuestas ni cambia
etapas. El piloto está restringido al superadmin autenticado con Clerk y a una
empresa/buzón configurados. Las copias son privadas a ese actor y empresa.
No hay consumo de IA ni dependencia de un nuevo proveedor de envío.

## Preparación

1. Aplicar `cotiza-web/prisma/manual/20261115_gmail_context.sql` de forma explícita.
   Es aditiva e idempotente; no se ejecuta en el build ni toca tablas comerciales.
2. En un proyecto Google Cloud de la organización, habilitar Gmail API, preparar
   consentimiento OAuth para uso interno si corresponde y crear cliente **Web**.
3. Registrar exactamente el callback HTTPS de la instalación:
   `https://DOMINIO_COTIZA/api/integrations/gmail/callback`.
4. Configurar en el servidor, sin prefijos públicos:

| Variable | Uso |
| --- | --- |
| `COTIZA_GMAIL_ENABLED` | `true` sólo al habilitar el piloto |
| `COTIZA_GMAIL_TENANT_ID` | Empresa autorizada |
| `COTIZA_GMAIL_ACCOUNT` | Buzón permitido, verificado contra Gmail `/profile` |
| `COTIZA_GMAIL_CLIENT_ID` | Cliente OAuth Web de Google |
| `COTIZA_GMAIL_CLIENT_SECRET` | Secreto OAuth; almacenar como secreto |
| `COTIZA_GMAIL_REDIRECT_URI` | Callback exacto registrado en Google |
| `COTIZA_GMAIL_TOKEN_KEY` | 32 bytes aleatorios en hexadecimal; secreto independiente |

La clave de cifrado debe conservarse para poder consultar las copias históricas.
Una rotación necesita recifrar las copias antes de cambiar la clave.
La autorización de Gmail usada por ChatGPT no se comparte ni se reutiliza aquí.

5. Abrir `/configuracion/integraciones/gmail`, pulsar **Conectar Gmail**, elegir
   el buzón permitido y autorizar únicamente `gmail.readonly`.
6. Abrir una oportunidad con cliente, sección **Comunicaciones**, buscar mensajes,
   leer uno y confirmar **Vincular correo y adjuntos**.

`gmail.readonly` permite leer el buzón; el filtro por operación es de Cotiza,
no una restricción de alcance impuesta por Google. El piloto interno y la
publicación a clientes externos tienen requisitos OAuth diferentes. Verificar
los requisitos vigentes de Google antes de ampliar el alcance.

## Integridad y aislamiento

- Estado OAuth aleatorio, hash en PostgreSQL, cookie segura HTTP-only, vencimiento
  de 10 minutos, consumo único y vínculo con actor/empresa/navegador.
- Cambiar de empresa o usuario durante OAuth invalida la finalización.
- Credenciales y archivos cifrados con AES-256-GCM y contexto autenticado.
- Revisión firmada por actor, empresa, cliente, oportunidad, buzón, mensaje y hash;
  se vuelve a leer la fuente antes de guardar. El navegador no proporciona evidencia.
- Se revalida rol y pertenencia del expediente al confirmar. Claves foráneas
  compuestas impiden vincular copias de otro actor/empresa.
- Las confirmaciones repetidas no duplican vínculos ni eventos.
- Se retiene la respuesta estructurada de Gmail con contenido MIME y adjuntos;
  no se afirma que sea una copia `.eml` byte a byte ni una validación fiscal.
- Cuerpo mostrado como texto React, nunca HTML ejecutable. Descarga como adjunto
  con `nosniff`; las instrucciones contenidas en correos no son instrucciones del sistema.
- Respuestas sin caché; sin secretos/códigos/cuerpos de proveedor en errores.
- Desconectar borra las credenciales locales e invalida intentos pendientes;
  conserva las copias. El usuario puede revocar el permiso también en Google.

## Límites del primer alcance

Búsquedas paginadas de 20 mensajes; hasta 50 vinculaciones recientes por
oportunidad, ordenadas cronológicamente en pantalla. Hasta 8 MiB de contenido
por mensaje y 200.000 caracteres por parte de texto. Un adjunto no disponible
impide la copia completa y se informa el error, sin omitirlo silenciosamente.
No hay sincronización automática, extracción de acuerdos, separación de pasajes,
acceso compartido a copias entre vendedores ni servidor MCP en este cambio.
Estos componentes se pueden añadir sobre el expediente sin cambiar su identidad.

## Prueba de aceptación

Usar datos sintéticos en pruebas automatizadas: dos mensajes con asunto idéntico
deben aparecer separados; revisar no guarda; confirmar vincula exactamente el
correo revisado; repetir no duplica; otro actor/empresa/expediente no obtiene la
copia; desconectar durante OAuth impide restaurar la conexión.

La prueba real con O'Donnell se hace tras el consentimiento de Google. No se
incluyen sus mensajes, adjuntos ni identificadores privados en el repositorio.

Validación de implementación:
- Build Next.js y comprobación TypeScript correctos.
- 1.246 pruebas pasan, 102 se omiten por requerir entornos independientes; se
  excluye expresamente `validate-quote-lifecycle.e2e.test.ts`, que escribe en una
  base real y no corresponde a esta conexión.
- 6 pruebas adicionales del store ejecutadas contra PostgreSQL WASM desechable:
  consumo único OAuth, desconexión durante callback, cifrado, idempotencia,
  mensajes con igual asunto, aislamiento y revalidación del rol al guardar.
- `scripts/check_gmail_schema.mjs` comprueba la migración repetible y las claves
  foráneas entre empresa, actor, cliente, oportunidad y copia.

Para ejecutar la suite del store, instalar `@electric-sql/pglite` como herramienta
de prueba y pasar su ruta absoluta en `PGLITE_MODULE`; no es dependencia de la
aplicación. Usar `--hookTimeout=45000` para la inicialización WASM en máquinas
con carga. Ninguna de estas pruebas recibe credenciales productivas.

Referencias oficiales:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
