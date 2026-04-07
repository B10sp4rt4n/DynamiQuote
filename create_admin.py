"""
Script interactivo para crear usuario administrador.
Ejecutar: python create_admin.py
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Asegura que database.py esté disponible
sys.path.insert(0, os.path.dirname(__file__))

from database import create_user, authenticate_user, users_exist, create_tenant, get_all_tenants, tenants_exist

def main():
    print("=" * 60)
    print("  DynamiQuote — Crear Usuario Administrador")
    print("=" * 60)

    # ── Sección empresa ──────────────────────────────────────────
    tenant_id = None
    if tenants_exist():
        tenants = get_all_tenants()
        print("\nEmpresas registradas:")
        for i, t in enumerate(tenants, 1):
            estado = "✅" if t['active'] else "❌"
            print(f"  {i}. {estado} {t['name']}  (slug: {t['slug']})")
        print(f"  {len(tenants)+1}. Crear nueva empresa")
        opcion = input(f"\nSelecciona empresa [1-{len(tenants)+1}]: ").strip()
        try:
            idx = int(opcion) - 1
            if 0 <= idx < len(tenants):
                tenant_id = tenants[idx]['tenant_id']
                print(f"✅ Empresa seleccionada: {tenants[idx]['name']}")
            else:
                tenant_id = _crear_empresa()
        except (ValueError, IndexError):
            tenant_id = _crear_empresa()
    else:
        print("\n⚙️  No hay empresas registradas. Crea la primera empresa.")
        tenant_id = _crear_empresa()

    if not tenant_id:
        print("❌ Se necesita una empresa para crear el usuario")
        return

    # ── Datos del usuario ────────────────────────────────────────
    print()
    alias     = input("Alias (usuario de login): ").strip().lower()
    first     = input("Nombre: ").strip()
    last      = input("Apellido: ").strip()
    seller_code = input("Código de vendedor (ej. JGP, opcional, Enter para omitir): ").strip().upper() or None

    import getpass
    password  = getpass.getpass("Contraseña: ")
    password2 = getpass.getpass("Confirmar contraseña: ")

    if not all([alias, first, last, password]):
        print("❌ Todos los campos obligatorios son requeridos")
        return

    if password != password2:
        print("❌ Las contraseñas no coinciden")
        return

    role = input("Rol [admin/user] (Enter = admin): ").strip().lower() or "admin"
    if role not in ("admin", "user"):
        role = "admin"

    ok, msg = create_user(alias, first, last, password, role=role, tenant_id=tenant_id, seller_code=seller_code)
    if ok:
        print(f"\n✅ {msg}")
        print(f"   Alias        : {alias}")
        print(f"   Nombre       : {first} {last}")
        print(f"   Rol          : {role}")
        if seller_code:
            print(f"   Cód. vendedor: {seller_code}")
        # Verificación rápida
        user = authenticate_user(alias, password)
        if user:
            print("✅ Credenciales verificadas — puedes iniciar sesión")
        else:
            print("⚠️  No se pudo verificar — revisa la BD")
    else:
        print(f"\n❌ {msg}")


def _crear_empresa() -> str | None:
    """Solicita datos de una nueva empresa y la registra. Retorna tenant_id o None."""
    print()
    nombre = input("Nombre de la empresa: ").strip()
    slug   = input("Slug único (min. letras y guiones, ej. acme-corp): ").strip().lower()
    if not nombre or not slug:
        print("❌ Nombre y slug son obligatorios")
        return None
    ok, msg, tenant_id = create_tenant(nombre, slug)
    if ok:
        print(f"✅ {msg}")
        return tenant_id
    else:
        print(f"❌ {msg}")
        return None


if __name__ == "__main__":
    main()
