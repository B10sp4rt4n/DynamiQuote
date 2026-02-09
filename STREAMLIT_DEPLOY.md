# 🚀 Guía de Deploy en Streamlit Cloud

## ⚠️ Si ves error de IndentationError en línea 1391

**El archivo está correcto en GitHub, pero Streamlit Cloud tiene caché antiguo.**

### Solución: Clear Cache + Reboot

1. **Ve a tu app en Streamlit Cloud** (share.streamlit.io)

2. **Abre el menú de configuración** (⋮) en la esquina superior derecha

3. **Settings → Advanced settings**

4. **Click en "Clear cache"** (botón rojo)

5. **Espera 10-15 segundos**

6. **Click en "Reboot app"** (botón azul)

### Alternativa: Force redeploy

Si clear cache no funciona:

1. En tu workspace local:
```bash
# Hacer un cambio pequeño para forzar redeploy
git commit --allow-empty -m "Force redeploy"
git push origin feature/api-first-validation
```

2. En Streamlit Cloud, espera a que detecte el nuevo commit (30-60 segundos)

3. La app se redeployará automáticamente

### Verificar que el deploy fue exitoso

Cuando la app cargue, deberías ver en la consola del navegador (F12):
- `Build: 2026-02-09-23:05 UTC` (en comentario línea 1)
- No debe haber errores de `IndentationError`

### Si el problema persiste

El archivo `app.py` actualmente tiene:
- **3541 líneas** totales
- **Línea 1391**: `help="Dale un nombre identificable a esta propuesta"`
- **Línea 1392**: `)  # FIX: Line 1391 fixed on 2026-02-09-23:05`

Si Streamlit Cloud sigue reportando error en línea 1391 con "st.", significa que el caché no se ha invalidado. Intenta:

1. **Cambiar de rama temporalmente**:
   - En Streamlit Cloud Settings, cambia a rama `main`
   - Espera que cargue (puede fallar, no importa)
   - Vuelve a cambiar a `feature/api-first-validation`

2. **Recrear la app**:
   - Borra la app en Streamlit Cloud
   - Créala de nuevo desde cero apuntando al mismo repo

## ✅ Características del deploy actual

- Python 3.13
- Streamlit Cloud Community
- PostgreSQL (Neon) como base de datos
- WeasyPrint opcional (puede no estar disponible por dependencias del sistema)
- Todas las demás funcionalidades completamente operativas

## 📦 Archivos de configuración

- `requirements.txt` - Dependencias Python
- `packages.txt` - Paquetes del sistema (librerías para WeasyPrint)
- `.streamlit/config.toml` - Configuración UI y tema
- `.streamlit/cache_buster.txt` - Forzar invalidación de caché

## 🔑 Secrets requeridos

En Streamlit Cloud Settings → Secrets:

```toml
DATABASE_URL = "postgresql://user:password@host/db?sslmode=require"
# Opcional:
# OPENAI_API_KEY = "sk-..."
```

---

**Última actualización**: 2026-02-09 23:05 UTC  
**Build**: 115d8c7  
**Estado**: ✅ Archivo correcto, caché de Streamlit Cloud necesita invalidación
