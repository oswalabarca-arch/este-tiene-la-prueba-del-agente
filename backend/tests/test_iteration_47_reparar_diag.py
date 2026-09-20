"""Tests for iteration 47:
- POST /api/reparar-reasignaciones-huerfanas (dry_run, admin-only, idempotence, only destino=descarte)
- GET /api/analiticas/conciliacion-diagnostico with new keys
- Reasignar with chosen fecha
- Regression: estado-resultados, inicio-operaciones, toggle-activo
"""
import os
import uuid
import pytest
import requests

def _read_backend_url():
    val = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if val:
        return val.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.strip().startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'").rstrip("/")
    except Exception:
        pass
    return ""


BASE_URL = _read_backend_url()
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "oswaldabarca@gmail.com"
ADMIN_PASSWORD = "Elvalle0612$"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"})
    return s


# ---------- Helpers ----------
def _mongo_db():
    from pymongo import MongoClient
    # read directly from backend/.env, stripping quotes
    mongo_url = "mongodb://localhost:27017"
    db_name = "erp_agricola"
    try:
        with open("/app/backend/.env") as f:
            for line in f:
                line = line.strip()
                if line.startswith("MONGO_URL="):
                    mongo_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                elif line.startswith("DB_NAME="):
                    db_name = line.split("=", 1)[1].strip().strip('"').strip("'")
    except Exception:
        pass
    return MongoClient(mongo_url)[db_name]


# ============================================================
# Bloque 1: reparar-reasignaciones-huerfanas
# ============================================================
class TestRepararHuerfanas:
    inserted_ids = []

    def test_1_seed_huerfana(self):
        """Inserta directamente en ventas_ciudad una salida huérfana (test-marked)."""
        db = _mongo_db()
        _id = f"test-huerfana-{uuid.uuid4().hex[:8]}"
        doc = {
            "_id": _id,
            "fecha": "2026-07-10T12:00:00.000Z",
            "cantidad_cestas": 2,
            "cantidad_kg": 28.0,
            "precio_unitario": 0, "total": 0, "cliente": "Reasignado a Descarte",
            "telefono": "", "abono_inicial": 0,
            "observaciones": "Reasignación de cestas sobrantes a Descarte",
            "origen": "reasignacion_salida",
            "createdAt": "2026-07-10T12:00:00.000Z",
            "updatedAt": "2026-07-10T12:00:00.000Z",
            "_test": True,
        }
        db.ventas_ciudad.insert_one(doc)
        TestRepararHuerfanas.inserted_ids.append(("ventas_ciudad", _id))
        assert db.ventas_ciudad.find_one({"_id": _id}) is not None

    def test_2_dry_run_finds(self, admin_client):
        r = admin_client.post(f"{API}/reparar-reasignaciones-huerfanas?dry_run=1")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True
        assert data["dry_run"] is True
        assert data["total"] >= 1
        found = [x for x in data["reparadas"] if x["origen_id"] == TestRepararHuerfanas.inserted_ids[0][1]]
        assert len(found) == 1
        assert found[0]["destino"] == "descarte"
        assert found[0]["cestas"] == 2
        assert found[0]["kg"] == 28.0

    def test_3_apply_creates_entry(self, admin_client):
        r = admin_client.post(f"{API}/reparar-reasignaciones-huerfanas?dry_run=0")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["success"] is True and data["dry_run"] is False
        assert data["total"] >= 1
        # Verify entrada in ventas_descarte
        db = _mongo_db()
        origen_id = TestRepararHuerfanas.inserted_ids[0][1]
        src = db.ventas_ciudad.find_one({"_id": origen_id})
        assert src is not None
        rid = src.get("reasignacion_id")
        assert rid, "salida debe haber quedado emparejada con reasignacion_id"
        entrada = db.ventas_descarte.find_one({"reasignacion_id": rid})
        assert entrada is not None
        assert entrada.get("origen") == "reasignacion_ciudad"
        assert float(entrada.get("cantidad_cestas") or 0) == 2
        assert float(entrada.get("cantidad_kg") or 0) == 28.0
        # remember to cleanup entrada
        TestRepararHuerfanas.inserted_ids.append(("ventas_descarte", entrada["_id"]))

    def test_4_idempotent(self, admin_client):
        r = admin_client.post(f"{API}/reparar-reasignaciones-huerfanas?dry_run=0")
        assert r.status_code == 200
        data = r.json()
        # After the previous apply, our seeded one is now paired. total may be 0 OR contain other pre-existing huerfanas
        origen_id = TestRepararHuerfanas.inserted_ids[0][1]
        matched = [x for x in data["reparadas"] if x["origen_id"] == origen_id]
        assert matched == [], "Segunda pasada debe ser idempotente para el registro sembrado"

    def test_5_non_admin_403(self):
        # Create a non-admin user via API (if allowed) — else use auth/create-admin approach. We'll attempt login with random.
        # Simpler: hit endpoint without any auth token -> should be 401 (not 403). To test 403 we need a user with rol != administrador.
        db = _mongo_db()
        u = db.usuarios.find_one({"rol": {"$ne": "administrador"}, "activo": True})
        if not u:
            pytest.skip("No hay usuario no-admin para probar 403")
        # Try login with that user — we don't know their password. Skip if no known creds.
        pytest.skip("No hay credenciales conocidas de usuario no-admin; se omite validación de 403")

    def test_6_cleanup(self):
        db = _mongo_db()
        for coll, _id in TestRepararHuerfanas.inserted_ids:
            db[coll].delete_one({"_id": _id})
        # verify
        for coll, _id in TestRepararHuerfanas.inserted_ids:
            assert db[coll].find_one({"_id": _id}) is None


