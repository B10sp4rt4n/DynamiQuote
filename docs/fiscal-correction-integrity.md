# Integridad de cancelación y sustitución

Entrega del 9 de noviembre de 2026. Apilada sobre #75 y dependiente de
Digestor #17. No está publicada en producción.

- Tras una respuesta perdida, las acciones de sustitución quedan bloqueadas
  hasta consultar correctamente el historial; se conserva el bloqueo si falla
  esa consulta. No se descarta una revisión desde una pantalla obsoleta.
- La cancelación conserva su consulta automática tras un fallo, añade lectura
  manual y bloquea otra solicitud mientras el estado siga sin confirmar.
  Consultar la solicitud guardada es GET; comprobar el estado fiscal conserva
  la ruta separada de conciliación. Descargar un acuse no afirma cancelación.
- Una sustituta processing no ofrece recuperación ni libera la reserva del
  trabajador original. Digestor rechaza la recuperación antes de llamar al PAC.
- XML activo e histórico deben corresponder al UUID de su revisión. La descarga
  conserva exactamente los bytes originales, con las mismas guardas que el PDF.

Las nuevas reproducciones fallaron antes de corregir el código: doble acción
tras respuesta perdida, recuperación durante processing y XML de otro UUID.
La regresión combinada local aprobó969 pruebas/68 omitidas. TypeScript aprobado;
ESLint dirigido sin errores y un aviso preexistente por _consent.

`scripts/check_fiscal_correction.mjs` inicia un backend desechable y corre el
ensayo conectado: HTTP real, FastAPI/SQLAlchemy/SQLite y proveedor sintético.
Comprueba sustituta, motivo01, activación sólo tras cancelación confirmada,
corrección REP, XML/PDF, fuentes conservadas y dos pagos que liquidan el saldo.
`scripts/check_fiscal_correction_ui.mjs` verifica las dos pantallas reales con
HTTP simulado en1360/390px; incluye doble clic, respuestas/consultas perdidas,
processing, recuperación y separación acuse/confirmación. CI conserva capturas.

El navegador local intentó arrancar pero falló por socket Operation not permitted;
React/JSDOM sí aprobó. La evidencia de CI queda en el PR, separada del ensayo local.
No se hicieron nuevas solicitudes PAC sandbox, timbrados/cancelaciones/pagos
productivos ni comunicaciones. No se certifican sellos, bancos o todos los perfiles
fiscales. Los processing abandonados requieren revisión manual. Sin migraciones,
servicios, suscripciones ni capacidades productivas nuevas.
