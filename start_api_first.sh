#!/bin/bash
# Script de inicio rápido para DynamiQuote API-First

set -e  # Exit on error

echo "🚀 DynamiQuote API-First - Inicio Rápido"
echo "========================================"

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Verificar Python
echo ""
echo "📋 Paso 1: Verificando Python..."
python3 --version || {
    echo -e "${RED}❌ Python 3 no encontrado${NC}"
    exit 1
}
echo -e "${GREEN}✅ Python OK${NC}"

# 2. Crear virtual environment (opcional)
if [ ! -d "venv" ]; then
    echo ""
    echo "📦 Paso 2: Creando virtual environment..."
    python3 -m venv venv
    echo -e "${GREEN}✅ Virtual environment creado${NC}"
fi

# 3. Activar venv
echo ""
echo "🔧 Paso 3: Activando virtual environment..."
source venv/bin/activate || {
    echo -e "${YELLOW}⚠️ No se pudo activar venv, continuando sin él${NC}"
}

# 4. Instalar dependencias
echo ""
echo "📥 Paso 4: Instalando dependencias..."
pip install -q --upgrade pip
pip install -q -r requirements.txt
echo -e "${GREEN}✅ Dependencias instaladas${NC}"

# 5. Ejecutar tests
echo ""
echo "🧪 Paso 5: Ejecutando tests de equivalencia..."
pytest tests/test_profitability_equivalence.py -v --tb=short || {
    echo -e "${RED}❌ Tests fallaron. Revisar código antes de continuar.${NC}"
    exit 1
}
echo -e "${GREEN}✅ Tests OK - Equivalencia verificada${NC}"

# 6. Levantar API en background
echo ""
echo "🌐 Paso 6: Levantando API backend..."
python src/api/main.py > /tmp/dynamiquote_api.log 2>&1 &
API_PID=$!
echo "PID de API: $API_PID"
sleep 3

# Verificar que API esté respondiendo
curl -s http://localhost:8000/ > /dev/null && {
    echo -e "${GREEN}✅ API iniciada en http://localhost:8000${NC}"
    echo "   - Health check: http://localhost:8000/"
    echo "   - Docs: http://localhost:8000/docs"
    echo "   - Logs: tail -f /tmp/dynamiquote_api.log"
} || {
    echo -e "${RED}❌ API no responde${NC}"
    kill $API_PID 2>/dev/null
    exit 1
}

# 7. Mostrar instrucciones
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✨ Sistema listo para usar${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🎯 Próximos pasos:"
echo ""
echo "1. Probar API con curl:"
echo "   curl http://localhost:8000/playbooks"
echo ""
echo "2. Ver documentación interactiva:"
echo "   Abrir en navegador: http://localhost:8000/docs"
echo ""
echo "3. Ejecutar frontend con feature flags:"
echo "   streamlit run src/ui/streamlit_api_migration_example.py"
echo ""
echo "4. Detener API:"
echo "   kill $API_PID"
echo ""
echo "📊 Modo de comparación:"
echo "   - Toggle ON = Usa API backend"
echo "   - Toggle OFF = Usa código legacy"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Guardar PID para poder detener después
echo $API_PID > /tmp/dynamiquote_api.pid

echo ""
echo -e "${YELLOW}💡 Tip: Para detener la API ejecuta:${NC}"
echo "   kill \$(cat /tmp/dynamiquote_api.pid)"
