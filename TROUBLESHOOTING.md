# 🔧 Solución de Problemas - Conexión Neon

## ❌ Error: "password authentication failed"

### Causa:
La contraseña en la cadena de conexión está incorrecta, expiró o fue regenerada.

### Solución:

1. **Ve a tu Dashboard de Neon:**
   https://console.neon.tech/

2. **Selecciona tu proyecto DynamiQuote**

3. **Copia la connection string actualizada:**
   - Ve a "Connection Details"
   - Selecciona "Pooled connection" 
   - Copia la cadena completa

4. **Actualiza tu archivo .env:**
   ```bash
   # Edita el archivo
   nano .env
   
   # O usa este comando (reemplaza con tu nueva cadena):
   echo 'DATABASE_URL=postgresql://neondb_owner:TU_PASSWORD_AQUI@ep-xxx.aws.neon.tech/neondb?sslmode=require' > .env
   ```

5. **Prueba la conexión:**
   ```bash
   python3 << 'EOF'
   from database import _create_connection, is_postgres
   conn = _create_connection()
   print("✅ Conexión exitosa!")
   EOF
   ```

---

## 🔄 Alternativa: Usar SQLite por ahora

Si quieres continuar sin configurar Neon ahora:

```bash
# Renombra el .env para que use SQLite
mv .env .env.neon.backup

# Corre la app
streamlit run app.py

# La app detectará que no hay DATABASE_URL y usará SQLite automáticamente
```

---

## 🎯 Verificar que Neon está activo

A veces Neon pausa las bases de datos inactivas:

1. Ve a https://console.neon.tech/
2. Verifica que tu proyecto no esté en estado "Paused"
3. Si está pausado, simplemente accede y se reactivará

---

## 📋 Checklist de Troubleshooting

- [ ] Dashboard de Neon accesible
- [ ] Proyecto activo (no pausado)
- [ ] Connection string copiada desde dashboard
- [ ] Password correcto en .env
- [ ] Archivo .env existe en el directorio correcto
- [ ] No hay espacios extras en DATABASE_URL

---

## ✅ Próximo Paso

Una vez que actualices el password en `.env`, ejecuta:

```bash
python migrate_to_neon.py
```

Esto:
1. ✅ Probará la conexión
2. ✅ Creará las tablas en Neon
3. ✅ Migrará datos existentes de SQLite
