"""Agente de ventas IA por WhatsApp (MÓDULO PILOTO - AISLADO).

Reglas de diseño (según requerimiento del usuario):
- El agente SOLO LEE los datos del ERP para conversar y recomendar.
- NUNCA escribe en las colecciones existentes (ventas_*, inventario, etc.) por su cuenta.
- Cuando arma un pedido, lo deja en `wa_pedidos_borrador` (cola de aprobación).
- La venta real SOLO se crea cuando el usuario pulsa "Autorizar" en el panel.
- Todas las colecciones nuevas llevan prefijo `wa_` para no tocar la estructura existente.
"""
import os
import re
import json
import hmac
import uuid
import hashlib
import logging
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Request, Response, HTTPException, Query
from pydantic import BaseModel

from emergentintegrations.llm.chat import LlmChat, UserMessage

log = logging.getLogger("whatsapp_agent")

# ---- Config desde entorno ----
GRAPH_VERSION = os.environ.get("WA_GRAPH_VERSION", "v23.0")
PHONE_NUMBER_ID = os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "")
ACCESS_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
APP_SECRET = os.environ.get("META_APP_SECRET", "")
VERIFY_TOKEN = os.environ.get("WHATSAPP_VERIFY_TOKEN", "")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
AGENT_MODEL = os.environ.get("WA_AGENT_MODEL", "claude-sonnet-5-5")

RECIBIDO_ORIGINS = ("asignacion_destino", "ajuste_entrada")

BASE_PROMPT = (
    "Eres un asistente de ventas por WhatsApp de una finca que vende FRESAS frescas en Venezuela. "
    "Hablas en español venezolano, cordial, claro y breve (mensajes cortos, estilo chat). "
    "Tu trabajo es: saludar, ayudar al cliente a hacer su pedido de fresas, recomendar según el catálogo y precios de referencia, "
    "responder dudas y, cuando el cliente CONFIRME el pedido completo, cerrar la orden.\n\n"
    "Para cerrar un pedido necesitas como mínimo: cantidad de cestas, precio por cesta y la dirección de entrega. "
    "Pregunta lo que falte, de a una cosa a la vez. No inventes precios: usa el precio de referencia del contexto; "
    "si no hay, pregunta al cliente o confirma el precio acordado.\n\n"
    "IMPORTANTE: cuando el cliente confirme explícitamente el pedido completo, agrega AL FINAL de tu mensaje un bloque "
    "exactamente con este formato (el cliente NO debe verlo, es para el sistema):\n"
    "[[PEDIDO]]{\"producto\":\"Fresa\",\"cantidad_cestas\":<numero>,\"cantidad_kg\":0,\"precio_unitario\":<numero>,\"total\":<numero>,\"direccion\":\"<texto>\",\"notas\":\"<texto opcional>\"}[[/PEDIDO]]\n"
    "Solo agrega el bloque cuando el pedido esté realmente confirmado y completo. Si aún falta info, NO lo agregues.\n\n"
    "DEUDAS/SALDO: si el cliente pregunta por su deuda o cuánto debe, respóndele usando EXACTAMENTE el dato 'DEUDA PENDIENTE' del contexto "
    "(monto total, cuántas ventas y desde qué fechas). Si el contexto dice que no tiene deuda, avísale que está al día. "
    "Si no reconoces al cliente por su número, pídele amablemente el nombre con el que registró su compra para poder revisar. "
    "NUNCA inventes montos ni fechas de deuda; usa solo lo que aparece en el contexto.\n\n"
    "LÍMITES ESTRICTOS: tu única acción es TOMAR PEDIDOS. NO puedes registrar pagos ni abonos, NO descuentas inventario, "
    "NO modificas, editas ni eliminas nada en el sistema; solo consultas información para informar. Si el cliente quiere "
    "pagar una deuda o abonar, dile con amabilidad que el encargado coordinará el pago (tú no procesas pagos). "
    "Si piden algo fuera de tomar pedidos o dar información, ofréceles que el encargado los atenderá."
)

PEDIDO_RE = re.compile(r"\[\[PEDIDO\]\](.*?)\[\[/PEDIDO\]\]", re.DOTALL)


