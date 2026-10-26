# Revalidación de candidato CRM y compatibilidad fiscal

Resultado: preparación técnica ensayada; **corte productivo pendiente**.
Esta revisión no fusiona PR, migra datos reales, habilita usuarios, cambia flags
remotos, detiene servicios, crea recursos ni timbra/envía documentos.

## Fuentes fijadas

| Componente | Commit revisado | Estado consultado |
| --- | --- | --- |
| Cotiza CRM, PR #28 | 694dedb523957945e6b3740d8f84e0305e3b2f58 | Abierto, draft, mergeable |
| Digestor, PR #2 | 38f064a706461a9fcbad541bd9e421e2f73545da | Abierto, draft, mergeable |

La revisión se realizó en un worktree del SHA exacto del PR #28, separado de
los PR de chat/exportador/ranking. Esos incrementos no son requisito para liberar
el CRM. Se instaló el lockfile del candidato con npm ci y se generó Prisma;
no hay cambios en dependencias ni código de aplicación en esta revisión.

La documentación anterior de compatibilidad acreditaba Digestor 074523e5 y 32
pruebas. El head actual añade mantenimiento fiscal en 38f064a: este informe
actualiza evidencia sin reatribuir los resultados históricos a otra versión.

## Ensayos ejecutados aquí

| Comprobación | Resultado | Límite |
| --- | --- | --- |
| Suite general del CRM | 544 aprobadas, 65 omitidas; 56 archivos pasan/5 omitidos | E2E heredada con DATABASE_URL excluida según CI; opt-in reportados aparte |
| Integración Prisma/handlers | 51 aprobadas en PostgreSQL desechable/PGlite y socket loopback | Datos ficticios, proveedor fiscal simulado |
| Dos migraciones multitenant | Ambas aplicadas dos veces; 13 FK presentes y validadas; 12 escrituras cruzadas rechazadas | Ensayo, no destino productivo |
| Datos históricos inconsistentes | La migración aborta, revierte DDL y conserva el registro original | Caso negativo sintético |
| Cliente Digestor/rutas stamp y reconcile | 25 aprobadas | Fetch/proveedor simulados; subconjunto de suite general, no sumar como casos adicionales únicos |
| TypeScript | Aprobado | Compilación de tipos, no login/hosting real |
| Mantenimiento HTTP CRM | 12 rechazos 503 con no-store/Retry-After; al reabrir 401 sin sesión y 200 diagnóstico | Servidor local, Clerk deshabilitado y DB inaccesible ficticia |
| Digestor completo actual | 53 aprobadas, 3 omitidas, 54 subpruebas aprobadas | SQLite/testclient, red/PAC bloqueados; las 3 omitidas requieren PG real |
| Nuevo preflight de esquema | Detecta esquema vacío, columna operativa ausente, tipos incorrectos y metadatos ausentes | Solo catálogos críticos; no acredita integridad completa |

Prisma 7.8.0/Next 16.2.4 del lockfile; ejecución local Node 24.22.1 y Python
3.12. PostgreSQL desechable local PGlite 0.5.11 + socket 0.2.14 instalados fuera
del repositorio. El CI del candidato usa Node 22 y PostgreSQL 17 para el respaldo.

Incidentes del ensayo que no se ocultan:

- El primer HTTP local falló porque Turbopack rechazó symlinks a dependencias
  fuera del worktree. Se instalaron las dependencias del candidato dentro de
  él y las 14 comprobaciones pasaron sin cambiar código de aplicación.
- El ensayo local de GPG se detuvo al crear su agente: el entorno prohíbe el
  socket requerido (`can't create socket: Operation not permitted`). No generó
  un respaldo productivo ni se lo considera un éxito de recuperación local.

## Evidencia CI existente inspeccionada, no nueva ejecución remota

