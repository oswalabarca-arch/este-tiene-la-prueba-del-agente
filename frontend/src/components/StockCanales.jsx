import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Boxes, Building2, Snowflake, Clock } from "lucide-react";

const META = {
  ciudad: { icon: Building2, color: "#3b82f6", bg: "#dbeafe" },
  refrigerar: { icon: Snowflake, color: "#0ea5e9", bg: "#e0f2fe" },
  congelar: { icon: Snowflake, color: "#6366f1", bg: "#e0e7ff" },
};

const fmtNum = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// Color del badge de días según antigüedad del lote más viejo
function diasStyle(dias) {
  if (dias >= 5) return { bg: "#fee2e2", color: "#dc2626" };
  if (dias >= 2) return { bg: "#fef3c7", color: "#b45309" };
  return { bg: "#dcfce7", color: "#15803d" };
}

export default function StockCanales() {
  const [canales, setCanales] = useState([]);
  const [unidad, setUnidad] = useState("cestas");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/dashboard/stock-canales")
      .then((r) => setCanales(r.data.canales || []))
      .catch(() => setCanales([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="card" style={{ marginBottom: 24, borderColor: "#bae6fd", background: "linear-gradient(135deg,#fff,#f0f9ff)" }} data-testid="stock-canales-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="kpi-icon-box" style={{ background: "#e0f2fe", color: "#0ea5e9", width: 46, height: 46 }}><Boxes size={22} /></div>
          <div>
            <h2 style={{ margin: 0, color: "#0f172a" }}>Stock por canal</h2>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
              Cestas disponibles ahora y antigüedad del lote más viejo en cada canal.
            </div>
          </div>
        </div>
        <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
          {["cestas", "kg"].map((u) => (
            <button key={u} onClick={() => setUnidad(u)} data-testid={`stock-unidad-${u}`}
              style={{ padding: "6px 16px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                background: unidad === u ? "#0ea5e9" : "transparent", color: unidad === u ? "#fff" : "#475569" }}>
              {u === "cestas" ? "Cestas" : "kg"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {canales.map((c) => {
          const meta = META[c.tipo] || META.ciudad;
          const Icon = meta.icon;
          const valor = unidad === "cestas" ? c.cestas : c.kg;
          const sinStock = (c.cestas || 0) <= 0.001;
          const ds = diasStyle(c.dias);
          return (
            <div key={c.tipo} className="card" style={{ padding: 16, borderColor: "var(--border)" }} data-testid={`stock-canal-${c.tipo}`}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="kpi-icon-box" style={{ background: meta.bg, color: meta.color, width: 38, height: 38 }}><Icon size={18} /></div>
                {!sinStock && c.dias > 0 && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: ds.bg, color: ds.color }} data-testid={`stock-canal-dias-${c.tipo}`}>
                    <Clock size={12} /> {c.dias} día{c.dias === 1 ? "" : "s"}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 12, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: sinStock ? "#94a3b8" : meta.color, lineHeight: 1.2 }} data-testid={`stock-canal-valor-${c.tipo}`}>
                {fmtNum(valor)} <span style={{ fontSize: 14, fontWeight: 600, color: "#94a3b8" }}>{unidad === "cestas" ? "cestas" : "kg"}</span>
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                {sinStock ? "Sin stock disponible" : `≈ ${fmtNum(unidad === "cestas" ? c.kg : c.cestas)} ${unidad === "cestas" ? "kg" : "cestas"}`}
              </div>
            </div>
          );
        })}
      </div>

      {!loading && canales.every((c) => (c.cestas || 0) <= 0.001) && (
        <div style={{ marginTop: 14, color: "#94a3b8", fontSize: 13, textAlign: "center" }} data-testid="stock-canales-vacio">
          No hay cestas disponibles en ningún canal por ahora.
        </div>
      )}
    </div>
  );
}
