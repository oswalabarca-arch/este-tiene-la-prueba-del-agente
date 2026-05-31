"""
Tests de regresión para el fix PEPS + Analíticas.

Verifica:
  - GET /api/inventario => 'hierro' tiene total_disponible=835, valor_remanente≈835
    y lote remanente a precio_unitario=1.0 (entrada manual cubre overflow).
  - GET /api/analiticas/resumen incluye inversion_compras, inversion_entradas_manuales
    e inversion_insumos_total y total == compras + manuales.
  - GET /api/compras no incluye entradas origen='ajuste'.
  - GET /api/inventario/entradas SÍ lista las entradas origen='ajuste'.
  - GET /api/aplicaciones responde 200 (regresión costeo PEPS).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "oswaldabarca@gmail.com"
ADMIN_PASSWORD = "123456"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    return s


# Inventario PEPS: hierro
def test_hierro_inventario_state(api):
    r = api.get(f"{BASE_URL}/api/inventario", timeout=20)
    assert r.status_code == 200
    items = r.json().get("inventario", [])
    hierro = next((x for x in items if (x.get("nombre_producto") or "").lower() == "hierro"), None)
    assert hierro is not None, "Producto 'hierro' no encontrado"
    assert float(hierro["total_disponible"]) == 835.0
    assert abs(float(hierro["valor_remanente"]) - 835.0) < 0.5
    lotes = hierro.get("lotes_remanentes", [])
    assert len(lotes) >= 1
    # El lote remanente debe ser el manual @ ~$1.0 (no $0.035 de compras reales)
    assert abs(float(lotes[0]["precio_unitario"]) - 1.0) < 0.01, \
        f"Precio remanente esperado=1.0 actual={lotes[0]['precio_unitario']}"


# Analíticas: nuevos KPIs
def test_analiticas_inversion_fields(api):
    r = api.get(f"{BASE_URL}/api/analiticas/resumen", timeout=20)
    assert r.status_code == 200
    d = r.json()
    for k in ("inversion_compras", "inversion_entradas_manuales", "inversion_insumos_total"):
        assert k in d, f"Falta campo {k} en resumen"
        assert isinstance(d[k], (int, float))
    assert abs(d["inversion_insumos_total"] - (d["inversion_compras"] + d["inversion_entradas_manuales"])) < 0.01


# Regresión: /api/compras excluye origen=ajuste
def test_compras_excludes_ajuste(api):
    r = api.get(f"{BASE_URL}/api/compras", timeout=20)
    assert r.status_code == 200
    compras = r.json().get("compras", [])
    for c in compras:
        assert c.get("origen") != "ajuste"


# Regresión: /api/inventario/entradas lista solo origen=ajuste
def test_inventario_entradas_only_ajuste(api):
    r = api.get(f"{BASE_URL}/api/inventario/entradas", timeout=20)
    assert r.status_code == 200
    entradas = r.json().get("entradas", [])
    for e in entradas:
        assert e.get("origen") == "ajuste"


# Regresión: /api/aplicaciones responde y costeo PEPS sigue activo
def test_aplicaciones_endpoint_ok(api):
    r = api.get(f"{BASE_URL}/api/aplicaciones", timeout=20)
    assert r.status_code == 200
    body = r.json()
    aps = body.get("aplicaciones", body) if isinstance(body, dict) else body
    assert isinstance(aps, list)
