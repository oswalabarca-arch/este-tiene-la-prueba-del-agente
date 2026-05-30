"""ERP Agrícola - FastAPI backend
Modelado a partir de los endpoints y datos del proyecto original
"""
from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import uuid
import bcrypt
import jwt
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any, Dict

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, Query
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
    "usuarios", "plantaciones", "equipos", "actividades", "aplicaciones",
    "cosecha", "ventas", "frio", "inventario", "compras", "analiticas",
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
    cultivo: str = ""
    variedad: str = ""
    inventario_plantas: float = 0
    cobertura: str = ""
    sistema_riego: str = ""
    tipo_plantacion: str = "CONVENCIONAL"
    distancia_plantas: float = 0
    distancia_filas: float = 0
    codigo_externo: str = ""
    foto_principal: str = ""
    foto_secundaria: str = ""
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


# ============================================================
# COSECHAS
# ============================================================
class CosechaIn(BaseModel):
    tipo_fruta_id: str
    variedad_id: str
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
    return await _create("cosechas", payload.model_dump(), user)


@api.put("/cosechas/{cid}")
async def update_cosecha(cid: str, payload: CosechaIn, _: dict = Depends(get_current_user)):
    return await _update("cosechas", cid, payload.model_dump())


@api.delete("/cosechas/{cid}")
async def delete_cosecha(cid: str, _: dict = Depends(get_current_user)):
    return await _delete("cosechas", cid)


# ============================================================
# ASIGNACIONES DE DESTINO
# Destinos posibles: venta_finca, enviar_ciudad, descarte, frio
# Recibe cantidad desde cosecha (cestas → 14kg/cesta por convención del original)
# ============================================================
KG_POR_CESTA = 14


class AsignacionIn(BaseModel):
    destino: str  # venta_finca | enviar_ciudad | descarte | frio
    unidad_ingreso: str = "cestas"  # cestas | kg
    cantidad_ingresada: float
    fecha: str
    observaciones: str = ""


@api.get("/asignaciones-destino")
async def list_asignaciones(fecha: Optional[str] = None, _: dict = Depends(get_current_user)):
    filt = {}
    if fecha:
        # Acepta fecha YYYY-MM-DD: match por prefijo
        filt["fecha"] = {"$regex": f"^{fecha}"}
    return await _list("asignaciones_destino", "asignaciones", filt, sort_field="fecha")


@api.post("/asignaciones-destino")
async def create_asignacion(payload: AsignacionIn, user: dict = Depends(get_current_user)):
    data = payload.model_dump()
    if data["unidad_ingreso"] == "cestas":
        data["cantidad_cestas"] = data["cantidad_ingresada"]
        data["cantidad_kg"] = round(data["cantidad_ingresada"] * KG_POR_CESTA, 2)
    else:
        data["cantidad_kg"] = data["cantidad_ingresada"]
        data["cantidad_cestas"] = round(data["cantidad_ingresada"] / KG_POR_CESTA, 2)
    return await _create("asignaciones_destino", data, user)


@api.delete("/asignaciones-destino/{aid}")
async def delete_asignacion(aid: str, _: dict = Depends(get_current_user)):
    return await _delete("asignaciones_destino", aid)


# ============================================================
# COMPRAS + INVENTARIO derivado
# ============================================================
CATEGORIAS_INSUMOS = ["fertilizantes", "plaguicidas", "fungicidas", "herbicidas", "tratamiento", "semillas", "otros"]


class CompraIn(BaseModel):
    categoria: str
    nombre_producto: str
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
    return await _list("compras", "compras", sort_field="fecha_compra")


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
        }},
    ]
    compras_agg = await db.compras.aggregate(pipeline_compras).to_list(5000)

    # Consumos en aplicaciones (subarray insumos: nombre, cantidad, unidad)
    pipeline_aplicaciones = [
        {"$unwind": {"path": "$insumos", "preserveNullAndEmptyArrays": False}},
        {"$group": {
            "_id": {"nombre_producto": "$insumos.nombre_producto", "unidad": "$insumos.unidad"},
            "total_enviado": {"$sum": "$insumos.cantidad"},
        }},
    ]
    apl_agg = await db.aplicaciones.aggregate(pipeline_aplicaciones).to_list(5000)
    enviado_map = {(a["_id"].get("nombre_producto"), a["_id"].get("unidad")): a["total_enviado"] for a in apl_agg}

    inventario = []
    for c in compras_agg:
        nombre = c["_id"]["nombre_producto"]
        unidad = c["_id"]["unidad"]
        comprado = c["total_comprado"]
        enviado = enviado_map.get((nombre, unidad), 0)
        disponible = comprado - enviado
        inventario.append({
            "categoria": c["_id"]["categoria"],
            "nombre_producto": nombre,
            "unidad": unidad,
            "total_comprado": comprado,
            "total_enviado": enviado,
            "total_disponible": disponible,
            "existencia": disponible > 0,
        })
    return {"inventario": inventario}


