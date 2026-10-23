# Recuperación Neon sin servicios adicionales — Cotiza / CRM

**Estado:** herramienta y ensayo sintético preparados. **No se ha ejecutado
un respaldo real ni una restauración de la base productiva.** No autoriza
suspender Railway, aplicar migraciones, crear recursos facturables o publicar
el PR #28.

## Alcance

Fuente aprobable: proyecto Neon DynamiQuote `cool-resonance-22906937`,
rama `production` (ID `br-quiet-morning-ahkomhhi`), base `neondb`.
Comprobar estos tres identificadores en Neon antes de proceder.

El script `scripts/backup_neon_encrypted.sh` realiza:
- `backup`: exportación de solo lectura mediante `pg_dump -Fc` por conexión
  **directa no pooled**; cifra el stream con la clave pública GPG indicada
  sin dejar un volcado sin cifrar en disco.
- `verify`: compara SHA-256 del archivo cifrado, descifra por tubería
  y valida que el archivo PostgreSQL contiene tenants, quotes, proposals
  y formal_proposals.
- `restore-test`: únicamente para PostgreSQL en `localhost`,
  base existente **vacía** con prefijo `cotiza_restore_` y reconocimiento
  explícito. Verifica tablas y reporta conteos después de restaurar.
  Nunca restaura en una dirección remota desde esta herramienta.

El flujo no crea snapshots Neon ni envía datos a GitHub Actions,
a Vercel o a esta conversación. No necesita ninguna suscripción nueva.
El costo de espacio y operación de la computadora existente debe ser
verificado localmente. No emplear un directorio sincronizado públicamente.

## Requisitos de seguridad del equipo operador

Usar un equipo Linux confiable con PostgreSQL Client **17 o posterior**
(`pg_dump`, `pg_restore`, `psql`), `gpg`, `sha256sum`, `stat` y Bash.
No ejecutar sobre el servidor Railway ni sobre un runner CI público.

1. Comprobar en Neon la URL de la rama **production** y copiar únicamente
   el host DIRECTO: uno cuyo nombre **no** contenga `-pooler`.
   Evitar la URL productiva compartida que pueda exponer una contraseña.
2. Usar un archivo PostgreSQL `.pgpass` bajo la cuenta local del operador,
   con permisos `chmod 600`, fuera del repositorio. Guardar la contraseña
   fuera del historial del shell y fuera de GitHub. El script no acepta
   conexiones con contraseña en argumentos.
3. Preparar y resguardar una clave GPG de recuperación, incluida su
   clave privada y los medios necesarios para descifrar. Revisar
   personalmente la huella de 40 dígitos antes de elegir el destinatario.
   Sin clave privada recuperable, el respaldo puede ser inutilizable.
4. Elegir un directorio local seguro ya existente y con espacio libre
   suficiente. El script rechaza `/tmp` y `/mnt/data` para respaldos reales.

### Exportación (equipo operador, después de autorizar el respaldo)

Configurar localmente **solo** estas variables; no publicarlas ni
introducir contraseñas en comandos visibles:

`COTIZA_BACKUP_PGHOST`: endpoint Neon DIRECTO comprobado.
`COTIZA_BACKUP_PGUSER`: rol aprobado para lectura.
`COTIZA_BACKUP_PGDATABASE`: `neondb`.
`COTIZA_BACKUP_PGPASSFILE`: ruta del archivo `.pgpass` con modo 0600.
`COTIZA_BACKUP_GPG_FINGERPRINT`: fingerprint de clave pública aprobada.
`COTIZA_BACKUP_PGPORT`: 5432 salvo configuración verificada.

Después ejecutar en el clon del repositorio:

```bash
bash scripts/backup_neon_encrypted.sh backup /ruta/local/segura
bash scripts/backup_neon_encrypted.sh verify /ruta/local/segura/dynamiquote-neon-FECHA.pgcustom.gpg
```

El resultado consta de **dos archivos**, ambos con permiso de propietario:
un archivo `.pgcustom.gpg` (única copia de datos, cifrada) y
`.pgcustom.gpg.sha256` (solo checksum). Copiarlos únicamente a un
almacenamiento de recuperación autorizado; conservar la clave privada
por separado. La integridad se verifica antes de considerar el respaldo
válido.

### Ensayo de restauración (equipo local, sin tocar Neon)

