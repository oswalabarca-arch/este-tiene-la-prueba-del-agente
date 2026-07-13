import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { TrendingUp, DollarSign, Package } from "lucide-react";

const fmtMoney = (n) => {
  const [ent, dec] = Number(n || 0).toFixed(2).split(".");
  return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
};
const fmtNum = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Convierte a kilo/litro: cada 1000 unidades (gramos/cc/ml) = 1 kg / 1 L.
function toKgLt(total, unidad) {
  const u = (unidad || "").trim().toLowerCase();
  if (["cc", "ml", "mililitro", "mililitros"].includes(u)) return { total: total / 1000, unidad: "L" };
  if (["lt", "l", "litro", "litros", "lts"].includes(u)) return { total, unidad: "L" };
  if (["kg", "kilo", "kilos", "kilogramo", "kilogramos", "kgs"].includes(u)) return { total, unidad: "kg" };
  // gramos y cualquier otra unidad "por unidad" se tratan como 1000 = 1 kg
  return { total: total / 1000, unidad: "kg" };
}

const MEDALS = ["#f59e0b", "#94a3b8", "#b45309", "#64748b", "#64748b"];

function Ranking({ items, testid, color, bg, valueFmt, unitOf }) {
  const max = Math.max(...items.map((i) => i.total || 0), 1);
  return (
    <div style={{ flex: "1 1 320px", minWidth: 280 }} data-testid={testid}>
      {items.length === 0 ? (
        <div style={{ color: "#94a3b8", fontSize: 13, padding: "18px 0", textAlign: "center" }} data-testid={`${testid}-empty`}>Sin datos de aplicaciones todavía.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, idx) => (
            <div key={it.nombre_producto + idx} data-testid={`${testid}-row-${idx}`}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}>
              <span style={{ flex: "0 0 auto", width: 24, height: 24, borderRadius: 999, background: MEDALS[idx] || "#64748b", color: "#fff", fontWeight: 800, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{idx + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.nombre_producto}</span>
                  <span style={{ fontWeight: 800, color, whiteSpace: "nowrap" }}>{valueFmt(it)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                  <div style={{ width: `${Math.max((it.total / max) * 100, 4)}%`, height: "100%", background: color, borderRadius: 999 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopProductosGasto() {
  const [data, setData] = useState({ top_dinero: [], top_unidades: [] });

  const load = useCallback(() => {
    api.get("/dashboard/top-productos", { params: { limit: 5 } })
      .then((r) => setData(r.data || { top_dinero: [], top_unidades: [] }))
      .catch(() => setData({ top_dinero: [], top_unidades: [] }));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="card" style={{ marginBottom: 24, borderColor: "#fde68a", background: "linear-gradient(135deg,#fff,#fffbeb)" }} data-testid="top-productos-card">
      <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <div className="kpi-icon-box" style={{ background: "#fef3c7", color: "#d97706", width: 46, height: 46 }}><TrendingUp size={22} /></div>
        <div>
          <h2 style={{ margin: 0, color: "#0f172a" }}>Top de productos que más gasto</h2>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
            Los 5 productos con mayor gasto en dinero y en unidades, según las aplicaciones registradas.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "#15803d", fontSize: 14, marginBottom: 10 }}>
            <DollarSign size={16} /> Top 5 · más gasto en dinero
          </div>
          <Ranking items={data.top_dinero} testid="top-dinero" color="#16a34a"
            valueFmt={(it) => `$ ${fmtMoney(it.total)}`} />
        </div>
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "#0369a1", fontSize: 14, marginBottom: 10 }}>
            <Package size={16} /> Top 5 · más gasto en kilo/litro
          </div>
          <Ranking items={data.top_unidades} testid="top-unidades" color="#0ea5e9"
            valueFmt={(it) => { const c = toKgLt(it.total, it.unidad); return `${fmtNum(c.total)} ${c.unidad}`; }} />
        </div>
      </div>
    </div>
  );
}
