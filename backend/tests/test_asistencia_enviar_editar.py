"""Tests for asistencia enviar/reabrir/marcar feature (block/unblock day)."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://agro-dashboard-14.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "oswaldabarca@gmail.com"
ADMIN_PASS = "123456"
TEST_USER_EMAIL = "zztest_campo@test.com"
TEST_USER_PASS = "Test1234"
FUTURE_DATE = "2026-08-15"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def obrero_id(admin_h):
    r = requests.post(f"{BASE}/api/asistencia/obreros", json={"nombre": "ZZTEST_Campo"}, headers=admin_h)
    assert r.status_code == 200, r.text
    oid = r.json()["_id"] if "_id" in r.json() else r.json().get("id")
    yield oid
    requests.delete(f"{BASE}/api/asistencia/obreros/{oid}", headers=admin_h)


@pytest.fixture(scope="module", autouse=True)
def cleanup_dia(admin_h):
    # Reset the day at start and end
    requests.post(f"{BASE}/api/asistencia/reabrir", json={"fecha": FUTURE_DATE}, headers=admin_h)
    yield
    requests.post(f"{BASE}/api/asistencia/reabrir", json={"fecha": FUTURE_DATE}, headers=admin_h)


@pytest.fixture(scope="module")
def test_user(admin_h):
    # Create restricted user with control_asistencia module but WITHOUT eliminar permission
    payload = {
        "nombre_completo": "ZZTest Campo User",
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASS,
        "rol": "operario",
        "modulos_asignados": ["control_asistencia"],
        "permisos_modulos": {
            "control_asistencia": {"ver": True, "crear": True, "editar": True, "eliminar": False}
        },
    }
    # Delete if exists first
    lst = requests.get(f"{BASE}/api/users", headers=admin_h).json().get("users", [])
    for u in lst:
        if u.get("email") == TEST_USER_EMAIL:
            requests.delete(f"{BASE}/api/users/{u['_id']}", headers=admin_h)
    r = requests.post(f"{BASE}/api/users", json=payload, headers=admin_h)
    assert r.status_code in (200, 201), r.text
    uid = r.json()["_id"]
    yield TEST_USER_EMAIL
    requests.delete(f"{BASE}/api/users/{uid}", headers=admin_h)


@pytest.fixture(scope="module")
def user_token(test_user):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": TEST_USER_EMAIL, "password": TEST_USER_PASS})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# Test 1: mark before enviar works
def test_1_marcar_presente(admin_h, obrero_id):
    r = requests.post(
        f"{BASE}/api/asistencia/marcar",
        json={"obrero_id": obrero_id, "fecha": FUTURE_DATE, "estado": "presente"},
        headers=admin_h,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("estado") == "presente"


# Test 2: GET /asistencia/dia returns enviado=false
def test_2_dia_not_enviado(admin_h):
    r = requests.get(f"{BASE}/api/asistencia/dia", params={"fecha": FUTURE_DATE}, headers=admin_h)
    assert r.status_code == 200
    assert r.json().get("enviado") in (False, None)


# Test 3: POST /asistencia/enviar locks the day
def test_3_enviar_bloquea(admin_h):
    r = requests.post(f"{BASE}/api/asistencia/enviar", json={"fecha": FUTURE_DATE}, headers=admin_h)
    assert r.status_code == 200, r.text
    assert r.json().get("enviado") is True
    # verify
    r2 = requests.get(f"{BASE}/api/asistencia/dia", params={"fecha": FUTURE_DATE}, headers=admin_h)
    assert r2.json().get("enviado") is True


# Test 4: marcar returns 423 when locked
def test_4_marcar_423_when_locked(admin_h, obrero_id):
    r = requests.post(
        f"{BASE}/api/asistencia/marcar",
        json={"obrero_id": obrero_id, "fecha": FUTURE_DATE, "estado": "medio_dia"},
        headers=admin_h,
    )
    assert r.status_code == 423, r.text


# Test 5: restricted user (without eliminar) cannot reabrir → 403
def test_5_user_sin_permiso_reabrir_403(user_token):
    h = {"Authorization": f"Bearer {user_token}"}
    r = requests.post(f"{BASE}/api/asistencia/reabrir", json={"fecha": FUTURE_DATE}, headers=h)
    assert r.status_code == 403, r.text


# Test 6: restricted user sees enviado=true on GET /asistencia/dia
def test_6_user_ve_bloqueado(user_token):
    h = {"Authorization": f"Bearer {user_token}"}
    r = requests.get(f"{BASE}/api/asistencia/dia", params={"fecha": FUTURE_DATE}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json().get("enviado") is True


# Test 7: admin can reabrir
def test_7_admin_reabrir(admin_h):
    r = requests.post(f"{BASE}/api/asistencia/reabrir", json={"fecha": FUTURE_DATE}, headers=admin_h)
    assert r.status_code == 200
    assert r.json().get("enviado") is False


# Test 8: after reabrir, marcar works again with medio_dia
def test_8_marcar_after_reabrir(admin_h, obrero_id):
    r = requests.post(
        f"{BASE}/api/asistencia/marcar",
        json={"obrero_id": obrero_id, "fecha": FUTURE_DATE, "estado": "medio_dia"},
        headers=admin_h,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("estado") == "medio_dia"
