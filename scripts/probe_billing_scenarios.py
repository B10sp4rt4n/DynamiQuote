"""Offline characterization of the pinned Digestor builder, NOT fiscal acceptance.

Run with Digestor's fiscal-test virtualenv and --digestor-root <checkout>.
No startup/lifespan, database connection, HTTP server, PAC or AI request.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
from decimal import Decimal
from unittest.mock import Mock, patch
from xml.etree import ElementTree as ET

PINNED_SOURCE = "38f064a706461a9fcbad541bd9e421e2f73545da"


def forbidden(*args, **kwargs):
    raise AssertionError("Database/network/PAC access forbidden in billing review")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--digestor-root", required=True, type=Path)
    args = parser.parse_args()
    source = args.digestor_root.resolve()
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
    if sha != PINNED_SOURCE:
        raise SystemExit("Use the pinned Digestor source; a new version needs a new review")
    # Do not inherit service credentials or read a checkout's local .env.
    os.environ.clear()
    os.environ.update(PATH=os.defpath, HOME="/tmp", DATABASE_URL="sqlite:///:memory:",
                      DB_SSL_REQUIRE="false", AUTH_CONNECTOR="jwt", FISCAL_MAINTENANCE_MODE="true",
                      PYTHONDONTWRITEBYTECODE="1")
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(source))
    with tempfile.TemporaryDirectory(prefix="cotiza-billing-probe-") as clean_cwd:
        os.chdir(clean_cwd)
        from sqlalchemy.engine import Engine
        import requests
        with patch.object(socket.socket, "connect", forbidden), patch.object(Engine, "connect", forbidden), \
                patch.object(requests.Session, "request", forbidden):
            from app.api.routers import commercial_v1 as api
            from app.schemas.commercial import DraftItemInput, BillingDraftCreateRequest
            from app.models.commercial import BillingDraft
            # Register relationships as the existing isolated fiscal tests do.
            from app.models.csf import CSF  # noqa: F401
            from app.models.sucursal import Sucursal  # noqa: F401
            from app.models.usuario import Usuario  # noqa: F401
            from app.models.evento import EventoFacturacion  # noqa: F401
            observations = []

            def probe(case, **overrides):
                item_args = {"description": "Synthetic license", "quantity": 1, "unit_price": 100,
                             "tax_rate": 0.16, **overrides.pop("item", {})}
                no_database = Mock()
                no_database.query.side_effect = forbidden
                item = api._resolve_item_payload(no_database, "synthetic", DraftItemInput(**item_args))
                fields = {
                    "id": "synthetic", "company_id": "synthetic", "customer_name": "SYNTHETIC CUSTOMER",
                    "customer_rfc": "AAA010101AAA", "customer_zip": "01000", "customer_regimen": "601",
                    "customer_use_cfdi": "G03", "emitter_name": "SYNTHETIC EMITTER",
                    "emitter_rfc": "EKU9003173C9", "emitter_regimen": "601", "place_of_issue": "01000",
                    "payment_method": "PUE", "payment_form": "03", "currency": "MXN", "items": [item],
                    **overrides,
                }
                draft = BillingDraft(**fields)
                api._recalculate_draft(draft)
                root = ET.fromstring(api._build_cfdi_xml(draft))
                ns = {"c": "http://www.sat.gob.mx/cfd/4"}
                concept = root.find("c:Conceptos/c:Concepto", ns)
                receiver = root.find("c:Receptor", ns)
                observations.append({
                    "case": case, "ready_to_stamp": not api._missing_fields(draft),
                    "currency": root.get("Moneda"), "exchange_rate": root.get("TipoCambio"),
                    "payment_method": root.get("MetodoPago"), "payment_form": root.get("FormaPago"),
                    "type": root.get("TipoDeComprobante"), "subtotal": root.get("SubTotal"),
                    "taxes": draft.taxes, "total": root.get("Total"),
                    "product_code": concept.get("ClaveProdServ"), "unit_code": concept.get("ClaveUnidad"),
                    "quantity_xml": concept.get("Cantidad"), "unit_price_xml": concept.get("ValorUnitario"),
                    "amount_xml": concept.get("Importe"),
                    "quantity_times_price_xml": str(Decimal(concept.get("Cantidad")) * Decimal(concept.get("ValorUnitario"))),
                    "has_concept_tax": concept.find("c:Impuestos", ns) is not None,
                    "receiver_name": receiver.get("Nombre"), "receiver_regimen": receiver.get("RegimenFiscalReceptor"),
                    "receiver_use": receiver.get("UsoCFDI"),
                    "has_global_node": root.find("c:InformacionGlobal", ns) is not None,
                })

            with patch.object(api.timbracfdi_client, "timbra_cfdi", forbidden):
                probe("mxn_pue_16_standard")
                probe("ppd_with_transfer_03", payment_method="PPD")
                probe("usd_without_exchange", currency="USD")
                probe("vat_zero_taxable", item={"tax_rate": 0})
                probe("not_taxable_backend", item={"tax_object": "01", "tax_rate": 0})
                probe("foreign_generic_rfc", customer_rfc="XEXX010101000", customer_name="SYNTHETIC FOREIGN CUSTOMER")
                probe("fractional_quantity", item={"quantity": 1.234, "unit_price": 100})
                probe("fractional_unit_price", item={"quantity": 100, "unit_price": 1.234})
                probe("explicit_backend_sat_code", item={"sat_product_code": "80101500", "unit_code": "E48"})
                supplied = {"currency": "USD", "exchange_rate": 20, "cfdi_type": "E",
                            "related_uuid": "synthetic-not-a-uuid", "discount": 10, "items": []}
                accepted = BillingDraftCreateRequest.model_validate(supplied).model_dump()
                print(json.dumps({
                    "source_commit": sha, "assurance": "offline_characterization_not_SAT_or_PAC_validation",
                    "network": "blocked", "observations": observations,
                    "unsupported_fields_dropped_by_schema": [key for key in supplied if key not in accepted],
                }, indent=2))


if __name__ == "__main__":
    main()
