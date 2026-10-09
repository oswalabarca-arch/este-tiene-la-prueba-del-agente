"""Backend API tests for ERP Agricola."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://erp-agricola.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "oswaldabarca@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "123456")


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "user" in data
    return data["token"]


@pytest.fixture(scope="session")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["success"] is True
        assert "token" in d
        user = d["user"]
        assert user["email"] == ADMIN_EMAIL
        assert user["rol"] == "administrador"
        assert isinstance(user["modulos_asignados"], list)
        assert len(user["modulos_asignados"]) == 12

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"}, timeout=30)
        assert r.status_code == 401

    def test_auth_me(self, auth_headers):
        r = requests.get(f"{API}/auth/me", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert d["rol"] == "administrador"

    def test_auth_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code == 401


# ---------- Users ----------
class TestUsers:
    def test_list_users(self, auth_headers):
        r = requests.get(f"{API}/users", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "users" in d
        assert any(u["email"] == ADMIN_EMAIL for u in d["users"])


# ---------- Plantaciones CRUD ----------
class TestPlantaciones:
    def test_crud(self, auth_headers):
        payload = {"nombre": "TEST_Plant_1", "lote": "L1", "cultivo": "Aguacate", "variedad": "Hass"}
        r = requests.post(f"{API}/plantaciones", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        pid = doc["_id"]
        assert doc["nombre"] == payload["nombre"]

        # List
        r = requests.get(f"{API}/plantaciones", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert any(p["_id"] == pid for p in r.json()["plantaciones"])

        # Update
        upd = {**payload, "nombre": "TEST_Plant_1_upd"}
        r = requests.put(f"{API}/plantaciones/{pid}", headers=auth_headers, json=upd, timeout=30)
        assert r.status_code == 200
        assert r.json()["nombre"] == "TEST_Plant_1_upd"

        # Delete
        r = requests.delete(f"{API}/plantaciones/{pid}", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert r.json()["success"] is True


# ---------- Tipos Fruta + Variedades ----------
class TestFrutaVariedades:
    def test_tipo_variedad(self, auth_headers):
        r = requests.post(f"{API}/tipos-fruta", headers=auth_headers, json={"nombre": "TEST_Aguacate"}, timeout=30)
        assert r.status_code == 200
        tipo = r.json()
        tid = tipo["_id"]
        assert tipo["nombre"] == "TEST_Aguacate"

        r = requests.post(f"{API}/variedades-fruta", headers=auth_headers,
                          json={"tipo_fruta_id": tid, "nombre": "TEST_Hass"}, timeout=30)
        assert r.status_code == 200
        var = r.json()
        vid = var["_id"]

        r = requests.get(f"{API}/variedades-fruta?tipo_fruta_id={tid}", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert any(v["_id"] == vid for v in r.json()["variedades"])

        # Save for downstream
        pytest.tid = tid
        pytest.vid = vid


# ---------- Cosechas ----------
class TestCosechas:
    def test_create_and_filter(self, auth_headers):
        tid = getattr(pytest, "tid", None) or "fake_tid"
        vid = getattr(pytest, "vid", None) or "fake_vid"
        payload = {
            "tipo_fruta_id": tid,
            "variedad_id": vid,
            "primera_calidad": 100, "segunda_calidad": 50, "tercera_calidad": 10, "descarte": 5,
            "unidad": "kg",
            "fecha_cosecha": "2026-01-15",
            "lote": "L1",
        }
        r = requests.post(f"{API}/cosechas", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["primera_calidad"] == 100
        assert doc["unidad"] == "kg"

        # Filter
        r = requests.get(f"{API}/cosechas?fecha_desde=2026-01-01&fecha_hasta=2026-12-31",
                         headers=auth_headers, timeout=30)
        assert r.status_code == 200
        cosechas = r.json()["cosechas"]
        assert any(c["_id"] == doc["_id"] for c in cosechas)


# ---------- Asignaciones destino ----------
class TestAsignaciones:
    def test_cestas_to_kg(self, auth_headers):
        payload = {
            "destino": "venta_finca", "unidad_ingreso": "cestas", "cantidad_ingresada": 10,
            "fecha": "2026-01-15T10:00:00", "observaciones": "TEST",
        }
        r = requests.post(f"{API}/asignaciones-destino", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["cantidad_cestas"] == 10
        assert doc["cantidad_kg"] == 140  # 10 * 14

    def test_kg_to_cestas(self, auth_headers):
        payload = {
            "destino": "frio", "unidad_ingreso": "kg", "cantidad_ingresada": 28,
            "fecha": "2026-01-16T10:00:00",
        }
        r = requests.post(f"{API}/asignaciones-destino", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200
        doc = r.json()
        assert doc["cantidad_kg"] == 28
        assert doc["cantidad_cestas"] == 2  # 28 / 14

    def test_filter_by_fecha(self, auth_headers):
        r = requests.get(f"{API}/asignaciones-destino?fecha=2026-01-15", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert "asignaciones" in r.json()


# ---------- Compras + equipo automatico ----------
class TestComprasEquipos:
    def test_compra_insumo(self, auth_headers):
        payload = {
            "categoria": "fertilizantes", "nombre_producto": "TEST_Urea", "precio": 50,
            "cantidad": 100, "unidad": "kg", "fecha_compra": "2026-01-10",
        }
        r = requests.post(f"{API}/compras", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["nombre_producto"] == "TEST_Urea"
        assert doc.get("es_equipo") in (False, None)

    def test_compra_equipo_crea_equipo(self, auth_headers):
        # Count equipos before
        r0 = requests.get(f"{API}/equipos", headers=auth_headers, timeout=30)
        before = len(r0.json()["equipos"])

        payload = {
            "categoria": "otros", "nombre_producto": "TEST_Tractor_X",
            "precio": 25000, "cantidad": 1, "unidad": "unidades",
            "fecha_compra": "2026-01-12",
            "es_equipo": True, "equipo_categoria": "maquinaria",
            "equipo_marca": "JohnDeere", "equipo_modelo": "T100",
        }
        r = requests.post(f"{API}/compras", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text

        r2 = requests.get(f"{API}/equipos", headers=auth_headers, timeout=30)
        after_list = r2.json()["equipos"]
        assert len(after_list) == before + 1
        assert any(e["nombre"] == "TEST_Tractor_X" for e in after_list)


# ---------- Aplicaciones + Inventario ----------
class TestAplicacionesInventario:
    def test_aplicacion_with_insumos(self, auth_headers):
        payload = {
            "tipo": "fertilizacion", "lote": "L1", "fecha": "2026-01-15",
            "estado": "confirmada",
            "insumos": [{"nombre_producto": "TEST_Urea", "cantidad": 10, "unidad": "kg", "categoria": "fertilizantes"}],
            "observaciones": "TEST aplicacion",
        }
        r = requests.post(f"{API}/aplicaciones", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["insumos"]) == 1
        assert d["insumos"][0]["cantidad"] == 10

    def test_inventario_aggregation(self, auth_headers):
        r = requests.get(f"{API}/inventario", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        inv = r.json()["inventario"]
        # Find TEST_Urea
        urea = next((i for i in inv if i["nombre_producto"] == "TEST_Urea"), None)
        assert urea is not None, "TEST_Urea not found in inventario"
        assert urea["total_comprado"] == 100
        assert urea["total_enviado"] == 10
        assert urea["total_disponible"] == 90


# ---------- Actividades ----------
class TestActividades:
    def test_horas_hombre_calc(self, auth_headers):
        payload = {
            "tipo": "deshierbar", "cantidad_trabajadores": 5, "horas_trabajo": 8,
            "lote": "L1", "fecha_actividad": "2026-01-15",
        }
        r = requests.post(f"{API}/actividades", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["horas_hombre"] == 40


# ---------- Ventas ----------
class TestVentas:
    def test_ventas_finca(self, auth_headers):
        payload = {"fecha": "2026-01-15", "cantidad_cestas": 5, "cantidad_kg": 70, "precio_unitario": 2, "total": 140, "cliente": "TEST_Cli"}
        r = requests.post(f"{API}/ventas-finca", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/ventas-finca", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert "ventas" in r.json()

    def test_ventas_ciudad(self, auth_headers):
        payload = {"fecha": "2026-01-15", "cantidad_cestas": 10, "cantidad_kg": 140, "precio_unitario": 3, "total": 420}
        r = requests.post(f"{API}/ventas-ciudad", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/ventas-ciudad", headers=auth_headers, timeout=30)
        assert r.status_code == 200


# ---------- Frio ----------
class TestFrio:
    def test_crud(self, auth_headers):
        payload = {"fecha_ingreso": "2026-01-15", "cantidad_cestas": 20, "lote": "L1", "variedad": "Hass"}
        r = requests.post(f"{API}/frio-registros", headers=auth_headers, json=payload, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/frio-registros", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert "registros" in r.json()


# ---------- Trabajadores ----------
class TestTrabajadores:
    def test_crud(self, auth_headers):
        r = requests.post(f"{API}/trabajadores", headers=auth_headers,
                          json={"nombre_completo": "TEST_Worker", "documento": "12345", "cargo": "operario", "salario_diario": 50}, timeout=30)
        assert r.status_code == 200
        r = requests.get(f"{API}/trabajadores", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        assert "trabajadores" in r.json()


# ---------- Analiticas ----------
class TestAnaliticas:
    def test_resumen(self, auth_headers):
        r = requests.get(f"{API}/analiticas/resumen", headers=auth_headers, timeout=30)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_kg_cosechado", "total_primera_calidad_kg", "total_descarte_kg",
                  "n_usuarios", "n_plantaciones", "n_aplicaciones", "n_actividades"):
            assert k in d
        # Cosecha created above: 100+50+10+5 = 165 kg
        assert d["total_kg_cosechado"] >= 165
        assert d["total_primera_calidad_kg"] >= 100
