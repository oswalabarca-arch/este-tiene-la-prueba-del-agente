"""
Tests para el comportamiento PEPS de las entradas manuales de inventario y su
reflejo como inversión en Analíticas.

Cubre (vía API, sin tocar aplicaciones):
  - Una entrada manual con FECHA PASADA conserva su valor en el inventario
    (valor_remanente / precio promedio reflejan el precio de la entrada).
  - GET /api/analiticas/resumen incluye el valor de la entrada manual en
    inversion_entradas_manuales e inversion_insumos_total.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

ADMIN_EMAIL = "oswaldabarca@gmail.com"
ADMIN_PASSWORD = "123456"


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def _inv_item(api, nombre):
    r = api.get(f"{BASE_URL}/api/inventario", timeout=20)
    assert r.status_code == 200
    items = r.json().get("inventario", [])
    m = [x for x in items if (x.get("nombre_producto") or "").lower() == nombre.lower()]
    return m[0] if m else None


def test_manual_entry_keeps_value_with_past_date(api):
    """Entrada manual con fecha PASADA: su valor cuenta como stock disponible HOY."""
    nombre = f"TEST_PEPS_{uuid.uuid4().hex[:8]}"
    payload = {
        "categoria": "fertilizantes",
        "nombre_producto": nombre,
        "cantidad": 10,
        "unidad": "Unidades",
        "precio": 100,  # $10 / unidad
        "descripcion": "pytest peps past date",
        "fecha": "2020-01-01T00:00:00.000Z",  # fecha muy pasada
    }
    r = api.post(f"{BASE_URL}/api/inventario/entradas", json=payload, timeout=20)
    assert r.status_code in (200, 201), r.text
    eid = r.json().get("id") or r.json().get("_id")
    try:
        item = _inv_item(api, nombre)
        assert item is not None, "Producto manual no aparece en inventario"
        assert float(item.get("total_disponible", 0)) == 10
        assert abs(float(item.get("valor_remanente", 0)) - 100) < 0.01, \
            f"valor_remanente={item.get('valor_remanente')} esperado 100"
        assert abs(float(item.get("precio_unitario_promedio", 0)) - 10) < 0.001, \
            f"precio_promedio={item.get('precio_unitario_promedio')} esperado 10"
    finally:
        api.delete(f"{BASE_URL}/api/inventario/entradas/{eid}", timeout=10)


def test_analiticas_inversion_includes_manual(api):
    """El valor de una entrada manual se suma a la inversión en Analíticas."""
    base = api.get(f"{BASE_URL}/api/analiticas/resumen", timeout=20).json()
    base_manual = float(base.get("inversion_entradas_manuales", 0))
    base_total = float(base.get("inversion_insumos_total", 0))

    nombre = f"TEST_INV_{uuid.uuid4().hex[:8]}"
    r = api.post(f"{BASE_URL}/api/inventario/entradas", json={
        "categoria": "otros", "nombre_producto": nombre, "cantidad": 5,
        "unidad": "Unidades", "precio": 250, "descripcion": "pytest inv", "fecha": "2026-02-01T00:00:00.000Z",
    }, timeout=20)
    assert r.status_code in (200, 201), r.text
    eid = r.json().get("id") or r.json().get("_id")
    try:
        after = api.get(f"{BASE_URL}/api/analiticas/resumen", timeout=20).json()
        assert abs(float(after.get("inversion_entradas_manuales", 0)) - (base_manual + 250)) < 0.01
        assert abs(float(after.get("inversion_insumos_total", 0)) - (base_total + 250)) < 0.01
    finally:
        api.delete(f"{BASE_URL}/api/inventario/entradas/{eid}", timeout=10)
