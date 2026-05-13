#!/usr/bin/env python3
"""
Importador de Aspel SAE 5.0 → POS System (Next.js + Prisma + SQLite)

Lee archivos DBF de Aspel SAE 5.0 y los importa a la base de datos
SQLite del POS System.

Uso:
  # Importar todo desde carpeta de Aspel
  python scripts/import-aspel.py --aspel-dir /ruta/a/Aspel/SAE50/Datos/

  # Importar solo productos
  python scripts/import-aspel.py --aspel-dir /ruta/ --only products

  # Importar y generar respaldo
  python scripts/import-aspel.py --aspel-dir /ruta/ --backup

  # Limpiar BD antes de importar
  python scripts/import-aspel.py --aspel-dir /ruta/ --clean
"""

import os
import sys
import sqlite3
import argparse
import json
from datetime import datetime
from pathlib import Path

# Try dbfread first, fall back to csv if not available
try:
    from dbfread import DBF
    HAS_DBFREAD = True
except ImportError:
    HAS_DBFREAD = False
    print("⚠️  dbfread no instalado. Solo soporte CSV disponible.")
    print("   Instalar: pip install dbfread")

# ─── CONFIGURACIÓN ───────────────────────────────────────────────

# Default Aspel SAE 5.0 data paths (common)
ASPEL_DEFAULT_PATHS = [
    "C:\\Aspel\\SAE\\Datos50",
    "C:\\AspelSAE50\\Datos",
    "D:\\Aspel\\SAE\\Datos50",
    "C:\\Program Files\\Aspel\\SAE\\Datos50",
]

# POS Database path (relative to project root or absolute)
POS_DB_PATH = "prisma/dev.db"

# Encoding for DBF files (Aspel uses DOS/Latin encoding)
DBF_ENCODING = "latin1"  # or cp850

# ─── FIELD MAPPINGS ──────────────────────────────────────────────

# PRODUCTOS.DBF → Product model
PRODUCT_MAPPING = {
    "codigo": ("barcode", lambda v: str(v or "").strip()),
    "descripc": ("name", lambda v: str(v or "").strip().title()),
    "linea": ("_linea", lambda v: str(v or "").strip()),
    "unidad": ("_unidad", lambda v: str(v or "").strip()),
    "precio1": ("price", lambda v: float(v or 0)),
    "precio2": ("_price2", lambda v: float(v or 0)),
    "precio3": ("_price3", lambda v: float(v or 0)),
    "costo": ("cost", lambda v: float(v or 0)),
    "existencia": ("stock", lambda v: max(0, int(float(v or 0)))),
    "stock_min": ("minStock", lambda v: max(0, int(float(v or 0)))),
    "stock_max": ("_stock_max", lambda v: int(float(v or 0))),
    "iu": ("active", lambda v: v not in (False, "N", "n", 0) if v is not None else True),
    "fecha_ult": ("_fecha_ult", lambda v: str(v or "")),
    "dias": ("_dias_surtir", lambda v: int(v or 0)),
}

# PROVEEDORES.DBF → Supplier model
SUPPLIER_MAPPING = {
    "clave": ("_clave", lambda v: str(v or "").strip()),
    "nombre": ("name", lambda v: str(v or "").strip().title()),
    "rfc": ("_rfc", lambda v: str(v or "").strip().upper()),
    "calle": ("_calle", lambda v: str(v or "").strip().title()),
    "colonia": ("_colonia", lambda v: str(v or "").strip().title()),
    "ciudad": ("_ciudad", lambda v: str(v or "").strip().title()),
    "estado": ("_estado", lambda v: str(v or "").strip().title()),
    "cp": ("_cp", lambda v: str(v or "").strip()),
    "telefono": ("phone", lambda v: str(v or "").strip()),
    "e_mail": ("email", lambda v: str(v or "").strip().lower()),
}

