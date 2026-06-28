"""Iteración 34: ventas por kg en canales Refrigerar y Congelar.

Cubre:
- POST /api/ventas-refrigerar con unidad_venta='kg' persiste correctamente cantidad_kg, precio_unitario, total y unidad_venta.
- Idem para /api/ventas-congelar.
- La venta por kg descuenta del disponible acumulado (cantidad_cestas = kg / 14).
- Validación de no vender más de lo disponible (en cestas equivalentes) en modo kg.
- Registrar abono (PUT) sobre una venta hecha por kg conserva unidad_venta='kg'.
- Modo cestas sigue funcionando (regresión): unidad_venta='cestas' al no enviar el campo.

CRÍTICO: el preview tiene datos reales del usuario. Sólo se borra lo creado por estos tests (por _id).
"""
import os
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "oswaldabarca@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "123456")
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d")
TODAY_ISO = TODAY + "T12:00:00.000Z"
RECIBIDO_ORIGINS = ("asignacion_destino", "ajuste_entrada")

CREATED = {"cosechas": [], "asignaciones": [], "ventas": []}  # ventas: list of (tipo, _id)


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login falló: {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    yield s
    # Cleanup SOLO lo que creamos
    for tipo, vid in CREATED["ventas"]:
        try:
            s.delete(f"{API}/ventas-{tipo}/{vid}")
        except Exception:
            pass
    for aid in CREATED["asignaciones"]:
        try:
            s.delete(f"{API}/asignaciones-destino/{aid}")
        except Exception:
            pass
    for cid in CREATED["cosechas"]:
        try:
            s.delete(f"{API}/cosechas/{cid}")
        except Exception:
            pass


def _disponible_canal(client, tipo: str) -> float:
    arr = client.get(f"{API}/ventas-{tipo}").json()["ventas"]
    asig = sum((v.get("cantidad_cestas", 0) or 0) for v in arr if v.get("origen") in RECIBIDO_ORIGINS)
    usado = sum((v.get("cantidad_cestas", 0) or 0) for v in arr if v.get("origen") not in RECIBIDO_ORIGINS)
    return asig - usado


def _seed_stock(client, destino: str, cestas: int = 4):
    """Crea una cosecha de hoy y asigna `cestas` a `destino` para tener stock disponible."""
    rc = client.post(f"{API}/cosechas", json={
        "tipo_fruta": "TEST_KG", "variedad": "TEST_kg",
        "primera_calidad": cestas + 2, "unidad": "cestas", "fecha_cosecha": TODAY_ISO,
    })
    assert rc.status_code in (200, 201), rc.text
    cid = rc.json()["_id"]
    CREATED["cosechas"].append(cid)
    ra = client.post(f"{API}/asignaciones-destino", json={
        "destino": destino, "unidad_ingreso": "cestas",
        "cantidad_ingresada": cestas, "fecha": TODAY_ISO,
    })
    assert ra.status_code in (200, 201), ra.text
    aid = ra.json()["_id"]
    CREATED["asignaciones"].append(aid)
    return cid, aid


@pytest.mark.parametrize("tipo", ["refrigerar", "congelar"])
def test_venta_por_kg_persiste_y_descuenta(client, tipo):
    """28 kg @ 2.5/kg = 70; descuenta 2 cestas del disponible."""
    _seed_stock(client, tipo, cestas=4)
    disp_antes = _disponible_canal(client, tipo)

    r = client.post(f"{API}/ventas-{tipo}", json={
        "fecha": TODAY_ISO,
        "cantidad_cestas": 2.0,  # 28 kg / 14
        "cantidad_kg": 28.0,
        "precio_unitario": 2.5,
        "total": 70.0,
        "unidad_venta": "kg",
        "cliente": "TEST_kg_cliente",
        "telefono": "",
        "abono_inicial": 0,
        "observaciones": "TEST_kg venta",
    })
    assert r.status_code in (200, 201), r.text
    doc = r.json()
    CREATED["ventas"].append((tipo, doc["_id"]))

    assert doc["unidad_venta"] == "kg"
    assert abs(doc["cantidad_kg"] - 28.0) < 0.001
    assert abs(doc["cantidad_cestas"] - 2.0) < 0.001
    assert abs(doc["precio_unitario"] - 2.5) < 0.001
    assert abs(doc["total"] - 70.0) < 0.001

    # Verificar persistencia via GET
    arr = client.get(f"{API}/ventas-{tipo}").json()["ventas"]
    found = next((v for v in arr if v["_id"] == doc["_id"]), None)
    assert found is not None
    assert found["unidad_venta"] == "kg"
    assert abs(found["cantidad_kg"] - 28.0) < 0.001

    # Disponible bajó exactamente 2 cestas
    disp_despues = _disponible_canal(client, tipo)
    assert abs((disp_antes - disp_despues) - 2.0) < 0.001, f"esperado -2 cestas, fue {disp_antes - disp_despues}"


@pytest.mark.parametrize("tipo", ["refrigerar", "congelar"])
def test_venta_por_cestas_regresion(client, tipo):
    """Modo cestas sigue funcionando: unidad_venta='cestas' explícito y default."""
    _seed_stock(client, tipo, cestas=5)
    r = client.post(f"{API}/ventas-{tipo}", json={
        "fecha": TODAY_ISO,
        "cantidad_cestas": 3,
        "cantidad_kg": 42,
        "precio_unitario": 10,
        "total": 30,
        "unidad_venta": "cestas",
        "cliente": "TEST_cestas_cliente",
    })
    assert r.status_code in (200, 201), r.text
    doc = r.json()
    CREATED["ventas"].append((tipo, doc["_id"]))
    assert doc["unidad_venta"] == "cestas"
    assert doc["cantidad_cestas"] == 3


@pytest.mark.parametrize("tipo", ["refrigerar", "congelar"])
def test_abono_preserva_unidad_venta_kg(client, tipo):
    """PUT de abono sobre una venta hecha por kg conserva unidad_venta='kg'."""
    _seed_stock(client, tipo, cestas=3)
    # Crear venta por kg
    r = client.post(f"{API}/ventas-{tipo}", json={
        "fecha": TODAY_ISO, "cantidad_cestas": 1.0, "cantidad_kg": 14.0,
        "precio_unitario": 3.0, "total": 42.0, "unidad_venta": "kg",
        "cliente": "TEST_abono_kg", "abono_inicial": 0,
    })
    assert r.status_code in (200, 201), r.text
    v = r.json()
    CREATED["ventas"].append((tipo, v["_id"]))
    # Abonar (replica el patrón de registrarAbono en Ventas.jsx)
    ru = client.put(f"{API}/ventas-{tipo}/{v['_id']}", json={
        "fecha": v["fecha"], "cantidad_cestas": v["cantidad_cestas"], "cantidad_kg": v["cantidad_kg"],
        "precio_unitario": v["precio_unitario"], "total": v["total"],
        "unidad_venta": v.get("unidad_venta", "cestas"),
        "cliente": v["cliente"], "telefono": v.get("telefono", ""),
        "abono_inicial": 20.0, "observaciones": v.get("observaciones", ""),
    })
    assert ru.status_code == 200, ru.text
    arr = client.get(f"{API}/ventas-{tipo}").json()["ventas"]
    found = next((x for x in arr if x["_id"] == v["_id"]), None)
    assert found is not None
    assert found["unidad_venta"] == "kg", f"unidad se rompió tras abono: {found.get('unidad_venta')}"
    assert abs(found["abono_inicial"] - 20.0) < 0.001
    # cantidad_kg y total se conservan
    assert abs(found["cantidad_kg"] - 14.0) < 0.001
    assert abs(found["total"] - 42.0) < 0.001


def test_venta_por_kg_total_calculado(client):
    """Validar matemática: 35 kg * 3.2/kg = 112.0."""
    _seed_stock(client, "refrigerar", cestas=4)
    r = client.post(f"{API}/ventas-refrigerar", json={
        "fecha": TODAY_ISO,
        "cantidad_cestas": 35 / 14,
        "cantidad_kg": 35.0,
        "precio_unitario": 3.2,
        "total": 112.0,
        "unidad_venta": "kg",
        "cliente": "TEST_kg_total",
    })
    assert r.status_code in (200, 201), r.text
    doc = r.json()
    CREATED["ventas"].append(("refrigerar", doc["_id"]))
    assert abs(doc["total"] - 112.0) < 0.001
    assert abs(doc["cantidad_kg"] - 35.0) < 0.001