# ============================================================
# Bloque 2: conciliacion-diagnostico nuevas claves
# ============================================================
class TestConciliacionDiagnostico:
    def test_new_keys_present(self, admin_client):
        r = admin_client.get(f"{API}/analiticas/conciliacion-diagnostico?gran=mes&anchor=2026-09-15")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("kg_salida_error", "salidas_error", "kg_huerfanas", "huerfanas", "desfase_positivo",
                 "canales", "ajustes_manuales", "kg_ajuste_saldo", "diferencia_periodo"):
            assert k in d, f"falta clave {k}"
        assert isinstance(d["salidas_error"], list)
        assert isinstance(d["huerfanas"], list)

    def test_coherencia(self, admin_client):
        r = admin_client.get(f"{API}/analiticas/conciliacion-diagnostico?gran=mes&anchor=2026-09-15")
        d = r.json()
        aj = float(d.get("kg_ajuste_saldo") or 0)
        if aj > 0:
            suma = float(d.get("kg_huerfanas") or 0) + float(d.get("desfase_positivo") or 0) + float(d.get("kg_salida_error") or 0)
            # tolerance
            assert abs(suma - aj) <= 0.5, f"kg_huerfanas+desfase+salida_error={suma} != kg_ajuste_saldo={aj}"


# ============================================================
# Bloque 3: reasignar con fecha elegida
# ============================================================
class TestReasignarConFecha:
    seeded = []

    def test_1_seed_stock_en_congelar(self, admin_client):
        """Crea una asignacion_destino en ventas_congelar para tener disponible."""
        db = _mongo_db()
        _id = f"test-cong-{uuid.uuid4().hex[:8]}"
        doc = {
            "_id": _id,
            "fecha": "2026-08-01T12:00:00.000Z",
            "cantidad_cestas": 3,
            "cantidad_kg": 42.0,
            "precio_unitario": 0, "total": 0, "cliente": "", "telefono": "", "abono_inicial": 0,
            "observaciones": "TEST asignacion destino",
            "origen": "asignacion_destino",
            "createdAt": "2026-08-01T12:00:00.000Z",
            "updatedAt": "2026-08-01T12:00:00.000Z",
            "_test": True,
        }
        db.ventas_congelar.insert_one(doc)
        TestReasignarConFecha.seeded.append(("ventas_congelar", _id))

    def test_2_reasignar_con_fecha_pasada(self, admin_client):
        payload = {"cantidad_cestas": 1, "destino": "descarte", "fecha": "2026-08-15"}
        r = admin_client.post(f"{API}/ventas-congelar/reasignar", json=payload)
        assert r.status_code == 200, r.text
        # verify salida en congelar + entrada en descarte, ambas con fecha 2026-08-15
        db = _mongo_db()
        salidas = list(db.ventas_congelar.find({"origen": "reasignacion_salida", "reasignacion_destino": "descarte"}))
        salidas_hoy = [s for s in salidas if (s.get("fecha") or "").startswith("2026-08-15")]
        assert len(salidas_hoy) >= 1, "no encontró salida con fecha 2026-08-15"
        rid = salidas_hoy[-1].get("reasignacion_id")
        assert rid
        entrada = db.ventas_descarte.find_one({"reasignacion_id": rid})
        assert entrada is not None
        assert (entrada.get("fecha") or "").startswith("2026-08-15")
        TestReasignarConFecha.seeded.append(("ventas_congelar", salidas_hoy[-1]["_id"]))
        TestReasignarConFecha.seeded.append(("ventas_descarte", entrada["_id"]))

    def test_9_cleanup(self):
        db = _mongo_db()
        for coll, _id in TestReasignarConFecha.seeded:
            db[coll].delete_one({"_id": _id})


