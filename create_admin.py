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

from database import create_user, authenticate_user, users_exist

def main():
    print("=" * 60)
    print("  DynamiQuote — Crear Usuario Administrador")
    print("=" * 60)

    alias     = input("Alias (usuario de login): ").strip().lower()
    first     = input("Nombre: ").strip()
    last      = input("Apellido: ").strip()

    import getpass
    password  = getpass.getpass("Contraseña: ")
    password2 = getpass.getpass("Confirmar contraseña: ")

    if not all([alias, first, last, password]):
        print("❌ Todos los campos son obligatorios")
        return

    if password != password2:
        print("❌ Las contraseñas no coinciden")
        return

    role = input("Rol [admin/user] (Enter = admin): ").strip().lower() or "admin"
    if role not in ("admin", "user"):
        role = "admin"

    ok, msg = create_user(alias, first, last, password, role=role)
    if ok:
        print(f"\n✅ {msg}")
        print(f"   Alias : {alias}")
        print(f"   Nombre: {first} {last}")
        print(f"   Rol   : {role}")
        # Verificación rápida
        user = authenticate_user(alias, password)
        if user:
            print("✅ Credenciales verificadas — puedes iniciar sesión")
        else:
            print("⚠️  No se pudo verificar — revisa la BD")
    else:
        print(f"\n❌ {msg}")

if __name__ == "__main__":
    main()
