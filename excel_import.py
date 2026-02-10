"""
Módulo de importación Excel para DynamiQuote.
Incluye validación estricta, detección de duplicados y reporte de errores.
"""

import pandas as pd
import uuid
from datetime import datetime, UTC
from difflib import SequenceMatcher
from typing import Tuple, List, Dict, Any


def validate_excel_structure(df: pd.DataFrame) -> Tuple[bool, str]:
    """
    Valida que el Excel tenga la estructura esperada.
    
    Args:
        df: DataFrame cargado desde Excel
    
    Returns:
        Tupla (is_valid: bool, message: str)
    """
    expected_columns = ['Descripción del Producto', 'Cantidad', 'Costo Unitario', 'Subtotal']
    
    # Verificar que tenga al menos las columnas requeridas
    missing_columns = [col for col in expected_columns if col not in df.columns]
    
    if missing_columns:
        return False, f"❌ Columnas faltantes: {', '.join(missing_columns)}"
    
    if len(df) == 0:
        return False, "❌ El archivo no contiene datos"
    
    return True, "✅ Estructura válida"


def validate_row(row: pd.Series, row_num: int) -> Dict[str, Any]:
    """
    Valida una fila individual del Excel.
    
    Args:
        row: Serie de pandas con los datos de la fila
        row_num: Número de fila (para reporte de errores)
    
    Returns:
        Diccionario con resultado de validación
    """
    errors = []
    warnings = []
    
    # 1. Validar descripción
    descripcion = row.get('Descripción del Producto', '')
    if pd.isna(descripcion) or str(descripcion).strip() == '':
        errors.append("Descripción vacía")
    
    # 2. Validar cantidad
    cantidad = row.get('Cantidad', None)
    if pd.isna(cantidad):
        cantidad = 1
        warnings.append("Cantidad vacía, asumiendo 1")
    else:
        try:
            cantidad = int(cantidad)
            if cantidad <= 0:
                errors.append("Cantidad debe ser mayor a 0")
        except (ValueError, TypeError):
            errors.append(f"Cantidad inválida: '{cantidad}'")
            cantidad = None
    
    # 3. Validar costo unitario
    costo = row.get('Costo Unitario', None)
    if pd.isna(costo):
        errors.append("Costo unitario vacío")
        costo = None
    else:
        try:
            costo = float(costo)
            if costo <= 0:
                errors.append("Costo debe ser mayor a 0")
        except (ValueError, TypeError):
            errors.append(f"Costo inválido: '{costo}'")
            costo = None
    
    # 4. Validar subtotal (opcional pero si existe, debe coincidir)
    subtotal = row.get('Subtotal', None)
    if not pd.isna(subtotal) and cantidad and costo:
        try:
            subtotal = float(subtotal)
            expected_subtotal = cantidad * costo
            # Tolerancia de 1 centavo por redondeo
            if abs(subtotal - expected_subtotal) > 0.01:
                warnings.append(f"Subtotal no coincide: esperado {expected_subtotal:.2f}, encontrado {subtotal:.2f}")
        except (ValueError, TypeError):
            warnings.append(f"Subtotal inválido: '{subtotal}'")
    
    return {
        "row_num": row_num,
        "is_valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "data": {
            "descripcion": str(descripcion).strip() if not pd.isna(descripcion) else "",
            "cantidad": cantidad,
            "costo": costo
        }
    }


