import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Wallet, ShoppingCart, Truck, Users, Wrench, Cog, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";

const fmtMoney = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDay = (iso) => {
  try {
    const d = new Date((iso || "").slice(0, 10) + "T12:00:00");
    return d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
  } catch { return iso; }
};

const CAT_META = {
  compras: { icon: ShoppingCart, color: "#3b82f6", bg: "#dbeafe" },
  vehiculos: { icon: Truck, color: "#f59e0b", bg: "#fef3c7" },
  trabajadores: { icon: Users, color: "#16a34a", bg: "#d1fae5" },
  herramientas: { icon: Wrench, color: "#8b5cf6", bg: "#ede9fe" },
  motores: { icon: Cog, color: "#ec4899", bg: "#fce7f3" },
};

export default function GastosSemana() {
  const [data, setData] = useState(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/dashboard/gastos-semana", { params: { offset } })
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [offset]);

  useEffect(() => { load(); }, [load]);

  const total = data?.total || 0;
  const categorias = data?.categorias || [];

  return (
    <div className="card" style={{ marginBottom: 24, borderColor: "#fecaca", background: "linear-gradient(135deg,#fff,#fef2f2)" }} data-testid="gastos-semana-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <div className="kpi-icon-box" style={{ background: "#fee2e2", color: "#dc2626", width: 46, height: 46 }}><Wallet size={22} /></div>
          <div>
            <h2 style={{ margin: 0, color: "#0f172a" }}>Gastos de la semana</h2>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }} data-testid="gastos-semana-rango">
              {data ? `${fmtDay(data.inicio)} 5:00 a.m. — ${fmtDay(data.fin)} 6:00 p.m.` : "Cargando..."}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setOffset(offset - 1)} title="Semana anterior" data-testid="gastos-semana-prev"><ChevronLeft size={16} /></button>
          {offset !== 0 && <button className="btn btn-sm" onClick={() => setOffset(0)} data-testid="gastos-semana-hoy">Esta semana</button>}
          <button className="btn btn-sm" onClick={() => setOffset(offset + 1)} disabled={offset >= 0} title="Semana siguiente" data-testid="gastos-semana-next"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Total gastado esta semana</div>
          <div style={{ fontSize: 38, fontWeight: 800, color: total > 0 ? "#dc2626" : "#94a3b8", lineHeight: 1.1 }} data-testid="gastos-semana-total">{fmtMoney(total)}</div>
        </div>
        {loading && <span style={{ color: "#94a3b8", fontSize: 13 }}>Actualizando...</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {categorias.map((c) => {
          const meta = CAT_META[c.key] || CAT_META.compras;
          const Icon = meta.icon;
          const open = expanded === c.key;
          return (
            <div key={c.key} className="card" style={{ padding: 14, cursor: c.count > 0 ? "pointer" : "default", borderColor: open ? meta.color : "var(--border)" }}
              onClick={() => c.count > 0 && setExpanded(open ? null : c.key)} data-testid={`gastos-cat-${c.key}`}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div className="kpi-icon-box" style={{ background: meta.bg, color: meta.color, width: 36, height: 36 }}><Icon size={18} /></div>
                {c.count > 0 && <ChevronDown size={16} style={{ color: "#94a3b8", transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 10, fontWeight: 600 }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: meta.color }} data-testid={`gastos-cat-total-${c.key}`}>{fmtMoney(c.total)}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{c.count} registro{c.count === 1 ? "" : "s"}</div>

              {open && (
                <div style={{ marginTop: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }} onClick={(e) => e.stopPropagation()} data-testid={`gastos-cat-detalle-${c.key}`}>
                  {c.items.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "4px 0" }}>
                      <span style={{ color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.concepto}>
                        <span style={{ color: "#94a3b8", marginRight: 6 }}>{(it.fecha || "").slice(5, 10)}</span>{it.concepto}
                      </span>
                      <b style={{ color: "#0f172a", whiteSpace: "nowrap" }}>{fmtMoney(it.monto)}</b>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!loading && total === 0 && (
        <div style={{ marginTop: 14, color: "#94a3b8", fontSize: 13, textAlign: "center" }} data-testid="gastos-semana-vacio">
          Sin gastos registrados en esta semana.
        </div>
      )}
    </div>
  );
}