def _now():
    return datetime.now(timezone.utc).isoformat()


def _nid():
    return str(uuid.uuid4())


def _solo_digitos(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _clean(d):
    """Garantiza que los documentos devueltos sean JSON-safe (sin ObjectId)."""
    if d is None:
        return None
    d = dict(d)
    if "_id" in d:
        d["_id"] = str(d["_id"])
    return d


def wa_configured() -> bool:
    return bool(PHONE_NUMBER_ID and ACCESS_TOKEN)


async def _enviar_whatsapp(to: str, body: str) -> dict:
    """Envía un mensaje de texto por la Cloud API. Devuelve dict con resultado o error."""
    if not wa_configured():
        return {"enviado": False, "motivo": "credenciales_incompletas"}
    url = f"https://graph.facebook.com/{GRAPH_VERSION}/{PHONE_NUMBER_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": _solo_digitos(to),
        "type": "text",
        "text": {"preview_url": False, "body": body[:4096]},
    }
    try:
        async with httpx.AsyncClient(timeout=20) as cli:
            r = await cli.post(url, headers={"Authorization": f"Bearer {ACCESS_TOKEN}"}, json=payload)
        if r.is_error:
            log.warning("WA send error %s", r.status_code)
            return {"enviado": False, "status": r.status_code, "error": (r.json() if r.content else r.text)}
        return {"enviado": True, "whatsapp": r.json()}
    except Exception as e:  # noqa
        log.exception("WA send exception")
        return {"enviado": False, "error": str(e)}


