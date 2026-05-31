"""Tests para:
- Descarte automático en Cosecha (origen='cosecha_descarte_auto')
- Validación de disponibilidad en POST /asignaciones-destino
- CRUD de /api/ventas-finca con PUT preservando origen/asignacion_id
- Filtro GET /api/asignaciones-destino?fecha=YYYY-MM-DD
- Asignación venta_finca alimenta ventas-finca (origen=asignacion_destino)
"""
import os
import pytest
import requests
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "oswaldabarca@gmail.com"
ADMIN_PASSWORD = "123456"
KG_POR_CESTA = 14

TODAY_DATE = datetime.now(timezone.utc).strftime("%Y-%m-%d")
TODAY_ISO = TODAY_DATE + "T12:00:00.000Z"

created = {"cosechas": [], "asignaciones": [], "ventas_finca": [], "ventas_ciudad": [], "tipos": [], "vars": []}


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    yield s
    # Cleanup
    for vid in created["ventas_finca"]:
        s.delete(f"{API}/ventas-finca/{vid}")
    for vid in created["ventas_ciudad"]:
        s.delete(f"{API}/ventas-ciudad/{vid}")
    for cid in created["cosechas"]:
        s.delete(f"{API}/cosechas/{cid}")
    # Asignaciones manuales (no auto-descarte)
    for aid in created["asignaciones"]:
        s.delete(f"{API}/asignaciones-destino/{aid}")
    # Limpiar asignaciones automaticas residuales de hoy
    r = s.get(f"{API}/asignaciones-destino", params={"fecha": TODAY_DATE})
    if r.status_code == 200:
        for a in r.json().get("asignaciones", []):
            if a.get("origen") == "cosecha_descarte_auto":
                # Solo se eliminará al borrar cosechas, pero forzar via mongo no es posible. ok.
                pass


def _cleanup_today_asignaciones(client):
    """Borrar todas las asignaciones (no auto) creadas hoy antes de cada test que valida disponibilidad."""
    r = client.get(f"{API}/asignaciones-destino", params={"fecha": TODAY_DATE})
    if r.status_code == 200:
        for a in r.json().get("asignaciones", []):
            if a.get("origen") != "cosecha_descarte_auto":
                client.delete(f"{API}/asignaciones-destino/{a['_id']}")


def _cleanup_today_cosechas(client):
    r = client.get(f"{API}/cosechas", params={"fecha_desde": TODAY_DATE, "fecha_hasta": TODAY_DATE})
    if r.status_code == 200:
        for c in r.json().get("cosechas", []):
            client.delete(f"{API}/cosechas/{c['_id']}")


@pytest.fixture(scope="module", autouse=True)
def clean_state(client):
    """Limpiar estado de hoy al iniciar y al terminar para no interferir con datos del usuario."""
    _cleanup_today_asignaciones(client)
    _cleanup_today_cosechas(client)
    yield
    _cleanup_today_asignaciones(client)
    _cleanup_today_cosechas(client)


# ============================================================
# CRUD ventas-finca
# ============================================================
class TestVentasFincaCRUD:
    def test_post_get_put_delete(self, client):
        # POST
        payload = {
            "fecha": TODAY_ISO, "cantidad_cestas": 3, "cantidad_kg": 3 * KG_POR_CESTA,
            "precio_unitario": 10, "total": 30, "cliente": "TEST_Cliente_VF",
            "telefono": "0414", "abono_inicial": 5, "observaciones": "TEST",
        }
        r = client.post(f"{API}/ventas-finca", json=payload)
        assert r.status_code == 200, r.text
        v = r.json()
        vid = v["_id"]
        created["ventas_finca"].append(vid)
        assert v["cantidad_cestas"] == 3
        assert v["cliente"] == "TEST_Cliente_VF"

        # GET
        r = client.get(f"{API}/ventas-finca")
        assert r.status_code == 200
        ventas = r.json()["ventas"]
        match = [x for x in ventas if x["_id"] == vid]
        assert len(match) == 1
        assert match[0]["abono_inicial"] == 5

        # PUT (cambiar precio): debe permitir editar
        upd = {**payload, "precio_unitario": 12, "total": 36}
        r = client.put(f"{API}/ventas-finca/{vid}", json=upd)
        assert r.status_code == 200, r.text
        assert r.json()["precio_unitario"] == 12

        # DELETE
        r = client.delete(f"{API}/ventas-finca/{vid}")
        assert r.status_code == 200
        created["ventas_finca"].remove(vid)
        # Verificar borrado
        r = client.get(f"{API}/ventas-finca")
        assert vid not in {x["_id"] for x in r.json()["ventas"]}


