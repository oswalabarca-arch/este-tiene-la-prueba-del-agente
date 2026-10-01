"""Tests para HORAS EXTRAS (iteración 48) - asistencia."""
import os
import pytest
import requests
from datetime import date, timedelta

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://agro-dashboard-14.preview.emergentagent.com").rstrip("/")
ADMIN_EMAIL = "oswaldabarca@gmail.com"
ADMIN_PASSWORD = "Elvalle0612$"


@pytest.fixture(scope="module")
def admin_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"login falló: {r.status_code} {r.text}"
    token = r.json().get("token")
    assert token
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def obrero(admin_client):
    """Usa un obrero existente activo o crea uno TEST_."""
    r = admin_client.get(f"{BASE_URL}/api/asistencia/obreros")
    assert r.status_code == 200
    activos = [o for o in r.json()["obreros"] if o.get("activo")]
    if activos:
        return activos[0]
    r = admin_client.post(f"{BASE_URL}/api/asistencia/obreros",
                          json={"nombre": "TEST_HE_Worker", "cargo": "test", "activo": True})
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def test_fecha(admin_client):
    """Fecha reciente no enviada. Elige lunes de la próxima semana para evitar colisiones."""
    today = date.today()
    # próximo lunes +7 (futura, raramente enviada)
    monday_next = today + timedelta(days=(7 - today.weekday()) % 7 + 7)
    f = monday_next.isoformat()
    # Asegurar no enviado
    r = admin_client.post(f"{BASE_URL}/api/asistencia/reabrir", json={"fecha": f})
    # 200 ok (si no estaba enviado también)
    return f


def _cleanup(admin_client, obrero_id, fecha):
    try:
        admin_client.post(f"{BASE_URL}/api/asistencia/horas-extra",
                          json={"obrero_id": obrero_id, "fecha": fecha, "horas_extra": 0})
        admin_client.post(f"{BASE_URL}/api/asistencia/marcar",
                          json={"obrero_id": obrero_id, "fecha": fecha, "estado": ""})
    except Exception:
        pass


