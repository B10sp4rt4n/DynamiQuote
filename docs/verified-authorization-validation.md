# Validación del piloto de autorización verificable

Fecha: 16 de noviembre de 2026. Base de implementación: main 57a7024, posterior al documento inicial del PR #109.

## Resultado comprobado

- Suite de repositorio: **1,321 pruebas aprobadas**, 109 omitidas por requisitos de otros entornos; 152 archivos de pruebas aprobados y 21 omitidos.
- Se excluyó explícitamente validate-quote-lifecycle.e2e.test.ts: su propio encabezado indica que escribe en una base Neon real. No se ejecutó contra producción.
- Las pruebas nuevas incluyen identidad Clerk estricta, política de contenido, interfaz DOM y un cluster PostgreSQL 18 temporal con firmas ES256 generadas durante la prueba.
- El SQL de entrega se aplicó en ese cluster temporal sobre las tablas existentes, incluyendo sus FK, índices y guarda append-only.
- Registro WebAuthn verificado, denegación por firma/origen/UV inválidos, bloqueo de credenciales sincronizables en perfil estricto, aislamiento por tenant y nominación de aprobadores.
- Alta inicial exige una reverificación nueva posterior al intento de registro; se rechazó reutilizar el intento o el ticket.
- Bajo confirmaciones concurrentes se aceptó una sola decisión. Bajo consumos concurrentes se generó un solo efecto y el reintento recibió el resultado existente.
- Se comprobaron vencimiento, rechazo, cancelación, pérdida de facultades, cambio de política, contenido alterado y revocación de credenciales.
- La exportación se verificó sin consultar Cotiza: hashes, secuencia, firma y vínculo con el contenido. Un snapshot alterado fue rechazado.
- Se comprobaron la habilitación administrativa con dry-run/aplicación y la recuperación fuera de banda, registrada como identidad declarada del operador.
- La interfaz DOM comprobó: recorrido directo sin QR, contenido privado antes de login, eliminación del secreto de la URL, denegación de cuenta incorrecta y firma únicamente tras pulsar Autorizar.
- Build Next.js de producción aprobado, comprobación TypeScript y ESLint de archivos modificados aprobados.

## Preparación del tenant real

Las consultas de lectura localizaron el registro activo de SynAppsSys (slug sys) y su cuenta activa de Salvador con rol superadmin vinculada por ID Clerk. Al consultar, las tablas del piloto no existían y la capacidad no estaba habilitada.

No se ejecutaron migraciones, habilitaciones, altas ni recuperación contra esa base. No se modificaron metadatos de Clerk, identidades o facultades existentes. Los IDs personales no se incorporan al código público ni a los fixtures.

## Pendiente de validación operativa

1. Aplicar el esquema y configurar el piloto en un entorno revisado con origen HTTPS estable e instancia Clerk correspondiente.
2. Configurar el claim de reverificación y nominar por ID Clerk la cuenta de Salvador como aprobador y manager del piloto.
3. Registrar y usar un autenticador real. Las pruebas ES256 sintéticas no acreditan reconocimiento físico, compatibilidad de Face ID ni soporte del perfil singleDevice en un iPhone concreto.
4. Recorrer PC/celular con sesiones reales de Clerk y revisar presentación/compatibilidad en los navegadores objetivo. La validación de interfaz de esta entrega fue DOM, no un ensayo completo en dispositivo físico.
5. Confirmar el resultado, conservar un manifiesto externo y decidir posteriormente la conexión de custodia. HotVault permanece sin conexión y los expedientes se identifican como prepared_for_custody.

Las compras del piloto permanecen simuladas. Integrar una compra real exige proteger todas las rutas de ejecución y revisar sus reglas comerciales; no se activa por este módulo ni por habilitar la capacidad premium.

## Actualización del PR #112

Se integró main en 0c1a58c2e312b5ec3d5ea067348711fc398072aa, conservando Recordia MCP y su memoria persistente de los PR #110 y #111. El único conflicto fue el lockfile de dependencias; se regeneró preservando ambas capacidades. La nueva corrida reportó 1,321 pruebas aprobadas y 109 omitidas. La corrida inicial de la implementación aislada había reportado 1,293 aprobadas y 108 omitidas. No se cambiaron datos ni activación del piloto durante la publicación.