Disponer de un PostgreSQL local o contenedor *ya disponible* y crear
una nueva base vacía, por ejemplo `cotiza_restore_20261023`.
No crearla dentro de Neon ni utilizar una base de clientes como destino.

Configurar `COTIZA_RESTORE_PGHOST=127.0.0.1`,
`COTIZA_RESTORE_PGDATABASE=cotiza_restore_20261023`,
`COTIZA_RESTORE_PGUSER`,
`COTIZA_RESTORE_PGPASSFILE` y
`COTIZA_RESTORE_ACK=DISPOSABLE_LOCAL_DATABASE`; opcionalmente
`COTIZA_RESTORE_PGPORT`. La instancia local debe ser realmente local,
no un túnel que redirija a producción.

```bash
bash scripts/backup_neon_encrypted.sh restore-test /ruta/local/segura/dynamiquote-neon-FECHA.pgcustom.gpg
```

El archivo cifrado se descifra por tubería. El script rehúsa un destino
remoto, una base sin el prefijo indicado y cualquier base local con
tablas existentes en el esquema public. Se ejecuta `pg_restore` en una
transacción que aborta ante error.

**La restauración no concluye con el contador.** Verificar después las
relaciones cliente–cotización–propuesta, la presencia de los documentos
con evidencia de entrega y el CFDI/timbrado existente sin divulgar su
contenido. Documentar fecha, número de entidades, hash del archivo
cifrado y el resultado del ensayo. No asumir que cantidades históricas
de otras fechas siguen siendo los valores actuales.

Precaución: `--no-owner --no-acl` facilita recuperar los datos y el
esquema bajo un usuario de prueba, pero NO recrea automáticamente roles
y permisos del servicio original. Validar roles, accesos, objetos,
extensiones y comportamiento de la aplicación antes de certificar
una recuperación apta para producción.

## Prueba automatizada que sí puede ejecutarse en GitHub

`scripts/test_backup_neon_encrypted.sh` utiliza un volcado totalmente
**ficticio**, ejecutables PostgreSQL simulados y una clave GPG efímera
que se elimina al acabar. Comprueba cifrado, hash, descifrado por
tubería, restauración solo local, rechazo de destinos remotos y
poolers, destino no vacío, nombre inseguro y manipulación del archivo.
**No prueba aún `pg_dump` ni `pg_restore` contra un PostgreSQL real**.
La suite PostgreSQL del PR #28 es independiente y ya se ejecuta
contra PGlite desechable para aislamientos comerciales.

## Validación adicional PostgreSQL real (23/10/2026)

La prueba independiente `scripts/test_backup_postgres_real.sh` agrega
**PostgreSQL 17 auténtico en un contenedor desechable**, distinto del
ensayo simulado con ejecutables de prueba. GitHub Actions:
https://github.com/B10sp4rt4n/DynamiQuote/actions/runs/39969533840

- **PASS:** `pg_dump` del PostgreSQL 17 desechable, cifrado GPG por
  tubería, comprobación SHA-256 y tabla de contenidos `pg_restore --list`.
- **PASS:** función real `restore-test` del procedimiento de Cotiza,
  hacia una segunda base local vacía, `pg_restore --single-transaction`
  y recuperación de 2 tenants, 2 cotizaciones, 2 propuestas y 2 documentos
  formales con datos **completamente ficticios**.
- **PASS:** preservación de un UUID y una huella de entrega *ficticios*,
  rechazo de referencia a tenant inexistente por FK y rechazo de un segundo
  restore en el mismo destino no vacío.
- **PASS:** la suite del PR, incluidos los controles multitenant, se ejecutó
  en otro job. La ejecución no importa datos reales, no utiliza credenciales
  productivas ni crea snapshots Neon.
- Esta prueba **no** valida la conexión Neon del comando `backup`, los
  roles/productivos ni la restauración del volumen real de datos y CFDI.
  El archivo real y su recuperación independiente continúan pendientes.

## Condición de liberación

Railway se mantiene encendido hasta comprobar un archivo real y
una restauración ensayada. No generar backups mediante snapshots que
se cobren, programaciones pagadas o nuevos servicios por inferencia.
Se necesita autorización separada para cualquier cambio de producción,
suspensión de Railway o manejo de una exportación real con datos sensibles.
