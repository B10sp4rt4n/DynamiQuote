"""
Script de diagnóstico para verificar la estructura de get_quote_by_group_id
Ejecuta este script en Streamlit Cloud para diagnosticar el problema.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from database import get_quote_by_group_id, get_quote_groups_summary
import streamlit as st

st.title("🔍 Diagnóstico de get_quote_by_group_id")

st.markdown("""
Este script ayuda a diagnosticar problemas con la función `get_quote_by_group_id`.
""")

# Obtener un grupo de ejemplo
st.subheader("1. Obtener grupos disponibles")
groups = get_quote_groups_summary(limit=5)

if groups:
    st.success(f"✅ Se encontraron {len(groups)} grupos")
    st.dataframe(groups)
    
    # Seleccionar el primer grupo
    first_group_id = groups[0]['quote_group_id'] if groups else None
    
    if first_group_id:
        st.subheader("2. Probar get_quote_by_group_id")
        st.code(f"group_id = '{first_group_id}'")
        
        try:
            result = get_quote_by_group_id(first_group_id)
            
            if result:
                st.success("✅ La función retornó datos correctamente")
                
                st.subheader("3. Verificar estructura del diccionario")
                st.json(result)
                
                st.subheader("4. Verificar campos requeridos")
                required_fields = ['quote_id', 'quote_group_id', 'version', 'created_at', 
                                 'status', 'total_revenue', 'avg_margin', 'playbook_name', 
                                 'client_name', 'proposal_name', 'quoted_by']
                
                for field in required_fields:
                    if field in result:
                        st.success(f"✅ Campo '{field}' presente: `{result[field]}`")
                    else:
                        st.error(f"❌ Campo '{field}' FALTANTE")
                
                # Verificar tipos
                st.subheader("5. Verificar tipos de datos")
                for key, value in result.items():
                    st.info(f"`{key}`: {type(value).__name__} = `{value}`")
                    
            else:
                st.error("❌ La función retornó None")
                
        except Exception as e:
            st.error(f"❌ Error al ejecutar get_quote_by_group_id: {e}")
            st.exception(e)
    else:
        st.warning("No hay grupos disponibles para probar")
else:
    st.error("❌ No se encontraron grupos en la base de datos")

st.divider()
st.subheader("6. Información del sistema")
st.write(f"- Python version: {sys.version}")
st.write(f"- Working directory: {os.getcwd()}")
st.write(f"- Database module location: {sys.modules['database'].__file__ if 'database' in sys.modules else 'No cargado'}")