# ============================================================
# Bloque 4: Regresión estado-resultados / inicio-operaciones
# ============================================================
class TestRegresionEstadoResultados:
    def test_inicio_operaciones(self, admin_client):
        r = admin_client.get(f"{API}/config/inicio-operaciones")
        assert r.status_code == 200
        d = r.json()
        assert "inicio_operaciones" in d
        assert d["inicio_operaciones"] == "2026-06-01"

    def test_estado_mes5_salarios_cero(self, admin_client):
        r = admin_client.get(f"{API}/analiticas/estado-resultados?anio=2026&mes=5")
        assert r.status_code == 200, r.text
        d = r.json()
        # gastos_operativos.salarios
        sal = None
        go = d.get("gastos_operativos") or {}
        if isinstance(go, dict):
            sal = go.get("salarios")
        assert sal is not None, f"no encontré salarios en gastos_operativos: {d}"
        assert float(sal) == 0.0, f"mes=5 salarios deben ser 0, got {sal}"

    def test_estado_mes6_salarios(self, admin_client):
        r = admin_client.get(f"{API}/analiticas/estado-resultados?anio=2026&mes=6")
        assert r.status_code == 200

    def test_estado_anio_ok(self, admin_client):
        r = admin_client.get(f"{API}/analiticas/estado-resultados?anio=2026")
        assert r.status_code == 200


# ============================================================
# Bloque 5: toggle-activo trabajador
# ============================================================
class TestToggleTrabajador:
    tid = None

    def test_1_create(self, admin_client):
        payload = {"nombre_completo": "TEST_worker_iter47", "documento": "V-TEST47", "cargo": "peon", "salario_diario": 10, "activo": True}
        r = admin_client.post(f"{API}/trabajadores", json=payload)
        assert r.status_code in (200, 201), r.text
        TestToggleTrabajador.tid = r.json().get("_id") or r.json().get("id")
        assert TestToggleTrabajador.tid

    def test_2_toggle_inactivo(self, admin_client):
        r = admin_client.post(f"{API}/trabajadores/{TestToggleTrabajador.tid}/toggle-activo")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("activo") is False
        assert d.get("fecha_inactivo") is not None

    def test_3_toggle_activo(self, admin_client):
        r = admin_client.post(f"{API}/trabajadores/{TestToggleTrabajador.tid}/toggle-activo")
        assert r.status_code == 200
        d = r.json()
        assert d.get("activo") is True
        assert d.get("fecha_inactivo") is None

    def test_9_cleanup(self, admin_client):
        if TestToggleTrabajador.tid:
            admin_client.delete(f"{API}/trabajadores/{TestToggleTrabajador.tid}")
