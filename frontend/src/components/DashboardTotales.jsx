import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { Apple, Users, SprayCan } from "lucide-react";
import { catColor, actColor } from "../lib/categoryColors";

const KG_POR_CESTA = 14;
const CAL_COLORS = { primera: "#16a34a", segunda: "#3b82f6", tercera: "#f59e0b", descarte: "#dc2626" };
const CAL_DEFS = [
  { key: "primera", name: "Primera", field: "primera_calidad" },
  { key: "segunda", name: "Segunda", field: "segunda_calidad" },
  { key: "tercera", name: "Tercera", field: "tercera_calidad" },
  { key: "descarte", name: "Descarte", field: "descarte" },
];

const cap = (s) => String(s || "—").charAt(0).toUpperCase() + String(s || "—").slice(1);
const num = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const Pill = ({ active, onClick, children, testid }) => (
  <button type="button" onClick={onClick} data-testid={testid}
    style={{ padding: "4px 11px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 12,
      background: active ? "#0f172a" : "#f1f5f9", color: active ? "#fff" : "#475569" }}>
    {children}
  </button>
);

function DonutCard({ icon: Icon, iconColor, iconBg, title, subtitle, data, total, centerNum, centerLabel, toggle, fmt, testid }) {
  return (
    <div className="card" style={{ flex: "1 1 320px", minWidth: 0, padding: 0, overflow: "hidden", border: "1px solid #e2e8f0" }} data-testid={testid}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" }}>
        <div className="kpi-icon-box" style={{ background: iconBg, color: iconColor, width: 38, height: 38 }}><Icon size={18} /></div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3>
          <div style={{ color: "#94a3b8", fontSize: 12 }}>{subtitle}</div>
        </div>
        {toggle}
      </div>
      <div style={{ padding: 16 }}>
        {data.length === 0 ? (
          <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: "34px 0" }} data-testid={`${testid}-vacio`}>Sin datos registrados todavía.</div>
        ) : (
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", width: 180, height: 180, flexShrink: 0, margin: "0 auto" }}>
              <PieChart width={180} height={180}>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={86} paddingAngle={3} stroke="#fff" strokeWidth={2} cornerRadius={6}>
                  {data.map((d) => <Cell key={d.key} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v, _n, p) => [fmt(Number(v)), p?.payload?.name]} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
              </PieChart>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 23, fontWeight: 800, color: "#0f172a", lineHeight: 1 }} data-testid={`${testid}-total`}>{centerNum}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{centerLabel}</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              {data.map((d) => {
                const ratio = total > 0 ? (d.value / total) * 100 : 0;
                return (
                  <div key={d.key} style={{ marginBottom: 10 }} data-testid={`${testid}-row-${d.key}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#334155", fontWeight: 600 }}>
                        <span style={{ width: 11, height: 11, borderRadius: 4, background: d.color, flexShrink: 0 }} />{d.name}
                      </span>
                      <span style={{ fontSize: 12.5, color: "#0f172a", fontWeight: 700 }}>{fmt(d.value)}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                      <div style={{ width: `${ratio}%`, height: "100%", borderRadius: 999, background: d.color, transition: "width .4s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardTotales() {
  const [cosechas, setCosechas] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [aplicaciones, setAplicaciones] = useState([]);
  const [calUnidad, setCalUnidad] = useState("kg");   // kg | cestas | pct
  const [laborMetric, setLaborMetric] = useState("horas"); // horas | costo
  const [aplicMetric, setAplicMetric] = useState("cantidad"); // cantidad | costo

  const load = useCallback(async () => {
    const [co, ac, ap] = await Promise.all([
      api.get("/cosechas").catch(() => ({ data: {} })),
      api.get("/actividades").catch(() => ({ data: {} })),
      api.get("/aplicaciones").catch(() => ({ data: {} })),
    ]);
    setCosechas(co.data.cosechas || []);
    setActividades(ac.data.actividades || []);
    setAplicaciones(ap.data.aplicaciones || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  // 1) Producción por calidad (suma de TODOS los lotes, en kg)
  const { calData, calTotalKg } = useMemo(() => {
    const agg = { primera: 0, segunda: 0, tercera: 0, descarte: 0 };
    cosechas.forEach((c) => { const f = c.unidad === "kg" ? 1 : KG_POR_CESTA; CAL_DEFS.forEach((d) => { agg[d.key] += (c[d.field] || 0) * f; }); });
    const data = CAL_DEFS.map((d) => ({ key: d.key, name: d.name, value: agg[d.key], color: CAL_COLORS[d.key] })).filter((d) => d.value > 0);
    return { calData: data, calTotalKg: CAL_DEFS.reduce((s, d) => s + agg[d.key], 0) };
  }, [cosechas]);

  // 2) Labores de personal por tipo (suma de TODOS los lotes)
  const labData = useMemo(() => {
    const agg = {};
    actividades.forEach((a) => { const t = a.tipo_personalizado || a.tipo || "—"; if (!agg[t]) agg[t] = { tipo: t, hh: 0, costo: 0 }; agg[t].hh += (a.horas_hombre || 0); agg[t].costo += (a.costo_total || 0); });
    return Object.values(agg)
      .map((r) => ({ key: r.tipo, name: cap(r.tipo), value: laborMetric === "horas" ? r.hh : r.costo, color: actColor(r.tipo).color }))
      .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [actividades, laborMetric]);

  // 3) Aplicaciones por tipo (suma de TODOS los lotes)
  const aplData = useMemo(() => {
    const agg = {};
    aplicaciones.forEach((a) => { const t = a.tipo || "otros"; if (!agg[t]) agg[t] = { tipo: t, count: 0, costo: 0 }; agg[t].count += 1; agg[t].costo += (a.costo_insumos || 0); });
    return Object.values(agg)
      .map((r) => ({ key: r.tipo, name: cap(r.tipo), value: aplicMetric === "cantidad" ? r.count : r.costo, color: catColor(r.tipo).color }))
      .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [aplicaciones, aplicMetric]);

  const labTotal = labData.reduce((s, d) => s + d.value, 0);
  const aplTotal = aplData.reduce((s, d) => s + d.value, 0);

  const fmtCal = (kg) => calUnidad === "cestas" ? `${num(kg / KG_POR_CESTA)} cestas` : calUnidad === "pct" ? `${calTotalKg > 0 ? ((kg / calTotalKg) * 100).toFixed(1) : "0"}%` : `${num(kg)} kg`;
  const fmtLabor = (v) => laborMetric === "horas" ? `${num(v)} h` : `$${num(v)}`;
  const fmtAplic = (v) => aplicMetric === "cantidad" ? `${num(v)} apl.` : `$${num(v)}`;

  return (
    <div style={{ marginBottom: 24 }} data-testid="dashboard-totales">
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Producción general</h2>
        <p style={{ color: "#64748b", fontSize: 13, margin: "2px 0 0" }}>Totales acumulados de todos los lotes registrados en Plantaciones.</p>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
        <DonutCard
          testid="totales-cosechas" icon={Apple} iconColor="#dc2626" iconBg="#fee2e2"
          title="Cosechas por calidad" subtitle="Primera, segunda, tercera y descarte"
          data={calData} total={calTotalKg} fmt={fmtCal}
          centerNum={calUnidad === "cestas" ? num(calTotalKg / KG_POR_CESTA) : calUnidad === "pct" ? "100%" : num(calTotalKg)}
          centerLabel={calUnidad === "cestas" ? "cestas" : calUnidad === "pct" ? "del total" : "kg totales"}
          toggle={<div style={{ display: "inline-flex", gap: 5 }}>
            {[["kg", "kg"], ["cestas", "Cestas"], ["pct", "%"]].map(([k, l]) => <Pill key={k} active={calUnidad === k} onClick={() => setCalUnidad(k)} testid={`totales-cosechas-unidad-${k}`}>{l}</Pill>)}
          </div>}
        />
        <DonutCard
          testid="totales-labores" icon={Users} iconColor="#1d4ed8" iconBg="#dbeafe"
          title="Labores de personal por tipo" subtitle="Distribución de actividades"
          data={labData} total={labTotal} fmt={fmtLabor}
          centerNum={laborMetric === "horas" ? num(labTotal) : `$${num(labTotal)}`}
          centerLabel={laborMetric === "horas" ? "horas-hombre" : "costo total"}
          toggle={<div style={{ display: "inline-flex", gap: 5 }}>
            {[["horas", "Horas"], ["costo", "Costo"]].map(([k, l]) => <Pill key={k} active={laborMetric === k} onClick={() => setLaborMetric(k)} testid={`totales-labores-metric-${k}`}>{l}</Pill>)}
          </div>}
        />
        <DonutCard
          testid="totales-aplicaciones" icon={SprayCan} iconColor="#6d28d9" iconBg="#ede9fe"
          title="Aplicaciones por tipo" subtitle="Fertilizantes, plaguicidas, etc."
          data={aplData} total={aplTotal} fmt={fmtAplic}
          centerNum={aplicMetric === "cantidad" ? num(aplTotal) : `$${num(aplTotal)}`}
          centerLabel={aplicMetric === "cantidad" ? "aplicaciones" : "costo insumos"}
          toggle={<div style={{ display: "inline-flex", gap: 5 }}>
            {[["cantidad", "Cantidad"], ["costo", "Costo"]].map(([k, l]) => <Pill key={k} active={aplicMetric === k} onClick={() => setAplicMetric(k)} testid={`totales-aplicaciones-metric-${k}`}>{l}</Pill>)}
          </div>}
        />
      </div>
    </div>
  );
}
