"""Tests para Asignación de destino: trazabilidad hacia ventas/frío + cascade delete + edición preservando vínculo."""
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
TODAY = datetime.now(timezone.utc).strftime("%Y-%m-%d") + "T12:00:00.000Z"
TODAY_DATE = TODAY[:10]

created_asignaciones = []


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login falló: {r.text}"
    token = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    yield s
    # cleanup
    for aid in created_asignaciones:
        s.delete(f"{API}/asignaciones-destino/{aid}")


def _find_linked(client, list_path, list_key, aid):
    r = client.get(f"{API}/{list_path}")
    assert r.status_code == 200, r.text
    docs = r.json().get(list_key, [])
    return [d for d in docs if d.get("asignacion_id") == aid]


# ---- Tests por destino: validar creación de registro vinculado ----

def _create_asig(client, destino, cant=2, unidad="cestas"):
    r = client.post(f"{API}/asignaciones-destino", json={
        "destino": destino,
        "unidad_ingreso": unidad,
        "cantidad_ingresada": cant,
        "fecha": TODAY,
        "observaciones": f"TEST_{destino}",
    })
    assert r.status_code == 200, f"create_asig {destino}: {r.status_code} {r.text}"
    d = r.json()
    created_asignaciones.append(d["_id"])
    return d


def test_refrigerar_crea_frio_refrigerado(client):
    asig = _create_asig(client, "refrigerar", 3)
    linked = _find_linked(client, "frio-registros", "registros", asig["_id"])
    assert len(linked) == 1
    f = linked[0]
    assert f["tipo_conservacion"] == "refrigerado"
    assert f["origen"] == "asignacion_destino"
    assert f["cantidad_cestas"] == 3


def test_congelar_crea_frio_congelado(client):
    asig = _create_asig(client, "congelar", 2)
    linked = _find_linked(client, "frio-registros", "registros", asig["_id"])
    assert len(linked) == 1
    assert linked[0]["tipo_conservacion"] == "congelado"


def test_venta_finca_kg_y_precio_cero(client):
    asig = _create_asig(client, "venta_finca", 4)
    linked = _find_linked(client, "ventas-finca", "ventas", asig["_id"])
    assert len(linked) == 1
    v = linked[0]
    assert v["cantidad_cestas"] == 4
    assert v["cantidad_kg"] == 4 * KG_POR_CESTA
    assert v["precio_unitario"] == 0
    assert v["total"] == 0
    assert v["origen"] == "asignacion_destino"


def test_enviar_ciudad(client):
    asig = _create_asig(client, "enviar_ciudad", 1)
    linked = _find_linked(client, "ventas-ciudad", "ventas", asig["_id"])
    assert len(linked) == 1
    assert "Asignación" in linked[0]["observaciones"] or "Asignaci" in linked[0]["observaciones"]


def test_enviar_otra_ciudad_observaciones(client):
    asig = _create_asig(client, "enviar_otra_ciudad", 1)
    linked = _find_linked(client, "ventas-ciudad", "ventas", asig["_id"])
    assert len(linked) == 1
    assert "Otra ciudad" in linked[0]["observaciones"]


def test_descarte(client):
    asig = _create_asig(client, "descarte", 1)
    linked = _find_linked(client, "ventas-descarte", "ventas", asig["_id"])
    assert len(linked) == 1


def test_donaciones(client):
    asig = _create_asig(client, "donaciones", 1)
    linked = _find_linked(client, "ventas-donaciones", "ventas", asig["_id"])
    assert len(linked) == 1


def test_conversion_kg_a_cestas(client):
    # 70 kg debe convertirse a 5 cestas (70/14)
    r = client.post(f"{API}/asignaciones-destino", json={
        "destino": "refrigerar",
        "unidad_ingreso": "kg",
        "cantidad_ingresada": 70,
        "fecha": TODAY,
        "observaciones": "TEST_kg_to_cestas",
    })
    assert r.status_code == 200, r.text
    asig = r.json()
    created_asignaciones.append(asig["_id"])
    assert asig["cantidad_cestas"] == 5
    assert asig["cantidad_kg"] == 70
    linked = _find_linked(client, "frio-registros", "registros", asig["_id"])
    assert len(linked) == 1
    assert linked[0]["cantidad_cestas"] == 5


def test_cascade_delete(client):
    asig = _create_asig(client, "venta_finca", 2)
    aid = asig["_id"]
    # verificar que existe el vinculado
    assert len(_find_linked(client, "ventas-finca", "ventas", aid)) == 1
    # eliminar la asignación
    r = client.delete(f"{API}/asignaciones-destino/{aid}")
    assert r.status_code == 200
    # vinculado debe haberse borrado
    assert _find_linked(client, "ventas-finca", "ventas", aid) == []
    created_asignaciones.remove(aid)


def test_put_venta_finca_preserva_vinculo(client):
    asig = _create_asig(client, "venta_finca", 3)
    aid = asig["_id"]
    linked = _find_linked(client, "ventas-finca", "ventas", aid)
    assert len(linked) == 1
    vid = linked[0]["_id"]
    # editar precio y cliente
    r = client.put(f"{API}/ventas-finca/{vid}", json={
        "fecha": linked[0]["fecha"],
        "cantidad_cestas": linked[0]["cantidad_cestas"],
        "cantidad_kg": linked[0]["cantidad_kg"],
        "precio_unitario": 100,
        "total": linked[0]["cantidad_kg"] * 100,
        "cliente": "Cliente TEST",
        "observaciones": linked[0]["observaciones"],
        # intentar romper el vínculo enviando origen vacío
        "origen": "",
        "asignacion_id": "",
    })
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["precio_unitario"] == 100
    assert updated["cliente"] == "Cliente TEST"
    # vínculo preservado
    assert updated.get("origen") == "asignacion_destino"
    assert updated.get("asignacion_id") == aid


def test_listar_asignaciones_filtro_fecha(client):
    r = client.get(f"{API}/asignaciones-destino", params={"fecha": TODAY_DATE})
    assert r.status_code == 200
    items = r.json().get("asignaciones", [])
    # debe contener al menos las creadas hoy
    ids = {a["_id"] for a in items}
    for aid in created_asignaciones:
        assert aid in ids, f"Asignación {aid} no aparece filtrando por fecha={TODAY_DATE}"