# CLIENTES.DBF → (for future customer module)
CUSTOMER_MAPPING = {
    "clave": ("_clave", lambda v: str(v or "").strip()),
    "nombre": ("name", lambda v: str(v or "").strip().title()),
    "rfc": ("rfc", lambda v: str(v or "").strip().upper()),
    "calle": ("_calle", lambda v: str(v or "").strip().title()),
    "colonia": ("_colonia", lambda v: str(v or "").strip().title()),
    "ciudad": ("_ciudad", lambda v: str(v or "").strip().title()),
    "estado": ("_estado", lambda v: str(v or "").strip().title()),
    "cp": ("cp", lambda v: str(v or "").strip()),
    "telefono": ("phone", lambda v: str(v or "").strip()),
    "e_mail": ("email", lambda v: str(v or "").strip().lower()),
    "listaprec": ("_price_list", lambda v: str(v or "1")),
}

# LINEAS.DBF → Department
LINEA_MAPPING = {
    "clave": ("_clave", lambda v: str(v or "").strip()),
    "descripc": ("name", lambda v: str(v or "").strip().title()),
}


# ─── HELPERS ─────────────────────────────────────────────────────

def normalize_field_name(name):
    """Strip suffixes that Aspel sometimes adds to field names."""
    name = name.strip().lower()
    # Remove trailing numeric suffixes like _1, _2
    for suffix in ["_1", "_2", "_3", "_4"]:
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break
    return name


def read_dbf(filepath, encoding=DBF_ENCODING):
    """Read a DBF file and return list of dicts."""
    if not os.path.exists(filepath):
        print(f"  ⚠️  Archivo no encontrado: {filepath}")
        return []

    try:
        table = DBF(filepath, encoding=encoding, ignore_missing_memofile=True)
        records = list(table)
        print(f"  ✓ {os.path.basename(filepath)}: {len(records)} registros")
        return records
    except Exception as e:
        print(f"  ⚠️  Error leyendo {filepath}: {e}")
        # Try with different encoding
        try:
            table = DBF(filepath, encoding="cp850", ignore_missing_memofile=True)
            records = list(table)
            print(f"  ✓ {os.path.basename(filepath)} (cp850): {len(records)} registros")
            return records
        except Exception as e2:
            print(f"  ✗ Error fatal: {e2}")
            return []


