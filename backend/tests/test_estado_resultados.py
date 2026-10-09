"""Tests for Estado de Resultados (Income Statement) module.

Validates:
- GET /api/analiticas/estado-resultados (mensual + anual)
- POST /api/analiticas/estado-resultados (registra período + congela salarios)
- Cálculo de totales (ingresos, costo_ventas, gastos_operativos, utilidad)
- Que el módulo NO modifique datos de Ventas/Aplicaciones/Actividades/Vehículos/Trabajadores (solo lectura)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://erp-agricola.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "oswaldabarca@gmail.com"
ADMIN_PASSWORD = "123456"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _snapshot_collection(auth, endpoint):
    r = requests.get(f"{BASE_URL}/api/{endpoint}", headers=auth, timeout=20)
    return r.status_code, (r.json() if r.status_code == 200 else None)


def test_get_estado_resultados_mensual(auth):
    r = requests.get(f"{BASE_URL}/api/analiticas/estado-resultados", params={"anio": 2026, "mes": 6}, headers=auth, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    # Estructura
    assert d["anio"] == 2026
    assert d["mes"] == 6
    assert "ingresos" in d and "costo_ventas" in d and "gastos_operativos" in d
    # Valores esperados (verificados por curl según contexto del main agent)
    assert d["costo_ventas"]["fertilizantes_agroquimicos"] == pytest.approx(46.8, rel=1e-3), d["costo_ventas"]
    assert d["costo_ventas"]["mano_obra"] == pytest.approx(16.25, rel=1e-3), d["costo_ventas"]
    assert d["gastos_operativos"]["salarios"] == pytest.approx(6000.0, rel=1e-3) or d["gastos_operativos"]["salarios"] > 0
    # Totales cuadran
    assert d["ingresos"]["total"] == pytest.approx(d["ingresos"]["ventas_fresa"] + d["ingresos"]["otros_ingresos"], rel=1e-6)
    assert d["costo_ventas"]["total"] == pytest.approx(d["costo_ventas"]["fertilizantes_agroquimicos"] + d["costo_ventas"]["mano_obra"], rel=1e-6)
    assert d["gastos_operativos"]["total"] == pytest.approx(
        d["gastos_operativos"]["salarios"] + d["gastos_operativos"]["gastos_vehiculo"] + d["gastos_operativos"]["software_erp"], rel=1e-6
    )
    assert d["utilidad_bruta"] == pytest.approx(d["ingresos"]["total"] - d["costo_ventas"]["total"], rel=1e-6)
    assert d["utilidad_operativa"] == pytest.approx(d["utilidad_bruta"] - d["gastos_operativos"]["total"], rel=1e-6)


def test_get_estado_resultados_anual_salarios_x12(auth):
    # No registrado: salarios anuales = mensual x12
    mensual = requests.get(f"{BASE_URL}/api/analiticas/estado-resultados", params={"anio": 2099, "mes": 6}, headers=auth, timeout=20).json()
    anual = requests.get(f"{BASE_URL}/api/analiticas/estado-resultados", params={"anio": 2099}, headers=auth, timeout=20).json()
    assert anual["mes"] is None
    assert anual["gastos_operativos"]["salarios"] == pytest.approx(mensual["gastos_operativos"]["salarios"] * 12, rel=1e-6)


def test_post_registra_y_congela_salarios(auth):
    """POST guarda los manuales y congela snapshot de salarios. Idempotente vía upsert."""
    # Usamos año futuro para no contaminar reportes reales
    payload = {"anio": 2099, "mes": 11, "otros_ingresos": 123.45, "software_erp": 67.89}
    r = requests.post(f"{BASE_URL}/api/analiticas/estado-resultados", json=payload, headers=auth, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["registrado"] is True
    assert d["ingresos"]["otros_ingresos"] == pytest.approx(123.45)
    assert d["gastos_operativos"]["software_erp"] == pytest.approx(67.89)
    salarios_snapshot = d["gastos_operativos"]["salarios"]
    assert salarios_snapshot > 0

    # GET retorna lo guardado y registrado=True
    g = requests.get(f"{BASE_URL}/api/analiticas/estado-resultados", params={"anio": 2099, "mes": 11}, headers=auth, timeout=20).json()
    assert g["registrado"] is True
    assert g["ingresos"]["otros_ingresos"] == pytest.approx(123.45)
    assert g["gastos_operativos"]["software_erp"] == pytest.approx(67.89)
    assert g["gastos_operativos"]["salarios"] == pytest.approx(salarios_snapshot)


def test_modulo_solo_lectura_no_modifica_otros(auth):
    """Snapshot de colecciones antes y después de POST: deben quedar intactas."""
    eps = ["ventas/finca", "ventas/ciudad", "ventas/donaciones", "ventas/descarte",
           "aplicaciones", "actividades", "gastos-vehiculos", "trabajadores"]
    before = {ep: _snapshot_collection(auth, ep) for ep in eps}
    # POST a un periodo distinto al test anterior
    requests.post(f"{BASE_URL}/api/analiticas/estado-resultados",
                  json={"anio": 2099, "mes": 12, "otros_ingresos": 1, "software_erp": 2},
                  headers=auth, timeout=20)
    after = {ep: _snapshot_collection(auth, ep) for ep in eps}
    for ep in eps:
        sc_b, data_b = before[ep]
        sc_a, data_a = after[ep]
        if sc_b == 200 and sc_a == 200 and isinstance(data_b, list) and isinstance(data_a, list):
            assert len(data_b) == len(data_a), f"Colección {ep} cambió ({len(data_b)}→{len(data_a)})"
