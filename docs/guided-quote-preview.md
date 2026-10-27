# Cotización guiada primera entrega

Comparador opcional de hasta cinco alternativas (la interfaz inicial ofrece tres), a partir de una versión guardada de la cotización. La partida variable se reemplaza con un SKU, cantidad, costo y precio explícitos en cada alternativa; las demás partidas permanecen como base fija. No infiere tarifarios, tramos, compatibilidad o precios del fabricante.

Se habilita por empresa mediante `cpq_guided_preview`, apagada cuando no existe autorización. El control en Configuración y su endpoint siguen reservados a superadmin y al tenant de la sesión. La página `/cotizaciones/guiada/[quoteId]` comprueba sesión, capacidad y visibilidad del vendedor antes de leer partidas o política. El enlace aparece únicamente con la capacidad habilitada.

La referencia y fecha de vigencia son declaraciones del usuario. El formulario no verifica autenticidad, autorización o elegibilidad del fabricante. El plazo del servicio es descriptivo; los precios ingresados deben cubrir todo ese plazo. Importes MXN, sin conversión de divisa, impuestos ni prorrateos. Los precios se capturan por alternativa, incluso si parecen iguales. El resultado muestra la referencia y nunca concede autorización; tampoco hereda excepciones de otra propuesta.

El cálculo usa centavos enteros, rechaza totales no seguros y compara el margen contra la política antes de redondear la presentación. Cambiar entradas elimina los resultados anteriores. Los datos HL Innovación se incluyen solo como fixtures históricos en pruebas, no como catálogo productivo ni valores predeterminados de precio.

Esta entrega es una simulación: no guarda alternativas, cotizaciones ni propuestas, no envía mensajes ni invoca facturación. El editor existente sigue siendo el recorrido operativo. Falta integrar una selección con el escritor común idempotente, persistir procedencia y revisión, validar catálogo/tarifario por tenant y ejecutar el piloto interactivo antes de habilitar generación de propuestas desde aquí.

No se habilitaron tenants ni se modificaron datos productivos durante su preparación.
