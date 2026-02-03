"""
Motor AUP para Propuestas → Rentabilidad → Versionado Inmutable.
Implementa el pseudocódigo arquitectural con aislamiento por tenant.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, UTC
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from database import get_cursor, is_postgres


# =========================
# Contexto y validaciones
# =========================

def require_context(context: Dict[str, Any]) -> Tuple[str, str]:
    """
    Valida contexto base (tenant_id, user_id, tenant_is_active, user_has_permission).
    """
    if context is None:
        raise ValueError("Context requerido")

    tenant_id = context.get("tenant_id")
    user_id = context.get("user_id")
    tenant_is_active = context.get("tenant_is_active")
    user_has_permission = context.get("user_has_permission")

    if not tenant_id or not user_id:
        raise ValueError("Context incompleto: tenant_id y user_id son obligatorios")

    if tenant_is_active is not True:
        raise PermissionError("Tenant inactivo")

    if user_has_permission is not True:
        raise PermissionError("Usuario sin permiso")

    return tenant_id, user_id


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _row_to_dict(cursor, row) -> Optional[Dict[str, Any]]:
    if row is None:
        return None
    columns = [desc[0] for desc in cursor.description]
    return dict(zip(columns, row))


def _execute(cursor, query_pg: str, query_sqlite: str, params: Tuple[Any, ...]):
    if is_postgres():
        cursor.execute(query_pg, params)
    else:
        cursor.execute(query_sqlite, params)


def _fetchone(cursor, query_pg: str, query_sqlite: str, params: Tuple[Any, ...]) -> Optional[Dict[str, Any]]:
    _execute(cursor, query_pg, query_sqlite, params)
    return _row_to_dict(cursor, cursor.fetchone())


def _fetchall(cursor, query_pg: str, query_sqlite: str, params: Tuple[Any, ...]) -> List[Dict[str, Any]]:
    _execute(cursor, query_pg, query_sqlite, params)
    rows = cursor.fetchall()
    if not rows:
        return []
    columns = [desc[0] for desc in cursor.description]
    return [dict(zip(columns, row)) for row in rows]


# =========================
# Salud y evaluación
# =========================

def evaluate_health(margin_pct: Optional[float]) -> str:
    if margin_pct is None:
        return "undefined"
    if margin_pct >= 0.35:
        return "green"
    if margin_pct >= 0.25:
        return "yellow"
    return "red"


def evaluate_net_health(net_margin_pct: Optional[float]) -> str:
    if net_margin_pct is None:
        return "undefined"
    if net_margin_pct >= 0.25:
        return "green"
    if net_margin_pct >= 0.15:
        return "yellow"
    return "red"


# =========================
# Propuestas (AUP)
# =========================

def create_proposal(origin: str, context: Dict[str, Any]) -> str:
    tenant_id, user_id = require_context(context)
    proposal_id = str(uuid.uuid4())
    created_at = _now_iso()

    with get_cursor() as cur:
        _insert_proposal(cur, proposal_id, tenant_id, user_id, origin, created_at)

    return proposal_id


def _insert_proposal(cur, proposal_id: str, tenant_id: str, user_id: str, origin: str, created_at: str):
    _execute(
        cur,
        """
        INSERT INTO proposals (proposal_id, tenant_id, origin, status, created_by, created_at)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        """
        INSERT INTO proposals (proposal_id, tenant_id, origin, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (proposal_id, tenant_id, origin, "open", user_id, created_at),
    )


def _get_proposal(cur, proposal_id: str, tenant_id: str) -> Optional[Dict[str, Any]]:
    return _fetchone(
        cur,
        "SELECT * FROM proposals WHERE proposal_id = %s AND tenant_id = %s",
        "SELECT * FROM proposals WHERE proposal_id = ? AND tenant_id = ?",
        (proposal_id, tenant_id),
    )


def _ensure_proposal_open(cur, proposal_id: str, tenant_id: str) -> Dict[str, Any]:
    proposal = _get_proposal(cur, proposal_id, tenant_id)
    if not proposal:
        raise ValueError("Proposal no encontrada")
    if proposal.get("status") != "open":
        raise ValueError("Proposal cerrada")
    return proposal


def _ensure_proposal_closed(cur, proposal_id: str, tenant_id: str) -> Dict[str, Any]:
    proposal = _get_proposal(cur, proposal_id, tenant_id)
    if not proposal:
        raise ValueError("Proposal no encontrada")
    if proposal.get("status") != "closed":
        raise ValueError("Proposal debe estar cerrada")
    return proposal


# =========================
# Importación Excel
# =========================

_COLUMN_ALIASES = {
    "quantity": ["quantity", "cantidad", "qty"],
    "sku": ["sku", "codigo", "código", "codigo sku"],
    "description": ["description", "descripcion", "descripción", "producto"],
    "cost_unit": ["cost_unit", "costo unitario", "cost unitario", "costo"],
}


def _normalize_columns(df: pd.DataFrame) -> Dict[str, str]:
    normalized = {str(c).strip().lower(): c for c in df.columns}
    mapping: Dict[str, str] = {}
    for canonical, aliases in _COLUMN_ALIASES.items():
        for alias in aliases:
            alias_lc = alias.lower()
            if alias_lc in normalized:
                mapping[canonical] = normalized[alias_lc]
                break
    return mapping


def _parse_excel_rows(df: pd.DataFrame) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    mapping = _normalize_columns(df)
    required = ["quantity", "description", "cost_unit"]
    missing = [field for field in required if field not in mapping]
    if missing:
        raise ValueError(f"Columnas faltantes: {', '.join(missing)}")

    rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    for index, row in df.iterrows():
        if row.isna().all():
            continue

        try:
            quantity = float(row[mapping["quantity"]])
            description = str(row[mapping["description"]]).strip()
            cost_unit = float(row[mapping["cost_unit"]])
            sku = None
            if "sku" in mapping:
                sku_value = row[mapping["sku"]]
                sku = None if pd.isna(sku_value) else str(sku_value).strip()

            if not description:
                raise ValueError("Descripción vacía")
            if quantity <= 0:
                raise ValueError("Cantidad inválida")
            if cost_unit <= 0:
                raise ValueError("Costo unitario inválido")

            rows.append(
                {
                    "row_number": int(index) + 2,
                    "quantity": quantity,
                    "description": description,
                    "cost_unit": cost_unit,
                    "sku": sku,
                }
            )
        except Exception as exc:
            errors.append({"row_number": int(index) + 2, "error": str(exc)})

    return rows, errors


def import_excel(proposal_id: str, excel_file: bytes, context: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id, _ = require_context(context)

    df = pd.read_excel(excel_file, engine="openpyxl")
    parsed_rows, errors = _parse_excel_rows(df)

    if errors:
        return {"success": False, "errors": errors, "imported": 0}

    with get_cursor() as cur:
        _ensure_proposal_open(cur, proposal_id, tenant_id)

        item_number = 1
        for row in parsed_rows:
            item_id = str(uuid.uuid4())
            subtotal_cost = row["quantity"] * row["cost_unit"]
            created_at = _now_iso()

            _execute(
                cur,
                """
                INSERT INTO proposal_items (
                    item_id, tenant_id, proposal_id, item_number, quantity, sku, description,
                    cost_unit, price_unit, subtotal_cost, subtotal_price, status, origin,
                    component_type, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                """
                INSERT INTO proposal_items (
                    item_id, tenant_id, proposal_id, item_number, quantity, sku, description,
                    cost_unit, price_unit, subtotal_cost, subtotal_price, status, origin,
                    component_type, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    tenant_id,
                    proposal_id,
                    item_number,
                    row["quantity"],
                    row.get("sku"),
                    row["description"],
                    row["cost_unit"],
                    None,
                    subtotal_cost,
                    None,
                    "open",
                    "excel",
                    None,
                    created_at,
                ),
            )
            item_number += 1

    recalculate_integrated_node(proposal_id, context)

    return {"success": True, "errors": [], "imported": len(parsed_rows)}


# =========================
# Items
# =========================

def update_proposal_item(item_id: str, updates: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id, _ = require_context(context)

    with get_cursor() as cur:
        item = _fetchone(
            cur,
            "SELECT * FROM proposal_items WHERE item_id = %s AND tenant_id = %s",
            "SELECT * FROM proposal_items WHERE item_id = ? AND tenant_id = ?",
            (item_id, tenant_id),
        )

        if not item:
            raise ValueError("Item no encontrado")
        if item.get("status") == "closed":
            raise ValueError("Item cerrado")

        quantity = updates.get("quantity", item.get("quantity"))
        description = updates.get("description", item.get("description"))
        price_unit = updates.get("price_unit", item.get("price_unit"))
        component_type = updates.get("component_type", item.get("component_type"))

        if quantity is None or float(quantity) <= 0:
            raise ValueError("Cantidad inválida")

        subtotal_cost = float(quantity) * float(item.get("cost_unit"))
        subtotal_price = None
        if price_unit is not None:
            subtotal_price = float(quantity) * float(price_unit)

        updated_at = _now_iso()

        _execute(
            cur,
            """
            UPDATE proposal_items
            SET quantity = %s, description = %s, price_unit = %s, component_type = %s,
                subtotal_cost = %s, subtotal_price = %s, status = %s, updated_at = %s
            WHERE item_id = %s AND tenant_id = %s
            """,
            """
            UPDATE proposal_items
            SET quantity = ?, description = ?, price_unit = ?, component_type = ?,
                subtotal_cost = ?, subtotal_price = ?, status = ?, updated_at = ?
            WHERE item_id = ? AND tenant_id = ?
            """,
            (
                quantity,
                description,
                price_unit,
                component_type,
                subtotal_cost,
                subtotal_price,
                "modified",
                updated_at,
                item_id,
                tenant_id,
            ),
        )

        proposal_id = item.get("proposal_id")

    recalculate_integrated_node(proposal_id, context)

    return {"success": True, "item_id": item_id}


# =========================
# Nodo integrado
# =========================

def recalculate_integrated_node(proposal_id: str, context: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id, _ = require_context(context)

    with get_cursor() as cur:
        _ensure_proposal_open(cur, proposal_id, tenant_id)

        items = _fetchall(
            cur,
            """
            SELECT subtotal_cost, subtotal_price
            FROM proposal_items
            WHERE proposal_id = %s AND tenant_id = %s AND status != %s
            """,
            """
            SELECT subtotal_cost, subtotal_price
            FROM proposal_items
            WHERE proposal_id = ? AND tenant_id = ? AND status != ?
            """,
            (proposal_id, tenant_id, "deleted"),
        )

        total_cost = sum(float(i["subtotal_cost"]) for i in items) if items else 0.0
        priced = [i for i in items if i.get("subtotal_price") is not None]
        total_price = sum(float(i["subtotal_price"]) for i in priced) if priced else None

        if total_price is None:
            gross_profit = None
            margin_pct = None
            health = "undefined"
        else:
            gross_profit = float(total_price) - float(total_cost)
            margin_pct = gross_profit / float(total_price) if float(total_price) > 0 else None
            health = evaluate_health(margin_pct)

        updated_at = _now_iso()

        _execute(
            cur,
            """
            INSERT INTO proposal_integrated_node
                (proposal_id, tenant_id, total_cost, total_price, gross_profit, margin_pct, health, status, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (proposal_id) DO UPDATE SET
                total_cost = EXCLUDED.total_cost,
                total_price = EXCLUDED.total_price,
                gross_profit = EXCLUDED.gross_profit,
                margin_pct = EXCLUDED.margin_pct,
                health = EXCLUDED.health,
                status = EXCLUDED.status,
                updated_at = EXCLUDED.updated_at
            """,
            """
            INSERT INTO proposal_integrated_node
                (proposal_id, tenant_id, total_cost, total_price, gross_profit, margin_pct, health, status, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (proposal_id) DO UPDATE SET
                total_cost = excluded.total_cost,
                total_price = excluded.total_price,
                gross_profit = excluded.gross_profit,
                margin_pct = excluded.margin_pct,
                health = excluded.health,
                status = excluded.status,
                updated_at = excluded.updated_at
            """,
            (
                proposal_id,
                tenant_id,
                total_cost,
                total_price,
                gross_profit,
                margin_pct,
                health,
                "open",
                updated_at,
            ),
        )

    return {
        "proposal_id": proposal_id,
        "total_cost": total_cost,
        "total_price": total_price,
        "gross_profit": gross_profit,
        "margin_pct": margin_pct,
        "health": health,
    }


# =========================
# Cierre y auditoría
# =========================

def _hash_proposal_snapshot(proposal: Dict[str, Any], items: List[Dict[str, Any]], integrated: Dict[str, Any]) -> str:
    payload = {
        "proposal": proposal,
        "items": sorted(items, key=lambda x: (x.get("item_number"), x.get("item_id"))),
        "integrated": integrated,
    }
    serialized = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def close_proposal(proposal_id: str, context: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id, _ = require_context(context)

    with get_cursor() as cur:
        proposal = _ensure_proposal_open(cur, proposal_id, tenant_id)

        _execute(
            cur,
            "UPDATE proposal_items SET status = %s WHERE proposal_id = %s AND tenant_id = %s",
            "UPDATE proposal_items SET status = ? WHERE proposal_id = ? AND tenant_id = ?",
            ("closed", proposal_id, tenant_id),
        )

        _execute(
            cur,
            "UPDATE proposal_integrated_node SET status = %s WHERE proposal_id = %s AND tenant_id = %s",
            "UPDATE proposal_integrated_node SET status = ? WHERE proposal_id = ? AND tenant_id = ?",
            ("closed", proposal_id, tenant_id),
        )

        closed_at = _now_iso()
        _execute(
            cur,
            "UPDATE proposals SET status = %s, closed_at = %s WHERE proposal_id = %s AND tenant_id = %s",
            "UPDATE proposals SET status = ?, closed_at = ? WHERE proposal_id = ? AND tenant_id = ?",
            ("closed", closed_at, proposal_id, tenant_id),
        )

        items = _fetchall(
            cur,
            "SELECT * FROM proposal_items WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT * FROM proposal_items WHERE proposal_id = ? AND tenant_id = ?",
            (proposal_id, tenant_id),
        )

        integrated = _fetchone(
            cur,
            "SELECT * FROM proposal_integrated_node WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT * FROM proposal_integrated_node WHERE proposal_id = ? AND tenant_id = ?",
            (proposal_id, tenant_id),
        ) or {}

        event_hash = _hash_proposal_snapshot(proposal, items, integrated)
        event_id = str(uuid.uuid4())
        payload = json.dumps({"proposal": proposal_id, "hash": event_hash}, sort_keys=True)

        _execute(
            cur,
            """
            INSERT INTO proposal_audit_events
                (event_id, tenant_id, proposal_id, event_type, event_hash, created_at, payload)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            """
            INSERT INTO proposal_audit_events
                (event_id, tenant_id, proposal_id, event_type, event_hash, created_at, payload)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                tenant_id,
                proposal_id,
                "close_proposal",
                event_hash,
                closed_at,
                payload,
            ),
        )

    return {"proposal_id": proposal_id, "status": "closed", "hash": event_hash}


# =========================
# Derivación
# =========================

def derive_proposal(base_proposal_id: str, context: Dict[str, Any]) -> str:
    tenant_id, user_id = require_context(context)

    with get_cursor() as cur:
        _ensure_proposal_closed(cur, base_proposal_id, tenant_id)

        new_proposal_id = str(uuid.uuid4())
        created_at = _now_iso()
        _insert_proposal(cur, new_proposal_id, tenant_id, user_id, "derived", created_at)

        base_items = _fetchall(
            cur,
            "SELECT * FROM proposal_items WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT * FROM proposal_items WHERE proposal_id = ? AND tenant_id = ?",
            (base_proposal_id, tenant_id),
        )

        for item in base_items:
            new_item_id = str(uuid.uuid4())
            created_at = _now_iso()

            _execute(
                cur,
                """
                INSERT INTO proposal_items (
                    item_id, tenant_id, proposal_id, item_number, quantity, sku, description,
                    cost_unit, price_unit, subtotal_cost, subtotal_price, status, origin,
                    component_type, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                """
                INSERT INTO proposal_items (
                    item_id, tenant_id, proposal_id, item_number, quantity, sku, description,
                    cost_unit, price_unit, subtotal_cost, subtotal_price, status, origin,
                    component_type, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    new_item_id,
                    tenant_id,
                    new_proposal_id,
                    item.get("item_number"),
                    item.get("quantity"),
                    item.get("sku"),
                    item.get("description"),
                    item.get("cost_unit"),
                    item.get("price_unit"),
                    item.get("subtotal_cost"),
                    item.get("subtotal_price"),
                    "open",
                    item.get("origin"),
                    item.get("component_type"),
                    created_at,
                ),
            )

        created_at = _now_iso()
        _execute(
            cur,
            """
            INSERT INTO proposal_derivations (base_proposal_id, derived_proposal_id, tenant_id, created_at)
            VALUES (%s, %s, %s, %s)
            """,
            """
            INSERT INTO proposal_derivations (base_proposal_id, derived_proposal_id, tenant_id, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (base_proposal_id, new_proposal_id, tenant_id, created_at),
        )

    recalculate_integrated_node(new_proposal_id, context)

    return new_proposal_id


# =========================
# Rentabilidad
# =========================

def add_project_expense(proposal_id: str, expense: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id, _ = require_context(context)

    category = expense.get("category")
    description = expense.get("description")
    amount = expense.get("amount")

    if not category or amount is None:
        raise ValueError("Expense inválido")

    with get_cursor() as cur:
        _ensure_proposal_closed(cur, proposal_id, tenant_id)

        expense_id = str(uuid.uuid4())
        created_at = _now_iso()

        _execute(
            cur,
            """
            INSERT INTO project_expenses (expense_id, tenant_id, proposal_id, category, description, amount, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            """
            INSERT INTO project_expenses (expense_id, tenant_id, proposal_id, category, description, amount, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (expense_id, tenant_id, proposal_id, category, description, float(amount), created_at),
        )

    return recalculate_profitability_node(proposal_id, context)


def recalculate_profitability_node(proposal_id: str, context: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id, _ = require_context(context)

    with get_cursor() as cur:
        integrated = _fetchone(
            cur,
            "SELECT * FROM proposal_integrated_node WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT * FROM proposal_integrated_node WHERE proposal_id = ? AND tenant_id = ?",
            (proposal_id, tenant_id),
        )

        if not integrated:
            raise ValueError("Nodo integrado no encontrado")

        expenses = _fetchall(
            cur,
            "SELECT amount FROM project_expenses WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT amount FROM project_expenses WHERE proposal_id = ? AND tenant_id = ?",
            (proposal_id, tenant_id),
        )

        total_expenses = sum(float(e["amount"]) for e in expenses) if expenses else 0.0

        gross_profit = integrated.get("gross_profit")
        total_price = integrated.get("total_price")

        if gross_profit is None or total_price is None:
            net_profit = None
            net_margin_pct = None
        else:
            net_profit = float(gross_profit) - float(total_expenses)
            net_margin_pct = net_profit / float(total_price) if float(total_price) > 0 else None

        health = evaluate_net_health(net_margin_pct)
        updated_at = _now_iso()

        _execute(
            cur,
            """
            INSERT INTO proposal_profitability_node
                (proposal_id, tenant_id, total_sales, total_cost, total_expenses, net_profit, net_margin_pct, health, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (proposal_id) DO UPDATE SET
                total_sales = EXCLUDED.total_sales,
                total_cost = EXCLUDED.total_cost,
                total_expenses = EXCLUDED.total_expenses,
                net_profit = EXCLUDED.net_profit,
                net_margin_pct = EXCLUDED.net_margin_pct,
                health = EXCLUDED.health,
                updated_at = EXCLUDED.updated_at
            """,
            """
            INSERT INTO proposal_profitability_node
                (proposal_id, tenant_id, total_sales, total_cost, total_expenses, net_profit, net_margin_pct, health, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (proposal_id) DO UPDATE SET
                total_sales = excluded.total_sales,
                total_cost = excluded.total_cost,
                total_expenses = excluded.total_expenses,
                net_profit = excluded.net_profit,
                net_margin_pct = excluded.net_margin_pct,
                health = excluded.health,
                updated_at = excluded.updated_at
            """,
            (
                proposal_id,
                tenant_id,
                integrated.get("total_price"),
                integrated.get("total_cost"),
                total_expenses,
                net_profit,
                net_margin_pct,
                health,
                updated_at,
            ),
        )

    return {
        "proposal_id": proposal_id,
        "total_sales": integrated.get("total_price"),
        "total_cost": integrated.get("total_cost"),
        "total_expenses": total_expenses,
        "net_profit": net_profit,
        "net_margin_pct": net_margin_pct,
        "health": health,
    }


# =========================
# Comparación
# =========================

def compare_proposals(base_id: str, derived_id: str, context: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id, _ = require_context(context)

    with get_cursor() as cur:
        base_node = _fetchone(
            cur,
            "SELECT * FROM proposal_integrated_node WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT * FROM proposal_integrated_node WHERE proposal_id = ? AND tenant_id = ?",
            (base_id, tenant_id),
        )
        derived_node = _fetchone(
            cur,
            "SELECT * FROM proposal_integrated_node WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT * FROM proposal_integrated_node WHERE proposal_id = ? AND tenant_id = ?",
            (derived_id, tenant_id),
        )

        if not base_node or not derived_node:
            raise ValueError("Nodos integrados no encontrados")

        base_items = _fetchall(
            cur,
            "SELECT item_number, quantity, price_unit, subtotal_price FROM proposal_items WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT item_number, quantity, price_unit, subtotal_price FROM proposal_items WHERE proposal_id = ? AND tenant_id = ?",
            (base_id, tenant_id),
        )
        derived_items = _fetchall(
            cur,
            "SELECT item_number, quantity, price_unit, subtotal_price FROM proposal_items WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT item_number, quantity, price_unit, subtotal_price FROM proposal_items WHERE proposal_id = ? AND tenant_id = ?",
            (derived_id, tenant_id),
        )

    def _num(value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    base_map = {i["item_number"]: i for i in base_items}
    derived_map = {i["item_number"]: i for i in derived_items}
    all_numbers = sorted(set(base_map.keys()) | set(derived_map.keys()))

    drilldown = []
    for number in all_numbers:
        base_item = base_map.get(number)
        derived_item = derived_map.get(number)
        drilldown.append(
            {
                "item_number": number,
                "base": base_item,
                "derived": derived_item,
                "delta_quantity": _num((derived_item or {}).get("quantity")) - _num((base_item or {}).get("quantity")),
                "delta_price_unit": _num((derived_item or {}).get("price_unit")) - _num((base_item or {}).get("price_unit")),
                "delta_subtotal_price": _num((derived_item or {}).get("subtotal_price")) - _num((base_item or {}).get("subtotal_price")),
            }
        )

    delta_price = (derived_node.get("total_price") or 0) - (base_node.get("total_price") or 0)
    delta_margin = (derived_node.get("margin_pct") or 0) - (base_node.get("margin_pct") or 0)

    return {
        "base": base_node,
        "derived": derived_node,
        "delta_price": delta_price,
        "delta_margin": delta_margin,
        "drilldown": drilldown,
    }


# =========================
# Visualizaciones (solo lectura)
# =========================

def generate_charts_data(proposal_id: str, context: Dict[str, Any]) -> Dict[str, Any]:
    tenant_id, _ = require_context(context)

    with get_cursor() as cur:
        items = _fetchall(
            cur,
            "SELECT component_type, subtotal_price, subtotal_cost FROM proposal_items WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT component_type, subtotal_price, subtotal_cost FROM proposal_items WHERE proposal_id = ? AND tenant_id = ?",
            (proposal_id, tenant_id),
        )

        integrated = _fetchone(
            cur,
            "SELECT * FROM proposal_integrated_node WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT * FROM proposal_integrated_node WHERE proposal_id = ? AND tenant_id = ?",
            (proposal_id, tenant_id),
        )

        profitability = _fetchone(
            cur,
            "SELECT * FROM proposal_profitability_node WHERE proposal_id = %s AND tenant_id = %s",
            "SELECT * FROM proposal_profitability_node WHERE proposal_id = ? AND tenant_id = ?",
            (proposal_id, tenant_id),
        )

    component_contribution: Dict[str, float] = {}
    for item in items:
        comp = item.get("component_type") or "undefined"
        component_contribution[comp] = component_contribution.get(comp, 0.0) + float(item.get("subtotal_price") or 0)

    total_cost = (integrated or {}).get("total_cost") or 0
    total_price = (integrated or {}).get("total_price") or 0
    gross_profit = (integrated or {}).get("gross_profit") or 0

    net_profit = (profitability or {}).get("net_profit") or 0
    total_expenses = (profitability or {}).get("total_expenses") or 0

    return {
        "pie_component_contribution": component_contribution,
        "pie_cost_vs_profit": {
            "total_cost": total_cost,
            "gross_profit": gross_profit,
        },
        "pie_net_distribution": {
            "total_cost": total_cost,
            "total_expenses": total_expenses,
            "net_profit": net_profit,
            "total_sales": total_price,
        },
    }
