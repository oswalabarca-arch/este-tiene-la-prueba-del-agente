"""Tests for costos-kg-tendencia and costos por kg panel (read-only).
Iteration 32: validates GET /api/analiticas/costos-kg-tendencia and that
estado-resultados response includes the cosecha block with kg breakdown.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://agro-dashboard-14.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "oswaldabarca@gmail.com"
ADMIN_PASS = "123456"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# --- Snapshot helpers to verify READ-ONLY -----------------------------------
READONLY_COLLECTIONS_ENDPOINTS = {
    "cosechas": "/api/cosecha",
    "aplicaciones": "/api/aplicaciones",
    "actividades": "/api/actividades",
    "gastos_vehiculos": "/api/gastos-vehiculos",
}


def _snapshot(auth_headers):
    snap = {}
    for k, ep in READONLY_COLLECTIONS_ENDPOINTS.items():
        r = requests.get(f"{BASE_URL}{ep}", headers=auth_headers, timeout=30)
        if r.status_code == 200:
            try:
                snap[k] = len(r.json())
            except Exception:
                snap[k] = -1
        else:
            snap[k] = r.status_code
    return snap


# --- Tendencia tests ---------------------------------------------------------
class TestTendenciaCostosKg:
    def test_tendencia_2026_estructura(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/analiticas/costos-kg-tendencia", params={"anio": 2026}, headers=auth_headers, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["anio"] == 2026
        assert isinstance(data["meses"], list)
        assert len(data["meses"]) == 12
        keys_needed = {"mes", "kg_cosechados", "kg_descarte", "kg_vendible",
                       "costo_por_kg", "costo_total_por_kg", "costo_real_vendible", "costo_total_real_vendible"}
        for i, m in enumerate(data["meses"], start=1):
            assert m["mes"] == i
            assert keys_needed.issubset(set(m.keys())), f"falta clave en mes {i}: {set(m.keys())}"

    def test_tendencia_2026_mayo_valores(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/analiticas/costos-kg-tendencia", params={"anio": 2026}, headers=auth_headers, timeout=60)
        assert r.status_code == 200
        mayo = next((m for m in r.json()["meses"] if m["mes"] == 5), None)
        assert mayo is not None
        # kg_cosechados=98 esperado según el problem statement
        assert mayo["kg_cosechados"] == 98, f"kg_cosechados esperado=98, got={mayo['kg_cosechados']}"
        # costo_total_por_kg ≈ 61.22
        assert abs(mayo["costo_total_por_kg"] - 61.22) < 0.05, mayo
        # costo_total_real_vendible ≈ 71.43
        assert abs(mayo["costo_total_real_vendible"] - 71.43) < 0.05, mayo

    def test_tendencia_anio_sin_cosecha(self, auth_headers):
        # Año futuro improbable: kg_cosechados todos en 0
        r = requests.get(f"{BASE_URL}/api/analiticas/costos-kg-tendencia", params={"anio": 2099}, headers=auth_headers, timeout=60)
        assert r.status_code == 200
        meses = r.json()["meses"]
        assert all(m["kg_cosechados"] == 0 for m in meses)
        # Cuando no hay kg, los costos por kg deben ser 0 (no NaN ni 500)
        assert all(m["costo_por_kg"] == 0 and m["costo_total_real_vendible"] == 0 for m in meses)

    def test_tendencia_requiere_auth(self):
        r = requests.get(f"{BASE_URL}/api/analiticas/costos-kg-tendencia", params={"anio": 2026}, timeout=30)
        assert r.status_code in (401, 403)


# --- estado-resultados expone bloque cosecha --------------------------------
class TestEstadoResultadosCosechaBlock:
    def test_mensual_incluye_cosecha(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/analiticas/estado-resultados", params={"anio": 2026, "mes": 5}, headers=auth_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "cosecha" in data, data.keys()
        c = data["cosecha"]
        assert {"kg_cosechados", "kg_descarte", "kg_vendible"}.issubset(c.keys())
        assert c["kg_cosechados"] == 98
        assert c["kg_vendible"] == round(c["kg_cosechados"] - c["kg_descarte"], 2)

    def test_anual_incluye_cosecha(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/analiticas/estado-resultados", params={"anio": 2026}, headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert "cosecha" in r.json()


# --- Solo lectura: tendencia + estado-resultados GET no modifican datos -----
class TestSoloLectura:
    def test_get_tendencia_no_modifica(self, auth_headers):
        before = _snapshot(auth_headers)
        for anio in (2024, 2025, 2026, 2099):
            requests.get(f"{BASE_URL}/api/analiticas/costos-kg-tendencia", params={"anio": anio}, headers=auth_headers, timeout=60)
        after = _snapshot(auth_headers)
        assert before == after, f"colecciones cambiaron: before={before} after={after}"