def normalize_aspel_value(value):
    """Convert Aspel DBF values to Python types."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, bool):
        return value
    return str(value)


def apply_mapping(record, mapping):
    """Apply a field mapping dict to a DBF record, returning a dict
    of (target_field → transformed_value)."""
    result = {}
    raw = {}
    for dbf_field, (target_field, transform) in mapping.items():
        # Find the field in the record (case-insensitive)
        val = None
        for key in record.keys():
            if key.lower() == dbf_field.lower():
                val = normalize_aspel_value(record[key])
                break
        if val is not None:
            try:
                result[target_field] = transform(val)
            except (ValueError, TypeError) as e:
                print(f"    ⚠️  Error transformando {dbf_field}='{val}': {e}")
                result[target_field] = None
            raw[dbf_field] = val
    return result, raw


# ─── DATABASE OPERATIONS ────────────────────────────────────────

def connect_db(db_path):
    """Connect to the POS SQLite database."""
    db_path = Path(db_path)
    if not db_path.exists():
        print(f"⚠️  Base de datos no encontrada: {db_path}")
        print("   Ejecuta 'npx prisma db push' primero para crearla.")
        return None
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    return conn


def get_departments(conn, lineas):
    """Create departments from LINEAS data and return a CLAVE→ID map."""
    cursor = conn.cursor()

    # Get existing departments
    cursor.execute("SELECT id, name FROM departments")
    existing = {row["name"].lower(): row["id"] for row in cursor.fetchall()}

    linea_map = {}  # clave → department_id

    if lineas:
        created = 0
        for rec in lineas:
            mapped, raw = apply_mapping(rec, LINEA_MAPPING)
            name = mapped.get("name", "")
            clave = mapped.get("_clave", "")
            if not name:
                name = clave
            if not name:
                continue

            key = name.lower()
            if key in existing:
                linea_map[clave.lower()] = existing[key]
            else:
                now = datetime.now().isoformat()
                try:
                    cursor.execute(
                        "INSERT INTO departments (name, description, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                        (name, f"Importado de Aspel ({clave})", 1, now, now),
                    )
                    dept_id = cursor.lastrowid
                    existing[key] = dept_id
                    linea_map[clave.lower()] = dept_id
                    created += 1
                except sqlite3.IntegrityError:
                    pass
        if created:
            print(f"\n  📁 Departamentos creados: {created}")

    return linea_map


def get_suppliers(conn, proveedores):
    """Create suppliers from PROVEEDORES data and return a CLAVE→ID map."""
    cursor = conn.cursor()

    cursor.execute("SELECT id, name FROM suppliers")
    existing = {row["name"].lower(): row["id"] for row in cursor.fetchall()}

    prov_map = {}
    created = 0

    for rec in proveedores:
        mapped, raw = apply_mapping(rec, SUPPLIER_MAPPING)
        name = mapped.get("name", "")
        if not name:
            continue

        # Build address from components
        address_parts = [
            mapped.get("_calle", ""),
            mapped.get("_colonia", ""),
            mapped.get("_ciudad", ""),
            mapped.get("_estado", ""),
        ]
        address = ", ".join(p for p in address_parts if p)

        key = name.lower()
        if key in existing:
            prov_map[mapped.get("_clave", "").lower()] = existing[key]
        else:
            now = datetime.now().isoformat()
            try:
                cursor.execute(
                    """INSERT INTO suppliers (name, contact, phone, email, address, active, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        name,
                        raw.get("rfc", ""),
                        mapped.get("phone", ""),
                        mapped.get("email", ""),
                        address,
                        1,
                        now,
                        now,
                    ),
                )
                sup_id = cursor.lastrowid
                existing[key] = sup_id
                prov_map[mapped.get("_clave", "").lower()] = sup_id
                created += 1
            except sqlite3.IntegrityError:
                pass

    if created:
        print(f"\n  👥 Proveedores creados: {created}")

    return prov_map


