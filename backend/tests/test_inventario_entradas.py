"""
Tests para el módulo de Entradas manuales de Inventario.
Cubre:
  - POST /api/inventario/entradas (crear entrada origen='ajuste')
  - GET  /api/inventario/entradas (listar)
  - GET  /api/inventario (la entrada aparece y suma stock)
  - GET  /api/compras (la entrada NO aparece)
  - DELETE /api/inventario/entradas/{id} (se elimina y descuenta del stock)
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: leer del .env del frontend
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "oswaldabarca@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "123456")


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token, "No token returned"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="session")
def unique_name():
    return f"TEST_EntradaManual_{uuid.uuid4().hex[:8]}"


@pytest.fixture(scope="session")
def created_entrada(api, unique_name):
    payload = {
        "categoria": "fertilizante",
        "nombre_producto": unique_name,
        "cantidad": 50,
        "unidad": "Unidades",
        "precio": 0,
        "descripcion": "Donación de prueba (pytest)",
        "fecha": "2026-01-10",
    }
    r = api.post(f"{BASE_URL}/api/inventario/entradas", json=payload, timeout=20)
    assert r.status_code in (200, 201), f"Create failed: {r.status_code} {r.text}"
    data = r.json()
    assert "id" in data or "_id" in data or data.get("success") or data.get("nombre_producto") == unique_name, f"No id en respuesta: {data}"
    # _create suele devolver el doc creado con campo 'id'
    eid = data.get("id") or data.get("_id")
    assert eid, f"No id encontrado en {data}"
    yield {"id": eid, "payload": payload, "response": data}
    # Cleanup defensivo (si no se eliminó en test)
    try:
        api.delete(f"{BASE_URL}/api/inventario/entradas/{eid}", timeout=10)
    except Exception:
        pass


def test_create_entrada_inventario(created_entrada, unique_name):
    """POST /api/inventario/entradas crea con campos correctos"""
    resp = created_entrada["response"]
    assert resp.get("origen") == "ajuste", f"origen incorrecto: {resp.get('origen')}"
    assert resp.get("nombre_producto") == unique_name
    assert float(resp.get("cantidad", 0)) == 50
    assert resp.get("es_equipo") in (False, None)


def test_list_entradas_includes_created(api, created_entrada, unique_name):
    """GET /api/inventario/entradas lista la entrada"""
    r = api.get(f"{BASE_URL}/api/inventario/entradas", timeout=20)
    assert r.status_code == 200
    body = r.json()
    entradas = body.get("entradas", body) if isinstance(body, dict) else body
    nombres = [e.get("nombre_producto") for e in entradas]
    assert unique_name in nombres, f"Entrada no listada. nombres={nombres[:10]}"
    # Todas deben tener origen='ajuste'
    for e in entradas:
        assert e.get("origen") == "ajuste"


def test_entrada_appears_in_inventario(api, created_entrada, unique_name):
    """GET /api/inventario incluye el producto con stock=50 y existencia=true"""
    r = api.get(f"{BASE_URL}/api/inventario", timeout=20)
    assert r.status_code == 200
    body = r.json()
    items = body.get("inventario", body) if isinstance(body, dict) else body
    match = [x for x in items if (x.get("nombre_producto") or "").lower() == unique_name.lower()]
    assert match, f"Producto {unique_name} no aparece en /api/inventario"
    item = match[0]
    total = item.get("total_disponible") or item.get("disponible") or item.get("total_comprado") or 0
    assert float(total) >= 50, f"total_disponible={total} esperado >=50"
    existencia = item.get("existencia")
    if existencia is not None:
        assert existencia is True or existencia == "true"


def test_entrada_excluded_from_compras(api, created_entrada, unique_name):
    """GET /api/compras NO debe incluir entradas origen='ajuste'"""
    r = api.get(f"{BASE_URL}/api/compras", timeout=20)
    assert r.status_code == 200
    body = r.json()
    compras = body.get("compras", body) if isinstance(body, dict) else body
    nombres = [c.get("nombre_producto") for c in compras]
    assert unique_name not in nombres, f"Entrada manual apareció en /api/compras: {unique_name}"
    # Ninguna debería tener origen=ajuste
    for c in compras:
        assert c.get("origen") != "ajuste", f"compra con origen=ajuste en /compras: {c}"


def test_aplicacion_stock_validation_uses_manual_entry(api, unique_name):
    """Regresión: la validación de stock para aplicaciones considera entradas manuales.
    Como no podemos crear una aplicación real sin lote/cultivo, comprobamos indirectamente
    que el endpoint de inventario muestra existencia=true para el producto manual."""
    r = api.get(f"{BASE_URL}/api/inventario", timeout=20)
    assert r.status_code == 200
    body = r.json()
    items = body.get("inventario", body) if isinstance(body, dict) else body
    match = [x for x in items if (x.get("nombre_producto") or "").lower() == unique_name.lower()]
    assert match, "Producto manual no disponible para aplicaciones"
    assert float(match[0].get("total_disponible", 0)) >= 50


def test_delete_entrada_removes_from_inventario(api, unique_name):
    """DELETE /api/inventario/entradas/{id}: la entrada desaparece y descuenta del stock"""
    # Crear una entrada dedicada para borrar
    payload = {
        "categoria": "fertilizante",
        "nombre_producto": f"{unique_name}_DEL",
        "cantidad": 25,
        "unidad": "Unidades",
        "precio": 0,
        "descripcion": "para borrar",
        "fecha": "2026-01-10",
    }
    r = api.post(f"{BASE_URL}/api/inventario/entradas", json=payload, timeout=20)
    assert r.status_code in (200, 201)
    eid = r.json().get("id") or r.json().get("_id")
    assert eid

    # Confirmar que está en inventario
    inv = api.get(f"{BASE_URL}/api/inventario", timeout=20).json()
    items = inv.get("inventario", inv) if isinstance(inv, dict) else inv
    assert any((x.get("nombre_producto") or "").lower() == payload["nombre_producto"].lower() for x in items)

    # Eliminar
    rd = api.delete(f"{BASE_URL}/api/inventario/entradas/{eid}", timeout=20)
    assert rd.status_code in (200, 204), f"Delete falló: {rd.status_code} {rd.text}"

    # Verificar que ya no aparece
    inv2 = api.get(f"{BASE_URL}/api/inventario", timeout=20).json()
    items2 = inv2.get("inventario", inv2) if isinstance(inv2, dict) else inv2
    assert not any((x.get("nombre_producto") or "").lower() == payload["nombre_producto"].lower() for x in items2), \
        "Producto sigue en inventario después de eliminar la entrada"

    # Verificar que ya no está en listado de entradas
    le = api.get(f"{BASE_URL}/api/inventario/entradas", timeout=20).json()
    entradas = le.get("entradas", le) if isinstance(le, dict) else le
    assert not any(e.get("id") == eid for e in entradas)


def test_cleanup_main_entrada(api, created_entrada):
    """Cleanup explícito: borrar la entrada principal de prueba"""
    eid = created_entrada["id"]
    r = api.delete(f"{BASE_URL}/api/inventario/entradas/{eid}", timeout=20)
    assert r.status_code in (200, 204, 404)
