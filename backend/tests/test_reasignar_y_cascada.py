"""Regresión para:
1) Reasignar cestas sobrantes de "Envío a ciudad" a Descarte / Donaciones.
2) Borrado en cascada de los gastos operativos al eliminar un vehículo.

Tests autocontenidos: siembran su propia cosecha y limpian todo al final
(no dependen del stock ambiente del día)."""
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


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login falló: {r.text}"
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    yield s


def _disponible_ciudad(client):
    arr = client.get(f"{API}/ventas-ciudad").json()["ventas"]
    asig = sum(v.get("cantidad_cestas", 0) for v in arr
               if v.get("origen") == "asignacion_destino" and v.get("fecha", "").startswith(TODAY))
    manual = sum(v.get("cantidad_cestas", 0) for v in arr
                 if v.get("origen") != "asignacion_destino" and v.get("fecha", "").startswith(TODAY))
    return asig - manual


def test_reasignar_ciudad_a_descarte_y_donaciones(client):
    cosecha_id = None
    asig_id = None
    try:
        # Sembrar cosecha de hoy: 12 cestas
        c = client.post(f"{API}/cosechas", json={
            "tipo_fruta": "TEST_REASIG", "variedad": "TEST",
            "primera_calidad": 12, "unidad": "cestas", "fecha_cosecha": TODAY_ISO,
        })
        assert c.status_code == 200, c.text
        cosecha_id = c.json()["_id"]

        # Asignar 9 a enviar_ciudad
        a = client.post(f"{API}/asignaciones-destino", json={
            "destino": "enviar_ciudad", "unidad_ingreso": "cestas",
            "cantidad_ingresada": 9, "fecha": TODAY_ISO,
        })
        assert a.status_code == 200, a.text
        asig_id = a.json()["_id"]
        assert abs(_disponible_ciudad(client) - 9) < 0.01

        # Reasignar 4 a descarte
        r1 = client.post(f"{API}/ventas-ciudad/reasignar",
                         json={"cantidad_cestas": 4, "destino": "descarte", "fecha": TODAY})
        assert r1.status_code == 200, r1.text
        # Reasignar 2 a donaciones
        r2 = client.post(f"{API}/ventas-ciudad/reasignar",
                         json={"cantidad_cestas": 2, "destino": "donaciones", "fecha": TODAY})
        assert r2.status_code == 200, r2.text

        # Disponible ciudad = 9 - 6 = 3
        assert abs(_disponible_ciudad(client) - 3) < 0.01

        # Descarte recibió 4 (origen reasignacion_ciudad)
        desc = client.get(f"{API}/ventas-descarte").json()["ventas"]
        assert any(abs(v.get("cantidad_cestas", 0) - 4) < 0.01
                   and v.get("origen") == "reasignacion_ciudad"
                   and v.get("fecha", "").startswith(TODAY) for v in desc)

        # Donaciones recibió 2 como "disponible para donar" (origen asignacion_destino)
        don = client.get(f"{API}/ventas-donaciones").json()["ventas"]
        assert any(abs(v.get("cantidad_cestas", 0) - 2) < 0.01
                   and v.get("origen") == "asignacion_destino"
                   and (v.get("observaciones") or "").startswith("Reasignado")
                   and v.get("fecha", "").startswith(TODAY) for v in don)

        # No permite reasignar más de lo disponible
        rx = client.post(f"{API}/ventas-ciudad/reasignar",
                         json={"cantidad_cestas": 99, "destino": "descarte", "fecha": TODAY})
        assert rx.status_code == 400

        # Destino inválido -> 400
        ry = client.post(f"{API}/ventas-ciudad/reasignar",
                         json={"cantidad_cestas": 1, "destino": "frio", "fecha": TODAY})
        assert ry.status_code == 400
    finally:
        # Limpieza
        for tipo in ["ciudad", "descarte", "donaciones"]:
            for v in client.get(f"{API}/ventas-{tipo}").json()["ventas"]:
                if v.get("fecha", "").startswith(TODAY):
                    client.delete(f"{API}/ventas-{tipo}/{v['_id']}")
        if asig_id:
            client.delete(f"{API}/asignaciones-destino/{asig_id}")
        if cosecha_id:
            client.delete(f"{API}/cosechas/{cosecha_id}")


def test_eliminar_vehiculo_borra_gastos_en_cascada(client):
    v = client.post(f"{API}/vehiculos", json={"nombre": "TEST_cascada"}).json()
    vid = v["_id"]
    g = client.post(f"{API}/gastos-vehiculos", json={
        "vehiculo_id": vid, "categoria": "gasolina", "monto": 42, "fecha": TODAY_ISO,
    }).json()
    gid = g["_id"]

    dv = client.delete(f"{API}/vehiculos/{vid}")
    assert dv.status_code == 200, dv.text

    gastos = client.get(f"{API}/gastos-vehiculos").json()["gastos"]
    assert not any(x["_id"] == gid for x in gastos), "El gasto debió borrarse en cascada"