# ============================================================
# Descarte automático
# ============================================================
class TestDescarteAuto:
    def _setup_tipo_var(self, client):
        r = client.post(f"{API}/tipos-fruta", json={"nombre": f"TEST_DescAuto_{datetime.now().timestamp()}"})
        assert r.status_code == 200
        tid = r.json()["_id"]
        created["tipos"].append(tid)
        r = client.post(f"{API}/variedades-fruta", json={"tipo_fruta_id": tid, "nombre": "TEST_Var"})
        assert r.status_code == 200
        vid = r.json()["_id"]
        created["vars"].append(vid)
        return tid, vid

    def test_cosecha_con_descarte_crea_asignacion_auto(self, client):
        _cleanup_today_asignaciones(client)
        _cleanup_today_cosechas(client)
        tid, vid = self._setup_tipo_var(client)
        # Crear cosecha en cestas con descarte=2 cestas
        payload = {
            "tipo_fruta_id": tid, "variedad_id": vid,
            "primera_calidad": 5, "segunda_calidad": 0, "tercera_calidad": 0, "descarte": 2,
            "unidad": "cestas", "fecha_cosecha": TODAY_ISO, "lote": "L1",
        }
        r = client.post(f"{API}/cosechas", json=payload)
        assert r.status_code == 200, r.text
        cid = r.json()["_id"]
        created["cosechas"].append(cid)

        # Verificar asignacion auto
        r = client.get(f"{API}/asignaciones-destino", params={"fecha": TODAY_DATE})
        assert r.status_code == 200
        autos = [a for a in r.json()["asignaciones"]
                 if a.get("origen") == "cosecha_descarte_auto" and a.get("destino") == "descarte"]
        assert len(autos) == 1, f"Esperaba 1 asignación auto, hay {len(autos)}"
        assert autos[0]["cantidad_cestas"] == 2
        assert autos[0]["cantidad_kg"] == 2 * KG_POR_CESTA
        auto_id = autos[0]["_id"]

        # Intentar borrar la auto-asignación: debe ser 400
        r = client.delete(f"{API}/asignaciones-destino/{auto_id}")
        assert r.status_code == 400, f"DELETE auto debe ser 400, fue {r.status_code} {r.text}"

        # Editar la cosecha cambiando descarte a 5
        upd = {**payload, "descarte": 5}
        r = client.put(f"{API}/cosechas/{cid}", json=upd)
        assert r.status_code == 200, r.text

        r = client.get(f"{API}/asignaciones-destino", params={"fecha": TODAY_DATE})
        autos = [a for a in r.json()["asignaciones"]
                 if a.get("origen") == "cosecha_descarte_auto" and a.get("destino") == "descarte"]
        assert len(autos) == 1
        assert autos[0]["cantidad_cestas"] == 5

        # Eliminar la cosecha: la auto-asignación debe desaparecer
        r = client.delete(f"{API}/cosechas/{cid}")
        assert r.status_code == 200
        created["cosechas"].remove(cid)

        r = client.get(f"{API}/asignaciones-destino", params={"fecha": TODAY_DATE})
        autos = [a for a in r.json()["asignaciones"]
                 if a.get("origen") == "cosecha_descarte_auto" and a.get("destino") == "descarte"]
        assert len(autos) == 0, f"Tras borrar cosecha quedó(an) {len(autos)} auto-asignaciones"


# ============================================================
# Validación de disponibilidad
# ============================================================
class TestDisponibilidad:
    def test_rechaza_si_excede_disponible(self, client):
        _cleanup_today_asignaciones(client)
        _cleanup_today_cosechas(client)
        # Crear cosecha de 4 cestas (primera=4, sin descarte)
        r = client.post(f"{API}/tipos-fruta", json={"nombre": f"TEST_Disp_{datetime.now().timestamp()}"})
        tid = r.json()["_id"]
        created["tipos"].append(tid)
        r = client.post(f"{API}/variedades-fruta", json={"tipo_fruta_id": tid, "nombre": "TEST_V"})
        vid = r.json()["_id"]
        created["vars"].append(vid)
        r = client.post(f"{API}/cosechas", json={
            "tipo_fruta_id": tid, "variedad_id": vid,
            "primera_calidad": 4, "segunda_calidad": 0, "tercera_calidad": 0, "descarte": 0,
            "unidad": "cestas", "fecha_cosecha": TODAY_ISO, "lote": "L1",
        })
        assert r.status_code == 200, r.text
        created["cosechas"].append(r.json()["_id"])

        # Asignar 5 cestas: debe fallar (>4 disponibles)
        r = client.post(f"{API}/asignaciones-destino", json={
            "destino": "venta_finca", "unidad_ingreso": "cestas",
            "cantidad_ingresada": 5, "fecha": TODAY_ISO, "observaciones": "TEST_excede",
        })
        assert r.status_code == 400, f"Debe rechazar (400), fue {r.status_code} {r.text}"

        # Asignar 3 cestas: OK
        r = client.post(f"{API}/asignaciones-destino", json={
            "destino": "venta_finca", "unidad_ingreso": "cestas",
            "cantidad_ingresada": 3, "fecha": TODAY_ISO, "observaciones": "TEST_ok",
        })
        assert r.status_code == 200, r.text
        aid = r.json()["_id"]
        created["asignaciones"].append(aid)

        # Asignar 2 más (queda 1 disponible): debe fallar
        r = client.post(f"{API}/asignaciones-destino", json={
            "destino": "venta_finca", "unidad_ingreso": "cestas",
            "cantidad_ingresada": 2, "fecha": TODAY_ISO,
        })
        assert r.status_code == 400


