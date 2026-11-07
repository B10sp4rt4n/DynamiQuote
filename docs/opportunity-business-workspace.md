# Ficha central y navegación por negocio

Ruta: /oportunidades/{opportunityId}. El título de cada oportunidad y el diálogo Revisar oportunidad abren su ficha. El alta explícita también ofrece Abrir ficha. La ficha conserva folio, cliente, responsable disponible en el directorio, resultado comercial y monto/rango del lector vigente. Reúne datos de intake (necesidad, origen y siguiente acción), tareas abiertas vinculadas, todas las revisiones autorizadas de cotización, alternativas declaradas y propuestas. No suma alternativas ni genera fechas o datos históricos.

La edición de datos usa el endpoint de intake existente, con su revisión optimista; los registros históricos no gestionados conservan su modo de consulta. Descartar y Reactivar continúan dentro de Revisar oportunidad.

Los pasos de documentos se resuelven en GET /api/commercial-context mediante sesión, tenant y alcance del documento y oportunidad. Un usuario ordinario debe ser dueño de la oportunidad; cada cotización exige su propietario. Las propuestas respetan el alcance vigente de creador/huérfana. Un origen histórico solo se utiliza tras verificar el documento de origen. La respuesta es privada/no-store. Cambios de documento abortan consultas anteriores; las vistas se reinician por tenant/actor donde corresponde.

Las alternativas se resuelven con el lector canónico de commercial-options y únicamente con los IDs previamente autorizados; la ficha de una alternativa redirige al negocio principal. El paso 1 vuelve a esa ficha; el paso 2 abre la revisión concreta; el paso 3 abre la propuesta concreta. Si todavía no hay propuesta, lleva a la sección Propuestas de la misma ficha. La vista general mantiene sus enlaces generales.

Verificación local: 533 pruebas generales aprobadas, 41 omitidas por condiciones; e2e legado con base externa excluido. 13 integraciones aprobadas con PostgreSQL 18.6 nativo desechable, incluyendo ficha, contexto exacto, rechazo por tenant/vendedor, alternativas canónicas y concurrencia existente del alta. Ensayo HTTP con Next local/actor bootstrap: render del alta/ficha, creación/reintento sintéticos, preselección y contexto exacto aprobados. TypeScript, ESLint sin errores (siete advertencias previas en ProposalShell), build Next.js y diff --check aprobados. Sin migraciones ni dependencias nuevas.

El arnés scripts/check_explicit_opportunity.mjs permite reproducir las integraciones y el ensayo HTTP usando EMBEDDED_POSTGRES_MODULE y COTIZA_HTTP_CHECK=1. Todo se ejecuta sobre una base vacía local; no crea operaciones comerciales productivas.
