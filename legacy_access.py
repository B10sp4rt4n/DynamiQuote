"""Contain the retired Streamlit UI; never use it against a shared tenant DB."""
from contextlib import AbstractContextManager
from typing import Callable, Any


class LegacyIsolationError(RuntimeError):
    pass


def require_legacy_isolation(cursor_factory: Callable[[], AbstractContextManager[Any]], postgres: bool) -> None:
    """Allow a local fresh SQLite database or an existing single-tenant database.

    Count every tenant, including inactive ones: their records remain private.
    Unknown database state denies access. No environment bypass exists.
    This is an entrypoint containment gate, not authorization for library calls.
    """
    try:
        with cursor_factory() as cursor:
            if not postgres:
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tenants'")
                if cursor.fetchone() is None:
                    return  # Local fresh database may run its existing setup.
            cursor.execute("SELECT tenant_id FROM tenants ORDER BY tenant_id LIMIT 2")
            tenants = cursor.fetchall()
            if len(tenants) != 1 or not tenants[0][0]:
                raise LegacyIsolationError("Legacy UI requires a database with exactly one tenant")
    except LegacyIsolationError:
        raise
    except Exception as error:
        raise LegacyIsolationError("Cannot verify legacy database isolation") from error
