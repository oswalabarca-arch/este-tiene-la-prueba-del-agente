"""ERP Agrícola - FastAPI backend
Modelado a partir de los endpoints y datos del proyecto original
"""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import io
import bcrypt
import jwt
import logging
import requests
from PIL import Image, ImageOps
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict

# Zona horaria de Venezuela (UTC-4). Definida temprano para uso global.
VE_TZ = timezone(timedelta(hours=-4))

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# -------- DB --------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# -------- App --------
app = FastAPI(title="ERP Agrícola")
api = APIRouter(prefix="/api")

# -------- Auth helpers --------
JWT_ALG = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
ACCESS_TTL = timedelta(days=7)


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False


def create_token(user_id: str, email: str) -> str:
    return jwt.encode(
        {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + ACCESS_TTL, "type": "access"},
        JWT_SECRET,
        algorithm=JWT_ALG,
    )


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        raise HTTPException(401, "No autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user = await db.users.find_one({"_id": payload["sub"]})
        if not user:
            raise HTTPException(401, "Usuario no encontrado")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido")


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("rol") != "administrador":
        raise HTTPException(403, "Sólo administrador")
    return user


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ============================================================
# OBJECT STORAGE (Emergent) - para fotos de fichas técnicas
# ============================================================
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "erp-agricola"
_storage_key = None
MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}


