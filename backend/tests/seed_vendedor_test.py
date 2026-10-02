"""Seed/cleanup two sales for QA_Vendedor on today for the Estadisticas de vendedor module test."""
import asyncio, os, sys, uuid
from datetime import date
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv('/app/backend/.env')
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

VENDEDOR = "QA_Vendedor"
HOY = date.today().isoformat()

async def seed():
    docs = []
    for cestas, precio in [(5, 10), (7, 10)]:  # totals: 50 and 70
        docs.append({
            "_id": str(uuid.uuid4()),
            "fecha": HOY,
            "cantidad_cestas": cestas,
            "cantidad_kg": cestas * 14,
            "precio_unitario": precio,
            "total": cestas * precio,
            "unidad_venta": "cestas",
            "cliente": "QA_Cliente",
            "telefono": "",
            "vendedor": VENDEDOR,
            "abono_inicial": 0,
            "observaciones": "QA_SEED",
            "origen": "asignacion_destino",  # mark as RECIBIDO so does not break saldo check
            "asignacion_id": "",
        })
    # Insert directly, bypassing stock check; use venta directly as if real sale (NOT origen RECIBIDO)
    # Actually we need vendedor-visible as a venta real. The endpoint groups ALL ventas by vendedor,
    # so having origen=asignacion_destino may still work (it just means it adds to disponible).
    # Simplest: insert with empty origen (treated as real sale).
    for d in docs:
        d["origen"] = ""
    await db.ventas_finca.insert_many(docs)
    print(f"Seeded {len(docs)} ventas for {VENDEDOR} on {HOY}")

async def cleanup():
    r = await db.ventas_finca.delete_many({"vendedor": VENDEDOR})
    r2 = await db.comisiones_vendedor.delete_many({"vendedor": {"$regex": f"^{VENDEDOR}$", "$options": "i"}})
    print(f"Deleted {r.deleted_count} ventas, {r2.deleted_count} comisiones")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "seed"
    asyncio.run(cleanup() if cmd == "cleanup" else seed())
