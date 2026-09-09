import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
import { Apple, Users, SprayCan } from "lucide-react";
import { catColor, actColor, laborBucketKey, laborBucketLabel } from "../lib/categoryColors";

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

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Rango [inicio, fin] según granularidad ancladas a una fecha YYYY-MM-DD
function periodoRange(gran, anchor) {
  const d = new Date(anchor + "T00:00:00");
  if (gran === "anio") return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999)];
  if (gran === "mes") return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)];
  // semana lunes→domingo
  const offset = (d.getDay() + 6) % 7;
  const start = new Date(d); start.setDate(d.getDate() - offset); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  return [start, end];
}

const Pill = ({ active, onClick, children, testid }) => (
  <button type="button" onClick={onClick} data-testid={testid}
    style={{ padding: "4px 11px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 12,
      background: active ? "#0f172a" : "#f1f5f9", color: active ? "#fff" : "#475569" }}>
    {children}
  </button>
);

function DonutCard({ icon: Icon, iconColor, iconBg, title, subtitle, data, total, centerNum, centerLabel, toggle, fmt, testid }) {
  const [openKey, setOpenKey] = useState(null);
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
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={86} paddingAngle={data.length === 1 ? 0 : 3} stroke="#fff" strokeWidth={2} cornerRadius={data.length === 1 ? 0 : 6}>
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
                const hasSub = Array.isArray(d.sub) && d.sub.length > 0;
                const isOpen = openKey === d.key;
                return (
                  <div key={d.key} style={{ marginBottom: 10 }} data-testid={`${testid}-row-${d.key}`}>
                    <div onClick={hasSub ? () => setOpenKey(isOpen ? null : d.key) : undefined}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3, cursor: hasSub ? "pointer" : "default" }}
                      data-testid={hasSub ? `${testid}-toggle-${d.key}` : undefined}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "#334155", fontWeight: 600 }}>
                        <span style={{ width: 11, height: 11, borderRadius: 4, background: d.color, flexShrink: 0 }} />{d.name}
                        {hasSub && <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{isOpen ? "▾" : "▸"} ({d.sub.length})</span>}
                      </span>
                      <span style={{ fontSize: 12.5, color: "#0f172a", fontWeight: 700 }}>{fmt(d.value)}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                      <div style={{ width: `${ratio}%`, height: "100%", borderRadius: 999, background: d.color, transition: "width .4s ease" }} />
                    </div>
                    {hasSub && isOpen && (
                      <div style={{ marginTop: 6, marginLeft: 18, paddingLeft: 8, borderLeft: "2px solid #e2e8f0" }} data-testid={`${testid}-sub-${d.key}`}>
                        {d.sub.map((s) => (
                          <div key={s.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#64748b", padding: "2px 0" }}>
                            <span>{s.name}</span><span style={{ fontWeight: 600, color: "#334155" }}>{fmt(s.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
  const [gran, setGran] = useState("todo"); // todo | semana | mes | anio
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));

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

  // Filtro de período (solo lectura sobre los datos cargados)
  const enPeriodo = useMemo(() => {
    if (gran === "todo") return () => true;
    const [start, end] = periodoRange(gran, anchor);
    const a = start.getTime(), b = end.getTime();
    return (s) => { const t = new Date(s).getTime(); return !isNaN(t) && t >= a && t <= b; };
  }, [gran, anchor]);

  const periodoLabel = useMemo(() => {
    if (gran === "todo") return "Todos los registros";
    const [s, e] = periodoRange(gran, anchor);
    if (gran === "anio") return `Año ${s.getFullYear()}`;
    if (gran === "mes") return `${MESES[s.getMonth()]} ${s.getFullYear()}`;
    return `Semana del ${s.getDate()} ${MESES_C[s.getMonth()]} al ${e.getDate()} ${MESES_C[e.getMonth()]} ${e.getFullYear()}`;
  }, [gran, anchor]);

  const cosF = useMemo(() => cosechas.filter((c) => enPeriodo(c.fecha_cosecha)), [cosechas, enPeriodo]);
  const actF = useMemo(() => actividades.filter((a) => enPeriodo(a.fecha_actividad)), [actividades, enPeriodo]);
  const aplF = useMemo(() => aplicaciones.filter((a) => enPeriodo(a.fecha)), [aplicaciones, enPeriodo]);

  // 1) Producción por calidad (suma de TODOS los lotes, en kg)
  const { calData, calTotalKg } = useMemo(() => {
    const agg = { primera: 0, segunda: 0, tercera: 0, descarte: 0 };
    cosF.forEach((c) => { const f = c.unidad === "kg" ? 1 : KG_POR_CESTA; CAL_DEFS.forEach((d) => { agg[d.key] += (c[d.field] || 0) * f; }); });
    const data = CAL_DEFS.map((d) => ({ key: d.key, name: d.name, value: agg[d.key], color: CAL_COLORS[d.key] })).filter((d) => d.value > 0);
    return { calData: data, calTotalKg: CAL_DEFS.reduce((s, d) => s + agg[d.key], 0) };
  }, [cosF]);

  // 2) Labores de personal por tipo (suma de TODOS los lotes)
  const labData = useMemo(() => {
    const agg = {};
    actF.forEach((a) => {
      const raw = a.tipo_personalizado || a.tipo || "—";
      const key = laborBucketKey(raw);
      if (!agg[key]) agg[key] = { key, hh: 0, costo: 0, sub: {} };
      agg[key].hh += (a.horas_hombre || 0);
      agg[key].costo += (a.costo_total || 0);
      if (key === "otra") {
        const s = agg[key].sub[raw] || { name: cap(raw), hh: 0, costo: 0 };
        s.hh += (a.horas_hombre || 0); s.costo += (a.costo_total || 0);
        agg[key].sub[raw] = s;
      }
    });
    return Object.values(agg)
      .map((r) => ({
        key: r.key, name: laborBucketLabel(r.key),
        value: laborMetric === "horas" ? r.hh : r.costo,
        color: actColor(r.key).color,
        sub: r.key === "otra"
          ? Object.values(r.sub).map((s) => ({ name: s.name, value: laborMetric === "horas" ? s.hh : s.costo })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value)
          : null,
      }))
      .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [actF, laborMetric]);

  // 3) Aplicaciones por tipo (suma de TODOS los lotes)
  const aplData = useMemo(() => {
    const agg = {};
    aplF.forEach((a) => { const t = a.tipo || "otros"; if (!agg[t]) agg[t] = { tipo: t, count: 0, costo: 0 }; agg[t].count += 1; agg[t].costo += (a.costo_insumos || 0); });
    return Object.values(agg)
      .map((r) => ({ key: r.tipo, name: cap(r.tipo), value: aplicMetric === "cantidad" ? r.count : r.costo, color: catColor(r.tipo).color }))
      .filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  }, [aplF, aplicMetric]);

  const labTotal = labData.reduce((s, d) => s + d.value, 0);
  const aplTotal = aplData.reduce((s, d) => s + d.value, 0);

  const fmtCal = (kg) => calUnidad === "cestas" ? `${num(kg / KG_POR_CESTA)} cestas` : calUnidad === "pct" ? `${calTotalKg > 0 ? ((kg / calTotalKg) * 100).toFixed(1) : "0"}%` : `${num(kg)} kg`;
  const fmtLabor = (v) => laborMetric === "horas" ? `${num(v)} h` : `$${num(v)}`;
  const fmtAplic = (v) => aplicMetric === "cantidad" ? `${num(v)} apl.` : `$${num(v)}`;

  return (
    <div style={{ marginBottom: 24 }} data-testid="dashboard-totales">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Producción general</h2>
          <p style={{ color: "#64748b", fontSize: 13, margin: "2px 0 0" }}>Totales de todos los lotes · {periodoLabel}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-testid="totales-filtro">
          <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
            {[["todo", "Todo"], ["semana", "Semana"], ["mes", "Mes"], ["anio", "Año"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setGran(k)} data-testid={`totales-gran-${k}`}
                style={{ padding: "6px 14px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: gran === k ? "#16a34a" : "transparent", color: gran === k ? "#fff" : "#475569" }}>
                {l}
              </button>
            ))}
          </div>
          {gran !== "todo" && (
            <input type="date" className="input" style={{ width: 160 }} value={anchor} onChange={(e) => setAnchor(e.target.value)} data-testid="totales-fecha" />
          )}
        </div>
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