# ============================================================
# Asignación venta_finca alimenta ventas-finca con origen=asignacion_destino
# y PUT preserva origen/asignacion_id
# ============================================================
class TestAsignacionAVentaFinca:
    def test_asignacion_venta_finca_crea_venta_origen_asignacion(self, client):
        _cleanup_today_asignaciones(client)
        _cleanup_today_cosechas(client)
        # Cosecha de 10 cestas
        r = client.post(f"{API}/tipos-fruta", json={"nombre": f"TEST_AsigVF_{datetime.now().timestamp()}"})
        tid = r.json()["_id"]; created["tipos"].append(tid)
        r = client.post(f"{API}/variedades-fruta", json={"tipo_fruta_id": tid, "nombre": "TEST_V"})
        vid = r.json()["_id"]; created["vars"].append(vid)
        r = client.post(f"{API}/cosechas", json={
            "tipo_fruta_id": tid, "variedad_id": vid,
            "primera_calidad": 10, "segunda_calidad": 0, "tercera_calidad": 0, "descarte": 0,
            "unidad": "cestas", "fecha_cosecha": TODAY_ISO, "lote": "L1",
        })
        created["cosechas"].append(r.json()["_id"])

        # Asignar 3 cestas a venta_finca
        r = client.post(f"{API}/asignaciones-destino", json={
            "destino": "venta_finca", "unidad_ingreso": "cestas",
            "cantidad_ingresada": 3, "fecha": TODAY_ISO, "observaciones": "TEST_VF",
        })
        assert r.status_code == 200, r.text
        aid = r.json()["_id"]
        created["asignaciones"].append(aid)

        # ventas-finca debe tener una con origen=asignacion_destino y asignacion_id=aid
        r = client.get(f"{API}/ventas-finca")
        linked = [v for v in r.json()["ventas"] if v.get("asignacion_id") == aid]
        assert len(linked) == 1
        v = linked[0]
        assert v["origen"] == "asignacion_destino"
        assert v["cantidad_cestas"] == 3

        # PUT: cambiar precio/cliente, intentar borrar origen/asignacion_id
        vid_venta = v["_id"]
        upd = {
            "fecha": v["fecha"], "cantidad_cestas": v["cantidad_cestas"],
            "cantidad_kg": v["cantidad_kg"], "precio_unitario": 8, "total": v["cantidad_kg"] * 8,
            "cliente": "TEST_Cliente_Edit", "observaciones": v.get("observaciones", ""),
            "origen": "manual", "asignacion_id": "",  # intentar romper
        }
        r = client.put(f"{API}/ventas-finca/{vid_venta}", json=upd)
        assert r.status_code == 200, r.text
        upd_v = r.json()
        assert upd_v["precio_unitario"] == 8
        assert upd_v["cliente"] == "TEST_Cliente_Edit"
        # Vínculo preservado
        assert upd_v.get("origen") == "asignacion_destino"
        assert upd_v.get("asignacion_id") == aid


# ============================================================
# Filtro GET ?fecha=
# ============================================================
class TestFiltroFecha:
    def test_filtro_fecha(self, client):
        r = client.get(f"{API}/asignaciones-destino", params={"fecha": TODAY_DATE})
        assert r.status_code == 200
        assert "asignaciones" in r.json()
        # Si hay alguna, todas deben tener fecha que empieza con TODAY_DATE
        for a in r.json()["asignaciones"]:
            assert a["fecha"].startswith(TODAY_DATE)