def _optimize_image(data: bytes) -> tuple[bytes, str, str]:
    """Reduce el peso de la imagen conservando nitidez para leer fichas técnicas.
    Redimensiona a máx 2000px por lado y recomprime como JPEG de alta calidad.
    Devuelve (bytes_optimizados, content_type, ext). Si algo falla, devuelve el original."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)  # respeta orientación de fotos de celular
        if img.mode in ("RGBA", "P", "LA"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            img_rgb = img.convert("RGBA")
            bg.paste(img_rgb, mask=img_rgb.split()[-1])
            img = bg
        else:
            img = img.convert("RGB")
        max_side = 2000
        if max(img.size) > max_side:
            img.thumbnail((max_side, max_side), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=82, optimize=True, progressive=True)
        return out.getvalue(), "image/jpeg", "jpg"
    except Exception as e:
        logging.warning(f"Image optimize skipped: {e}")
        return data, "application/octet-stream", "bin"


def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    if resp.status_code == 403:
        # storage_key expirado -> re-init una vez
        globals()["_storage_key"] = None
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key, "Content-Type": content_type}, data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 403:
        globals()["_storage_key"] = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ============================================================
# AUTH
# ============================================================
class LoginIn(BaseModel):
    email: EmailStr
    password: str


@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(401, "Credenciales inválidas")
    token = create_token(user["_id"], email)
    response.set_cookie("access_token", token, httponly=True, samesite="lax", secure=False, max_age=int(ACCESS_TTL.total_seconds()), path="/")
    user.pop("password_hash", None)
    return {"success": True, "user": user, "token": token}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"success": True}


class CreateAdminIn(BaseModel):
    nombre_completo: str = "Administrador"
    email: EmailStr
    password: str


@api.post("/auth/create-admin")
async def create_admin_public(payload: CreateAdminIn):
    """Crea el primer administrador sólo si no hay ninguno aún."""
    exists = await db.users.find_one({"rol": "administrador"})
    if exists:
        raise HTTPException(400, "Ya existe un administrador")
    doc = {
        "_id": new_id(),
        "nombre_completo": payload.nombre_completo,
        "email": payload.email.lower().strip(),
        "password_hash": hash_password(payload.password),
        "salario": 0,
        "rol": "administrador",
        "modulos_asignados": MODULOS_DISPONIBLES,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    await db.users.insert_one(doc)
    return {"success": True}


# ============================================================
# USERS
# ============================================================
MODULOS_DISPONIBLES = [
    "usuarios", "control_asistencia", "plantaciones", "equipos", "actividades", "aplicaciones",
    "cosecha", "ventas", "frio", "inventario", "ficha_tecnica", "compras", "analiticas",
    "recursos_humanos",
]

ROLES = ["administrador", "ingeniero", "encargado_campo", "operario"]


class UserCreate(BaseModel):
    nombre_completo: str
    email: EmailStr
    password: str
    rol: str = "operario"
    salario: float = 0
    modulos_asignados: List[str] = []
    permisos_modulos: Optional[Dict[str, Dict[str, bool]]] = None


class UserUpdate(BaseModel):
    nombre_completo: Optional[str] = None
    email: Optional[EmailStr] = None
    rol: Optional[str] = None
    salario: Optional[float] = None
    modulos_asignados: Optional[List[str]] = None
    permisos_modulos: Optional[Dict[str, Dict[str, bool]]] = None


class PasswordChange(BaseModel):
    password: str


@api.get("/users")
async def list_users(user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"password_hash": 0}).to_list(1000)
    return {"users": users}


@api.post("/users")
async def create_user(payload: UserCreate, _: dict = Depends(require_admin)):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email ya existe")
    doc = {
        "_id": new_id(),
        "nombre_completo": payload.nombre_completo,
        "email": email,
        "password_hash": hash_password(payload.password),
        "rol": payload.rol,
        "salario": payload.salario,
        "modulos_asignados": payload.modulos_asignados,
        "permisos_modulos": payload.permisos_modulos or {},
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("password_hash", None)
    return doc


@api.put("/users/{uid}")
async def update_user(uid: str, payload: UserUpdate, _: dict = Depends(require_admin)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "email" in update:
        update["email"] = update["email"].lower().strip()
    update["updatedAt"] = now_iso()
    res = await db.users.update_one({"_id": uid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "No encontrado")
    user = await db.users.find_one({"_id": uid}, {"password_hash": 0})
    return user


@api.put("/users/{uid}/password")
async def change_password(uid: str, payload: PasswordChange, _: dict = Depends(require_admin)):
    res = await db.users.update_one({"_id": uid}, {"$set": {"password_hash": hash_password(payload.password), "updatedAt": now_iso()}})
    if res.matched_count == 0:
        raise HTTPException(404, "No encontrado")
    return {"success": True}


@api.delete("/users/{uid}")
async def delete_user(uid: str, _: dict = Depends(require_admin)):
    await db.users.delete_one({"_id": uid})
    return {"success": True}


# ============================================================
# Helper genérico CRUD por colección
# ============================================================
async def _list(coll: str, key: str, filt: dict = None, sort_field: str = "createdAt"):
    docs = await db[coll].find(filt or {}).sort(sort_field, -1).to_list(5000)
    return {key: docs}


async def _create(coll: str, doc: dict, user: dict):
    doc["_id"] = new_id()
    doc["createdAt"] = now_iso()
    doc["updatedAt"] = now_iso()
    doc.setdefault("usuario_email", user.get("email"))
    doc.setdefault("usuario_name", user.get("nombre_completo"))
    await db[coll].insert_one(doc)
    return doc


async def _update(coll: str, doc_id: str, payload: dict):
    payload = {k: v for k, v in payload.items() if v is not None}
    payload["updatedAt"] = now_iso()
    res = await db[coll].update_one({"_id": doc_id}, {"$set": payload})
    if res.matched_count == 0:
        raise HTTPException(404, "No encontrado")
    return await db[coll].find_one({"_id": doc_id})


async def _delete(coll: str, doc_id: str):
    res = await db[coll].delete_one({"_id": doc_id})
    return {"success": res.deleted_count > 0}


# ============================================================
# TIPOS DE FRUTA Y VARIEDADES
# ============================================================
class TipoFrutaIn(BaseModel):
    nombre: str
    descripcion: str = ""


@api.get("/tipos-fruta")
async def list_tipos_fruta(_: dict = Depends(get_current_user)):
    return await _list("tipos_fruta", "tipos_fruta")


@api.post("/tipos-fruta")
async def create_tipo_fruta(payload: TipoFrutaIn, user: dict = Depends(get_current_user)):
    return await _create("tipos_fruta", payload.model_dump(), user)


@api.put("/tipos-fruta/{tid}")
async def update_tipo_fruta(tid: str, payload: TipoFrutaIn, _: dict = Depends(get_current_user)):
    return await _update("tipos_fruta", tid, payload.model_dump())


@api.delete("/tipos-fruta/{tid}")
async def delete_tipo_fruta(tid: str, _: dict = Depends(get_current_user)):
    return await _delete("tipos_fruta", tid)


class VariedadIn(BaseModel):
    tipo_fruta_id: str
    nombre: str
    descripcion: str = ""


@api.get("/variedades-fruta")
async def list_variedades(tipo_fruta_id: Optional[str] = None, _: dict = Depends(get_current_user)):
    filt = {"tipo_fruta_id": tipo_fruta_id} if tipo_fruta_id else {}
    return await _list("variedades_fruta", "variedades", filt)


@api.post("/variedades-fruta")
async def create_variedad(payload: VariedadIn, user: dict = Depends(get_current_user)):
    return await _create("variedades_fruta", payload.model_dump(), user)


@api.put("/variedades-fruta/{vid}")
async def update_variedad(vid: str, payload: VariedadIn, _: dict = Depends(get_current_user)):
    return await _update("variedades_fruta", vid, payload.model_dump())


@api.delete("/variedades-fruta/{vid}")
async def delete_variedad(vid: str, _: dict = Depends(get_current_user)):
    return await _delete("variedades_fruta", vid)


# ============================================================
# PLANTACIONES
# ============================================================
class PlantacionIn(BaseModel):
    nombre: str
    lote: str
    recinto_agronomico: str = ""
    huerta_uhc: str = ""
    superficie_geometrica: float = 0
    superficie_declarada: float = 0
    fecha_inicio: Optional[str] = None
    fecha_finalizacion: Optional[str] = None
    cultivo: str = ""  # mantenido por compatibilidad
    variedad: str = ""  # mantenido por compatibilidad
    cultivos: List[str] = []  # NUEVO: lista de cultivos (fresa, arándano, etc.)
    variedades: List[str] = []  # NUEVO: lista de variedades (albion, san andreas, etc.)
    plantas_por_variedad: Dict[str, float] = {}  # NUEVO: cantidad de plantas por variedad
    total_plantas: float = 0  # NUEVO: total de plantas de la plantación (suma de variedades)
    inventario_plantas: float = 0
    cobertura: str = ""
    sistema_riego: str = ""
    tipo_plantacion: str = "CONVENCIONAL"
    distancia_plantas: float = 0
    distancia_filas: float = 0
    codigo_externo: str = ""
    foto_principal: str = ""  # base64 data URL
    foto_secundaria: str = ""  # base64 data URL
    observaciones: str = ""


@api.get("/plantaciones")
async def list_plantaciones(_: dict = Depends(get_current_user)):
    return await _list("plantaciones", "plantaciones")


@api.post("/plantaciones")
async def create_plantacion(payload: PlantacionIn, user: dict = Depends(get_current_user)):
    return await _create("plantaciones", payload.model_dump(), user)


@api.put("/plantaciones/{pid}")
async def update_plantacion(pid: str, payload: PlantacionIn, _: dict = Depends(get_current_user)):
    return await _update("plantaciones", pid, payload.model_dump())


@api.delete("/plantaciones/{pid}")
async def delete_plantacion(pid: str, _: dict = Depends(get_current_user)):
    return await _delete("plantaciones", pid)


@api.post("/plantaciones/{pid}/archivar")
async def archivar_plantacion(pid: str, _: dict = Depends(get_current_user)):
    """Archiva un lote finalizado: se conserva toda su info pero deja de aparecer entre los activos."""
    res = await db.plantaciones.update_one({"_id": pid}, {"$set": {"archivada": True, "fecha_archivado": datetime.now(VE_TZ).isoformat()}})
    if res.matched_count == 0:
        raise HTTPException(404, "No encontrado")
    return await db.plantaciones.find_one({"_id": pid}, {"_id": 0})


@api.post("/plantaciones/{pid}/desarchivar")
async def desarchivar_plantacion(pid: str, _: dict = Depends(get_current_user)):
    """Reactiva un lote archivado (vuelve a los activos)."""
    res = await db.plantaciones.update_one({"_id": pid}, {"$set": {"archivada": False}, "$unset": {"fecha_archivado": ""}})
    if res.matched_count == 0:
        raise HTTPException(404, "No encontrado")
    return await db.plantaciones.find_one({"_id": pid}, {"_id": 0})


# ============================================================
# COSECHAS
# ============================================================
class CosechaIn(BaseModel):
    tipo_fruta: str = ""        # nombre del cultivo (tomado de Plantaciones)
    variedad: str = ""          # nombre de la variedad (tomado de Plantaciones)
    tipo_fruta_id: str = ""     # legacy / opcional por compatibilidad
    variedad_id: str = ""       # legacy / opcional por compatibilidad
    primera_calidad: float = 0
    segunda_calidad: float = 0
    tercera_calidad: float = 0
    descarte: float = 0
    unidad: str = "kg"  # kg | cestas
    fecha_cosecha: str
    lote: str = ""


@api.get("/cosechas")
async def list_cosechas(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    filt = {}
    if fecha_desde or fecha_hasta:
        filt["fecha_cosecha"] = {}
        if fecha_desde:
            filt["fecha_cosecha"]["$gte"] = fecha_desde
        if fecha_hasta:
            filt["fecha_cosecha"]["$lte"] = fecha_hasta
    return await _list("cosechas", "cosechas", filt, sort_field="fecha_cosecha")


@api.post("/cosechas")
async def create_cosecha(payload: CosechaIn, user: dict = Depends(get_current_user)):
    created = await _create("cosechas", payload.model_dump(), user)
    await _sync_descarte_asignacion(created.get("fecha_cosecha"), user)
    return created


@api.put("/cosechas/{cid}")
async def update_cosecha(cid: str, payload: CosechaIn, user: dict = Depends(get_current_user)):
    updated = await _update("cosechas", cid, payload.model_dump())
    await _sync_descarte_asignacion(payload.model_dump().get("fecha_cosecha"), user)
    return updated


@api.delete("/cosechas/{cid}")
async def delete_cosecha(cid: str, user: dict = Depends(get_current_user)):
    doc = await db.cosechas.find_one({"_id": cid})
    if not doc:
        raise HTTPException(404, "No encontrado")
    fecha = doc.get("fecha_cosecha")
    fp = (fecha or "")[:10]
    if fp:
        def _cestas(c):
            s = (c.get("primera_calidad", 0) or 0) + (c.get("segunda_calidad", 0) or 0) + (c.get("tercera_calidad", 0) or 0) + (c.get("descarte", 0) or 0)
            return (s / KG_POR_CESTA) if c.get("unidad") == "kg" else s

        def _descarte(c):
            d = c.get("descarte", 0) or 0
            return (d / KG_POR_CESTA) if c.get("unidad") == "kg" else d

        cosecha_restante = await _cosecha_cestas_dia(fp) - _cestas(doc)
        cos_dia = await db.cosechas.find({"fecha_cosecha": {"$regex": f"^{fp}"}}).to_list(5000)
        descarte_restante = sum(_descarte(c) for c in cos_dia) - _descarte(doc)
        asigs = await db.asignaciones_destino.find({"fecha": {"$regex": f"^{fp}"}}).to_list(5000)
        manual_asignado = sum((a.get("cantidad_cestas", 0) or 0) for a in asigs if a.get("origen") != "cosecha_descarte_auto")
        asignado_despues = manual_asignado + max(descarte_restante, 0)
        disponible_despues = round(cosecha_restante - asignado_despues, 2)
        if disponible_despues < -0.001:
            raise HTTPException(400, f"No se puede borrar esta cosecha: ya asignaste {round(manual_asignado, 2)} cesta(s) de ese día a otros destinos (donaciones, ventas, refrigerar, etc.). Primero elimina o reduce esas asignaciones en 'Asignación de destino' y luego borra la cosecha.")
    res = await _delete("cosechas", cid)
    if fecha:
        await _sync_descarte_asignacion(fecha, user)
    return res


# ============================================================
# ASIGNACIONES DE DESTINO
# Destinos posibles: venta_finca, enviar_ciudad, descarte, frio
# Recibe cantidad desde cosecha (cestas → 14kg/cesta por convención del original)
# ============================================================
KG_POR_CESTA = 14


class AsignacionIn(BaseModel):
    destino: str  # venta_finca | enviar_ciudad | enviar_otra_ciudad | refrigerar | congelar | descarte | donaciones
    unidad_ingreso: str = "cestas"  # cestas | kg
    cantidad_ingresada: float
    fecha: str
    observaciones: str = ""


# Módulos vinculados: alimenta los canales de Ventas según el destino (trazabilidad)
_VENTAS_DESTINO = {
    "venta_finca": "finca",
    "enviar_ciudad": "ciudad",
    "enviar_otra_ciudad": "ciudad",
    "refrigerar": "refrigerar",
    "congelar": "congelar",
    "descarte": "descarte",
    "donaciones": "donaciones",
}
_LINKED_COLLS = ["ventas_finca", "ventas_ciudad", "ventas_refrigerar", "ventas_congelar", "ventas_descarte", "ventas_donaciones", "frio_registros"]


def _build_linked_doc(destino, cestas, kg, fecha, asignacion_id):
    """Devuelve (coleccion, doc) para alimentar el módulo destino, o None."""
    base = {"origen": "asignacion_destino", "asignacion_id": asignacion_id}
    if destino in _VENTAS_DESTINO:
        notas = {
            "enviar_otra_ciudad": "Otra ciudad · desde Asignación de destino",
            "refrigerar": "Refrigerar · desde Asignación de destino",
            "congelar": "Congelar · desde Asignación de destino",
        }
        nota = notas.get(destino, "Desde Asignación de destino")
        doc = {
            "fecha": fecha, "cantidad_cestas": cestas, "cantidad_kg": kg,
            "precio_unitario": 0, "total": 0, "cliente": "", "observaciones": nota, **base,
        }
        return (f"ventas_{_VENTAS_DESTINO[destino]}", doc)
    return None


@api.get("/asignaciones-destino")
async def list_asignaciones(fecha: Optional[str] = None, _: dict = Depends(get_current_user)):
    filt = {}
    if fecha:
        # Acepta fecha YYYY-MM-DD: match por prefijo
        filt["fecha"] = {"$regex": f"^{fecha}"}
    return await _list("asignaciones_destino", "asignaciones", filt, sort_field="fecha")


async def _cosecha_cestas_dia(fecha_prefix: str) -> float:
    """Total cosechado (en cestas) para una fecha YYYY-MM-DD."""
    if not fecha_prefix:
        return 0.0
    docs = await db.cosechas.find({"fecha_cosecha": {"$regex": f"^{fecha_prefix}"}}).to_list(5000)
    total = 0.0
    for c in docs:
        suma = (c.get("primera_calidad", 0) or 0) + (c.get("segunda_calidad", 0) or 0) + (c.get("tercera_calidad", 0) or 0) + (c.get("descarte", 0) or 0)
        total += (suma / KG_POR_CESTA) if c.get("unidad") == "kg" else suma
    return total


async def _asignado_cestas_dia(fecha_prefix: str) -> float:
    """Total ya asignado (en cestas) para una fecha YYYY-MM-DD."""
    if not fecha_prefix:
        return 0.0
    docs = await db.asignaciones_destino.find({"fecha": {"$regex": f"^{fecha_prefix}"}}).to_list(5000)
    return sum((a.get("cantidad_cestas", 0) or 0) for a in docs)


async def _sync_descarte_asignacion(fecha_cosecha_iso, user):
    """El descarte generado en Cosecha se asigna OBLIGATORIAMENTE al destino 'descarte'.
    Mantiene una única asignación automática (origen='cosecha_descarte_auto') igual al
    total de descarte cosechado ese día. Solo aplica al descarte, no a las demás calidades."""
    fecha_prefix = (fecha_cosecha_iso or "")[:10]
    if not fecha_prefix:
        return
    docs = await db.cosechas.find({"fecha_cosecha": {"$regex": f"^{fecha_prefix}"}}).to_list(5000)
    total_descarte = 0.0
    for c in docs:
        d = c.get("descarte", 0) or 0
        total_descarte += (d / KG_POR_CESTA) if c.get("unidad") == "kg" else d
    total_descarte = round(total_descarte, 2)
    existing = await db.asignaciones_destino.find_one({
        "fecha": {"$regex": f"^{fecha_prefix}"},
        "destino": "descarte",
        "origen": "cosecha_descarte_auto",
    })
    if total_descarte <= 0:
        if existing:
            await db.asignaciones_destino.delete_one({"_id": existing["_id"]})
            for coll in _LINKED_COLLS:
                await db[coll].delete_many({"asignacion_id": existing["_id"]})
        return
    fecha_full = fecha_prefix + "T12:00:00.000Z"
    kg = round(total_descarte * KG_POR_CESTA, 2)
    if existing:
        if abs((existing.get("cantidad_cestas", 0) or 0) - total_descarte) > 0.001:
            await db.asignaciones_destino.update_one(
                {"_id": existing["_id"]},
                {"$set": {"cantidad_cestas": total_descarte, "cantidad_kg": kg, "cantidad_ingresada": total_descarte, "unidad_ingreso": "cestas"}},
            )
            await db.ventas_descarte.update_many(
                {"asignacion_id": existing["_id"]},
                {"$set": {"cantidad_cestas": total_descarte, "cantidad_kg": kg}},
            )
    else:
        data = {
            "destino": "descarte", "unidad_ingreso": "cestas",
            "cantidad_ingresada": total_descarte, "cantidad_cestas": total_descarte, "cantidad_kg": kg,
            "fecha": fecha_full, "observaciones": "Descarte de cosecha (automático)",
            "origen": "cosecha_descarte_auto",
        }
        created = await _create("asignaciones_destino", data, user)
        linked = _build_linked_doc("descarte", total_descarte, kg, fecha_full, created["_id"])
        if linked:
            coll, doc = linked
            doc["observaciones"] = "Descarte de cosecha (automático)"
            await _create(coll, doc, user)


@api.post("/asignaciones-destino")
async def create_asignacion(payload: AsignacionIn, user: dict = Depends(get_current_user)):
    data = payload.model_dump()
    if data["unidad_ingreso"] == "cestas":
        data["cantidad_cestas"] = data["cantidad_ingresada"]
        data["cantidad_kg"] = round(data["cantidad_ingresada"] * KG_POR_CESTA, 2)
    else:
        data["cantidad_kg"] = data["cantidad_ingresada"]
        data["cantidad_cestas"] = round(data["cantidad_ingresada"] / KG_POR_CESTA, 2)
    # Validar disponibilidad: no permitir asignar más cestas de las cosechadas hoy
    fecha_prefix = (data.get("fecha") or "")[:10]
    disponible = await _cosecha_cestas_dia(fecha_prefix) - await _asignado_cestas_dia(fecha_prefix)
    if data["cantidad_cestas"] > disponible + 0.001:
        raise HTTPException(400, f"No hay cestas disponibles suficientes. Disponible: {round(max(disponible, 0), 2)} cestas")
    created = await _create("asignaciones_destino", data, user)
    # Alimentar el módulo destino correspondiente (trazabilidad)
    linked = _build_linked_doc(created["destino"], created["cantidad_cestas"], created["cantidad_kg"], created["fecha"], created["_id"])
    if linked:
        coll, doc = linked
        await _create(coll, doc, user)
    return created


@api.delete("/asignaciones-destino/{aid}")
async def delete_asignacion(aid: str, _: dict = Depends(get_current_user)):
    # El descarte de cosecha es obligatorio: no se puede eliminar manualmente
    doc = await db.asignaciones_destino.find_one({"_id": aid})
    if doc and doc.get("origen") == "cosecha_descarte_auto":
        raise HTTPException(400, "El descarte de cosecha es obligatorio y no se puede eliminar. Ajusta el descarte en el módulo Cosecha.")
    # Eliminar el registro vinculado en el módulo destino, si existe
    for coll in _LINKED_COLLS:
        await db[coll].delete_many({"asignacion_id": aid})
    return await _delete("asignaciones_destino", aid)


# ============================================================
# COMPRAS + INVENTARIO derivado
# ============================================================
CATEGORIAS_INSUMOS = ["fertilizantes", "plaguicidas", "fungicidas", "herbicidas", "tratamiento", "semillas", "otros"]


class CompraIn(BaseModel):
    categoria: str
    nombre_producto: str
    ingrediente_activo: Optional[str] = ""
    precio: float
    cantidad: float
    unidad: str  # gramos | mililitros | kg | litros | unidades
    descripcion: Optional[str] = ""
    fecha_compra: str
    # Si es equipo en lugar de insumo:
    es_equipo: bool = False
    equipo_categoria: Optional[str] = None  # vehiculo | herramienta | maquinaria
    equipo_marca: Optional[str] = ""
    equipo_modelo: Optional[str] = ""


@api.get("/compras")
async def list_compras(_: dict = Depends(get_current_user)):
    return await _list("compras", "compras", filt={"origen": {"$ne": "ajuste"}}, sort_field="fecha_compra")


@api.post("/compras")
async def create_compra(payload: CompraIn, user: dict = Depends(get_current_user)):
    data = payload.model_dump()
    doc = await _create("compras", data, user)
    # Si es equipo: crear equipo automáticamente
    if data.get("es_equipo"):
        equipo = {
            "_id": new_id(),
            "nombre": data["nombre_producto"],
            "categoria": data.get("equipo_categoria") or "herramienta",
            "marca": data.get("equipo_marca", ""),
            "modelo": data.get("equipo_modelo", ""),
            "año": None,
            "numero_serie": "",
            "placa": "",
            "color": "",
            "tipo_motor": "",
            "descripcion_uso": data.get("descripcion", "") or "",
            "estado": "activo",
            "fecha_adquisicion": data["fecha_compra"],
            "costo_adquisicion": data["precio"],
            "ubicacion": "",
            "responsable": "",
            "observaciones": "",
            "foto": "",
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        await db.equipos.insert_one(equipo)
    return doc


@api.put("/compras/{cid}")
async def update_compra(cid: str, payload: CompraIn, _: dict = Depends(get_current_user)):
    return await _update("compras", cid, payload.model_dump())


@api.delete("/compras/{cid}")
async def delete_compra(cid: str, _: dict = Depends(get_current_user)):
    return await _delete("compras", cid)


# ----- Entradas manuales de inventario -----
# Productos que NO entran por compras: se registran directamente en el módulo
# Inventario. Se guardan en la colección `compras` con origen="ajuste" para que
# fluyan automáticamente al inventario, al PEPS y a la validación de stock, pero
# se excluyen del listado del módulo Compras.
class EntradaInventarioIn(BaseModel):
    categoria: str
    nombre_producto: str
    ingrediente_activo: Optional[str] = ""
    cantidad: float = Field(gt=0)
    unidad: str = "Unidades"
    precio: float = Field(default=0, ge=0)  # valor/costo total (opcional; 0 si el producto no tiene costo de compra)
    descripcion: Optional[str] = ""
    fecha: str  # fecha de la entrada (se mapea a fecha_compra para el cálculo PEPS)


@api.get("/inventario/entradas")
async def list_entradas_inventario(_: dict = Depends(get_current_user)):
    docs = await db.compras.find({"origen": "ajuste"}).sort("fecha_compra", -1).to_list(5000)
    return {"entradas": docs}


@api.post("/inventario/entradas")
async def create_entrada_inventario(payload: EntradaInventarioIn, user: dict = Depends(get_current_user)):
    data = payload.model_dump()
    doc = {
        "categoria": data["categoria"],
        "nombre_producto": data["nombre_producto"],
        "ingrediente_activo": data.get("ingrediente_activo", "") or "",
        "precio": float(data.get("precio") or 0),
        "cantidad": float(data["cantidad"]),
        "unidad": data.get("unidad") or "Unidades",
        "descripcion": data.get("descripcion", "") or "",
        "fecha_compra": data["fecha"],
        "es_equipo": False,
        "origen": "ajuste",
    }
    return await _create("compras", doc, user)


@api.delete("/inventario/entradas/{eid}")
async def delete_entrada_inventario(eid: str, _: dict = Depends(get_current_user)):
    # Solo permite eliminar entradas manuales (origen='ajuste'), nunca compras reales.
    res = await db.compras.delete_one({"_id": eid, "origen": "ajuste"})
    return {"success": res.deleted_count > 0}


@api.put("/inventario/entradas/{eid}")
async def update_entrada_inventario(eid: str, payload: EntradaInventarioIn, _: dict = Depends(get_current_user)):
    # Solo permite editar entradas manuales (origen='ajuste'), nunca compras reales.
    existing = await db.compras.find_one({"_id": eid, "origen": "ajuste"})
    if not existing:
        raise HTTPException(404, "Entrada manual no encontrada")
    data = payload.model_dump()
    update = {
        "categoria": data["categoria"],
        "nombre_producto": data["nombre_producto"],
        "ingrediente_activo": data.get("ingrediente_activo", "") or "",
        "precio": float(data.get("precio") or 0),
        "cantidad": float(data["cantidad"]),
        "unidad": data.get("unidad") or "Unidades",
        "descripcion": data.get("descripcion", "") or "",
        "fecha_compra": data["fecha"],
        "updatedAt": now_iso(),
    }
    await db.compras.update_one({"_id": eid, "origen": "ajuste"}, {"$set": update})
    return await db.compras.find_one({"_id": eid})



async def _compute_peps_remaining_per_product() -> Dict[str, Dict[str, Any]]:
    """
    Calcula los lotes PEPS (FIFO) que quedan en stock por producto, después de aplicar
    todos los consumos de las aplicaciones confirmadas en orden cronológico.

    Retorna: { nombre_producto.lower(): {
                 "lotes_remanentes": [{"cantidad","precio_unitario","fecha_compra"}],
                 "cantidad_remanente": float,
                 "valor_remanente": float,
                 "precio_unitario_promedio": float } }
    """
    # 1. Compras reales (no ajustes) ordenadas asc; entradas manuales aparte
    all_compras = await db.compras.find({"es_equipo": {"$ne": True}}).to_list(20000)
    real_compras = [c for c in all_compras if c.get("origen") != "ajuste"]
    manual_entries = [c for c in all_compras if c.get("origen") == "ajuste"]
    real_compras.sort(key=lambda c: (c.get("fecha_compra") or "9999-12-31"))
    manual_entries.sort(key=lambda c: (c.get("fecha_compra") or "0000", c.get("createdAt") or ""))

    # 2. Aplicaciones CONFIRMADAS ordenadas asc (solo confirmadas consumen real stock)
    aplicaciones = await db.aplicaciones.find({"estado": "confirmada"}).to_list(20000)
    aplicaciones.sort(key=lambda a: (a.get("fecha") or "9999-12-31"))

    # 3. Eventos en orden cronológico (compras antes que aplicaciones en la misma fecha)
    #    Las entradas manuales NO entran en la línea de tiempo: se aplican al final
    #    (cuentan como stock disponible HOY, sin importar su fecha) y solo se consumen
    #    después de agotar las compras reales.
    eventos: List[Dict[str, Any]] = []
    for c in real_compras:
        eventos.append({"kind": "compra", "fecha": c.get("fecha_compra") or "9999-12-31", "data": c})
    for a in aplicaciones:
        eventos.append({"kind": "aplicacion", "fecha": a.get("fecha") or "9999-12-31", "data": a})
    eventos.sort(key=lambda e: (e["fecha"], 0 if e["kind"] == "compra" else 1))

    # 4. Procesar compras reales y consumos; registrar el consumo NO cubierto (overflow)
    lotes: Dict[str, List[Dict[str, Any]]] = {}
    overflow: Dict[str, float] = {}
    for ev in eventos:
        if ev["kind"] == "compra":
            c = ev["data"]
            nombre = (c.get("nombre_producto") or "").strip().lower()
            cantidad = float(c.get("cantidad") or 0)
            precio = float(c.get("precio") or 0)
            if cantidad <= 0 or not nombre:
                continue
            lotes.setdefault(nombre, []).append({
                "cantidad": cantidad,
                "precio_unitario": precio / cantidad if cantidad else 0,
                "fecha_compra": c.get("fecha_compra"),
            })
        else:
            a = ev["data"]
            for ins in (a.get("insumos") or []):
                nombre = (ins.get("nombre_producto") or "").strip().lower()
                qty_needed = float(ins.get("cantidad") or 0)
                queue = lotes.get(nombre, [])
                while qty_needed > 0 and queue:
                    lot = queue[0]
                    take = min(lot["cantidad"], qty_needed)
                    lot["cantidad"] -= take
                    qty_needed -= take
                    if lot["cantidad"] <= 1e-9:
                        queue.pop(0)
                if qty_needed > 1e-9:
                    overflow[nombre] = overflow.get(nombre, 0) + qty_needed

    # 4b. Aplicar entradas manuales: primero cubren el consumo no cubierto (overflow),
    #     el resto queda como stock remanente disponible.
    for c in manual_entries:
        nombre = (c.get("nombre_producto") or "").strip().lower()
        cantidad = float(c.get("cantidad") or 0)
        precio = float(c.get("precio") or 0)
        if cantidad <= 0 or not nombre:
            continue
        unit = precio / cantidad if cantidad else 0
        ov = overflow.get(nombre, 0)
        if ov > 0:
            consumido = min(ov, cantidad)
            overflow[nombre] = ov - consumido
            cantidad -= consumido
        if cantidad > 1e-9:
            lotes.setdefault(nombre, []).append({
                "cantidad": cantidad,
                "precio_unitario": unit,
                "fecha_compra": c.get("fecha_compra"),
            })

    # 5. Empaquetar resultado
    out: Dict[str, Dict[str, Any]] = {}
    for nombre, qs in lotes.items():
        remanentes = [{"cantidad": round(q["cantidad"], 4),
                       "precio_unitario": round(q["precio_unitario"], 4),
                       "fecha_compra": q.get("fecha_compra")}
                      for q in qs if q["cantidad"] > 1e-9]
        cant_r = sum(q["cantidad"] for q in remanentes)
        valor_r = sum(q["cantidad"] * q["precio_unitario"] for q in remanentes)
        out[nombre] = {
            "lotes_remanentes": remanentes,
            "cantidad_remanente": round(cant_r, 4),
            "valor_remanente": round(valor_r, 2),
            "precio_unitario_promedio": round(valor_r / cant_r, 4) if cant_r else 0,
        }
    return out


@api.get("/inventario")
async def get_inventario(_: dict = Depends(get_current_user)):
    # Construye inventario en tiempo real:
    # total_comprado: sum cantidad de /compras (no equipos)
    # total_enviado: sum cantidad consumida por aplicaciones y actividades
    pipeline_compras = [
        {"$match": {"es_equipo": {"$ne": True}}},
        {"$group": {
            "_id": {"categoria": "$categoria", "nombre_producto": "$nombre_producto", "unidad": "$unidad"},
            "total_comprado": {"$sum": "$cantidad"},
            "total_invertido": {"$sum": "$precio"},
        }},
    ]
    compras_agg = await db.compras.aggregate(pipeline_compras).to_list(5000)

    # Consumos en aplicaciones (subarray insumos: nombre, cantidad, unidad)
    # Solo se descuenta cuando la aplicación está confirmada (ejecutada en campo).
    pipeline_aplicaciones = [
        {"$match": {"estado": "confirmada"}},
        {"$unwind": {"path": "$insumos", "preserveNullAndEmptyArrays": False}},
        {"$group": {
            "_id": {"$toLower": "$insumos.nombre_producto"},
            "total_enviado": {"$sum": "$insumos.cantidad"},
        }},
    ]
    apl_agg = await db.aplicaciones.aggregate(pipeline_aplicaciones).to_list(5000)
    enviado_map = {a["_id"]: a["total_enviado"] for a in apl_agg}

    # Stock remanente por método PEPS (FIFO) — sabemos qué unidades y a qué precio
    peps = await _compute_peps_remaining_per_product()

    # Ingrediente activo por producto: viene de las compras y entradas manuales
    # (ambas en la colección `compras`). Se toma el más reciente no vacío.
    ingrediente_map: Dict[str, str] = {}
    ingrediente_fecha: Dict[str, str] = {}
    ia_docs = await db.compras.find(
        {"es_equipo": {"$ne": True}},
        {"nombre_producto": 1, "ingrediente_activo": 1, "fecha_compra": 1},
    ).to_list(20000)
    for d in ia_docs:
        nom = (d.get("nombre_producto") or "").strip().lower()
        ia = (d.get("ingrediente_activo") or "").strip()
        if not nom or not ia:
            continue
        fch = d.get("fecha_compra") or ""
        if nom not in ingrediente_fecha or fch >= ingrediente_fecha[nom]:
            ingrediente_map[nom] = ia
            ingrediente_fecha[nom] = fch

    inventario = []
    for c in compras_agg:
        nombre = c["_id"]["nombre_producto"]
        unidad = c["_id"]["unidad"]
        comprado = c["total_comprado"]
        invertido = c.get("total_invertido", 0)
        enviado = enviado_map.get(nombre.lower() if nombre else "", 0)
        disponible = comprado - enviado
        info_peps = peps.get((nombre or "").lower(), {})
        inventario.append({
            "categoria": c["_id"]["categoria"],
            "nombre_producto": nombre,
            "ingrediente_activo": ingrediente_map.get((nombre or "").lower(), ""),
            "unidad": unidad,
            "total_comprado": comprado,
            "total_invertido": round(invertido, 2),
            "total_enviado": enviado,
            "total_disponible": disponible,
            "existencia": disponible > 0,
            # Datos PEPS del stock remanente
            "lotes_remanentes": info_peps.get("lotes_remanentes", []),
            "valor_remanente": info_peps.get("valor_remanente", 0),
            "precio_unitario_promedio": info_peps.get("precio_unitario_promedio", 0),
        })
    return {"inventario": inventario}


@api.get("/dashboard/alertas-reposicion")
async def dashboard_alertas_reposicion(dias: int = 30, categoria: str = "fertilizantes", _: dict = Depends(get_current_user)):
    """Alertas de reposición por CONSUMO CONTINUO (Tipo A). SOLO LECTURA.
    Mide el consumo de los últimos `dias` (aplicaciones confirmadas), calcula el ritmo
    diario, los días restantes y las aplicaciones restantes por producto de la categoría dada.
    Semáforo por semanas hasta agotarse: 1/2/3/4 semanas."""
    dias = max(int(dias or 30), 7)

    # 1. Stock disponible por producto de la categoría (comprado - consumido histórico)
    compras_agg = await db.compras.aggregate([
        {"$match": {"es_equipo": {"$ne": True}, "categoria": categoria}},
        {"$group": {"_id": {"nombre_producto": "$nombre_producto", "unidad": "$unidad"}, "total_comprado": {"$sum": "$cantidad"}}},
    ]).to_list(5000)

    apl_all = await db.aplicaciones.aggregate([
        {"$match": {"estado": "confirmada"}},
        {"$unwind": {"path": "$insumos", "preserveNullAndEmptyArrays": False}},
        {"$group": {"_id": {"$toLower": "$insumos.nombre_producto"}, "total": {"$sum": "$insumos.cantidad"}}},
    ]).to_list(5000)
    enviado_map = {a["_id"]: a["total"] for a in apl_all}

    # Nombres de producto de la categoría (para filtrar consumo)
    nombres_cat = {(c["_id"]["nombre_producto"] or "").strip().lower() for c in compras_agg}

    # 2. Consumo del período (últimos `dias`): total y nº de aplicaciones por producto
    cutoff = (datetime.now(VE_TZ).date() - timedelta(days=dias)).isoformat()
    consumo_periodo: Dict[str, float] = {}
    apps_periodo: Dict[str, int] = {}
    for a in await db.aplicaciones.find({"estado": "confirmada"}).to_list(20000):
        if str(a.get("fecha") or "")[:10] < cutoff:
            continue
        vistos = set()
        for ins in (a.get("insumos") or []):
            nom = (ins.get("nombre_producto") or "").strip().lower()
            if nom not in nombres_cat:
                continue
            consumo_periodo[nom] = consumo_periodo.get(nom, 0.0) + float(ins.get("cantidad") or 0)
            if nom not in vistos:
                apps_periodo[nom] = apps_periodo.get(nom, 0) + 1
                vistos.add(nom)

    def _nivel(dr):
        if dr is None:
            return ("sin_consumo", 5)
        if dr <= 7:
            return ("critico", 0)
        if dr <= 14:
            return ("dos_semanas", 1)
        if dr <= 21:
            return ("tres_semanas", 2)
        if dr <= 28:
            return ("cuatro_semanas", 3)
        return ("sano", 4)

    productos = []
    for c in compras_agg:
        nombre = c["_id"]["nombre_producto"]
        unidad = c["_id"]["unidad"] or "u."
        nl = (nombre or "").strip().lower()
        stock = round(float(c["total_comprado"] or 0) - float(enviado_map.get(nl, 0) or 0), 2)
        cons = consumo_periodo.get(nl, 0.0)
        napps = apps_periodo.get(nl, 0)
        consumo_diario = round(cons / dias, 4) if cons > 0 else 0
        consumo_por_app = round(cons / napps, 4) if napps > 0 else 0
        if consumo_diario > 0:
            dias_restantes = max(round(stock / consumo_diario, 1), 0)
        else:
            dias_restantes = None
        apps_restantes = (round(stock / consumo_por_app, 1) if consumo_por_app > 0 else None)
        nivel, orden = _nivel(dias_restantes if stock > 0 else (0 if consumo_diario > 0 else None))
        if stock <= 0 and consumo_diario > 0:
            nivel, orden, dias_restantes, apps_restantes = "critico", 0, 0, 0
        productos.append({
            "nombre_producto": nombre,
            "unidad": unidad,
            "stock": stock,
            "consumo_periodo": round(cons, 2),
            "consumo_diario": consumo_diario,
            "consumo_por_aplicacion": consumo_por_app,
            "aplicaciones_periodo": napps,
            "dias_restantes": dias_restantes,
            "aplicaciones_restantes": apps_restantes,
            "nivel": nivel,
            "_orden": orden,
        })
    productos.sort(key=lambda p: (p["_orden"], p["dias_restantes"] if p["dias_restantes"] is not None else 1e9))
    for p in productos:
        p.pop("_orden", None)

    resumen = {
        "critico": sum(1 for p in productos if p["nivel"] == "critico"),
        "alerta": sum(1 for p in productos if p["nivel"] in ("dos_semanas", "tres_semanas", "cuatro_semanas")),
        "sano": sum(1 for p in productos if p["nivel"] == "sano"),
        "sin_consumo": sum(1 for p in productos if p["nivel"] == "sin_consumo"),
    }
    return {"categoria": categoria, "dias_periodo": dias, "productos": productos, "resumen": resumen}


@api.get("/dashboard/top-productos")
async def dashboard_top_productos(limit: int = 5, _: dict = Depends(get_current_user)):
    """Top de productos con mayor gasto según las aplicaciones (solo lectura).
    - top_dinero: productos con mayor costo real (PEPS/FIFO) en $.
    - top_unidades: productos con mayor cantidad consumida (en su unidad).
    No modifica ningún módulo."""
    costos = await _compute_fifo_costs_per_aplicacion()
    money: Dict[str, Dict[str, Any]] = {}
    units: Dict[str, Dict[str, Any]] = {}
    for _aid, c in costos.items():
        for ic in c.get("insumos_costo", []):
            nombre = (ic.get("nombre_producto") or "").strip()
            if not nombre:
                continue
            key = nombre.lower()
            unidad = ic.get("unidad") or "u."
            m = money.setdefault(key, {"nombre_producto": nombre, "total": 0.0})
            m["total"] += float(ic.get("costo") or 0)
            u = units.setdefault(key, {"nombre_producto": nombre, "unidad": unidad, "total": 0.0})
            u["total"] += float(ic.get("cantidad") or 0)
            if not u.get("unidad"):
                u["unidad"] = unidad
    top_dinero = sorted(money.values(), key=lambda x: x["total"], reverse=True)[:limit]
    top_unidades = sorted(units.values(), key=lambda x: x["total"], reverse=True)[:limit]
    for t in top_dinero:
        t["total"] = round(t["total"], 2)
    for t in top_unidades:
        t["total"] = round(t["total"], 2)
    return {"top_dinero": top_dinero, "top_unidades": top_unidades}




# ============================================================
# EQUIPOS
# ============================================================
class EquipoIn(BaseModel):
    nombre: str
    categoria: str = "herramienta"  # motor | herramienta | otros
    marca: str = ""
    modelo: str = ""
    año: Optional[int] = None
    numero_serie: str = ""
    placa: str = ""
    color: str = ""
    tipo_motor: str = ""
    descripcion_uso: str = ""
    estado: str = "activo"  # activo | mantenimiento | inactivo
    fecha_adquisicion: Optional[str] = None
    cantidad: int = 1
    costo_adquisicion: float = 0  # precio unitario
    ubicacion: str = ""
    responsable: str = ""
    observaciones: str = ""
    foto: str = ""


@api.get("/equipos")
async def list_equipos(_: dict = Depends(get_current_user)):
    return await _list("equipos", "equipos")


@api.post("/equipos")
async def create_equipo(payload: EquipoIn, user: dict = Depends(get_current_user)):
    return await _create("equipos", payload.model_dump(), user)


@api.put("/equipos/{eid}")
async def update_equipo(eid: str, payload: EquipoIn, _: dict = Depends(get_current_user)):
    return await _update("equipos", eid, payload.model_dump())


@api.delete("/equipos/{eid}")
async def delete_equipo(eid: str, _: dict = Depends(get_current_user)):
    return await _delete("equipos", eid)


# ============================================================
# VEHÍCULOS — registro de vehículos comprados
# ============================================================
class VehiculoIn(BaseModel):
    nombre: str
    marca: str = ""
    modelo: str = ""
    año: Optional[int] = None
    placa: str = ""
    color: str = ""
    tipo_combustible: str = ""  # gasolina | diesel | electrico | hibrido
    kilometraje_inicial: float = 0
    costo_adquisicion: float = 0
    fecha_adquisicion: Optional[str] = None
    estado: str = "activo"  # activo | mantenimiento | inactivo
    responsable: str = ""
    observaciones: str = ""
    foto: str = ""


@api.get("/vehiculos")
async def list_vehiculos(_: dict = Depends(get_current_user)):
    return await _list("vehiculos", "vehiculos")


@api.post("/vehiculos")
async def create_vehiculo(payload: VehiculoIn, user: dict = Depends(get_current_user)):
    return await _create("vehiculos", payload.model_dump(), user)


@api.put("/vehiculos/{vid}")
async def update_vehiculo(vid: str, payload: VehiculoIn, _: dict = Depends(get_current_user)):
    return await _update("vehiculos", vid, payload.model_dump())


@api.delete("/vehiculos/{vid}")
async def delete_vehiculo(vid: str, _: dict = Depends(get_current_user)):
    # Borrado en cascada: eliminar también los gastos operativos del vehículo
    # para no dejar registros huérfanos imposibles de eliminar desde la UI.
    await db.gastos_vehiculos.delete_many({"vehiculo_id": vid})
    return await _delete("vehiculos", vid)


# ============================================================
# GASTOS DE VEHÍCULOS (Gasolina, Repuestos, Mano de Obra)
# Ahora cada gasto se vincula a un vehículo
# ============================================================
CATEGORIAS_GASTO_VEHICULO = ["gasolina", "repuestos", "mano_obra"]


class GastoVehiculoIn(BaseModel):
    vehiculo_id: str
    categoria: str  # gasolina | repuestos | mano_obra
    monto: float
    fecha: str
    descripcion: str = ""


@api.get("/gastos-vehiculos")
async def list_gastos_vehiculos(
    vehiculo_id: Optional[str] = None,
    categoria: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    filt = {}
    if vehiculo_id:
        filt["vehiculo_id"] = vehiculo_id
    if categoria:
        filt["categoria"] = categoria
    return await _list("gastos_vehiculos", "gastos", filt, sort_field="fecha")


@api.post("/gastos-vehiculos")
async def create_gasto_vehiculo(payload: GastoVehiculoIn, user: dict = Depends(get_current_user)):
    return await _create("gastos_vehiculos", payload.model_dump(), user)


@api.put("/gastos-vehiculos/{gid}")
async def update_gasto_vehiculo(gid: str, payload: GastoVehiculoIn, _: dict = Depends(get_current_user)):
    return await _update("gastos_vehiculos", gid, payload.model_dump())


@api.delete("/gastos-vehiculos/{gid}")
async def delete_gasto_vehiculo(gid: str, _: dict = Depends(get_current_user)):
    return await _delete("gastos_vehiculos", gid)


# ============================================================
# APLICACIONES + RECETAS
# Una aplicación: lista de insumos consumidos del inventario, aplicado en un lote
# Una receta: plantilla reutilizable de insumos
# ============================================================
class InsumoItem(BaseModel):
    nombre_producto: str
    cantidad: float = 0
    unidad: str = "Unidades"
    dosis: Optional[str] = ""
    categoria: Optional[str] = ""


class AplicacionIn(BaseModel):
    tipo: str = "fertilizacion"  # fertilizacion | plaguicida | fungicida | herbicida | tratamiento
    subtipo: Optional[str] = None  # "receta" | "producto" — sólo aplica a fertilizacion/tratamiento
    lote: str = ""  # legacy single lote
    lotes: List[str] = []  # múltiples lotes (planificados)
    lotes_destino: List[str] = []  # lotes finales donde se aplicó (al confirmar)
    fecha: str
    estado: str = "pendiente"
    insumos: List[InsumoItem] = []
    cantidad_agua: float = 0
    modo_aplicacion: Optional[str] = None  # foliar | suelo | riego | drench
    observaciones: str = ""
    receta_id: Optional[str] = None
    receta_nombre: Optional[str] = ""  # snapshot del nombre de la receta al crear (no cambia si luego se edita la receta)
    # Datos de ejecución (se llenan al confirmar desde Pendientes)
    cantidad_trabajadores: int = 0
    horas_trabajo: float = 0  # horas por trabajador
    precio_hora: float = 0  # costo por hora de trabajo


async def _compute_fifo_costs_per_aplicacion() -> Dict[str, Dict[str, Any]]:
    """
    Calcula el costo real de cada aplicación usando PEPS (FIFO):
    'primeros precios que entran, primeros precios que salen'.

    Para cada producto:
      - Las compras se ordenan por fecha y se acumulan como lotes (cantidad, precio_unitario).
      - Las aplicaciones (en orden cronológico) consumen los lotes más antiguos primero.

    Tanto aplicaciones confirmadas como pendientes reciben un costo estimado,
    siguiendo la misma simulación. El cost mismo es real para confirmadas y proyectado
    para pendientes (asumiendo que se confirman en el orden cronológico actual).

    Retorna: { aplicacion_id: { "total_costo": float,
                                 "insumos_costo": [{"nombre", "cantidad", "unidad", "costo", "precio_unitario_promedio"}] } }
    """
    # 1. Cargar compras (solo insumos, no equipos); separar reales de entradas manuales
    all_compras = await db.compras.find({"es_equipo": {"$ne": True}}).to_list(20000)
    real_compras = [c for c in all_compras if c.get("origen") != "ajuste"]
    manual_entries = [c for c in all_compras if c.get("origen") == "ajuste"]
    real_compras.sort(key=lambda c: (c.get("fecha_compra") or "9999-12-31"))
    manual_entries.sort(key=lambda c: (c.get("fecha_compra") or "0000", c.get("createdAt") or ""))

    # 2. Cargar aplicaciones ordenadas por fecha asc
    aplic_cur = db.aplicaciones.find({})
    aplicaciones = await aplic_cur.to_list(20000)
    aplicaciones.sort(key=lambda a: (a.get("fecha") or "9999-12-31"))

    # 3. Construir línea de tiempo con compras REALES + aplicaciones.
    #    Las entradas manuales se aplican al final (cubren faltantes), por lo que se
    #    consumen solo después de agotar las compras reales y no inflan costos pasados.
    eventos: List[Dict[str, Any]] = []
    for c in real_compras:
        eventos.append({"kind": "compra", "fecha": c.get("fecha_compra") or "9999-12-31", "data": c})
    for a in aplicaciones:
        eventos.append({"kind": "aplicacion", "fecha": a.get("fecha") or "9999-12-31", "data": a})
    eventos.sort(key=lambda e: (e["fecha"], 0 if e["kind"] == "compra" else 1))

    # 4. Lotes FIFO por nombre de producto (case-insensitive)
    lotes: Dict[str, List[Dict[str, float]]] = {}
    resultados: Dict[str, Dict[str, Any]] = {}
    pendientes: List[Dict[str, Any]] = []  # insumos sin cobertura, en orden cronológico

    for ev in eventos:
        if ev["kind"] == "compra":
            c = ev["data"]
            nombre = (c.get("nombre_producto") or "").strip().lower()
            cantidad = float(c.get("cantidad") or 0)
            precio = float(c.get("precio") or 0)
            if cantidad <= 0 or not nombre:
                continue
            unit = precio / cantidad if cantidad else 0
            lotes.setdefault(nombre, []).append({"cantidad": cantidad, "precio_unitario": unit})
        else:
            a = ev["data"]
            aid = a.get("_id")
            insumos = a.get("insumos") or []
            insumos_cost: List[Dict[str, Any]] = []
            for ins in insumos:
                nombre = (ins.get("nombre_producto") or "").strip().lower()
                qty_needed = float(ins.get("cantidad") or 0)
                qty_orig = qty_needed
                cost = 0.0
                queue = lotes.get(nombre, [])
                # consumir de los lotes más antiguos
                while qty_needed > 0 and queue:
                    lot = queue[0]
                    take = min(lot["cantidad"], qty_needed)
                    cost += take * lot["precio_unitario"]
                    lot["cantidad"] -= take
                    qty_needed -= take
                    if lot["cantidad"] <= 1e-9:
                        queue.pop(0)
                ic = {
                    "nombre_producto": ins.get("nombre_producto"),
                    "cantidad": qty_orig,
                    "unidad": ins.get("unidad"),
                    "_costo": cost,            # sin redondear hasta el final
                    "_sin_cobertura": qty_needed,
                    "_nombre": nombre,
                }
                insumos_cost.append(ic)
                if qty_needed > 1e-9:
                    pendientes.append(ic)
            resultados[aid] = {"_insumos": insumos_cost}

    # 4b. Las entradas manuales cubren las cantidades sin cobertura, en orden
    #     cronológico de las aplicaciones (FIFO de entradas manuales por producto).
    manual_lotes: Dict[str, List[Dict[str, float]]] = {}
    for c in manual_entries:
        nombre = (c.get("nombre_producto") or "").strip().lower()
        cantidad = float(c.get("cantidad") or 0)
        precio = float(c.get("precio") or 0)
        if cantidad <= 0 or not nombre:
            continue
        manual_lotes.setdefault(nombre, []).append({"cantidad": cantidad, "precio_unitario": precio / cantidad if cantidad else 0})
    for ic in pendientes:
        nombre = ic["_nombre"]
        queue = manual_lotes.get(nombre, [])
        while ic["_sin_cobertura"] > 1e-9 and queue:
            lot = queue[0]
            take = min(lot["cantidad"], ic["_sin_cobertura"])
            ic["_costo"] += take * lot["precio_unitario"]
            ic["_sin_cobertura"] -= take
            lot["cantidad"] -= take
            if lot["cantidad"] <= 1e-9:
                queue.pop(0)

    # 5. Empaquetar resultados finales (con redondeo)
    final: Dict[str, Dict[str, Any]] = {}
    for aid, r in resultados.items():
        insumos_cost: List[Dict[str, Any]] = []
        total_costo = 0.0
        for ic in r["_insumos"]:
            qty_orig = ic["cantidad"]
            insumos_cost.append({
                "nombre_producto": ic["nombre_producto"],
                "cantidad": qty_orig,
                "unidad": ic["unidad"],
                "costo": round(ic["_costo"], 2),
                "precio_unitario_promedio": round(ic["_costo"] / qty_orig, 4) if qty_orig else 0,
                "cantidad_sin_cobertura": round(ic["_sin_cobertura"], 4),
            })
            total_costo += ic["_costo"]
        final[aid] = {"total_costo": round(total_costo, 2), "insumos_costo": insumos_cost}
    return final


@api.get("/aplicaciones")
async def list_aplicaciones(_: dict = Depends(get_current_user)):
    resp = await _list("aplicaciones", "aplicaciones", sort_field="fecha")
    # Decorar cada aplicación con su costo real usando PEPS (FIFO)
    costos = await _compute_fifo_costs_per_aplicacion()
    for a in resp.get("aplicaciones", []):
        c = costos.get(a.get("_id"))
        if c:
            a["costo_insumos"] = c["total_costo"]
            a["insumos_costo"] = c["insumos_costo"]
        else:
            a["costo_insumos"] = 0.0
            a["insumos_costo"] = []
    return resp


@api.post("/aplicaciones")
async def create_aplicacion(payload: AplicacionIn, user: dict = Depends(get_current_user)):
    data = payload.model_dump()
    await _validate_inventory_for_aplicacion(None, data.get("insumos") or [])
    return await _create("aplicaciones", data, user)


@api.put("/aplicaciones/{aid}")
async def update_aplicacion(aid: str, payload: AplicacionIn, _: dict = Depends(get_current_user)):
    data = payload.model_dump()
    # Validar inventario tanto al editar pendientes como al confirmar.
    await _validate_inventory_for_aplicacion(aid, data.get("insumos") or [])
    return await _update("aplicaciones", aid, data)


@api.delete("/aplicaciones/{aid}")
async def delete_aplicacion(aid: str, _: dict = Depends(get_current_user)):
    return await _delete("aplicaciones", aid)


async def _validate_inventory_for_aplicacion(aid: Optional[str], payload_insumos: List[Dict[str, Any]]):
    """
    Antes de crear o modificar una aplicación, verifica que el inventario
    cubra todos los insumos. Las aplicaciones existentes (confirmadas O pendientes)
    se cuentan como "reservadas" — así nunca se podrá crear/editar una aplicación
    que después no se pudiera confirmar.

    Si `aid` se pasa, se excluye esa aplicación del cálculo (caso edición).
    Match por nombre de producto (case-insensitive).
    Lanza HTTPException 400 con el detalle del faltante.
    """
    # Total comprado por producto
    pipeline_compras = [
        {"$match": {"es_equipo": {"$ne": True}}},
        {"$group": {
            "_id": {"$toLower": "$nombre_producto"},
            "total_comprado": {"$sum": "$cantidad"},
        }},
    ]
    comprado = {c["_id"]: c["total_comprado"]
                for c in await db.compras.aggregate(pipeline_compras).to_list(5000)}

    # Total reservado: TODAS las aplicaciones existentes (pendientes + confirmadas),
    # excluyendo la actual si estamos editando.
    match_stage: Dict[str, Any] = {}
    if aid:
        match_stage["_id"] = {"$ne": aid}
    pipeline_usado: List[Dict[str, Any]] = []
    if match_stage:
        pipeline_usado.append({"$match": match_stage})
    pipeline_usado += [
        {"$unwind": "$insumos"},
        {"$group": {
            "_id": {"$toLower": "$insumos.nombre_producto"},
            "total_usado": {"$sum": "$insumos.cantidad"},
        }},
    ]
    reservado = {a["_id"]: a["total_usado"]
                 for a in await db.aplicaciones.aggregate(pipeline_usado).to_list(5000)}

    # Sumar las cantidades del payload por producto
    pedido: Dict[str, float] = {}
    for ins in (payload_insumos or []):
        nombre = (ins.get("nombre_producto") or "").strip().lower()
        if not nombre:
            continue
        pedido[nombre] = pedido.get(nombre, 0) + float(ins.get("cantidad") or 0)

    faltantes = []
    for nombre, cant in pedido.items():
        disponible = comprado.get(nombre, 0) - reservado.get(nombre, 0)
        if cant > disponible + 1e-9:
            faltantes.append({
                "producto": nombre,
                "solicitado": round(cant, 2),
                "disponible": round(disponible, 2),
                "faltante": round(cant - disponible, 2),
            })

    if faltantes:
        msg_lines = ["No hay suficiente inventario disponible:"]
        for f in faltantes:
            msg_lines.append(
                f"• {f['producto']}: pedido {f['solicitado']}, disponible {f['disponible']}, faltante {f['faltante']}"
            )
        msg_lines.append("")
        msg_lines.append("Registra una compra antes de crear esta aplicación.")
        raise HTTPException(status_code=400, detail="\n".join(msg_lines))


class RecetaIn(BaseModel):
    nombre: str
    descripcion: str = ""
    cantidad_agua: float = 0
    observaciones: str = ""
    insumos: List[InsumoItem] = []


@api.get("/recetas")
async def list_recetas(_: dict = Depends(get_current_user)):
    return await _list("recetas", "recetas")


@api.post("/recetas")
async def create_receta(payload: RecetaIn, user: dict = Depends(get_current_user)):
    return await _create("recetas", payload.model_dump(), user)


@api.put("/recetas/{rid}")
async def update_receta(rid: str, payload: RecetaIn, _: dict = Depends(get_current_user)):
    return await _update("recetas", rid, payload.model_dump())


@api.delete("/recetas/{rid}")
async def delete_receta(rid: str, _: dict = Depends(get_current_user)):
    return await _delete("recetas", rid)


# ============================================================
# ACTIVIDADES
# Origen: registro_manual o desde aplicacion (pendiente -> confirmada)
# ============================================================
class ActividadIn(BaseModel):
    tipo: str  # deshierbar | siembra | poda | otro | aplicacion
    tipo_personalizado: Optional[str] = None
    cantidad_trabajadores: float = 0  # puede ser fraccionario al repartir entre lotes
    horas_trabajo: float = 0
    precio_hora: float = 0
    lote: str = ""
    fecha_actividad: str
    observaciones: str = ""
    origen: str = "registro_manual"  # registro_manual | aplicacion
    aplicacion_id: Optional[str] = None


@api.get("/actividades")
async def list_actividades(
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    filt = {}
    if fecha_desde or fecha_hasta:
        filt["fecha_actividad"] = {}
        if fecha_desde:
            filt["fecha_actividad"]["$gte"] = fecha_desde
        if fecha_hasta:
            filt["fecha_actividad"]["$lte"] = fecha_hasta
    return await _list("actividades", "actividades", filt, sort_field="fecha_actividad")


def _compute_actividad_derived(data: dict) -> dict:
    trab = float(data.get("cantidad_trabajadores") or 0)
    horas = float(data.get("horas_trabajo") or 0)
    precio = float(data.get("precio_hora") or 0)
    data["horas_hombre"] = trab * horas
    data["costo_total"] = trab * horas * precio
    return data


@api.post("/actividades")
async def create_actividad(payload: ActividadIn, user: dict = Depends(get_current_user)):
    data = _compute_actividad_derived(payload.model_dump())
    data["registrado_por"] = user.get("email")
    return await _create("actividades", data, user)


@api.put("/actividades/{aid}")
async def update_actividad(aid: str, payload: ActividadIn, _: dict = Depends(get_current_user)):
    data = _compute_actividad_derived(payload.model_dump())
    return await _update("actividades", aid, data)


@api.delete("/actividades/{aid}")
async def delete_actividad(aid: str, _: dict = Depends(get_current_user)):
    return await _delete("actividades", aid)


# ============================================================
# VENTAS - finca, ciudad
# ============================================================
class VentaIn(BaseModel):
    fecha: str
    cantidad_cestas: float = 0
    cantidad_kg: float = 0
    precio_unitario: float = 0
    total: float = 0
    unidad_venta: str = "cestas"  # cestas | kg (forma en que se registró la venta)
    cliente: str = ""
    telefono: str = ""
    abono_inicial: float = 0
    observaciones: str = ""
    origen: str = ""
    asignacion_id: str = ""


class AjusteSaldoIn(BaseModel):
    cantidad_cestas: float  # el "Disponible acumulado" REAL que debe quedar
    observaciones: str = ""


# Orígenes que SUMAN al disponible acumulado (entradas de stock)
RECIBIDO_ORIGINS = ("asignacion_destino", "ajuste_entrada")


def _ventas_router(tipo: str):
    _es_donacion = tipo == "donaciones"

    def _strip_money(data: dict) -> dict:
        if _es_donacion:
            data["precio_unitario"] = 0
            data["total"] = 0
            data["abono_inicial"] = 0
        return data

    @api.get(f"/ventas-{tipo}")
    async def _list_v(_: dict = Depends(get_current_user)):
        docs = await db[f"ventas_{tipo}"].find({}).sort("fecha", -1).to_list(2000)
        return {"ventas": docs}

    @api.post(f"/ventas-{tipo}")
    async def _create_v(payload: VentaIn, user: dict = Depends(get_current_user)):
        return await _create(f"ventas_{tipo}", _strip_money(payload.model_dump()), user)

    @api.put(f"/ventas-{tipo}/{{vid}}")
    async def _update_v(vid: str, payload: VentaIn, _: dict = Depends(get_current_user)):
        data = _strip_money(payload.model_dump())
        # No permitir que una edición rompa el vínculo con Asignación de destino
        data.pop("origen", None)
        data.pop("asignacion_id", None)
        return await _update(f"ventas_{tipo}", vid, data)

    @api.delete(f"/ventas-{tipo}/{{vid}}")
    async def _delete_v(vid: str, _: dict = Depends(get_current_user)):
        return await _delete(f"ventas_{tipo}", vid)

    @api.post(f"/ventas-{tipo}/ajuste-saldo")
    async def _ajuste_saldo(payload: AjusteSaldoIn, user: dict = Depends(get_current_user)):
        """Fija el 'Disponible acumulado' real del módulo creando un registro de ajuste.
        Útil cuando hay ventas históricas sin un 'recibido' que las respalde."""
        deseado = round(payload.cantidad_cestas or 0, 4)
        if deseado < 0:
            raise HTTPException(400, "El saldo disponible no puede ser negativo.")
        coll = f"ventas_{tipo}"
        docs = await db[coll].find({}).to_list(50000)
        recibido = sum((d.get("cantidad_cestas", 0) or 0) for d in docs if d.get("origen") in RECIBIDO_ORIGINS)
        usado = sum((d.get("cantidad_cestas", 0) or 0) for d in docs if d.get("origen") not in RECIBIDO_ORIGINS)
        actual = recibido - usado
        delta = round(deseado - actual, 4)
        if abs(delta) < 0.001:
            return {"success": True, "sin_cambios": True, "disponible": round(actual, 2)}
        cant = round(abs(delta), 4)
        kg = round(cant * KG_POR_CESTA, 2)
        registro = {
            "fecha": now_iso(), "cantidad_cestas": cant, "cantidad_kg": kg,
            "precio_unitario": 0, "total": 0, "cliente": "", "telefono": "", "abono_inicial": 0,
            "observaciones": payload.observaciones or f"Ajuste de saldo: disponible fijado a {deseado}",
            "origen": "ajuste_entrada" if delta > 0 else "ajuste_salida",
        }
        await _create(coll, registro, user)
        return {"success": True, "disponible_anterior": round(actual, 2), "disponible_nuevo": deseado, "delta": delta}

_ventas_router("finca")
_ventas_router("ciudad")
_ventas_router("refrigerar")
_ventas_router("congelar")
_ventas_router("descarte")
_ventas_router("donaciones")


# ── Reasignar cestas sobrantes entre canales (ciudad → ..., refrigerar → ..., congelar → ...) ──
class ReasignarIn(BaseModel):
    cantidad_cestas: float
    destino: str
    fecha: str    # YYYY-MM-DD o ISO


_REASIGNAR_LABELS = {"descarte": "Descarte", "donaciones": "Donaciones", "refrigerar": "Refrigerar", "congelar": "Congelar"}
_FUENTE_LABELS = {"ciudad": "Envío a ciudad", "refrigerar": "Refrigerar", "congelar": "Congelar"}


async def _reasignar_ventas(source_tipo: str, payload: ReasignarIn, allowed: tuple, user: dict):
    """Mueve cestas no vendidas de un canal de ventas hacia otro destino.
    Crea una salida en el canal origen (reduce su disponible) y una entrada en el destino."""
    if payload.destino not in allowed:
        raise HTTPException(400, f"Destino inválido. Opciones: {', '.join(allowed)}.")
    cestas = round(payload.cantidad_cestas or 0, 4)
    if cestas <= 0:
        raise HTTPException(400, "La cantidad debe ser mayor a 0.")
    fecha_prefix = (payload.fecha or "")[:10]
    if not fecha_prefix:
        raise HTTPException(400, "Fecha inválida.")
    coll = f"ventas_{source_tipo}"
    docs = await db[coll].find({}).to_list(20000)
    asignado = sum((d.get("cantidad_cestas", 0) or 0) for d in docs if d.get("origen") in RECIBIDO_ORIGINS)
    usado = sum((d.get("cantidad_cestas", 0) or 0) for d in docs if d.get("origen") not in RECIBIDO_ORIGINS)
    disponible = asignado - usado
    if cestas > disponible + 0.001:
        raise HTTPException(400, f"Solo hay {round(max(disponible, 0), 2)} cesta(s) disponible(s) en {_FUENTE_LABELS.get(source_tipo, source_tipo)} para reasignar.")
    kg = round(cestas * KG_POR_CESTA, 2)
    fecha_full = fecha_prefix + "T12:00:00.000Z"
    destino_label = _REASIGNAR_LABELS[payload.destino]
    # 1) Salida del canal origen (reduce su disponible): registro de salida, no es venta real
    salida = {
        "fecha": fecha_full, "cantidad_cestas": cestas, "cantidad_kg": kg,
        "precio_unitario": 0, "total": 0, "cliente": f"Reasignado a {destino_label}",
        "telefono": "", "abono_inicial": 0,
        "observaciones": f"Reasignación de cestas sobrantes a {destino_label}",
        "origen": "reasignacion_salida",
    }
    await _create(coll, salida, user)
    # 2) Entrada en el destino elegido
    # En canales que se siguen vendiendo/donando (refrigerar/congelar/donaciones) cuenta como
    # stock disponible (origen=asignacion_destino). En descarte queda solo como registro.
    entrada = {
        "fecha": fecha_full, "cantidad_cestas": cestas, "cantidad_kg": kg,
        "precio_unitario": 0, "total": 0, "cliente": "", "telefono": "", "abono_inicial": 0,
        "observaciones": f"Reasignado desde {_FUENTE_LABELS.get(source_tipo, source_tipo)}",
        "origen": "reasignacion_ciudad" if payload.destino == "descarte" else "asignacion_destino",
    }
    await _create(f"ventas_{payload.destino}", entrada, user)
    return {"success": True, "cantidad_cestas": cestas, "destino": payload.destino}


@api.post("/ventas-ciudad/reasignar")
async def reasignar_ciudad(payload: ReasignarIn, user: dict = Depends(get_current_user)):
    return await _reasignar_ventas("ciudad", payload, ("descarte", "donaciones", "refrigerar", "congelar"), user)


@api.post("/ventas-refrigerar/reasignar")
async def reasignar_refrigerar(payload: ReasignarIn, user: dict = Depends(get_current_user)):
    return await _reasignar_ventas("refrigerar", payload, ("congelar", "donaciones", "descarte"), user)


@api.post("/ventas-congelar/reasignar")
async def reasignar_congelar(payload: ReasignarIn, user: dict = Depends(get_current_user)):
    return await _reasignar_ventas("congelar", payload, ("donaciones", "descarte"), user)


@api.get("/dashboard/stock-canales")
async def stock_canales(_: dict = Depends(get_current_user)):
    """Stock disponible actual por canal (cestas/kg) y antigüedad (días) del lote más viejo
    que aún sigue disponible (FIFO: lo usado se descuenta de los recibidos más antiguos)."""
    hoy = datetime.now(VE_TZ).date()
    canales = [("ciudad", "Envío a ciudad"), ("refrigerar", "Refrigerar"), ("congelar", "Congelar")]
    out = []
    for tipo, label in canales:
        docs = await db[f"ventas_{tipo}"].find({}).to_list(20000)
        recibidos = [d for d in docs if d.get("origen") in RECIBIDO_ORIGINS]
        recibido_total = sum((d.get("cantidad_cestas", 0) or 0) for d in recibidos)
        usado = sum((d.get("cantidad_cestas", 0) or 0) for d in docs if d.get("origen") not in RECIBIDO_ORIGINS)
        disponible = round(recibido_total - usado, 2)
        dias = 0
        fecha_mas_antigua = None
        if disponible > 0.001:
            rem = usado
            for d in sorted(recibidos, key=lambda x: (x.get("fecha") or "")):
                c = d.get("cantidad_cestas", 0) or 0
                if rem >= c - 0.0001:
                    rem -= c
                    continue
                fecha_mas_antigua = (d.get("fecha") or "")[:10]
                break
            if fecha_mas_antigua:
                try:
                    fd = datetime.strptime(fecha_mas_antigua, "%Y-%m-%d").date()
                    dias = max((hoy - fd).days, 0)
                except ValueError:
                    dias = 0
        out.append({
            "tipo": tipo, "label": label,
            "cestas": disponible,
            "kg": round(max(disponible, 0) * KG_POR_CESTA, 2),
            "dias": dias,
            "fecha_mas_antigua": fecha_mas_antigua,
        })
    return {"canales": out}


# ============================================================
# FRIO - cámara fría con cestas almacenadas
# ============================================================
class FrioIn(BaseModel):
    fecha_ingreso: str
    cantidad_cestas: float
    lote: str = ""
    variedad: str = ""
    tipo_conservacion: str = ""
    observaciones: str = ""
    origen: str = ""
    asignacion_id: str = ""


@api.get("/frio-registros")
async def list_frio(_: dict = Depends(get_current_user)):
    return await _list("frio_registros", "registros", sort_field="fecha_ingreso")


@api.post("/frio-registros")
async def create_frio(payload: FrioIn, user: dict = Depends(get_current_user)):
    return await _create("frio_registros", payload.model_dump(), user)


@api.delete("/frio-registros/{fid}")
async def delete_frio(fid: str, _: dict = Depends(get_current_user)):
    return await _delete("frio_registros", fid)


# ============================================================
# RRHH - vincula actividades a trabajadores
# ============================================================
class TrabajadorIn(BaseModel):
    nombre_completo: str
    documento: str = ""
    telefono: str = ""
    cargo: str = ""
    salario_diario: float = 0
    fecha_ingreso: Optional[str] = None
    activo: bool = True


@api.get("/trabajadores")
async def list_trabajadores(_: dict = Depends(get_current_user)):
    return await _list("trabajadores", "trabajadores")


@api.post("/trabajadores")
async def create_trabajador(payload: TrabajadorIn, user: dict = Depends(get_current_user)):
    return await _create("trabajadores", payload.model_dump(), user)


@api.put("/trabajadores/{tid}")
async def update_trabajador(tid: str, payload: TrabajadorIn, _: dict = Depends(get_current_user)):
    return await _update("trabajadores", tid, payload.model_dump())


@api.delete("/trabajadores/{tid}")
async def delete_trabajador(tid: str, _: dict = Depends(get_current_user)):
    return await _delete("trabajadores", tid)


# ============================================================
# ANALITICAS - resumen agregado
# ============================================================
@api.get("/analiticas/resumen")
async def analiticas_resumen(_: dict = Depends(get_current_user)):
    cosechas = await db.cosechas.find({}).to_list(5000)
    total_kg = 0
    total_primera = 0
    total_descarte = 0
    for c in cosechas:
        unidad = c.get("unidad", "kg")
        mult = KG_POR_CESTA if unidad == "cestas" else 1
        for q in ("primera_calidad", "segunda_calidad", "tercera_calidad", "descarte"):
            v = c.get(q, 0) or 0
            total_kg += v * mult
            if q == "primera_calidad":
                total_primera += v * mult
            if q == "descarte":
                total_descarte += v * mult
    n_users = await db.users.count_documents({})
    n_plant = await db.plantaciones.count_documents({})
    n_aplic = await db.aplicaciones.count_documents({})
    n_act = await db.actividades.count_documents({})

    # Inversión en insumos: compras reales + entradas manuales de inventario
    compras_ins = await db.compras.find({"es_equipo": {"$ne": True}}).to_list(20000)
    inv_compras = sum(float(c.get("precio") or 0) for c in compras_ins if c.get("origen") != "ajuste")
    inv_manual = sum(float(c.get("precio") or 0) for c in compras_ins if c.get("origen") == "ajuste")

    return {
        "total_kg_cosechado": round(total_kg, 2),
        "total_primera_calidad_kg": round(total_primera, 2),
        "total_descarte_kg": round(total_descarte, 2),
        "n_usuarios": n_users,
        "n_plantaciones": n_plant,
        "n_aplicaciones": n_aplic,
        "n_actividades": n_act,
        "inversion_compras": round(inv_compras, 2),
        "inversion_entradas_manuales": round(inv_manual, 2),
        "inversion_insumos_total": round(inv_compras + inv_manual, 2),
    }


@api.get("/analiticas/cuentas-por-cobrar")
async def analiticas_cuentas_por_cobrar(_: dict = Depends(get_current_user)):
    """Deuda agrupada por cliente, sumando ventas de finca + ciudad con saldo pendiente."""
    ventas = []
    for coll, origen in (("ventas_finca", "Venta en finca"), ("ventas_ciudad", "Envío a ciudad")):
        docs = await db[coll].find({}).to_list(5000)
        for v in docs:
            ventas.append({**v, "_origen_modulo": origen})

    hoy = datetime.now(timezone.utc)
    grupos = {}
    for v in ventas:
        total = v.get("total", 0) or 0
        abono = v.get("abono_inicial", 0) or 0
        saldo = total - abono
        if saldo <= 0.001:
            continue  # solo deudores
        cliente = (v.get("cliente") or "").strip() or "Sin nombre"
        telefono = (v.get("telefono") or "").strip()
        key = cliente.lower() + "|" + telefono
        g = grupos.get(key)
        if not g:
            g = {"cliente": cliente, "telefono": telefono, "total_vendido": 0.0, "total_abonado": 0.0,
                  "saldo": 0.0, "n_ventas": 0, "dias_max": 0, "modulos": set()}
            grupos[key] = g
        g["total_vendido"] += total
        g["total_abonado"] += abono
        g["saldo"] += saldo
        g["n_ventas"] += 1
        g["modulos"].add(v["_origen_modulo"])
        try:
            fecha = datetime.fromisoformat((v.get("fecha") or "").replace("Z", "+00:00"))
            dias = max(0, (hoy - fecha).days)
            g["dias_max"] = max(g["dias_max"], dias)
        except Exception:
            pass

    cuentas = []
    for g in grupos.values():
        cuentas.append({
            "cliente": g["cliente"], "telefono": g["telefono"],
            "total_vendido": round(g["total_vendido"], 2),
            "total_abonado": round(g["total_abonado"], 2),
            "saldo": round(g["saldo"], 2),
            "n_ventas": g["n_ventas"], "dias_max": g["dias_max"],
            "modulos": sorted(g["modulos"]),
        })
    cuentas.sort(key=lambda c: c["saldo"], reverse=True)

    return {
        "cuentas": cuentas,
        "total_deuda": round(sum(c["saldo"] for c in cuentas), 2),
        "total_vendido": round(sum(c["total_vendido"] for c in cuentas), 2),
        "total_cobrado": round(sum(c["total_abonado"] for c in cuentas), 2),
        "n_deudores": len(cuentas),
    }


@api.get("/analiticas/cuentas-por-cobrar/detalle")
async def analiticas_cxc_detalle(cliente: str, telefono: str = "", _: dict = Depends(get_current_user)):
    """Ventas individuales pendientes (con saldo > 0) de un cliente, de finca + ciudad.
    Cada venta incluye `_tipo` (finca|ciudad) para poder registrar abonos vía PUT."""
    cliente_key = (cliente or "").strip().lower()
    telefono_key = (telefono or "").strip()
    hoy = datetime.now(timezone.utc)
    ventas = []
    for tipo, coll, label in (("finca", "ventas_finca", "Venta en finca"), ("ciudad", "ventas_ciudad", "Envío a ciudad")):
        docs = await db[coll].find({}).to_list(5000)
        for v in docs:
            c = (v.get("cliente") or "").strip()
            t = (v.get("telefono") or "").strip()
            if c.lower() != cliente_key or t != telefono_key:
                continue
            total = v.get("total", 0) or 0
            abono = v.get("abono_inicial", 0) or 0
            saldo = total - abono
            if saldo <= 0.001:
                continue
            try:
                fecha = datetime.fromisoformat((v.get("fecha") or "").replace("Z", "+00:00"))
                dias = max(0, (hoy - fecha).days)
            except Exception:
                dias = 0
            ventas.append({
                "_id": v.get("_id"), "_tipo": tipo, "_modulo": label,
                "fecha": v.get("fecha", ""),
                "cantidad_cestas": v.get("cantidad_cestas", 0) or 0,
                "cantidad_kg": v.get("cantidad_kg", 0) or 0,
                "precio_unitario": v.get("precio_unitario", 0) or 0,
                "total": round(total, 2), "abono_inicial": round(abono, 2),
                "saldo": round(saldo, 2), "dias": dias,
                "observaciones": v.get("observaciones", ""),
            })
    ventas.sort(key=lambda x: x["fecha"], reverse=True)
    return {
        "cliente": cliente, "telefono": telefono, "ventas": ventas,
        "saldo_total": round(sum(v["saldo"] for v in ventas), 2),
        "n_ventas": len(ventas),
    }


# ============================================================
# DASHBOARD - Gastos de la semana (solo lectura, no afecta otros módulos)
# Semana: lunes 5:00 a.m. → domingo 6:00 p.m. (hora de Venezuela, UTC-4)
# Recopila: Compras (insumos) + Gastos de vehículo + Pago de trabajadores
# (costo de actividades) + Equipos nuevos de tipo Herramienta y Motor.
# ============================================================
VE_TZ = timezone(timedelta(hours=-4))  # (definido también arriba, cerca de imports)


def _parse_dt_ve(s) -> Optional[datetime]:
    """Convierte una fecha almacenada (date-only o ISO) a datetime con tz de Venezuela.
    Las fechas sin hora se anclan a las 12:00 (mediodía) para caer con seguridad dentro del día."""
    if not s:
        return None
    s = str(s).strip()
    try:
        if "T" in s or ":" in s:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=VE_TZ)
            return dt.astimezone(VE_TZ)
        d = datetime.fromisoformat(s[:10])
        return d.replace(hour=12, minute=0, second=0, microsecond=0, tzinfo=VE_TZ)
    except Exception:
        return None


def _week_window_ve(offset: int = 0):
    """Ventana de la semana: lunes 05:00 → domingo 18:00 (VE). offset desplaza semanas (0=actual, -1=anterior)."""
    now = datetime.now(VE_TZ)
    monday = (now - timedelta(days=now.weekday())).replace(hour=5, minute=0, second=0, microsecond=0)
    monday = monday + timedelta(weeks=offset)
    sunday = (monday + timedelta(days=6)).replace(hour=18, minute=0, second=0, microsecond=0)
    return monday, sunday


@api.get("/dashboard/gastos-semana")
async def dashboard_gastos_semana(offset: int = 0, _: dict = Depends(get_current_user)):
    inicio, fin = _week_window_ve(offset)

    def in_week(s) -> bool:
        dt = _parse_dt_ve(s)
        return dt is not None and inicio <= dt <= fin

    cats = {
        "compras": {"label": "Compras (insumos)", "total": 0.0, "count": 0, "items": []},
        "vehiculos": {"label": "Gastos de vehículo", "total": 0.0, "count": 0, "items": []},
        "trabajadores": {"label": "Pago de trabajadores", "total": 0.0, "count": 0, "items": []},
        "herramientas": {"label": "Herramientas (nuevas)", "total": 0.0, "count": 0, "items": []},
        "motores": {"label": "Motores (nuevos)", "total": 0.0, "count": 0, "items": []},
    }

    # Compras de insumos (excluye equipos y entradas manuales 'ajuste')
    for c in await db.compras.find({"es_equipo": {"$ne": True}, "origen": {"$ne": "ajuste"}}).to_list(20000):
        if in_week(c.get("fecha_compra")):
            monto = float(c.get("precio") or 0)
            cats["compras"]["total"] += monto
            cats["compras"]["count"] += 1
            cats["compras"]["items"].append({"fecha": c.get("fecha_compra"), "concepto": c.get("nombre_producto") or "Compra", "monto": round(monto, 2)})

    # Gastos de vehículo
    for g in await db.gastos_vehiculos.find({}).to_list(20000):
        if in_week(g.get("fecha")):
            monto = float(g.get("monto") or 0)
            cats["vehiculos"]["total"] += monto
            cats["vehiculos"]["count"] += 1
            cats["vehiculos"]["items"].append({"fecha": g.get("fecha"), "concepto": (g.get("categoria") or "Gasto").replace("_", " "), "monto": round(monto, 2)})

    # Pago de trabajadores = costo de mano de obra de actividades
    for a in await db.actividades.find({}).to_list(20000):
        if in_week(a.get("fecha_actividad")):
            monto = float(a.get("costo_total") or 0)
            if monto <= 0:
                continue
            cats["trabajadores"]["total"] += monto
            cats["trabajadores"]["count"] += 1
            cats["trabajadores"]["items"].append({"fecha": a.get("fecha_actividad"), "concepto": a.get("tipo_personalizado") or a.get("tipo") or "Actividad", "monto": round(monto, 2)})

    # Equipos nuevos: Herramientas y Motores (valor = costo_adquisicion × cantidad)
    for e in await db.equipos.find({}).to_list(20000):
        cat = (e.get("categoria") or "").lower()
        key = "herramientas" if cat == "herramienta" else ("motores" if cat == "motor" else None)
        if key and in_week(e.get("fecha_adquisicion")):
            monto = float(e.get("costo_adquisicion") or 0) * float(e.get("cantidad") or 1)
            cats[key]["total"] += monto
            cats[key]["count"] += 1
            cats[key]["items"].append({"fecha": e.get("fecha_adquisicion"), "concepto": e.get("nombre") or "Equipo", "monto": round(monto, 2)})

    categorias = []
    for k, v in cats.items():
        v["items"].sort(key=lambda x: x.get("fecha") or "", reverse=True)
        categorias.append({"key": k, "label": v["label"], "total": round(v["total"], 2), "count": v["count"], "items": v["items"]})
    total = round(sum(c["total"] for c in categorias), 2)

    return {
        "offset": offset,
        "inicio": inicio.isoformat(),
        "fin": fin.isoformat(),
        "total": total,
        "categorias": categorias,
    }


# ============================================================
# ANALÍTICAS - Estado de Resultados (solo lectura + valores manuales por periodo)
# Recopila datos de otros módulos (NO los modifica) y los agrupa.
# Salarios: snapshot por periodo para no afectar periodos ya registrados.
# ============================================================
class EstadoResultadosIn(BaseModel):
    anio: int
    mes: Optional[int] = None  # 1-12 = mensual; None = anual
    otros_ingresos: float = 0
    software_erp: float = 0


VENTA_SYSTEM_ORIGENES = ("asignacion_destino", "ajuste_entrada", "ajuste_salida", "reasignacion_salida")
SALARIO_DIAS_MES = 30  # factor para convertir salario diario -> mensual


def _en_periodo(s, anio: int, mes: Optional[int]) -> bool:
    """Compara por prefijo de fecha (YYYY-MM-DD) para agrupar por mes/año calendario sin desfases de zona horaria."""
    if not s:
        return False
    d = str(s)[:10]
    if len(d) < 7:
        return False
    if mes:
        return d[:7] == f"{anio:04d}-{mes:02d}"
    return d[:4] == f"{anio:04d}"


async def _current_salarios_mensual() -> float:
    trabajadores = await db.trabajadores.find({}).to_list(5000)
    return sum((float(t.get("salario_diario") or 0) * SALARIO_DIAS_MES) for t in trabajadores if t.get("activo", True))


async def _build_estado_resultados(anio: int, mes: Optional[int]) -> dict:
    # INGRESO POR VENTAS: total vendido de los 4 canales con dinero (solo ventas reales)
    ventas_fresa = 0.0
    for tipo in ("finca", "ciudad", "refrigerar", "congelar"):
        for v in await db[f"ventas_{tipo}"].find({}).to_list(20000):
            if v.get("origen") in VENTA_SYSTEM_ORIGENES:
                continue
            if _en_periodo(v.get("fecha"), anio, mes):
                ventas_fresa += float(v.get("total") or 0)

    # COSTO DE VENTAS: fertilizantes y agroquímicos = costo real PEPS de aplicaciones confirmadas
    fifo = await _compute_fifo_costs_per_aplicacion()
    fert_agro = 0.0
    for a in await db.aplicaciones.find({"estado": "confirmada"}).to_list(20000):
        if _en_periodo(a.get("fecha"), anio, mes):
            fert_agro += float(fifo.get(a.get("_id"), {}).get("total_costo", 0) or 0)

    # COSTO DE VENTAS: mano de obra = costo de actividades
    mano_obra = 0.0
    for act in await db.actividades.find({}).to_list(20000):
        if _en_periodo(act.get("fecha_actividad"), anio, mes):
            mano_obra += float(act.get("costo_total") or 0)

    # GASTOS OPERATIVOS: gastos del vehículo = total (gasolina + repuestos + mano de obra)
    gastos_vehiculo = 0.0
    for g in await db.gastos_vehiculos.find({}).to_list(20000):
        if _en_periodo(g.get("fecha"), anio, mes):
            gastos_vehiculo += float(g.get("monto") or 0)

    # COSECHA: kg cosechados y kg de descarte en el período (para costos por kg)
    kg_cosechados = 0.0
    kg_descarte = 0.0
    for c in await db.cosechas.find({}).to_list(20000):
        if not _en_periodo(c.get("fecha_cosecha"), anio, mes):
            continue
        suma = (c.get("primera_calidad", 0) or 0) + (c.get("segunda_calidad", 0) or 0) + (c.get("tercera_calidad", 0) or 0) + (c.get("descarte", 0) or 0)
        desc = c.get("descarte", 0) or 0
        mult = 1 if c.get("unidad") == "kg" else KG_POR_CESTA
        kg_cosechados += suma * mult
        kg_descarte += desc * mult
    # DONACIONES: kg realmente donados en el período (registros de donación, no movimientos del sistema)
    kg_donaciones = 0.0
    for d in await db.ventas_donaciones.find({}).to_list(20000):
        if d.get("origen") in VENTA_SYSTEM_ORIGENES:
            continue
        if _en_periodo(d.get("fecha"), anio, mes):
            kg_donaciones += float(d.get("cantidad_kg") or (d.get("cantidad_cestas", 0) or 0) * KG_POR_CESTA)
    # DESCARTE reasignado: fruta buena reenviada al canal Descarte (NO el descarte de calidad,
    # que llega con origen=asignacion_destino y ya está contado en kg_descarte).
    kg_descarte_reasignado = 0.0
    for d in await db.ventas_descarte.find({}).to_list(20000):
        if d.get("origen") == "asignacion_destino":
            continue
        if _en_periodo(d.get("fecha"), anio, mes):
            kg_descarte_reasignado += float(d.get("cantidad_kg") or (d.get("cantidad_cestas", 0) or 0) * KG_POR_CESTA)
    kg_cosechados = round(kg_cosechados, 2)
    kg_descarte = round(kg_descarte, 2)
    kg_donaciones = round(kg_donaciones, 2)
    kg_descarte_reasignado = round(kg_descarte_reasignado, 2)
    kg_vendible = round(kg_cosechados - kg_descarte - kg_donaciones - kg_descarte_reasignado, 2)

    # Valores guardados del periodo (manuales + snapshot de salarios congelado)
    doc = await db.estado_resultados.find_one({"anio": anio, "mes": mes})
    otros_ingresos = float(doc.get("otros_ingresos", 0)) if doc else 0.0
    software_erp = float(doc.get("software_erp", 0)) if doc else 0.0
    if doc and doc.get("salarios_snapshot") is not None:
        salarios = float(doc["salarios_snapshot"])
    else:
        base = await _current_salarios_mensual()
        salarios = base if mes else base * 12

    total_ingresos = round(ventas_fresa + otros_ingresos, 2)
    total_costo_ventas = round(fert_agro + mano_obra, 2)
    total_gastos_op = round(salarios + gastos_vehiculo + software_erp, 2)
    utilidad_bruta = round(total_ingresos - total_costo_ventas, 2)
    utilidad_operativa = round(utilidad_bruta - total_gastos_op, 2)

    return {
        "anio": anio, "mes": mes,
        "registrado": bool(doc),
        "fecha_registro": doc.get("fecha_registro") if doc else None,
        "ingresos": {"ventas_fresa": round(ventas_fresa, 2), "otros_ingresos": round(otros_ingresos, 2), "total": total_ingresos},
        "costo_ventas": {"fertilizantes_agroquimicos": round(fert_agro, 2), "mano_obra": round(mano_obra, 2), "total": total_costo_ventas},
        "gastos_operativos": {"salarios": round(salarios, 2), "gastos_vehiculo": round(gastos_vehiculo, 2), "software_erp": round(software_erp, 2), "total": total_gastos_op},
        "cosecha": {"kg_cosechados": kg_cosechados, "kg_descarte": kg_descarte, "kg_donaciones": kg_donaciones, "kg_descarte_reasignado": kg_descarte_reasignado, "kg_vendible": kg_vendible},
        "utilidad_bruta": utilidad_bruta,
        "utilidad_operativa": utilidad_operativa,
    }


@api.get("/analiticas/estado-resultados")
async def get_estado_resultados(anio: int, mes: Optional[int] = None, _: dict = Depends(get_current_user)):
    return await _build_estado_resultados(anio, mes)


@api.post("/analiticas/estado-resultados")
async def guardar_estado_resultados(payload: EstadoResultadosIn, _: dict = Depends(get_current_user)):
    base = await _current_salarios_mensual()
    salarios = base if payload.mes else base * 12
    await db.estado_resultados.update_one(
        {"anio": payload.anio, "mes": payload.mes},
        {"$set": {
            "anio": payload.anio, "mes": payload.mes,
            "otros_ingresos": float(payload.otros_ingresos or 0),
            "software_erp": float(payload.software_erp or 0),
            "salarios_snapshot": salarios,
            "registrado": True,
            "fecha_registro": now_iso(),
        }},
        upsert=True,
    )
    return await _build_estado_resultados(payload.anio, payload.mes)


@api.get("/analiticas/costos-kg-tendencia")
async def costos_kg_tendencia(anio: int, _: dict = Depends(get_current_user)):
    """Tendencia mensual (12 meses) de los 4 costos por kg para el año dado.
    Calcula cada colección una sola vez y agrega por mes (solo lectura)."""
    fifo = await _compute_fifo_costs_per_aplicacion()
    aplicaciones = await db.aplicaciones.find({"estado": "confirmada"}).to_list(20000)
    actividades = await db.actividades.find({}).to_list(20000)
    gastos = await db.gastos_vehiculos.find({}).to_list(20000)
    cosechas = await db.cosechas.find({}).to_list(20000)
    donaciones = await db.ventas_donaciones.find({}).to_list(20000)
    descartes_ch = await db.ventas_descarte.find({}).to_list(20000)
    docs_by_mes = {d.get("mes"): d for d in await db.estado_resultados.find({"anio": anio}).to_list(200)}
    base_salario = await _current_salarios_mensual()

    meses = []
    for m in range(1, 13):
        fert = sum(float(fifo.get(a.get("_id"), {}).get("total_costo", 0) or 0)
                   for a in aplicaciones if _en_periodo(a.get("fecha"), anio, m))
        mano = sum(float(a.get("costo_total") or 0)
                   for a in actividades if _en_periodo(a.get("fecha_actividad"), anio, m))
        gveh = sum(float(g.get("monto") or 0)
                   for g in gastos if _en_periodo(g.get("fecha"), anio, m))
        doc = docs_by_mes.get(m)
        soft = float(doc.get("software_erp", 0)) if doc else 0.0
        sal = float(doc["salarios_snapshot"]) if (doc and doc.get("salarios_snapshot") is not None) else base_salario

        kg_cos = 0.0
        kg_desc = 0.0
        for c in cosechas:
            if not _en_periodo(c.get("fecha_cosecha"), anio, m):
                continue
            suma = (c.get("primera_calidad", 0) or 0) + (c.get("segunda_calidad", 0) or 0) + (c.get("tercera_calidad", 0) or 0) + (c.get("descarte", 0) or 0)
            mult = 1 if c.get("unidad") == "kg" else KG_POR_CESTA
            kg_cos += suma * mult
            kg_desc += (c.get("descarte", 0) or 0) * mult
        kg_don = 0.0
        for d in donaciones:
            if d.get("origen") in VENTA_SYSTEM_ORIGENES:
                continue
            if _en_periodo(d.get("fecha"), anio, m):
                kg_don += float(d.get("cantidad_kg") or (d.get("cantidad_cestas", 0) or 0) * KG_POR_CESTA)
        kg_desc_re = 0.0
        for d in descartes_ch:
            if d.get("origen") == "asignacion_destino":
                continue
            if _en_periodo(d.get("fecha"), anio, m):
                kg_desc_re += float(d.get("cantidad_kg") or (d.get("cantidad_cestas", 0) or 0) * KG_POR_CESTA)
        kg_vend = kg_cos - kg_desc - kg_don - kg_desc_re
        costo_ventas = fert + mano
        costo_con_op = costo_ventas + sal + gveh + soft
        meses.append({
            "mes": m,
            "kg_cosechados": round(kg_cos, 2),
            "kg_descarte": round(kg_desc, 2),
            "kg_donaciones": round(kg_don, 2),
            "kg_vendible": round(kg_vend, 2),
            "costo_por_kg": round(costo_ventas / kg_cos, 4) if kg_cos > 0 else 0,
            "costo_total_por_kg": round(costo_con_op / kg_cos, 4) if kg_cos > 0 else 0,
            "costo_real_vendible": round(costo_ventas / kg_vend, 4) if kg_vend > 0 else 0,
            "costo_total_real_vendible": round(costo_con_op / kg_vend, 4) if kg_vend > 0 else 0,
        })
    return {"anio": anio, "meses": meses}


def _costos_kg_window(gran: str, anchor: Optional[str]):
    """Devuelve (desde, hasta) inclusivos en 'YYYY-MM-DD' segun granularidad. Para 'todo' devuelve (None, None)."""
    from datetime import date as _date
    today = datetime.now(VE_TZ).date()
    try:
        a = _date.fromisoformat(str(anchor)[:10]) if anchor else today
    except Exception:
        a = today
    if gran == "semana":
        monday = a - timedelta(days=a.weekday())
        return monday.isoformat(), (monday + timedelta(days=6)).isoformat()
    if gran == "mes":
        first = a.replace(day=1)
        nxt = first.replace(year=a.year + 1, month=1) if a.month == 12 else first.replace(month=a.month + 1)
        return first.isoformat(), (nxt - timedelta(days=1)).isoformat()
    if gran == "anio":
        return _date(a.year, 1, 1).isoformat(), _date(a.year, 12, 31).isoformat()
    return None, None  # todo


def _in_win(s, desde: Optional[str], hasta: Optional[str]) -> bool:
    if not s:
        return False
    d = str(s)[:10]
    if len(d) < 10:
        return False
    if desde and d < desde:
        return False
    if hasta and d > hasta:
        return False
    return True


@api.get("/analiticas/costos-kg")
async def costos_kg_filtrado(gran: str = "todo", anchor: Optional[str] = None, _: dict = Depends(get_current_user)):
    """Costos por kg para una ventana de tiempo (todo/semana/mes/anio). SOLO LECTURA.
    Salarios prorrateados por dias: salario_diario_total x dias de la ventana."""
    from datetime import date as _date
    desde, hasta = _costos_kg_window(gran, anchor)

    # COSTO DE VENTAS: fert/agro PEPS de aplicaciones confirmadas + mano de obra (actividades)
    fifo = await _compute_fifo_costs_per_aplicacion()
    fert_agro = 0.0
    for a in await db.aplicaciones.find({"estado": "confirmada"}).to_list(20000):
        if _in_win(a.get("fecha"), desde, hasta):
            fert_agro += float(fifo.get(a.get("_id"), {}).get("total_costo", 0) or 0)
    mano_obra = 0.0
    for act in await db.actividades.find({}).to_list(20000):
        if _in_win(act.get("fecha_actividad"), desde, hasta):
            mano_obra += float(act.get("costo_total") or 0)

    # GASTOS OPERATIVOS: gastos de vehiculo (filtrados) + salarios prorrateados
    gastos_vehiculo = 0.0
    for g in await db.gastos_vehiculos.find({}).to_list(20000):
        if _in_win(g.get("fecha"), desde, hasta):
            gastos_vehiculo += float(g.get("monto") or 0)

    # COSECHA: kg cosechados/descarte + donaciones en la ventana
    kg_cosechados = kg_descarte = 0.0
    min_fecha = None
    for c in await db.cosechas.find({}).to_list(20000):
        fc = str(c.get("fecha_cosecha") or "")[:10]
        if len(fc) == 10 and (min_fecha is None or fc < min_fecha):
            min_fecha = fc
        if not _in_win(c.get("fecha_cosecha"), desde, hasta):
            continue
        suma = (c.get("primera_calidad", 0) or 0) + (c.get("segunda_calidad", 0) or 0) + (c.get("tercera_calidad", 0) or 0) + (c.get("descarte", 0) or 0)
        mult = 1 if c.get("unidad") == "kg" else KG_POR_CESTA
        kg_cosechados += suma * mult
        kg_descarte += (c.get("descarte", 0) or 0) * mult
    kg_donaciones = 0.0
    for d in await db.ventas_donaciones.find({}).to_list(20000):
        if d.get("origen") in VENTA_SYSTEM_ORIGENES:
            continue
        if _in_win(d.get("fecha"), desde, hasta):
            kg_donaciones += float(d.get("cantidad_kg") or (d.get("cantidad_cestas", 0) or 0) * KG_POR_CESTA)
    # DESCARTE reasignado (fruta buena enviada al canal descarte; el automático ya va en kg_descarte)
    kg_descarte_reasignado = 0.0
    for d in await db.ventas_descarte.find({}).to_list(20000):
        if d.get("origen") == "asignacion_destino":
            continue
        if _in_win(d.get("fecha"), desde, hasta):
            kg_descarte_reasignado += float(d.get("cantidad_kg") or (d.get("cantidad_cestas", 0) or 0) * KG_POR_CESTA)
    # KG VENDIDOS reales (para la conciliación) + ingreso de ventas del período
    kg_vendidos = 0.0
    ingreso_ventas = 0.0
    for tipo in ("finca", "ciudad", "refrigerar", "congelar"):
        for v in await db[f"ventas_{tipo}"].find({}).to_list(20000):
            if v.get("origen") in VENTA_SYSTEM_ORIGENES:
                continue
            if _in_win(v.get("fecha"), desde, hasta):
                kg_vendidos += float(v.get("cantidad_kg") or (v.get("cantidad_cestas", 0) or 0) * KG_POR_CESTA)
                ingreso_ventas += float(v.get("total") or 0)
    kg_cosechados = round(kg_cosechados, 2)
    kg_descarte = round(kg_descarte, 2)
    kg_donaciones = round(kg_donaciones, 2)
    kg_descarte_reasignado = round(kg_descarte_reasignado, 2)
    kg_vendible = round(kg_cosechados - kg_descarte - kg_donaciones - kg_descarte_reasignado, 2)
    kg_vendidos = round(kg_vendidos, 2)
    kg_disponible = round(kg_vendible - kg_vendidos, 2)

    # SALARIOS prorrateados por dias de la ventana
    today = datetime.now(VE_TZ).date()
    if gran == "todo":
        try:
            ini = _date.fromisoformat(min_fecha) if min_fecha else today
        except Exception:
            ini = today
        dias = max((today - ini).days + 1, 0)
    else:
        d0 = _date.fromisoformat(desde)
        d1 = _date.fromisoformat(hasta)
        dias = (d1 - d0).days + 1
    salario_diario = sum(float(t.get("salario_diario") or 0) for t in await db.trabajadores.find({}).to_list(5000) if t.get("activo", True))
    salarios = round(salario_diario * dias, 2)

    total_costo = round(fert_agro + mano_obra, 2)
    total_gastos_op = round(salarios + gastos_vehiculo, 2)
    costo_con_op = total_costo + total_gastos_op

    return {
        "gran": gran,
        "desde": desde,
        "hasta": hasta,
        "dias": dias,
        "cosecha": {"kg_cosechados": kg_cosechados, "kg_descarte": kg_descarte, "kg_donaciones": kg_donaciones, "kg_descarte_reasignado": kg_descarte_reasignado, "kg_vendible": kg_vendible, "kg_vendidos": kg_vendidos, "kg_disponible": kg_disponible},
        "costo_ventas": round(total_costo, 2),
        "gastos_operativos": {"salarios": salarios, "gastos_vehiculo": round(gastos_vehiculo, 2), "total": total_gastos_op},
        "costo_por_kg": round(total_costo / kg_cosechados, 4) if kg_cosechados > 0 else 0,
        "costo_total_por_kg": round(costo_con_op / kg_cosechados, 4) if kg_cosechados > 0 else 0,
        "costo_real_vendible": round(total_costo / kg_vendible, 4) if kg_vendible > 0 else 0,
        "costo_total_real_vendible": round(costo_con_op / kg_vendible, 4) if kg_vendible > 0 else 0,
        "ingreso_ventas": round(ingreso_ventas, 2),
        "precio_promedio_kg": round(ingreso_ventas / kg_vendidos, 4) if kg_vendidos > 0 else 0,
        "ganancia_real_kg": round((ingreso_ventas / kg_vendidos if kg_vendidos > 0 else 0) - (costo_con_op / kg_vendible if kg_vendible > 0 else 0), 4),
    }


# ============================================================
# FICHA TÉCNICA DE PRODUCTOS (catálogo con 2 fotos por producto)
# ============================================================
FICHA_TIPOS = ["fertilizantes", "fungicidas", "plaguicida", "herbicidas", "tratamiento"]


class FichaTecnicaIn(BaseModel):
    nombre_producto: str
    tipo: str
    presentacion: Optional[str] = ""
    observaciones: Optional[str] = ""
    foto_frontal: Optional[str] = None   # storage path
    foto_trasera: Optional[str] = None   # storage path


def _ficha_out(doc: dict) -> dict:
    return {
        "_id": doc["_id"],
        "nombre_producto": doc.get("nombre_producto", ""),
        "tipo": doc.get("tipo", ""),
        "presentacion": doc.get("presentacion", ""),
        "observaciones": doc.get("observaciones", ""),
        "foto_frontal": doc.get("foto_frontal"),
        "foto_trasera": doc.get("foto_trasera"),
        "createdAt": doc.get("createdAt"),
        "updatedAt": doc.get("updatedAt"),
    }


@api.post("/fichas-tecnicas/upload")
async def upload_ficha_foto(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    ext = (file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else "bin")
    if ext not in MIME_TYPES:
        raise HTTPException(400, "Formato no soportado. Usá JPG, PNG o WEBP.")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(400, "La imagen supera el límite de 25 MB.")
    # Optimizar: redimensiona (máx 2000px) y recomprime a JPEG (b)
    opt_data, content_type, opt_ext = _optimize_image(data)
    if content_type == "application/octet-stream":
        # No se pudo optimizar -> usar original con su tipo real
        opt_data = data
        content_type = MIME_TYPES.get(ext, file.content_type or "application/octet-stream")
        opt_ext = ext
    path = f"{APP_NAME}/fichas/{user['_id']}/{uuid.uuid4()}.{opt_ext}"
    try:
        result = put_object(path, opt_data, content_type)
    except Exception as e:
        logging.error(f"Storage upload failed: {e}")
        raise HTTPException(502, "No se pudo subir la imagen. Intentá de nuevo.")
    await db.archivos.insert_one({
        "_id": new_id(),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(opt_data)),
        "is_deleted": False,
        "createdAt": now_iso(),
    })
    return {"path": result["path"]}


@api.get("/fichas-tecnicas/file/{path:path}")
async def get_ficha_foto(path: str, request: Request, auth: Optional[str] = Query(None)):
    # Permitir auth por header o por query param (para usar en <img src=...?auth=token>)
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token and auth:
        token = auth
    if not token:
        raise HTTPException(401, "No autenticado")
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Token inválido")
    record = await db.archivos.find_one({"storage_path": path, "is_deleted": False})
    if not record:
        raise HTTPException(404, "Archivo no encontrado")
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(404, "Archivo no disponible")
    return Response(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={"Cache-Control": "private, max-age=604800, immutable"},
    )


@api.get("/fichas-tecnicas")
async def list_fichas_tecnicas(tipo: Optional[str] = None, _: dict = Depends(get_current_user)):
    filt = {}
    if tipo and tipo in FICHA_TIPOS:
        filt["tipo"] = tipo
    docs = await db.fichas_tecnicas.find(filt).sort("nombre_producto", 1).to_list(2000)
    return {"fichas": [_ficha_out(d) for d in docs], "tipos": FICHA_TIPOS}


@api.post("/fichas-tecnicas")
async def create_ficha_tecnica(payload: FichaTecnicaIn, user: dict = Depends(get_current_user)):
    if payload.tipo not in FICHA_TIPOS:
        raise HTTPException(400, "Tipo inválido")
    doc = {
        "_id": new_id(),
        "nombre_producto": payload.nombre_producto.strip(),
        "tipo": payload.tipo,
        "presentacion": (payload.presentacion or "").strip(),
        "observaciones": (payload.observaciones or "").strip(),
        "foto_frontal": payload.foto_frontal,
        "foto_trasera": payload.foto_trasera,
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
        "usuario_email": user.get("email"),
    }
    await db.fichas_tecnicas.insert_one(doc)
    return _ficha_out(doc)


@api.put("/fichas-tecnicas/{fid}")
async def update_ficha_tecnica(fid: str, payload: FichaTecnicaIn, _: dict = Depends(get_current_user)):
    if payload.tipo not in FICHA_TIPOS:
        raise HTTPException(400, "Tipo inválido")
    existing = await db.fichas_tecnicas.find_one({"_id": fid})
    if not existing:
        raise HTTPException(404, "Ficha no encontrada")
    upd = {
        "nombre_producto": payload.nombre_producto.strip(),
        "tipo": payload.tipo,
        "presentacion": (payload.presentacion or "").strip(),
        "observaciones": (payload.observaciones or "").strip(),
        "foto_frontal": payload.foto_frontal,
        "foto_trasera": payload.foto_trasera,
        "updatedAt": now_iso(),
    }
    await db.fichas_tecnicas.update_one({"_id": fid}, {"$set": upd})
    return _ficha_out({**existing, **upd})


@api.delete("/fichas-tecnicas/{fid}")
async def delete_ficha_tecnica(fid: str, _: dict = Depends(get_current_user)):
    ficha = await db.fichas_tecnicas.find_one({"_id": fid})
    if not ficha:
        raise HTTPException(404, "Ficha no encontrada")
    # Soft-delete de los archivos asociados (storage no tiene delete API)
    for p in (ficha.get("foto_frontal"), ficha.get("foto_trasera")):
        if p:
            await db.archivos.update_one({"storage_path": p}, {"$set": {"is_deleted": True}})
    await db.fichas_tecnicas.delete_one({"_id": fid})
    return {"success": True}


# ============================================================
# CONTROL DE ASISTENCIA (módulo independiente: obreros + asistencia diaria)
# ============================================================
ASISTENCIA_ESTADOS = ["presente", "medio_dia"]


class ObreroIn(BaseModel):
    nombre: str
    cargo: Optional[str] = ""
    activo: Optional[bool] = True


class MarcarAsistenciaIn(BaseModel):
    obrero_id: str
    fecha: str  # YYYY-MM-DD
    estado: str


def _obrero_out(d: dict) -> dict:
    return {"_id": d["_id"], "nombre": d.get("nombre", ""), "cargo": d.get("cargo", ""), "activo": d.get("activo", True)}


@api.get("/asistencia/obreros")
async def list_obreros(_: dict = Depends(get_current_user)):
    docs = await db.asistencia_obreros.find({}).sort("nombre", 1).to_list(2000)
    return {"obreros": [_obrero_out(d) for d in docs], "estados": ASISTENCIA_ESTADOS}


@api.post("/asistencia/obreros")
async def create_obrero(payload: ObreroIn, _: dict = Depends(get_current_user)):
    if not payload.nombre.strip():
        raise HTTPException(400, "El nombre es obligatorio")
    doc = {"_id": new_id(), "nombre": payload.nombre.strip(), "cargo": (payload.cargo or "").strip(),
           "activo": payload.activo if payload.activo is not None else True, "createdAt": now_iso()}
    await db.asistencia_obreros.insert_one(doc)
    return _obrero_out(doc)


@api.put("/asistencia/obreros/{oid}")
async def update_obrero(oid: str, payload: ObreroIn, _: dict = Depends(get_current_user)):
    existing = await db.asistencia_obreros.find_one({"_id": oid})
    if not existing:
        raise HTTPException(404, "Obrero no encontrado")
    upd = {"nombre": payload.nombre.strip(), "cargo": (payload.cargo or "").strip(),
           "activo": payload.activo if payload.activo is not None else True, "updatedAt": now_iso()}
    await db.asistencia_obreros.update_one({"_id": oid}, {"$set": upd})
    return _obrero_out({**existing, **upd})


@api.delete("/asistencia/obreros/{oid}")
async def delete_obrero(oid: str, _: dict = Depends(get_current_user)):
    if not await db.asistencia_obreros.find_one({"_id": oid}):
        raise HTTPException(404, "Obrero no encontrado")
    await db.asistencia_obreros.delete_one({"_id": oid})
    await db.asistencia_registros.delete_many({"obrero_id": oid})
    return {"success": True}


@api.get("/asistencia/dia")
async def asistencia_dia(fecha: str, _: dict = Depends(get_current_user)):
    """Asistencia de todos los obreros activos para una fecha (YYYY-MM-DD)."""
    f = fecha[:10]
    obreros = await db.asistencia_obreros.find({"activo": True}).sort("nombre", 1).to_list(2000)
    regs = await db.asistencia_registros.find({"fecha": f}).to_list(5000)
    estado_map = {r["obrero_id"]: r.get("estado") for r in regs}
    filas = [{"obrero_id": o["_id"], "nombre": o.get("nombre", ""), "cargo": o.get("cargo", ""),
              "estado": estado_map.get(o["_id"])} for o in obreros]
    dia_doc = await db.asistencia_dias.find_one({"_id": f}) or {}
    return {"fecha": f, "filas": filas, "estados": ASISTENCIA_ESTADOS,
            "enviado": bool(dia_doc.get("enviado")), "enviado_por": dia_doc.get("enviado_por")}


def _puede_desbloquear(user: dict) -> bool:
    if user.get("rol") == "administrador":
        return True
    if "control_asistencia" not in (user.get("modulos_asignados") or []):
        return False
    p = (user.get("permisos_modulos") or {}).get("control_asistencia") or {}
    return p.get("eliminar") is not False


class DiaFechaIn(BaseModel):
    fecha: str


@api.post("/asistencia/enviar")
async def enviar_asistencia(payload: DiaFechaIn, user: dict = Depends(get_current_user)):
    """Bloquea la asistencia del día: ya no se puede modificar hasta reabrir."""
    f = payload.fecha[:10]
    await db.asistencia_dias.update_one(
        {"_id": f},
        {"$set": {"enviado": True, "enviado_at": now_iso(), "enviado_por": user.get("nombre") or user.get("email")}},
        upsert=True,
    )
    return {"success": True, "enviado": True}


@api.post("/asistencia/reabrir")
async def reabrir_asistencia(payload: DiaFechaIn, user: dict = Depends(get_current_user)):
    """Desbloquea la asistencia del día para editar. Requiere permiso (Eliminar en Usuarios)."""
    if not _puede_desbloquear(user):
        raise HTTPException(403, "No tenés permiso para editar una asistencia enviada")
    f = payload.fecha[:10]
    await db.asistencia_dias.update_one({"_id": f}, {"$set": {"enviado": False, "reabierto_at": now_iso()}}, upsert=True)
    return {"success": True, "enviado": False}


@api.post("/asistencia/marcar")
async def marcar_asistencia(payload: MarcarAsistenciaIn, _: dict = Depends(get_current_user)):
    fecha = payload.fecha[:10]
    if payload.estado not in ASISTENCIA_ESTADOS and payload.estado != "":
        raise HTTPException(400, "Estado inválido")
    dia_doc = await db.asistencia_dias.find_one({"_id": fecha}) or {}
    if dia_doc.get("enviado"):
        raise HTTPException(423, "La asistencia de este día fue enviada y está bloqueada. Usá 'Editar' para desbloquearla.")
    if not await db.asistencia_obreros.find_one({"_id": payload.obrero_id}):
        raise HTTPException(404, "Obrero no encontrado")
    if payload.estado == "":
        # Desmarcar
        await db.asistencia_registros.delete_one({"obrero_id": payload.obrero_id, "fecha": fecha})
        return {"success": True, "estado": None}
    await db.asistencia_registros.update_one(
        {"obrero_id": payload.obrero_id, "fecha": fecha},
        {"$set": {"estado": payload.estado, "updatedAt": now_iso()},
         "$setOnInsert": {"_id": new_id(), "obrero_id": payload.obrero_id, "fecha": fecha, "createdAt": now_iso()}},
        upsert=True,
    )
    return {"success": True, "estado": payload.estado}


@api.get("/asistencia/semana")
async def asistencia_semana(fecha: str, _: dict = Depends(get_current_user)):
    """Planilla semanal: 7 días (lunes a domingo) que contienen la fecha dada.
    Ordena los obreros de MAYOR a MENOR jornales trabajados (presente=1, medio_día=0.5)."""
    from datetime import date as _date
    try:
        d = _date.fromisoformat(str(fecha)[:10])
    except Exception:
        d = datetime.now(VE_TZ).date()
    lunes = d - timedelta(days=d.weekday())
    dias_semana = [(lunes + timedelta(days=i)).isoformat() for i in range(7)]
    set_dias = set(dias_semana)

    obreros = await db.asistencia_obreros.find({"activo": True}).to_list(2000)
    regs = await db.asistencia_registros.find({"fecha": {"$in": dias_semana}}).to_list(20000)
    reg_map: Dict[str, Dict[str, str]] = {}
    for r in regs:
        f = str(r.get("fecha"))[:10]
        if f in set_dias:
            reg_map.setdefault(r["obrero_id"], {})[f] = r.get("estado")

    # Configuración de pago de la semana (salario diario por defecto, tasa y salarios individuales)
    cfg = await db.asistencia_config.find_one({"_id": dias_semana[0]}) or {}
    salario_default = float(cfg.get("salario_default") or 0)
    tasa = float(cfg.get("tasa") or 0)
    salarios_ind = cfg.get("salarios") or {}

    filas = []
    for o in obreros:
        dias = reg_map.get(o["_id"], {})
        totales = {e: 0 for e in ASISTENCIA_ESTADOS}
        for est in dias.values():
            if est in totales:
                totales[est] += 1
        jornales = round(totales.get("presente", 0) * 1.0 + totales.get("medio_dia", 0) * 0.5, 1)
        dias_trabajados = totales.get("presente", 0) + totales.get("medio_dia", 0)
        es_individual = o["_id"] in salarios_ind
        salario = float(salarios_ind[o["_id"]]) if es_individual else salario_default
        bcv = round(jornales * salario, 2)
        bolivares = round(bcv * tasa, 2)
        filas.append({"obrero_id": o["_id"], "nombre": o.get("nombre", ""), "cargo": o.get("cargo", ""),
                      "dias": dias, "totales": totales, "jornales": jornales, "dias_trabajados": dias_trabajados,
                      "salario_diario": salario, "salario_individual": es_individual, "bcv": bcv, "bolivares": bolivares})
    filas.sort(key=lambda f: (-f["jornales"], -f["dias_trabajados"], f["nombre"].lower()))
    total_bcv = round(sum(f["bcv"] for f in filas), 2)
    total_bolivares = round(sum(f["bolivares"] for f in filas), 2)
    return {"desde": dias_semana[0], "hasta": dias_semana[6], "dias_semana": dias_semana,
            "filas": filas, "estados": ASISTENCIA_ESTADOS,
            "salario_default": salario_default, "tasa": tasa,
            "total_bcv": total_bcv, "total_bolivares": total_bolivares}


class SemanaConfigIn(BaseModel):
    desde: str  # lunes de la semana (YYYY-MM-DD)
    salario_default: Optional[float] = None
    tasa: Optional[float] = None


class SalarioIndividualIn(BaseModel):
    desde: str
    obrero_id: str
    salario: Optional[float] = None  # null => quitar override (vuelve al default)


@api.post("/asistencia/config")
async def set_semana_config(payload: SemanaConfigIn, _: dict = Depends(get_current_user)):
    upd = {}
    if payload.salario_default is not None:
        upd["salario_default"] = float(payload.salario_default)
    if payload.tasa is not None:
        upd["tasa"] = float(payload.tasa)
    if upd:
        await db.asistencia_config.update_one(
            {"_id": payload.desde[:10]},
            {"$set": upd, "$setOnInsert": {"salarios": {}}},
            upsert=True,
        )
    return {"success": True}


@api.post("/asistencia/config/salario")
async def set_salario_individual(payload: SalarioIndividualIn, _: dict = Depends(get_current_user)):
    desde = payload.desde[:10]
    if payload.salario is None:
        await db.asistencia_config.update_one({"_id": desde}, {"$unset": {f"salarios.{payload.obrero_id}": ""}})
    else:
        await db.asistencia_config.update_one(
            {"_id": desde},
            {"$set": {f"salarios.{payload.obrero_id}": float(payload.salario)},
             "$setOnInsert": {"salario_default": 0, "tasa": 0}},
            upsert=True,
        )
    return {"success": True}


@api.get("/asistencia/resumen-mensual")
async def asistencia_resumen_mensual(anio: int, mes: int, _: dict = Depends(get_current_user)):
    """Suma por obrero de jornales, BCV $ y Bolívares de todo el mes, usando la tasa y
    salario de CADA semana respectivamente (día por día). SOLO LECTURA."""
    import calendar as _cal
    from datetime import date as _date
    dias_mes = _cal.monthrange(anio, mes)[1]
    fechas = [f"{anio:04d}-{mes:02d}-{d:02d}" for d in range(1, dias_mes + 1)]
    set_fechas = set(fechas)

    regs = await db.asistencia_registros.find({"fecha": {"$in": fechas}}).to_list(50000)
    # Config por semana (lunes) que toca el mes
    lunes_set = set()
    for f in fechas:
        d = _date.fromisoformat(f)
        lunes_set.add((d - timedelta(days=d.weekday())).isoformat())
    cfgs = {}
    for lun in lunes_set:
        cfgs[lun] = await db.asistencia_config.find_one({"_id": lun}) or {}

    obreros = {o["_id"]: o for o in await db.asistencia_obreros.find({}).to_list(2000)}
    acc: Dict[str, dict] = {}
    for r in regs:
        f = str(r.get("fecha"))[:10]
        if f not in set_fechas:
            continue
        est = r.get("estado")
        jornal = 1.0 if est == "presente" else (0.5 if est == "medio_dia" else 0.0)
        if jornal == 0.0:
            continue
        oid = r["obrero_id"]
        d = _date.fromisoformat(f)
        lun = (d - timedelta(days=d.weekday())).isoformat()
        cfg = cfgs.get(lun, {})
        salario = float((cfg.get("salarios") or {}).get(oid, cfg.get("salario_default") or 0))
        tasa = float(cfg.get("tasa") or 0)
        a = acc.setdefault(oid, {"jornales": 0.0, "bcv": 0.0, "bolivares": 0.0})
        a["jornales"] += jornal
        a["bcv"] += jornal * salario
        a["bolivares"] += jornal * salario * tasa

    filas = []
    for oid, a in acc.items():
        o = obreros.get(oid, {})
        filas.append({"obrero_id": oid, "nombre": o.get("nombre", "(eliminado)"), "cargo": o.get("cargo", ""),
                      "jornales": round(a["jornales"], 1), "bcv": round(a["bcv"], 2), "bolivares": round(a["bolivares"], 2)})
    filas.sort(key=lambda x: (-x["jornales"], -x["bolivares"], x["nombre"].lower()))
    return {"anio": anio, "mes": mes, "filas": filas,
            "total_jornales": round(sum(f["jornales"] for f in filas), 1),
            "total_bcv": round(sum(f["bcv"] for f in filas), 2),
            "total_bolivares": round(sum(f["bolivares"] for f in filas), 2)}








# ============================================================
# SEED
# ============================================================
@app.on_event("startup")
async def on_start():
    try:
        init_storage()
        logging.info("Object storage initialized")
    except Exception as e:
        logging.error(f"Storage init failed (se reintentará al usar): {e}")
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@erp.com").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    await db.users.create_index("email", unique=True)

    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "_id": new_id(),
            "nombre_completo": "Administrador",
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "salario": 0,
            "rol": "administrador",
            "modulos_asignados": MODULOS_DISPONIBLES,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        })
        logging.info(f"Admin seeded: {admin_email}")
    elif not verify_password(admin_password, existing.get("password_hash", "")):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password), "updatedAt": now_iso()}},
        )
        logging.info("Admin password updated from env")


# Mount
app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)


@app.on_event("shutdown")
async def shutdown():
    client.close()