class TestHorasExtras:
    def test_set_horas_extra_persistencia(self, admin_client, obrero, test_fecha):
        oid = obrero["_id"]
        # Marcar presente
        r = admin_client.post(f"{BASE_URL}/api/asistencia/marcar",
                              json={"obrero_id": oid, "fecha": test_fecha, "estado": "presente"})
        assert r.status_code == 200
        # Setear 2 horas extra
        r = admin_client.post(f"{BASE_URL}/api/asistencia/horas-extra",
                              json={"obrero_id": oid, "fecha": test_fecha, "horas_extra": 2})
        assert r.status_code == 200, r.text
        assert r.json()["horas_extra"] == 2.0

        # GET día -> debe reflejar horas_extra=2
        r = admin_client.get(f"{BASE_URL}/api/asistencia/dia", params={"fecha": test_fecha})
        assert r.status_code == 200
        fila = next((f for f in r.json()["filas"] if f["obrero_id"] == oid), None)
        assert fila is not None
        assert fila["horas_extra"] == 2.0
        assert fila["estado"] == "presente"
        _cleanup(admin_client, oid, test_fecha)

    def test_set_horas_extra_cero_elimina_si_no_hay_estado(self, admin_client, obrero, test_fecha):
        oid = obrero["_id"]
        # Sin estado, con horas extras
        admin_client.post(f"{BASE_URL}/api/asistencia/horas-extra",
                          json={"obrero_id": oid, "fecha": test_fecha, "horas_extra": 3})
        # Luego 0 -> debería desaparecer
        admin_client.post(f"{BASE_URL}/api/asistencia/horas-extra",
                          json={"obrero_id": oid, "fecha": test_fecha, "horas_extra": 0})
        r = admin_client.get(f"{BASE_URL}/api/asistencia/dia", params={"fecha": test_fecha})
        fila = next((f for f in r.json()["filas"] if f["obrero_id"] == oid), None)
        assert fila["horas_extra"] == 0
        assert fila["estado"] in (None, "")

    def test_horas_extra_conservadas_al_desmarcar(self, admin_client, obrero, test_fecha):
        oid = obrero["_id"]
        admin_client.post(f"{BASE_URL}/api/asistencia/marcar",
                          json={"obrero_id": oid, "fecha": test_fecha, "estado": "presente"})
        admin_client.post(f"{BASE_URL}/api/asistencia/horas-extra",
                          json={"obrero_id": oid, "fecha": test_fecha, "horas_extra": 2})
        # Desmarcar estado
        r = admin_client.post(f"{BASE_URL}/api/asistencia/marcar",
                              json={"obrero_id": oid, "fecha": test_fecha, "estado": ""})
        assert r.status_code == 200
        r = admin_client.get(f"{BASE_URL}/api/asistencia/dia", params={"fecha": test_fecha})
        fila = next((f for f in r.json()["filas"] if f["obrero_id"] == oid), None)
        # horas_extra se conservan
        assert fila["horas_extra"] == 2.0
        _cleanup(admin_client, oid, test_fecha)

    def test_bloqueado_cuando_enviado(self, admin_client, obrero, test_fecha):
        oid = obrero["_id"]
        admin_client.post(f"{BASE_URL}/api/asistencia/enviar", json={"fecha": test_fecha})
        r = admin_client.post(f"{BASE_URL}/api/asistencia/horas-extra",
                              json={"obrero_id": oid, "fecha": test_fecha, "horas_extra": 1})
        assert r.status_code == 423
        # Reabrir
        admin_client.post(f"{BASE_URL}/api/asistencia/reabrir", json={"fecha": test_fecha})

    def test_semana_calculo_bcv_con_horas_extra(self, admin_client, obrero, test_fecha):
        """Salario 12$ + presente + 2 horas extras => BCV = 12 + 2*(12/8) = 15."""
        oid = obrero["_id"]
        d = date.fromisoformat(test_fecha)
        lunes = (d - timedelta(days=d.weekday())).isoformat()
        # salario individual 12
        admin_client.post(f"{BASE_URL}/api/asistencia/config",
                          json={"desde": lunes, "salario_default": 12, "tasa": 100})
        admin_client.post(f"{BASE_URL}/api/asistencia/config/salario",
                          json={"desde": lunes, "obrero_id": oid, "salario": 12})
        admin_client.post(f"{BASE_URL}/api/asistencia/marcar",
                          json={"obrero_id": oid, "fecha": test_fecha, "estado": "presente"})
        admin_client.post(f"{BASE_URL}/api/asistencia/horas-extra",
                          json={"obrero_id": oid, "fecha": test_fecha, "horas_extra": 2})

        r = admin_client.get(f"{BASE_URL}/api/asistencia/semana", params={"fecha": test_fecha})
        assert r.status_code == 200
        js = r.json()
        fila = next((f for f in js["filas"] if f["obrero_id"] == oid), None)
        assert fila is not None, "obrero no en respuesta semana"
        assert fila["jornales"] == 1.0
        assert fila["horas_extra"] == 2.0
        assert fila["bcv"] == 15.0, f"bcv esperado 15.0 got {fila['bcv']}"
        assert fila["horas_dias"].get(test_fecha) == 2.0
        assert js["total_horas_extra"] >= 2.0

        _cleanup(admin_client, oid, test_fecha)
        # limpiar salario individual
        admin_client.post(f"{BASE_URL}/api/asistencia/config/salario",
                          json={"desde": lunes, "obrero_id": oid, "salario": None})

    def test_resumen_mensual_incluye_horas_extra(self, admin_client, obrero, test_fecha):
        oid = obrero["_id"]
        d = date.fromisoformat(test_fecha)
        lunes = (d - timedelta(days=d.weekday())).isoformat()
        admin_client.post(f"{BASE_URL}/api/asistencia/config",
                          json={"desde": lunes, "salario_default": 12, "tasa": 100})
        admin_client.post(f"{BASE_URL}/api/asistencia/config/salario",
                          json={"desde": lunes, "obrero_id": oid, "salario": 12})
        admin_client.post(f"{BASE_URL}/api/asistencia/marcar",
                          json={"obrero_id": oid, "fecha": test_fecha, "estado": "presente"})
        admin_client.post(f"{BASE_URL}/api/asistencia/horas-extra",
                          json={"obrero_id": oid, "fecha": test_fecha, "horas_extra": 2})

        r = admin_client.get(f"{BASE_URL}/api/asistencia/resumen-mensual",
                             params={"anio": d.year, "mes": d.month})
        assert r.status_code == 200
        js = r.json()
        fila = next((f for f in js["filas"] if f["obrero_id"] == oid), None)
        assert fila is not None
        assert fila["horas_extra"] >= 2.0
        # BCV debería contener al menos los 15 (puede haber más días si fixture reutilizó obrero)
        assert fila["bcv"] >= 15.0
        assert js["total_horas_extra"] >= 2.0

        _cleanup(admin_client, oid, test_fecha)
        admin_client.post(f"{BASE_URL}/api/asistencia/config/salario",
                          json={"desde": lunes, "obrero_id": oid, "salario": None})
