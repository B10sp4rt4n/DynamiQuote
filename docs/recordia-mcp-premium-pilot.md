# Recordia MCP Premium — piloto SynAppsSys

Autorización de Salvador, 16 de noviembre de 2026: integrar el piloto únicamente
al tenant SynAppsSys. Es un complemento premium de consulta, sin cobro automático.

## Alcance

Cada oportunidad muestra **Memoria Recordia · Premium · Piloto SynAppsSys** al
superadmin autenticado. **Consultar memoria** usa el servidor MCP real de Cotiza
para consultar registros comerciales, sus fechas y sus referencias. No requiere
un proveedor de IA ni un servicio adicional.

Esta es la implementación nativa TypeScript del contrato de lectura de Recordia
propuesto en `B10sp4rt4n/usr-core` PR #2. El adaptador usa la identidad real de
Cotiza; no expone ni depende de la API de demostración de USR. Los datos continúan
en las fuentes existentes de Cotiza. Este piloto proyecta los registros al
consultarlos; no crea todavía un ledger Recordia separado ni conserva versiones
anteriores de fuentes modificadas.

Incluye creación y fecha de cierre de oportunidades, registro de cotizaciones y
propuestas, notas ligadas a la oportunidad, eventos de propuesta y decisiones de
aprobación. Respeta la agrupación comercial de oportunidades del mismo cliente
que Cotiza ya valida. No asocia documentos antiguos por semejanza de nombres;
solo utiliza relaciones explícitas de oportunidad o de origen de cotización.

No consulta nuevos correos, transcripciones, adjuntos, XML ni estados bancarios.
No modifica fuentes, cambia etapas, aprueba, factura, cobra ni envía mensajes.
Un timestamp de registro no demuestra cuándo ocurrió un hecho fuera de Cotiza;
una fecha ausente permanece explícitamente sin registrar.

## Frontera del piloto

- Identidad fija verificada: tenant `389b6cc1-2f8d-4fe4-bc3d-f50f92df3157`, slug `sys`.
  No se obtiene del cuerpo de la solicitud ni se amplía mediante variables.
- Sesión Clerk válida comprobada directamente y coherente con la empresa activa.
  Bootstrap y las cookies de desarrollo no habilitan este endpoint.
- Usuario activo con rol superadmin reconsultado en PostgreSQL, empresa activa y
  capacidad `recordia_mcp_premium` habilitada. El rol por sí solo no da premium.
- Comprobación en cada solicitud y antes/después de leer las fuentes; deshabilitar
  la capacidad bloquea nuevas respuestas, incluso con un cliente ya conectado.
- Cabecera `X-Tenant-Context` coherente con la sesión y origen HTTPS propio.
- Otro tenant permanece bloqueado aunque alguien le asigne por error la capacidad.
- Ninguna identidad, plan ni permiso son argumentos válidos de las herramientas.
- Respuestas privadas sin caché; no se almacenan en localStorage. Cambiar de
  empresa desmonta el panel y cancela sus consultas pendientes.

## MCP y procedencia

Endpoint privado por expediente:
`POST /api/opportunities/{opportunityId}/recordia/mcp`.

SDK oficial `@modelcontextprotocol/sdk` 1.32.2, transporte Streamable HTTP sin
sesión compartida: servidor y transporte nuevos por solicitud. Las herramientas
son `recordia_list_memories`, `recordia_get_memory`, `recordia_get_evidence`.
El cliente no puede salir del expediente vinculado a la ruta.

El piloto utiliza exclusivamente la sesión de la aplicación y su origen. No es
todavía un endpoint OAuth para conectar ChatGPT u otros clientes externos.
No se emiten credenciales persistentes ni se copian sesiones al servidor USR.

Las notas se clasifican como declaraciones registradas; las aprobaciones como
decisiones registradas. Los otros eventos indican la existencia de un registro
en Cotiza, no prueban hechos externos. `integrity_status` es `not_verified`.
`projection_hash` es SHA-256 de la proyección entregada: no acredita integridad
binaria del documento original, inmutabilidad ni custodia HotVault.

Fechas normalizadas a UTC; pantalla en `America/Mexico_City`, con ISO UTC en la
referencia desplegable. No se inventan fechas faltantes. Páginas de hasta 100
registros, 100 registros recientes por fuente, 16 KiB por solicitud y 256 KiB por
respuesta. Si se recorta una fuente o una nota, la respuesta lo informa.

## Activación explícita

1. Ejecutar `cotiza-web/prisma/manual/20261116_recordia_mcp_pilot.sql` en la base
   DynamiQuote autorizada. Solo agrega la capacidad de SynAppsSys y su evento de
   activación. Repetir no duplica ni revierte una revocación posterior.
2. Configurar en el servidor:

| Variable | Valor del piloto |
|---|---|
| `COTIZA_RECORDIA_ENABLED` | `true` |
| `COTIZA_RECORDIA_APP_ORIGIN` | `https://dynami-quote.vercel.app` |
| `COTIZA_RECORDIA_VALID_UNTIL` | `2026-12-17T06:00:00Z` |

La vigencia propuesta termina al finalizar el 16 de diciembre de 2026 en CDMX.
Fechas sin zona, ausencia de configuración, revocación o vencimiento bloquean el
piloto. No hay renovación automática ni compromiso de pago. Un Preview utiliza
su `VERCEL_URL` propia para validar el origen, manteniendo los mismos controles.

3. Desplegar el commit probado en el proyecto Cotiza existente.
4. Entrar con Clerk, elegir SynAppsSys y abrir una oportunidad. Pulsar
   **Consultar memoria**, revisar fechas y abrir una fuente. Cambiar de empresa
   debe ocultar el panel; una llamada directa debe quedar bloqueada.

Para suspender inmediatamente: deshabilitar `recordia_mcp_premium` de SynAppsSys
mediante una actualización administrativa auditada en `tenant_capabilities` y
`tenant_capability_events`. La siguiente consulta vuelve a revisar esa tabla,
sin necesitar redeploy. La suspensión conserva todas las fuentes comerciales.

## Validación

Pruebas con datos sintéticos: cliente MCP oficial conectado al transporte HTTP
real, aislamiento, permisos, vigencia, revocación durante lectura y en conexión
abierta, referencias fuera del expediente, proyecciones, límites y fechas
desconocidas. El panel se prueba con protocolo de inicialización, notas como
texto, limpieza de datos al fallar y cancelación al desmontar.

La suite completa se ejecuta con una URL PostgreSQL sintética no conectable,
sin credenciales productivas. Se excluye `validate-quote-lifecycle.e2e.test.ts`,
que escribe datos comerciales reales; los ensayos que exigen bases independientes
permanecen omitidos. No se confunde esta validación con un recorrido autenticado
en producción.

Resultado previo al despliegue: 1.273 pruebas aprobadas, 108 omitidas por sus
requisitos independientes; TypeScript, ESLint de archivos nuevos y build Next.js
aprobados. Se agregaron 27 pruebas del piloto. Base de implementación:
`57a7024e7e009b6fda3dcf0eb1d6b7a8e9c5de58`.