def import_products(conn, productos, linea_map, prov_map, clean=False):
    """Import products from PRODUCTOS data."""
    cursor = conn.cursor()

    if clean:
        print("\n  🧹 Limpiando productos existentes...")
        cursor.execute("DELETE FROM sale_items")
        cursor.execute("DELETE FROM sales")
        cursor.execute("DELETE FROM product_lines")
        cursor.execute("DELETE FROM products")

    cursor.execute("SELECT id, barcode FROM products")
    existing_barcodes = {row["barcode"]: row["id"] for row in cursor.fetchall() if row["barcode"]}

    imported = 0
    skipped = 0
    errors = 0

    print(f"\n  📦 Importando productos...")
    for i, rec in enumerate(productos):
        mapped, raw = apply_mapping(rec, PRODUCT_MAPPING)
        name = mapped.get("name", "")
        barcode = mapped.get("barcode", "")
        price = mapped.get("price", 0)
        cost = mapped.get("cost", 0)
        stock = mapped.get("stock", 0)
        min_stock = mapped.get("minStock", 5)
        active = mapped.get("active", True)

        if not name:
            skipped += 1
            continue

        # Map department via línea
        linea_clave = mapped.get("_linea", "").lower()
        dept_id = linea_map.get(linea_clave) if linea_clave else None

        # Skip if barcode already exists
        if barcode and barcode in existing_barcodes:
            skipped += 1
            continue

        now = datetime.now().isoformat()
        try:
            cursor.execute(
                """INSERT INTO products (name, barcode, price, cost, stock, min_stock, active, department_id, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (name, barcode, price, cost, stock, min_stock, 1 if active else 0, dept_id, now, now),
            )
            if barcode:
                existing_barcodes[barcode] = cursor.lastrowid
            imported += 1
            if imported % 100 == 0:
                print(f"    ... {imported} productos importados")
        except sqlite3.IntegrityError as e:
            errors += 1
            if errors <= 5:
                print(f"    ⚠️  Error importando '{name}': {e}")

    conn.commit()
    print(f"\n  ✅ Productos: {imported} importados, {skipped} omitidos, {errors} errores")
    return imported


# ─── MAIN ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Importar datos de Aspel SAE 5.0 al POS System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python scripts/import-aspel.py --aspel-dir "C:\\Aspel\\SAE\\Datos50"
  python scripts/import-aspel.py --aspel-dir /mnt/windows/Aspel/SAE/Datos50/ --only products
  python scripts/import-aspel.py --aspel-dir /ruta/ --backup --clean
  python scripts/import-aspel.py --csv-dir ./exports/ --only suppliers
        """,
    )
    parser.add_argument("--aspel-dir", help="Ruta a la carpeta de datos de Aspel SAE")
    parser.add_argument("--csv-dir", help="Ruta a carpeta con archivos CSV exportados")
    parser.add_argument(
        "--only",
        choices=["products", "suppliers", "departments", "customers", "all"],
        default="all",
        help="Solo importar esta entidad",
    )
    parser.add_argument("--db", default=POS_DB_PATH, help=f"Ruta a la BD del POS (default: {POS_DB_PATH})")
    parser.add_argument("--clean", action="store_true", help="Limpiar datos existentes antes de importar")
    parser.add_argument("--backup", action="store_true", help="Crear respaldo de la BD antes de importar")
    parser.add_argument("--dry-run", action="store_true", help="Solo mostrar qué se importaría (no escribir)")
    parser.add_argument("--encoding", default=DBF_ENCODING, help=f"Encoding de DBF (default: {DBF_ENCODING})")
    parser.add_argument("--json", help="Exportar datos a archivo JSON en lugar de importar a BD")

    args = parser.parse_args()

    print("╔══════════════════════════════════════════════╗")
    print("║   🚀 Importador Aspel SAE 5.0 → POS System  ║")
    print("╚══════════════════════════════════════════════╝")
    print()

    # ─── DATA SOURCE ───────────────────────────────────────

    productos = []
    proveedores = []
    clientes = []
    lineas = []
    encoding = args.encoding

    if args.aspel_dir:
        data_dir = Path(args.aspel_dir)
        if not data_dir.exists():
            print(f"❌ Carpeta no encontrada: {data_dir}")
            sys.exit(1)

        print(f"📂 Leyendo datos de: {data_dir}")
        print(f"🔤 Encoding: {encoding}")

        if args.only in ("all", "products", "departments"):
            productos = read_dbf(str(data_dir / "PRODUCTOS.DBF"), encoding)
        if args.only in ("all", "departments"):
            lineas = read_dbf(str(data_dir / "LINEAS.DBF"), encoding)
        if args.only in ("all", "suppliers"):
            proveedores = read_dbf(str(data_dir / "PROVEEDORES.DBF"), encoding)
        if args.only in ("all", "customers"):
            clientes = read_dbf(str(data_dir / "CLIENTES.DBF"), encoding)

    elif args.csv_dir:
        csv_dir = Path(args.csv_dir)
        if not csv_dir.exists():
            print(f"❌ Carpeta no encontrada: {csv_dir}")
            sys.exit(1)

        import csv

        print(f"📂 Leyendo CSV de: {csv_dir}")

        def read_csv(filepath):
            records = []
            if filepath.exists():
                with open(filepath, encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        records.append(row)
            return records

        if args.only in ("all", "products"):
            productos = read_csv(csv_dir / "productos.csv")
        if args.only in ("all", "suppliers"):
            proveedores = read_csv(csv_dir / "proveedores.csv")
        if args.only in ("all", "customers"):
            clientes = read_csv(csv_dir / "clientes.csv")

        print(f"  ✓ Productos CSV: {len(productos)}")
        print(f"  ✓ Proveedores CSV: {len(proveedores)}")
        print(f"  ✓ Clientes CSV: {len(clientes)}")
    else:
        print("❌ Debes especificar --aspel-dir o --csv-dir")
        print("\nEjemplo:")
        print('  python scripts/import-aspel.py --aspel-dir "C:\\Aspel\\SAE\\Datos50"')
        print('  python scripts/import-aspel.py --csv-dir "./exports/"')
        sys.exit(1)

    # Summary
    total_records = len(productos) + len(proveedores) + len(clientes) + len(lineas)
    print(f"\n📊 Total registros encontrados: {total_records}")
    print(f"   • Productos: {len(productos)}")
    print(f"   • Líneas (Deptos): {len(lineas)}")
    print(f"   • Proveedores: {len(proveedores)}")
    print(f"   • Clientes: {len(clientes)}")

    if total_records == 0:
        print("\n⚠️  No se encontraron datos para importar.")
        sys.exit(0)

    # ─── JSON EXPORT ──────────────────────────────────────────

    if args.json:
        print(f"\n📄 Exportando a JSON: {args.json}")
        export_data = {
            "productos": productos if productos else [],
            "proveedores": proveedores if proveedores else [],
            "clientes": clientes if clientes else [],
            "lineas": lineas if lineas else [],
            "metadata": {
                "source": "Aspel SAE 5.0",
                "imported_at": datetime.now().isoformat(),
                "count_total": total_records,
            },
        }
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False, default=str)
        print(f"  ✅ Exportado a {args.json}")
        return

    # ─── DRY RUN ─────────────────────────────────────────────

    if args.dry_run:
        print("\n🔍 MODO DRY RUN — No se escribirá nada en la BD")
        print("\n📋 Vista previa de productos (primeros 5):")
        for i, rec in enumerate(productos[:5]):
            mapped, raw = apply_mapping(rec, PRODUCT_MAPPING)
            print(f"   {i+1}. [{mapped.get('barcode','')}] {mapped.get('name','')} — ${mapped.get('price',0):.2f} ({mapped.get('stock',0)} uds)")
        print(f"\n   ... y {max(0, len(productos)-5)} más")
        return

    # ─── DATABASE IMPORT ─────────────────────────────────────

    db_path = Path(args.db)
    if not db_path.is_absolute():
        db_path = Path.cwd() / args.db

    if args.backup and db_path.exists():
        backup_path = str(db_path) + f".bak.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        import shutil

        shutil.copy2(str(db_path), backup_path)
        print(f"\n💾 Respaldo creado: {backup_path}")

    conn = connect_db(str(db_path))
    if not conn:
        sys.exit(1)

    try:
        # Enable WAL mode for better concurrent access
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=OFF")

        # Import departments (líneas)
        linea_map = {}
        if lineas and args.only in ("all", "departments", "products"):
            print("\n🏷️  Importando departamentos...")
            linea_map = get_departments(conn, lineas)
            conn.commit()

        # Import suppliers
        prov_map = {}
        if proveedores and args.only in ("all", "suppliers", "products"):
            print("\n🏢 Importando proveedores...")
            prov_map = get_suppliers(conn, proveedores)
            conn.commit()

        # Import products
        if productos and args.only in ("all", "products"):
            import_products(conn, productos, linea_map, prov_map, clean=args.clean)

        # Import customers (store for future use)
        if clientes and args.only in ("all", "customers"):
            print(f"\n👤 Clientes encontrados: {len(clientes)}")
            print("   ⏳ Módulo de clientes próximamente...")

        conn.execute("PRAGMA foreign_keys=ON")
        conn.close()

        print(f"\n{'═' * 50}")
        print("✅ IMPORTACIÓN COMPLETADA")
        print(f"{'═' * 50}")
        print(f"\nPara ver los datos, inicia el POS System:")
        print("   npm run dev")
        print("   http://localhost:3000")
        print()

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Error durante la importación: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