# ============================================================
# EQUIPOS
# ============================================================
class EquipoIn(BaseModel):
    nombre: str
    categoria: str = "herramienta"  # vehiculo | herramienta | maquinaria
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
    costo_adquisicion: float = 0
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
# APLICACIONES + RECETAS
# Una aplicación: lista de insumos consumidos del inventario, aplicado en un lote
# Una receta: plantilla reutilizable de insumos
# ============================================================
class InsumoItem(BaseModel):
    nombre_producto: str
    cantidad: float
    unidad: str
    categoria: Optional[str] = ""


class AplicacionIn(BaseModel):
    tipo: str = "fertilizacion"  # fertilizacion | fungicida | plaguicida | herbicida | tratamiento
    lote: str
    fecha: str
    estado: str = "pendiente"  # pendiente | confirmada
    insumos: List[InsumoItem] = []
    observaciones: str = ""
    receta_id: Optional[str] = None


@api.get("/aplicaciones")
async def list_aplicaciones(_: dict = Depends(get_current_user)):
    return await _list("aplicaciones", "aplicaciones", sort_field="fecha")


@api.post("/aplicaciones")
async def create_aplicacion(payload: AplicacionIn, user: dict = Depends(get_current_user)):
    data = payload.model_dump()
    return await _create("aplicaciones", data, user)


@api.put("/aplicaciones/{aid}")
async def update_aplicacion(aid: str, payload: AplicacionIn, _: dict = Depends(get_current_user)):
    return await _update("aplicaciones", aid, payload.model_dump())


@api.delete("/aplicaciones/{aid}")
async def delete_aplicacion(aid: str, _: dict = Depends(get_current_user)):
    return await _delete("aplicaciones", aid)


class RecetaIn(BaseModel):
    nombre: str
    descripcion: str = ""
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
    cantidad_trabajadores: int = 0
    horas_trabajo: float = 0
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


@api.post("/actividades")
async def create_actividad(payload: ActividadIn, user: dict = Depends(get_current_user)):
    data = payload.model_dump()
    data["horas_hombre"] = (data.get("cantidad_trabajadores") or 0) * (data.get("horas_trabajo") or 0)
    data["registrado_por"] = user.get("email")
    return await _create("actividades", data, user)


@api.put("/actividades/{aid}")
async def update_actividad(aid: str, payload: ActividadIn, _: dict = Depends(get_current_user)):
    data = payload.model_dump()
    data["horas_hombre"] = (data.get("cantidad_trabajadores") or 0) * (data.get("horas_trabajo") or 0)
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
    cliente: str = ""
    observaciones: str = ""


def _ventas_router(tipo: str):
    @api.get(f"/ventas-{tipo}")
    async def _list_v(_: dict = Depends(get_current_user)):
        docs = await db[f"ventas_{tipo}"].find({}).sort("fecha", -1).to_list(2000)
        return {"ventas": docs}

    @api.post(f"/ventas-{tipo}")
    async def _create_v(payload: VentaIn, user: dict = Depends(get_current_user)):
        return await _create(f"ventas_{tipo}", payload.model_dump(), user)

    @api.delete(f"/ventas-{tipo}/{{vid}}")
    async def _delete_v(vid: str, _: dict = Depends(get_current_user)):
        return await _delete(f"ventas_{tipo}", vid)

_ventas_router("finca")
_ventas_router("ciudad")
_ventas_router("refrigerar")
_ventas_router("descarte")
_ventas_router("donaciones")


# ============================================================
# FRIO - cámara fría con cestas almacenadas
# ============================================================
class FrioIn(BaseModel):
    fecha_ingreso: str
    cantidad_cestas: float
    lote: str = ""
    variedad: str = ""
    observaciones: str = ""


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
    return {
        "total_kg_cosechado": round(total_kg, 2),
        "total_primera_calidad_kg": round(total_primera, 2),
        "total_descarte_kg": round(total_descarte, 2),
        "n_usuarios": n_users,
        "n_plantaciones": n_plant,
        "n_aplicaciones": n_aplic,
        "n_actividades": n_act,
    }


# ============================================================
# SEED
# ============================================================
@app.on_event("startup")
async def on_start():
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
