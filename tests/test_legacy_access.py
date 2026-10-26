import ast
import sqlite3
from contextlib import contextmanager
from pathlib import Path

import pytest
from legacy_access import LegacyIsolationError, require_legacy_isolation


@contextmanager
def memory_cursor():
    connection = sqlite3.connect(":memory:")
    try:
        yield connection.cursor()
    finally:
        connection.close()


def fixture_cursor(rows):
    @contextmanager
    def factory():
        with memory_cursor() as cur:
            cur.execute("CREATE TABLE tenants(tenant_id TEXT, active INTEGER)")
            cur.executemany("INSERT INTO tenants VALUES (?, ?)", rows)
            yield cur
    return factory


def test_new_local_sqlite_can_initialize():
    require_legacy_isolation(memory_cursor, postgres=False)


def test_single_tenant_can_use_legacy_ui():
    require_legacy_isolation(fixture_cursor([("a", 1)]), postgres=False)


@pytest.mark.parametrize("rows", [[], [("a", 1), ("b", 1)], [("a", 1), ("b", 0)], [(None, 1)]])
def test_empty_invalid_or_shared_databases_are_denied(rows):
    with pytest.raises(LegacyIsolationError):
        require_legacy_isolation(fixture_cursor(rows), postgres=False)


def test_missing_postgres_schema_fails_closed():
    with pytest.raises(LegacyIsolationError):
        require_legacy_isolation(memory_cursor, postgres=True)


def test_connection_failure_fails_closed():
    @contextmanager
    def broken():
        raise ConnectionError("unreachable")
        yield
    with pytest.raises(LegacyIsolationError):
        require_legacy_isolation(broken, postgres=True)


def test_streamlit_entrypoint_checks_isolation_before_setup():
    tree = ast.parse((Path(__file__).resolve().parents[1] / "app.py").read_text())
    gate = next(n for n in tree.body if isinstance(n, ast.Try) and any(
        isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id == "require_legacy_isolation"
        for c in ast.walk(n)))
    setup = [c.lineno for c in ast.walk(tree) if isinstance(c, ast.Call) and isinstance(c.func, ast.Name) and c.func.id in {"init_database", "run_migrations"}]
    assert gate.lineno < min(setup)
    assert any(isinstance(c, ast.Call) and isinstance(c.func, ast.Attribute) and c.func.attr == "stop" for c in ast.walk(gate))