def validate_excel_data(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Valida todos los datos del Excel fila por fila.
    
    Args:
        df: DataFrame con los datos del Excel
    
    Returns:
        Diccionario con reporte completo de validación
    """
    validation_results = []
    valid_rows = []
    error_rows = []
    
    for idx, row in df.iterrows():
        # Saltar filas completamente vacías
        if row.isna().all():
            continue
        
        result = validate_row(row, idx + 2)  # +2 porque Excel empieza en 1 y tiene header
        validation_results.append(result)
        
        if result["is_valid"]:
            valid_rows.append(result)
        else:
            error_rows.append(result)
    
    return {
        "total_rows": len(validation_results),
        "valid_rows": len(valid_rows),
        "error_rows": len(error_rows),
        "validation_results": validation_results,
        "valid_data": valid_rows,
        "errors_data": error_rows
    }


def detect_similar_descriptions(new_descriptions: List[str], existing_descriptions: List[str], 
                                threshold: float = 0.85) -> List[Dict[str, Any]]:
    """
    Detecta descripciones similares entre nuevas y existentes usando difflib.
    
    Args:
        new_descriptions: Lista de descripciones del Excel importado
        existing_descriptions: Lista de descripciones ya en la cotización
        threshold: Umbral de similitud (0.0 a 1.0)
    
    Returns:
        Lista de coincidencias potenciales
    """
    duplicates = []
    
    for new_desc in new_descriptions:
        for existing_desc in existing_descriptions:
            ratio = SequenceMatcher(None, new_desc.lower(), existing_desc.lower()).ratio()
            
            if ratio > threshold:
                duplicates.append({
                    "new_description": new_desc,
                    "existing_description": existing_desc,
                    "similarity": round(ratio * 100, 1)
                })
    
    return duplicates


def convert_to_quote_lines(valid_data: List[Dict], import_batch_id: str, 
                           default_margin: float = 35.0) -> List[Dict[str, Any]]:
    """
    Convierte datos validados a formato de líneas de cotización.
    
    Args:
        valid_data: Lista de filas válidas del Excel
        import_batch_id: UUID que agrupa este import
        default_margin: Margen por defecto a aplicar (%)
    
    Returns:
        Lista de diccionarios con líneas listas para agregar
    """
    lines = []
    
    for item in valid_data:
        data = item["data"]
        warnings = item["warnings"]
        
        # Calcular precio con margen default
        costo = data["costo"]
        precio = round(costo / (1 - default_margin / 100), 2)
        margen = default_margin
        
        # Agregar warning de cálculo
        calc_warnings = warnings.copy()
        calc_warnings.append(f"Precio calculado con margen {default_margin}%")
        calc_warnings.append("Importado desde Excel")
        
        line = {
            "line_id": str(uuid.uuid4()),
            "sku": f"IMP-{uuid.uuid4().hex[:8].upper()}",  # SKU auto-generado
            "description_original": data["descripcion"],
            "description_input": data["descripcion"],
            "description_final": None,  # Se definirá con corrección ortográfica
            "description_corrections": "",
            "corrected_desc": data["descripcion"],
            "corrections": [],
            "line_type": "product",
            "service_origin": "producto",
            "cost_unit": costo,
            "final_price_unit": precio,
            "margin_pct": margen,
            "quantity": int(data["cantidad"]),
            "strategy": "penetration",
            "warnings": " | ".join(calc_warnings),
            "created_at": datetime.now(UTC).isoformat(),
            "import_source": "excel",
            "import_batch_id": import_batch_id,
            # Metadata adicional para preview
            "_cantidad": data["cantidad"],  # Mantener para compatibilidad con UI
            "_row_num": item["row_num"]
        }
        
        lines.append(line)
    
    return lines


def import_excel_file(file_content: bytes, filename: str, existing_lines: List[Dict] = None) -> Dict[str, Any]:
    """
    Función principal de importación Excel.
    
    Args:
        file_content: Contenido binario del archivo Excel
        filename: Nombre del archivo
        existing_lines: Líneas ya presentes en la cotización (para detectar duplicados)
    
    Returns:
        Diccionario con resultado completo de la importación
    """
    try:
        # 1. Leer Excel
        df = pd.read_excel(file_content, engine='openpyxl')
        
        # 2. Validar estructura
        is_valid, message = validate_excel_structure(df)
        if not is_valid:
            return {
                "success": False,
                "error": message,
                "validation_report": None,
                "lines": []
            }
        
        # 3. Validar datos
        validation_report = validate_excel_data(df)
        
        if validation_report["valid_rows"] == 0:
            return {
                "success": False,
                "error": "❌ No hay filas válidas para importar",
                "validation_report": validation_report,
                "lines": []
            }
        
        # 4. Generar batch ID para este import
        import_batch_id = str(uuid.uuid4())
        
        # 5. Convertir a líneas de cotización
        lines = convert_to_quote_lines(validation_report["valid_data"], import_batch_id)
        
        # 6. Detectar duplicados con líneas existentes
        duplicates = []
        if existing_lines:
            new_descriptions = [line["description_original"] for line in lines]
            existing_descriptions = [line["description_final"] for line in existing_lines]
            duplicates = detect_similar_descriptions(new_descriptions, existing_descriptions)
        
        return {
            "success": True,
            "validation_report": validation_report,
            "lines": lines,
            "duplicates": duplicates,
            "import_batch_id": import_batch_id,
            "file_info": {
                "filename": filename,
                "size": len(file_content),
                "rows_total": validation_report["total_rows"],
                "rows_imported": validation_report["valid_rows"],
                "rows_errors": validation_report["error_rows"]
            }
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": f"❌ Error leyendo archivo: {str(e)}",
            "validation_report": None,
            "lines": []
        }


def format_validation_report(validation_report: Dict[str, Any]) -> str:
    """
    Formatea reporte de validación para mostrar en UI.
    
    Args:
        validation_report: Diccionario con resultados de validación
    
    Returns:
        String formateado para mostrar
    """
    lines = []
    lines.append(f"📊 **Resumen de Validación**")
    lines.append(f"- Total de filas procesadas: {validation_report['total_rows']}")
    lines.append(f"- ✅ Filas válidas: {validation_report['valid_rows']}")
    lines.append(f"- ❌ Filas con errores: {validation_report['error_rows']}")
    
    if validation_report['error_rows'] > 0:
        lines.append("\n**Errores encontrados:**")
        for error_row in validation_report['errors_data']:
            lines.append(f"\n*Fila {error_row['row_num']}:*")
            for error in error_row['errors']:
                lines.append(f"  - ❌ {error}")
            for warning in error_row['warnings']:
                lines.append(f"  - ⚠️ {warning}")
    
    return "\n".join(lines)