def build_wa_router(db, get_current_user):
    wa = APIRouter(prefix="/api/whatsapp")

    # ---------- Contexto de negocio (SOLO LECTURA) ----------
    async def _contexto_negocio(telefono: str, nombre: str = None) -> str:
        partes = []
        tel_norm = _solo_digitos(telefono)[-10:]
        nom_norm = (nombre or "").strip().lower()
        # Precio de referencia por cesta (promedio de ventas reales a ciudad)
        try:
            docs = await db["ventas_ciudad"].find({}).to_list(5000)
            precios = [d.get("precio_unitario", 0) for d in docs
                       if (d.get("precio_unitario") or 0) > 0 and d.get("origen") not in
                       ("asignacion_destino", "ajuste_entrada", "ajuste_salida", "reasignacion_salida", "salida_error")]
            if precios:
                prom = round(sum(precios) / len(precios), 2)
                partes.append(f"Precio de referencia por cesta (envío a ciudad): ${prom}")
        except Exception:
            pass
        # Disponible en canal ciudad
        try:
            docs = await db["ventas_ciudad"].find({}).to_list(50000)
            recibido = sum((d.get("cantidad_cestas", 0) or 0) for d in docs if d.get("origen") in RECIBIDO_ORIGINS)
            usado = sum((d.get("cantidad_cestas", 0) or 0) for d in docs if d.get("origen") not in RECIBIDO_ORIGINS)
            disp = round(recibido - usado, 2)
            partes.append(f"Cestas disponibles ahora para envío a ciudad: {max(disp, 0)}")
        except Exception:
            pass
        # Cliente conocido + DEUDA pendiente (por teléfono) — SOLO LECTURA
        try:
            from datetime import datetime as _dt
            hoy = datetime.now(timezone.utc)
            nombre_cli = None
            pendientes = []
            for coll in ("ventas_finca", "ventas_ciudad", "ventas_refrigerar", "ventas_congelar"):
                async for d in db[coll].find({}):
                    tel_ok = tel_norm and _solo_digitos(d.get("telefono", ""))[-10:] == tel_norm
                    cli = (d.get("cliente") or "").strip()
                    nom_ok = nom_norm and cli.lower() == nom_norm
                    if not (tel_ok or nom_ok):
                        continue
                    nombre_cli = cli or nombre_cli
                    total = d.get("total", 0) or 0
                    abono = d.get("abono_inicial", 0) or 0
                    saldo = total - abono
                    if saldo > 0.001:
                        try:
                            f = _dt.fromisoformat((d.get("fecha") or "").replace("Z", "+00:00"))
                            dias = max(0, (hoy - f).days)
                        except Exception:
                            dias = 0
                        pendientes.append({"fecha": d.get("fecha", ""), "saldo": round(saldo, 2), "dias": dias})
            if nombre_cli:
                partes.append(f"Cliente conocido: {nombre_cli} (ya ha comprado antes).")
            if pendientes:
                pendientes.sort(key=lambda x: x["fecha"])
                total_deuda = round(sum(p["saldo"] for p in pendientes), 2)
                detalle = "; ".join(f"${p['saldo']} del {p['fecha']} ({p['dias']} días)" for p in pendientes)
                partes.append(f"DEUDA PENDIENTE del cliente: ${total_deuda} en {len(pendientes)} venta(s) [{detalle}].")
            elif nombre_cli:
                partes.append("El cliente NO tiene deuda pendiente (saldo en $0).")
        except Exception:
            pass
        return "\n".join(partes) if partes else "Sin datos de referencia adicionales."

    async def _historial(telefono: str, limite: int = 20) -> str:
        msgs = await db["wa_mensajes"].find({"telefono": telefono}).sort("ts", -1).to_list(limite)
        msgs = list(reversed(msgs))
        lineas = []
        for m in msgs:
            quien = "Cliente" if m.get("direction") == "inbound" else "Agente"
            lineas.append(f"{quien}: {m.get('text', '')}")
        return "\n".join(lineas)

    async def _guardar_msg(telefono, direction, text, wamid=None, nombre=None):
        await db["wa_mensajes"].insert_one({
            "_id": _nid(), "telefono": telefono, "direction": direction,
            "text": text, "wamid": wamid, "ts": _now(),
        })
        await db["wa_conversaciones"].update_one(
            {"_id": telefono},
            {"$set": {"telefono": telefono, "ultimo_mensaje": text[:120],
                      "ultima_direccion": direction, "updated_at": _now()},
             "$setOnInsert": {"created_at": _now()},
             **({"$set": {"nombre": nombre}} if False else {})},
            upsert=True,
        )
        if nombre:
            await db["wa_conversaciones"].update_one({"_id": telefono}, {"$set": {"nombre": nombre}})

    async def _procesar(telefono: str, text: str, nombre: str = None, wamid: str = None, enviar: bool = False):
        """Núcleo del agente: recibe un mensaje del cliente, responde y (si procede) crea pedido borrador."""
        await _guardar_msg(telefono, "inbound", text, wamid=wamid, nombre=nombre)

        contexto = await _contexto_negocio(telefono, nombre)
        historial = await _historial(telefono)
        system = (
            BASE_PROMPT
            + "\n\n--- CONTEXTO DE NEGOCIO (solo lectura) ---\n" + contexto
            + ("\n\n--- HISTORIAL DE LA CONVERSACIÓN ---\n" + historial if historial else "")
        )

        reply = "Disculpa, estoy teniendo un problema para responder en este momento. ¿Puedes reintentar en unos minutos?"
        try:
            chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"wa-{telefono}", system_message=system)
            chat.with_model("anthropic", AGENT_MODEL)
            resp = await chat.send_message(UserMessage(text=text))
            reply = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
        except Exception:
            log.exception("LLM error")

        # Extraer bloque de pedido si existe
        pedido = None
        m = PEDIDO_RE.search(reply or "")
        if m:
            try:
                pedido = json.loads(m.group(1).strip())
            except Exception:
                pedido = None
            reply = PEDIDO_RE.sub("", reply).strip()

        pedido_id = None
        if pedido:
            pedido_id = _nid()
            nombre_final = nombre
            if not nombre_final:
                conv = await db["wa_conversaciones"].find_one({"_id": telefono})
                nombre_final = (conv or {}).get("nombre", "")
            await db["wa_pedidos_borrador"].insert_one({
                "_id": pedido_id, "telefono": telefono, "nombre": nombre_final or "",
                "producto": pedido.get("producto", "Fresa"),
                "cantidad_cestas": float(pedido.get("cantidad_cestas", 0) or 0),
                "cantidad_kg": float(pedido.get("cantidad_kg", 0) or 0),
                "precio_unitario": float(pedido.get("precio_unitario", 0) or 0),
                "total": float(pedido.get("total", 0) or 0),
                "direccion": pedido.get("direccion", ""),
                "notas": pedido.get("notas", ""),
                "estado": "pendiente", "venta_id": None, "canal": "ciudad",
                "created_at": _now(), "updated_at": _now(),
            })

        await _guardar_msg(telefono, "outbound", reply, nombre=nombre)

        if enviar and reply:
            await _enviar_whatsapp(telefono, reply)

        return {"reply": reply, "pedido_id": pedido_id, "pedido": pedido}

    # ====================== WEBHOOK (público, lo llama Meta) ======================
    @wa.get("/webhook")
    async def verificar_webhook(
        mode: str = Query(None, alias="hub.mode"),
        challenge: str = Query(None, alias="hub.challenge"),
        verify_token: str = Query(None, alias="hub.verify_token"),
    ):
        if mode == "subscribe" and VERIFY_TOKEN and hmac.compare_digest(verify_token or "", VERIFY_TOKEN) and challenge is not None:
            return Response(content=challenge, media_type="text/plain")
        raise HTTPException(403, "Verificación fallida")

    @wa.post("/webhook")
    async def recibir_webhook(request: Request):
        raw = await request.body()
        # Validar firma solo si hay APP_SECRET configurado
        if APP_SECRET:
            sig = request.headers.get("X-Hub-Signature-256", "")
            esperado = "sha256=" + hmac.new(APP_SECRET.encode(), raw, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(sig, esperado):
                raise HTTPException(401, "Firma inválida")
        try:
            payload = json.loads(raw)
        except Exception:
            raise HTTPException(400, "JSON inválido")

        if payload.get("object") != "whatsapp_business_account":
            return {"ok": True}

        # ¿Agente activo?
        cfg = await db["wa_config"].find_one({"_id": "config"}) or {}
        activo = cfg.get("activo", True)

        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                contactos = {c.get("wa_id"): c.get("profile", {}).get("name") for c in value.get("contacts", [])}
                for msg in value.get("messages", []):
                    if msg.get("type") != "text":
                        continue
                    wamid = msg.get("id")
                    # Idempotencia: ignorar reintentos del mismo mensaje
                    if wamid and await db["wa_mensajes"].find_one({"wamid": wamid}):
                        continue
                    telefono = msg.get("from")
                    text = msg.get("text", {}).get("body", "")
                    nombre = contactos.get(telefono)
                    if activo:
                        await _procesar(telefono, text, nombre=nombre, wamid=wamid, enviar=True)
                    else:
                        await _guardar_msg(telefono, "inbound", text, wamid=wamid, nombre=nombre)
        return {"ok": True}

    # ====================== PANEL (autenticado) ======================
    @wa.get("/estado")
    async def estado(_: dict = Depends(get_current_user)):
        cfg = await db["wa_config"].find_one({"_id": "config"}) or {}
        return {
            "configurado": wa_configured(),
            "firma_configurada": bool(APP_SECRET),
            "verify_token": VERIFY_TOKEN,
            "phone_number_id": PHONE_NUMBER_ID,
            "modelo": AGENT_MODEL,
            "activo": cfg.get("activo", True),
            "vendedor_nombre": cfg.get("vendedor_nombre", "Agente WhatsApp"),
        }

    class ConfigIn(BaseModel):
        activo: bool = True
        vendedor_nombre: str = "Agente WhatsApp"

    @wa.put("/config")
    async def set_config(body: ConfigIn, _: dict = Depends(get_current_user)):
        await db["wa_config"].update_one(
            {"_id": "config"},
            {"$set": {"activo": body.activo, "vendedor_nombre": body.vendedor_nombre, "updated_at": _now()}},
            upsert=True,
        )
        return {"ok": True}

    @wa.get("/conversaciones")
    async def conversaciones(_: dict = Depends(get_current_user)):
        docs = await db["wa_conversaciones"].find({}).sort("updated_at", -1).to_list(500)
        return {"conversaciones": [_clean(x) for x in docs]}

    @wa.get("/conversaciones/{telefono}/mensajes")
    async def mensajes(telefono: str, _: dict = Depends(get_current_user)):
        docs = await db["wa_mensajes"].find({"telefono": telefono}).sort("ts", 1).to_list(1000)
        return {"mensajes": [_clean(x) for x in docs]}

    class SimularIn(BaseModel):
        telefono: str
        text: str
        nombre: str = ""

    @wa.post("/simular")
    async def simular(body: SimularIn, _: dict = Depends(get_current_user)):
        """Simula un mensaje entrante del cliente para PROBAR el agente sin enviar WhatsApp real."""
        tel = _solo_digitos(body.telefono)
        if not tel:
            raise HTTPException(400, "Teléfono inválido")
        res = await _procesar(tel, body.text, nombre=body.nombre or None, enviar=False)
        return res

    @wa.get("/pedidos")
    async def pedidos(estado: str = "pendiente", _: dict = Depends(get_current_user)):
        filt = {} if estado == "todos" else {"estado": estado}
        docs = await db["wa_pedidos_borrador"].find(filt).sort("created_at", -1).to_list(500)
        return {"pedidos": [_clean(x) for x in docs]}

    @wa.post("/pedidos/{pid}/autorizar")
    async def autorizar(pid: str, user: dict = Depends(get_current_user)):
        """Aprueba el pedido SIN escribir en ningún otro módulo.
        El agente solo toma pedidos: NO descuenta inventario ni crea ventas.
        El pedido aprobado queda registrado únicamente en el módulo de WhatsApp."""
        p = await db["wa_pedidos_borrador"].find_one({"_id": pid})
        if not p:
            raise HTTPException(404, "Pedido no encontrado")
        if p.get("estado") == "aprobado":
            raise HTTPException(400, "Este pedido ya fue aprobado")
        await db["wa_pedidos_borrador"].update_one(
            {"_id": pid},
            {"$set": {"estado": "aprobado", "aprobado_por": user.get("email"),
                      "aprobado_at": _now(), "updated_at": _now()}},
        )
        return {"ok": True}

    @wa.post("/pedidos/{pid}/rechazar")
    async def rechazar(pid: str, _: dict = Depends(get_current_user)):
        res = await db["wa_pedidos_borrador"].update_one(
            {"_id": pid}, {"$set": {"estado": "rechazado", "updated_at": _now()}}
        )
        if res.matched_count == 0:
            raise HTTPException(404, "Pedido no encontrado")
        return {"ok": True}

    # ---------- Repartidores (listo para Fase 2) ----------
    class RepartidorIn(BaseModel):
        nombre: str
        telefono: str
        zona: str = ""
        activo: bool = True

    @wa.get("/repartidores")
    async def list_rep(_: dict = Depends(get_current_user)):
        docs = await db["wa_repartidores"].find({}).sort("nombre", 1).to_list(500)
        return {"repartidores": [_clean(x) for x in docs]}

    @wa.post("/repartidores")
    async def crear_rep(body: RepartidorIn, _: dict = Depends(get_current_user)):
        doc = body.model_dump()
        doc["_id"] = _nid()
        doc["telefono"] = _solo_digitos(doc["telefono"])
        doc["created_at"] = _now()
        await db["wa_repartidores"].insert_one(doc)
        return doc

    @wa.put("/repartidores/{rid}")
    async def upd_rep(rid: str, body: RepartidorIn, _: dict = Depends(get_current_user)):
        data = body.model_dump()
        data["telefono"] = _solo_digitos(data["telefono"])
        res = await db["wa_repartidores"].update_one({"_id": rid}, {"$set": data})
        if res.matched_count == 0:
            raise HTTPException(404, "No encontrado")
        return _clean(await db["wa_repartidores"].find_one({"_id": rid}))

    @wa.delete("/repartidores/{rid}")
    async def del_rep(rid: str, _: dict = Depends(get_current_user)):
        res = await db["wa_repartidores"].delete_one({"_id": rid})
        return {"ok": res.deleted_count > 0}

    return wa
