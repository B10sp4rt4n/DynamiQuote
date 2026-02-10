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

## 🔑 Configuración de Secrets (DATABASE_URL)

**⚠️ IMPORTANTE**: Si ves que la app usa SQLite en lugar de PostgreSQL, los secrets no están configurados.

### Paso 1: Acceder a la configuración de Secrets

1. Ve a tu app en Streamlit Cloud: https://share.streamlit.io/
2. Click en tu app **dynamiquote-xxx**
3. Click en el botón **"Manage app"** (esquina inferior derecha)
4. En el menú lateral, click en **"⚙️ Settings"**
5. Scroll hasta encontrar la sección **"Secrets"**

### Paso 2: Configurar DATABASE_URL

En el editor de secrets, pega:

```toml
# Neon PostgreSQL Database
DATABASE_URL = "postgresql://neondb_owner:npg_y7QFVB3tYafI@ep-falling-wind-ah1tb7pk-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Opcional: OpenAI API Key (para corrección inteligente de descripciones)
# OPENAI_API_KEY = "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Paso 3: Guardar y Reboot

1. Click en **"Save"** (botón verde)
2. Click en **"Reboot app"** para aplicar los cambios
3. Espera 30-60 segundos

### Paso 4: Verificar conexión

Cuando la app cargue:

1. En la **sidebar izquierda** deberías ver:
   ```
   ☁️ Base de datos: PostgreSQL (Neon)
   Conexión: Cloud
   ```

2. Expande **"🔍 Debug Info"** en la sidebar para ver:
   - ✅ DATABASE_URL encontrada
   - Lista de secrets configurados

### 🐛 Troubleshooting

**Problema**: App sigue usando SQLite después de configurar secrets

**Solución**:
1. Verifica que guardaste los secrets (botón "Save")
2. Haz **Reboot app** (no solo refresh)
3. Espera al menos 30 segundos
4. Si persiste, haz **Clear cache** + **Reboot app**

**Problema**: Error "Unable to connect to database"

**Solución**:
1. Verifica que la URL de Neon es correcta (incluye `?sslmode=require`)
2. Verifica que la base de datos Neon está activa (no en sleep mode)
3. Revisa los logs en Streamlit Cloud para ver el error exacto

---

**Última actualización**: 2026-02-10 UTC  
**Build**: 1e341c5  
**Estado**: ✅ Archivo correcto, secrets requeridos para PostgreSQL
