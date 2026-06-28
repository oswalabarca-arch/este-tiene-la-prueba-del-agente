"""Regresión iteración 33: Refrigerar y Congelar como canales de venta completos.

Cubre:
- Asignación destino 'refrigerar' crea stock en ventas_refrigerar (origen=asignacion_destino).
- Asignación destino 'congelar' crea stock en ventas_congelar (origen=asignacion_destino).
- Ya NO se crean docs en frio_registros vía asignación destino.
- Reasignar ciudad → refrigerar: baja disponible de ciudad y suma stock en refrigerar.
- Reasignar refrigerar → congelar: baja disponible de refrigerar y suma stock en congelar.
- Reasignar congelar → donaciones: baja disponible de congelar y suma stock en donaciones.
- Validaciones 400:
  * ventas-refrigerar/reasignar con destino 'refrigerar' → 400
  * ventas-refrigerar/reasignar con destino 'congelar' y cantidad > disponible → 400
  * ventas-congelar/reasignar con destino 'congelar' → 400
  * ventas-congelar/reasignar con destino 'refrigerar' → 400 (no permitido)

Tests autocontenidos: limpian TODOS los registros creados al final."""
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


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login falló: {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    yield s


def _disponible_canal(client, tipo: str) -> float:
    arr = client.get(f"{API}/ventas-{tipo}").json()["ventas"]
    asig = sum((v.get("cantidad_cestas", 0) or 0) for v in arr
               if v.get("origen") in RECIBIDO_ORIGINS and v.get("fecha", "").startswith(TODAY))
    usado = sum((v.get("cantidad_cestas", 0) or 0) for v in arr
                if v.get("origen") not in RECIBIDO_ORIGINS and v.get("fecha", "").startswith(TODAY))
    return asig - usado


def _cleanup(client, cosecha_id, asig_ids):
    for tipo in ["ciudad", "refrigerar", "congelar", "donaciones", "descarte", "finca"]:
        for v in client.get(f"{API}/ventas-{tipo}").json().get("ventas", []):
            if v.get("fecha", "").startswith(TODAY):
                client.delete(f"{API}/ventas-{tipo}/{v['_id']}")
    for aid in asig_ids:
        if aid:
            client.delete(f"{API}/asignaciones-destino/{aid}")
    if cosecha_id:
        client.delete(f"{API}/cosechas/{cosecha_id}")


# Asegura que asignar a 'refrigerar' / 'congelar' crea stock en los nuevos canales
def test_asignacion_refrigerar_y_congelar_crean_stock_en_canales_correctos(client):
    cosecha_id = None
    asig_ids = []
    try:
        c = client.post(f"{API}/cosechas", json={
            "tipo_fruta": "TEST_REFCONG", "variedad": "TEST",
            "primera_calidad": 20, "unidad": "cestas", "fecha_cosecha": TODAY_ISO,
        })
        assert c.status_code == 200, c.text
        cosecha_id = c.json()["_id"]

        # Asignar 6 cestas a refrigerar
        a1 = client.post(f"{API}/asignaciones-destino", json={
            "destino": "refrigerar", "unidad_ingreso": "cestas",
            "cantidad_ingresada": 6, "fecha": TODAY_ISO,
        })
        assert a1.status_code == 200, a1.text
        asig_ids.append(a1.json()["_id"])

        # Asignar 5 cestas a congelar
        a2 = client.post(f"{API}/asignaciones-destino", json={
            "destino": "congelar", "unidad_ingreso": "cestas",
            "cantidad_ingresada": 5, "fecha": TODAY_ISO,
        })
        assert a2.status_code == 200, a2.text
        asig_ids.append(a2.json()["_id"])

        # ventas_refrigerar tiene doc con origen=asignacion_destino y 6 cestas
        ref = client.get(f"{API}/ventas-refrigerar").json()["ventas"]
        assert any(abs(v.get("cantidad_cestas", 0) - 6) < 0.01
                   and v.get("origen") == "asignacion_destino"
                   and v.get("asignacion_id") == asig_ids[0]
                   and v.get("fecha", "").startswith(TODAY) for v in ref), \
            "Asignar a 'refrigerar' debe crear doc en ventas_refrigerar con origen=asignacion_destino"

        # ventas_congelar tiene doc con origen=asignacion_destino y 5 cestas
        cong = client.get(f"{API}/ventas-congelar").json()["ventas"]
        assert any(abs(v.get("cantidad_cestas", 0) - 5) < 0.01
                   and v.get("origen") == "asignacion_destino"
                   and v.get("asignacion_id") == asig_ids[1]
                   and v.get("fecha", "").startswith(TODAY) for v in cong), \
            "Asignar a 'congelar' debe crear doc en ventas_congelar con origen=asignacion_destino"

        # frio_registros NO debe haber sido alimentado por esas asignaciones (era el viejo flujo)
        frio = client.get(f"{API}/frio-registros").json().get("registros", [])
        assert not any(f.get("asignacion_id") in asig_ids for f in frio), \
            "Ya no debe escribirse en frio_registros vía Asignación de destino"

        # Stock aportado POR ESTAS asignaciones (robusto ante datos reales del usuario en preview):
        # se filtra por asignacion_id en vez del disponible global del canal.
        refri_aporte = sum(v.get("cantidad_cestas", 0) or 0 for v in ref if v.get("asignacion_id") in asig_ids)
        cong_aporte = sum(v.get("cantidad_cestas", 0) or 0 for v in cong if v.get("asignacion_id") in asig_ids)
        assert abs(refri_aporte - 6) < 0.01
        assert abs(cong_aporte - 5) < 0.01
    finally:
        _cleanup(client, cosecha_id, asig_ids)


# Cadena: ciudad → refrigerar → congelar → donaciones, y validaciones 400 por canal
def test_cadena_reasignacion_y_validaciones(client):
    cosecha_id = None
    asig_ids = []
    try:
        c = client.post(f"{API}/cosechas", json={
            "tipo_fruta": "TEST_CADENA", "variedad": "TEST",
            "primera_calidad": 30, "unidad": "cestas", "fecha_cosecha": TODAY_ISO,
        })
        assert c.status_code == 200, c.text
        cosecha_id = c.json()["_id"]

        # Asignar 10 a ciudad
        a = client.post(f"{API}/asignaciones-destino", json={
            "destino": "enviar_ciudad", "unidad_ingreso": "cestas",
            "cantidad_ingresada": 10, "fecha": TODAY_ISO,
        })
        assert a.status_code == 200, a.text
        asig_ids.append(a.json()["_id"])
        assert abs(_disponible_canal(client, "ciudad") - 10) < 0.01

        # Reasignar 6 ciudad → refrigerar
        r1 = client.post(f"{API}/ventas-ciudad/reasignar",
                         json={"cantidad_cestas": 6, "destino": "refrigerar", "fecha": TODAY})
        assert r1.status_code == 200, r1.text
        assert abs(_disponible_canal(client, "ciudad") - 4) < 0.01
        assert abs(_disponible_canal(client, "refrigerar") - 6) < 0.01

        # Verificar la entrada en ventas_refrigerar (origen=asignacion_destino)
        ref = client.get(f"{API}/ventas-refrigerar").json()["ventas"]
        assert any(abs(v.get("cantidad_cestas", 0) - 6) < 0.01
                   and v.get("origen") == "asignacion_destino"
                   and (v.get("observaciones") or "").startswith("Reasignado desde")
                   for v in ref), "Refrigerar debe recibir 6 con origen=asignacion_destino"

        # Reasignar 4 refrigerar → congelar
        r2 = client.post(f"{API}/ventas-refrigerar/reasignar",
                         json={"cantidad_cestas": 4, "destino": "congelar", "fecha": TODAY})
        assert r2.status_code == 200, r2.text
        assert abs(_disponible_canal(client, "refrigerar") - 2) < 0.01
        assert abs(_disponible_canal(client, "congelar") - 4) < 0.01

        cong = client.get(f"{API}/ventas-congelar").json()["ventas"]
        assert any(abs(v.get("cantidad_cestas", 0) - 4) < 0.01
                   and v.get("origen") == "asignacion_destino"
                   and (v.get("observaciones") or "").startswith("Reasignado desde")
                   for v in cong), "Congelar debe recibir 4 con origen=asignacion_destino"

        # Reasignar 3 congelar → donaciones
        r3 = client.post(f"{API}/ventas-congelar/reasignar",
                         json={"cantidad_cestas": 3, "destino": "donaciones", "fecha": TODAY})
        assert r3.status_code == 200, r3.text
        assert abs(_disponible_canal(client, "congelar") - 1) < 0.01
        assert abs(_disponible_canal(client, "donaciones") - 3) < 0.01

        # ── Validaciones 400 ─────────────────────────
        # refrigerar/reasignar destino='refrigerar' → 400
        v1 = client.post(f"{API}/ventas-refrigerar/reasignar",
                         json={"cantidad_cestas": 1, "destino": "refrigerar", "fecha": TODAY})
        assert v1.status_code == 400, v1.text

        # refrigerar/reasignar destino='congelar' con cantidad mayor a disponible → 400
        v2 = client.post(f"{API}/ventas-refrigerar/reasignar",
                         json={"cantidad_cestas": 99, "destino": "congelar", "fecha": TODAY})
        assert v2.status_code == 400, v2.text

        # congelar/reasignar destino='congelar' → 400
        v3 = client.post(f"{API}/ventas-congelar/reasignar",
                         json={"cantidad_cestas": 1, "destino": "congelar", "fecha": TODAY})
        assert v3.status_code == 400, v3.text

        # congelar/reasignar destino='refrigerar' → 400 (no permitido)
        v4 = client.post(f"{API}/ventas-congelar/reasignar",
                         json={"cantidad_cestas": 1, "destino": "refrigerar", "fecha": TODAY})
        assert v4.status_code == 400, v4.text

        # cantidad <= 0 → 400
        v5 = client.post(f"{API}/ventas-refrigerar/reasignar",
                         json={"cantidad_cestas": 0, "destino": "congelar", "fecha": TODAY})
        assert v5.status_code == 400
    finally:
        _cleanup(client, cosecha_id, asig_ids)


# La ruta vieja /api/frio sigue siendo accesible (módulo histórico) pero ya no recibe
# nada vía asignación. Solo verificamos que el endpoint responde 200 con auth.
def test_endpoint_frio_legacy_responde(client):
    r = client.get(f"{API}/frio-registros")
    assert r.status_code == 200
    assert "registros" in r.json()
