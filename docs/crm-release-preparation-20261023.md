# Preparación operativa de liberación CRM / Digestor

Estado: preparado para revisión; ambos PR siguen draft. Sin cambio productivo.
La evidencia por versión está en evidence/crm-release-preparation-20261023.json.

## Lo que quedó comprobado

| Frente | Resultado | Límite |
| --- | --- | --- |
| Código CRM | Fuente e122c48a, árbol 877540ae; CI 39983511078 success | El éxito CI no acredita el corte remoto |
| Recuperación de fuente CRM | 425 archivos extraídos y hashes verificados desde e122c48a | Sin base, dependencias, build ni rollback de hosting; no fallback productivo aprobado |
| Código Digestor | 32 pruebas aprobadas en 074523e5 | Proveedor y documentos sintéticos |
| Digestor actualmente desplegado | Railway atribuye fced17d8 a 9e251d76, SUCCESS | Metadatos de plataforma, no lectura del almacenamiento |
| Identidad de Salvador | ID exacto activo, superadmin, tenant sys activo | Login probado previamente; no nueva sesión en esta continuación ni lista aprobada |
| Neon CRM | 6 horas de historia, cero snapshots y schedule vacío | Falta archivo independiente y restauración real |
| Datos fiscales CRM | Una propuesta con evidencia fiscal, cero stamping; muestra SQL de lectura | No demuestra firma/verdad comercial ni estado del PAC |
| Escritor Cotiza antiguo | Railway conserva 1e21faa5 SUCCESS, una réplica, sin staged | No detenido, inventario externo pendiente |
| Vercel | La lectura del equipo ahora devuelve 403 forbidden | No se certificó de nuevo el alias actual ni se cambió de cuenta para eludir el bloqueo |

La muestra PostgreSQL observó cero sesiones de clientes adicionales en ese
instante. No demuestra ausencia de escritores intermitentes ni drenado.
La rama de ensayo br-old-pond-ahe5jto3 expira **23/10/2026, 14:25 hora de Ciudad
de México** (20:25 UTC). No se extendió y no sustituye un respaldo.

## Operadores propuestos

Propuesta para un primer piloto: solo Salvador, con el ID exacto ya verificado
user_3D45SeGQqBoyBe8v3XvOu39QdWH, tenant sys y rol vigente superadmin. La propuesta
no está aprobada, no modifica accesos y no implica desactivar otros usuarios.
Las cuentas identificadas como pruebas permanecen fuera de la habilitación
propuesta, sin invitación, vínculo por correo o borrado automático. La expansión
requiere nombres/IDs y pruebas de acceso de quienes realmente participarán.

## Almacenamiento y arranque fiscal: completar antes del redeploy

El servicio Digestor tiene DB_URL pero el conector OAuth solo muestra su nombre.
Cero volúmenes montados no permite concluir si usa SQLite, almacenamiento
transitorio o PostgreSQL remoto. El destino fiscal no se atribuye a Neon CRM.
Se requiere su propia recuperación consistente, en especial XML/UUID y estados
pendientes, antes de reiniciar o cambiar imagen.

app/main.py, config.py y Procfile no cambian entre el commit desplegado y el
candidato. El arranque ya contiene create_all, seed condicional y workers de
documentos/entregas. Se deben inventariar y drenar; una pausa HTTP no los detiene
por sí sola. No se importó app.main ni se ejecutó lifespan contra el servicio.
El webhook saliente de proyecto Railway está vacío; no prueba ausencia de
webhooks de aplicación o integraciones entrantes.

Se preparó en Digestor scripts/inspect_release_storage.py: lee configuración y
metadatos del archivo si SQLite, informa flags y hashes de fuente, sin conectar
SQL ni mostrar credenciales. Comprobado localmente con PostgreSQL inaccesible y
SQLite en memoria ficticios. Falta ejecutarlo mediante operador autorizado en
el deployment actual. El conector carece de ejecución/SSH y oculta valores; usar
el panel sería un fallback que requiere aprobación del usuario.

## Respaldo y decisiones pendientes

La vía preparada sigue siendo una exportación consistente cifrada a un equipo y
almacén privado existentes, con clave recuperable resguardada, seguida de restore
en PostgreSQL local desechable. Este runtime no tiene pg_dump/pg_restore/psql,
ni destino privado durable o clave de recuperación seleccionados. No se creó
clave efímera para datos reales, exportación productiva, snapshot facturable ni
nuevo servicio. La prueba CI sintética no sustituye este paso.

Pendientes concretos:

1. Inspección de tipo/destino fiscal de solo lectura desde el panel u operador.
2. Definir equipo y almacenamiento privados, custodia de clave y ejecutar backup
   y recuperación real de cada base. Si es Windows, usar herramientas locales o
   WSL ya disponible; no asumir que Bash/PG17/GPG están instalados.
3. Confirmar operadores reales; el alcance solo Salvador sigue siendo propuesta.
4. Recuperar visibilidad del equipo Vercel. La API solicita authorize_team_access,
   herramienta no expuesta en esta conexión. No se intentó otra cuenta/CLI para
   rodear el 403. El último alias verificado sigue siendo evidencia histórica.
5. Cerrar inventario y drenado, respuesta real PAC previa redactada y preflight.
6. Presentar SHA, ventana, responsables, recuperación e impacto para liberación.
   Digestor compatible primero; CRM después. No reabrir el código fiscal antiguo
   automáticamente tras comenzar operaciones con reservas persistentes.

Referencias: crm-cutover-runbook.md, neon-backup-recovery.md,
railway-retirement-plan.md y digestor-compatibility-20261023.md.