- CRM SHA 694dedb: [run 39985386781](https://github.com/B10sp4rt4n/DynamiQuote/actions/runs/39985386781),
  success. Job 120523085887 confirma 544 generales y 51 integraciones, migraciones
  repetidas/rollback y guardas del respaldo. Job 120523085657 confirma pg_dump
  17.11, cifrado GPG, restore real con datos ficticios, evidencia fiscal ficticia,
  FK y rechazo de sobrescritura. **No es respaldo de Neon productivo.**
- Digestor SHA 38f064a: [run 40067635386](https://github.com/B10sp4rt4n/digestor__fiscal/actions/runs/40067635386),
  success. Job 120794113456 confirma **56 aprobadas, cero omitidas y 54
  subpruebas**, incluido PostgreSQL 17.11 con dos conexiones. Los tres casos que
  aquí se omitieron sí están cubiertos por ese run del SHA exacto actual.

Los wrappers de consulta de runs filtraban eventos pull_request y devolvían
lista vacía. Se consultó la colección oficial por head_sha: los runs son de
push. La lista vacía del wrapper no se interpretó como ausencia de CI.

## Mejora concreta de preflight

El harness de integración genera el modelo Prisma y añade explícitamente
`proposal_approvals.executed_by_user_id`. Esa columna operativa está documentada
en prisma/manual/README.md, pero no pertenece aún al modelo Prisma. Por tanto,
un ensayo generado desde el modelo no prueba que el destino real tenga ese
prerrequisito ni el resto de columnas manuales requeridas.

Se agrega `scripts/audit_crm_schema_requirements.sql`: transacción READ ONLY
que inspecciona 16 columnas críticas y tipos en information_schema. Incluye
aprobaciones, fechas comerciales, columnas fiscales, metadatos de plantillas
y capacidades por tenant. No lee importes/clientes/XML, no repara ni altera
columnas y funciona incluso si faltan tablas.

Antes del corte: missing_count=0 y wrong_type_count=0. Si hay diferencias,
detener y revisar su compatibilidad/migración; nunca ejecutar db push ni cambiar
tipos automáticamente para hacer pasar la prueba. Este subconjunto no sustituye
la comparación completa del esquema, las 13 FK, preflight de datos o auditoría
fiscal. El CI existente incorpora la nueva prueba de escenarios negativos.

Reproducción aislada (tras npm ci y Prisma generate):

```bash
PGLITE_MODULE=/ruta/a/pglite/dist/index.js node scripts/check_multitenant_migration.mjs
PGLITE_MODULE=/ruta/a/pglite/dist/index.js node scripts/check_crm_schema_requirements.mjs
PGLITE_MODULE=/ruta/a/pglite/dist/index.js PGLITE_SOCKET_MODULE=/ruta/a/pglite-socket/dist/index.js node scripts/check_crm_isolation.mjs
npm --prefix cotiza-web test -- --exclude validate-quote-lifecycle.e2e.test.ts
NEXT_TELEMETRY_DISABLED=1 node scripts/check_crm_maintenance.mjs
```

Digestor (venv con sus dos requirements instalados):

```bash
DATABASE_URL='sqlite:///:memory:' DB_SSL_REQUIRE=false AUTH_CONNECTOR=jwt python -m pytest -q tests
```

No importar/startup Digestor fuera del modo de mantenimiento contra bases
reales: la ruta normal puede ejecutar create_all, seed y workers. El modo de
mantenimiento actual omite esas operaciones y conserva JWT/tenant en su única
lectura fiscal permitida. HTTP pausado no drena automáticamente otros procesos.

## Bloqueos que permanecen abiertos

1. **Destinos actuales:** cotejar conexiones efectivas de Vercel/Railway y
   verificar almacenamiento propio de Digestor. Esta continuación no inspeccionó
   bases ni secretos productivos. Las observaciones anteriores de deployment
   fallido no prueban ausencia de una instancia previa atendiendo tráfico.
2. **Recuperación productiva:** archivo íntegro cifrado de cada base fiscal/CRM,
   destino durable autorizado y custodia recuperable de clave; restore comprobado.
   Ni CI, ni branch de ensayo expirada, ni recuperación de fuente sustituyen esto.
3. **Escritores y ventanas:** inventario, pausa/drenado de servicios y procesos
   directos; comprobar que las solicitudes en curso terminaron.
4. **Destino listo:** ejecutar nuevo chequeo de esquema, los siete contadores
   del preflight original y auditoría fiscal/conciliación de evidencia real.
   No atribuir NULL históricos ni borrar/cancelar facturas como reparación.
5. **Digestor primero:** destino, tenant, credenciales y una respuesta PAC real
   anterior redactada; desplegar candidato compatible con mantenimiento y
   recuperación aprobados, sin emitir otro CFDI para probarlo.
6. **Operadores y corte:** definir operadores reales, probar login/tenant/rol
   y flujo remoto, artefacto/recuperación, impacto y aprobación final. El piloto
   solo Salvador continúa como propuesta; no se cambiaron pertenencias.

El runbook conserva su secuencia. No se propone desplegar código viejo para
recuperar acceso, eliminar FK, liberar unknown automáticamente ni fusionar
Cotiza PR #5 separadamente del trabajo ya incorporado en PR #28.
