import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { TrendingUp } from "lucide-react";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtCostoKg = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function rangeLabel(d) {
  if (!d || !d.desde) return "Todos los registros";
  const s = new Date(d.desde + "T00:00:00"), e = new Date(d.hasta + "T00:00:00");
  if (d.gran === "anio") return `Año ${s.getFullYear()}`;
  if (d.gran === "mes") return `${MESES[s.getMonth()]} ${s.getFullYear()}`;
  return `Semana del ${s.getDate()} ${MESES_C[s.getMonth()]} al ${e.getDate()} ${MESES_C[e.getMonth()]} ${e.getFullYear()}`;
}

export default function GananciaRealPorKg() {
  const [gran, setGran] = useState("todo");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    const params = { gran };
    if (gran !== "todo") params.anchor = anchor;
    api.get("/analiticas/costos-kg", { params }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [gran, anchor]);
  useEffect(() => { load(); }, [load]);

  const periodoLabel = useMemo(() => rangeLabel(data), [data]);
  const ganancia = data?.ganancia_real_kg ?? 0;
  const positiva = ganancia >= 0;

  return (
    <div className="card" style={{ width: "100%", margin: 0, background: positiva ? "linear-gradient(135deg,#f0fdf4,#dcfce7)" : "linear-gradient(135deg,#fef2f2,#fee2e2)", borderColor: positiva ? "#86efac" : "#fca5a5" }} data-testid="er-ganancia-real-kg-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: positiva ? "#15803d" : "#b91c1c" }}>
            <TrendingUp size={15} style={{ verticalAlign: "middle", marginRight: 5 }} />GANANCIA REAL POR KG
          </div>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>Precio promedio de venta − Costo total real vendible · {periodoLabel}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-testid="gr-filtro">
          <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
            {[["todo", "Todo"], ["semana", "Semana"], ["mes", "Mes"], ["anio", "Año"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setGran(k)} data-testid={`gr-gran-${k}`}
                style={{ padding: "6px 13px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: gran === k ? "#15803d" : "transparent", color: gran === k ? "#fff" : "#475569" }}>
                {l}
              </button>
            ))}
          </div>
          {gran !== "todo" && (
            <input type="date" className="input" style={{ width: 160 }} value={anchor} onChange={(e) => setAnchor(e.target.value)} data-testid="gr-fecha" />
          )}
        </div>
      </div>

      <div style={{ textAlign: "center", padding: "6px 0 10px" }}>
        <div style={{ fontSize: 40, fontWeight: 800, color: positiva ? "#15803d" : "#dc2626", lineHeight: 1.05 }} data-testid="er-ganancia-real-kg">
          {fmtCostoKg(ganancia)}<span style={{ fontSize: 16, color: "#94a3b8", fontWeight: 600 }}>/kg</span>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", fontSize: 13, color: "#475569", borderTop: "1px dashed rgba(0,0,0,0.1)", paddingTop: 10 }}>
        <span>Precio promedio/kg: <b style={{ color: "#15803d" }} data-testid="gr-precio-kg">{fmtCostoKg(data?.precio_promedio_kg)}</b></span>
        <span>− Costo total real vendible/kg: <b style={{ color: "#7c3aed" }} data-testid="gr-costo-kg">{fmtCostoKg(data?.costo_total_real_vendible)}</b></span>
      </div>
    </div>
  );
}
