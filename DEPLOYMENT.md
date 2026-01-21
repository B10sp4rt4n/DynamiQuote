# 🌐 Guía de Configuración de Entornos

Esta guía explica cómo configurar DynamiQuote para funcionar tanto en **desarrollo local** como en **Streamlit Cloud**.

---

## 🎯 **Detección Automática de Entorno**

La aplicación detecta automáticamente dónde está corriendo:

```
┌─────────────────────────────────────────────┐
│ 1. ¿Está en Streamlit Cloud?               │
│    → Usa st.secrets (secrets.toml)         │
├─────────────────────────────────────────────┤
│ 2. ¿Existe archivo .env local?             │
│    → Usa python-dotenv (.env)              │
├─────────────────────────────────────────────┤
│ 3. ¿Existe variable de entorno del sistema?│
│    → Usa os.environ                        │
├─────────────────────────────────────────────┤
│ 4. Si no hay DATABASE_URL                  │
│    → Usa SQLite local (desarrollo)         │
└─────────────────────────────────────────────┘
```

---

## 💻 **Configuración Local (Desarrollo)**

### **Opción 1: PostgreSQL (Neon) - Recomendado**

1. **Ya tienes el archivo `.env` configurado** ✅
   ```bash
   # Verificar configuración
   cat .env
   ```

2. **Instalar dependencias:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Correr la app:**
   ```bash
   streamlit run app.py
   ```

4. **La app usará automáticamente Neon PostgreSQL** 🎉

### **Opción 2: SQLite (Sin configuración)**

Si quieres usar SQLite para desarrollo rápido:

1. **Renombra o borra el `.env`:**
   ```bash
   mv .env .env.backup
   ```

2. **Corre la app:**
   ```bash
   streamlit run app.py
   ```

3. **La app detectará que no hay DATABASE_URL y usará SQLite** 📁

---

## ☁️ **Configuración en Streamlit Cloud**

### **Paso a Paso:**

1. **Ve a tu app en Streamlit Cloud**
   - https://share.streamlit.io/

2. **Haz clic en tu app > Settings ⚙️**

3. **Selecciona "Secrets"**

4. **Copia y pega esto:**
   ```toml
   # Secrets for DynamiQuote
   DATABASE_URL = "postgresql://neondb_owner:npg_y7QFVB3tYafI@ep-falling-wind-ah1tb7pk-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"
   ```

5. **Haz clic en "Save"**

6. **La app se reiniciará automáticamente** 🚀

### **Verificar que funciona:**

En Streamlit Cloud, verás en los logs:
```
✅ Usando DATABASE_URL de Streamlit Cloud Secrets
```

---

## 🔐 **Seguridad**

### **Archivos que NO se suben a Git:**

| Archivo | Propósito | ¿Commitear? |
|---------|-----------|-------------|
| `.env` | Credenciales locales | ❌ NO |
| `.streamlit/secrets.toml` | Credenciales cloud | ❌ NO |
| `quotes_mvp.db` | Base de datos SQLite | ❌ NO |

### **Archivos seguros para Git:**

| Archivo | Propósito | ¿Commitear? |
|---------|-----------|-------------|
| `.env.example` | Plantilla sin credenciales | ✅ SÍ |
| `.streamlit/secrets.toml.example` | Plantilla cloud | ✅ SÍ |
| `database.py` | Código de conexión | ✅ SÍ |

---

## 🧪 **Probar la Conexión**

### **Verificar conexión a Neon:**

```bash
# Instalar cliente PostgreSQL (si no lo tienes)
sudo apt-get install postgresql-client

# Probar conexión
psql "postgresql://neondb_owner:npg_y7QFVB3tYafI@ep-falling-wind-ah1tb7pk-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require"

# Si funciona, verás:
# neondb=>
```

### **Verificar desde Python:**

```bash
python3 << 'EOF'
from database import get_connection, test_connection

if test_connection():
    print("✅ Conexión exitosa!")
else:
    print("❌ Error de conexión")
EOF
```

---

## 🚀 **Deploy a Streamlit Cloud**

### **Pasos para deployar:**

1. **Asegúrate de que todo esté commiteado:**
   ```bash
   git status
   git add .
   git commit -m "Ready for deployment"
   git push
   ```

2. **Ve a Streamlit Cloud:**
   - https://share.streamlit.io/

3. **Nuevo deployment:**
   - Repositorio: `B10sp4rt4n/DynamiQuote`
   - Branch: `main`
   - Main file: `app.py`

4. **Configura Secrets (ver arriba)**

5. **Deploy! 🎉**

---

## 🔧 **Troubleshooting**

### **Error: "DATABASE_URL no configurada"**

**Solución:**
1. Verifica que existe archivo `.env` con DATABASE_URL
2. O configura secrets en Streamlit Cloud
3. O usa SQLite (sin DATABASE_URL)

### **Error: "Connection refused" o "SSL required"**

**Solución:**
1. Verifica que la URL incluye `?sslmode=require`
2. Verifica que Neon está activo (no en pausa)
3. Chequea firewall/VPN

### **Error: "password authentication failed"**

**Solución:**
1. Verifica usuario y password en Neon dashboard
2. Regenera password si es necesario
3. Actualiza .env y secrets.toml

### **La app usa SQLite en vez de PostgreSQL**

**Solución:**
1. Verifica que DATABASE_URL está configurada
2. Revisa logs de la app para ver qué detectó
3. Asegúrate de que el valor no esté vacío

---

## 📊 **Comparación de Entornos**

| Característica | Local (SQLite) | Local (Neon) | Cloud (Neon) |
|----------------|----------------|--------------|--------------|
| **Configuración** | Ninguna | .env | secrets.toml |
| **Velocidad** | ⚡⚡⚡ | ⚡⚡ | ⚡⚡ |
| **Multi-usuario** | ❌ | ✅ | ✅ |
| **Persistencia** | Local | Cloud | Cloud |
| **Backups** | Manual | Auto | Auto |
| **Escalabilidad** | Baja | Alta | Alta |
| **Costo** | $0 | $0 (512MB) | $0 (512MB) |

---

## 🎓 **Mejores Prácticas**

1. **Desarrollo local:** Usa Neon para simular producción
2. **Testing:** Usa SQLite para tests rápidos
3. **Producción:** Siempre usa Neon en Streamlit Cloud
4. **Secrets:** Nunca commitear credenciales
5. **Backups:** Neon hace backups automáticos
6. **Monitoreo:** Revisa logs en Neon dashboard

---

## 📝 **Variables Disponibles**

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Conexión PostgreSQL | `postgresql://user:pass@host/db` |
| `ENVIRONMENT` | Entorno (opcional) | `development`, `production` |
| `DEBUG` | Modo debug (opcional) | `true`, `false` |

---

## ✅ **Checklist de Deploy**

- [ ] `.env` configurado localmente
- [ ] App funciona en local con Neon
- [ ] Código commiteado y pusheado
- [ ] Secrets configurados en Streamlit Cloud
- [ ] App desplegada y funcionando
- [ ] Conexión a Neon verificada
- [ ] Primeras cotizaciones de prueba creadas

---

**¿Necesitas ayuda?** 
- Revisa logs en Streamlit Cloud
- Chequea Neon dashboard
- Verifica configuración de secrets
