import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { Tag, ArrowUp, ArrowDown, Minus } from "lucide-react";

const KG_POR_CESTA = 14;
const SYSTEM_ORIGENES = ["asignacion_destino", "ajuste_entrada", "ajuste_salida", "reasignacion_salida"];
const CANALES = [
  { tipo: "finca", label: "Venta en finca" },
  { tipo: "ciudad", label: "Envío a ciudad" },
  { tipo: "refrigerar", label: "Refrigerado" },
  { tipo: "congelar", label: "Congelado" },
];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmt = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numf = (n) => Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 2 });

function periodoRange(gran, anchor) {
  const d = new Date(anchor + "T00:00:00");
  if (gran === "anio") return [new Date(d.getFullYear(), 0, 1), new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999)];
  if (gran === "mes") return [new Date(d.getFullYear(), d.getMonth(), 1), new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)];
  const off = (d.getDay() + 6) % 7;
  const s = new Date(d); s.setDate(d.getDate() - off); s.setHours(0, 0, 0, 0);
  const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23, 59, 59, 999);
  return [s, e];
}

const isoD = (d) => d.toISOString().slice(0, 10);
// Ancla del período ANTERIOR (semana pasada / mes pasado / año pasado)
function prevAnchor(gran, anchor) {
  const d = new Date(anchor + "T00:00:00");
  if (gran === "semana") { const p = new Date(d); p.setDate(d.getDate() - 7); return isoD(p); }
  if (gran === "mes") return isoD(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  if (gran === "anio") return isoD(new Date(d.getFullYear() - 1, 0, 1));
  return null;
}

function Trend({ pct, testid }) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0.05, down = pct < -0.05;
  const color = up ? "#15803d" : down ? "#dc2626" : "#64748b";
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 12, fontWeight: 700, color, marginTop: 4 }} data-testid={testid}>
      <Icon size={13} />{Math.abs(pct).toFixed(1)}% vs período anterior
    </span>
  );
}

export default function PrecioPromedioVenta() {
  const [ventas, setVentas] = useState({}); // { tipo: [...] }
  const [gran, setGran] = useState("todo"); // todo | semana | mes | anio
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    const res = await Promise.all(CANALES.map((c) => api.get(`/ventas-${c.tipo}`).catch(() => ({ data: {} }))));
    const map = {};
    CANALES.forEach((c, i) => { map[c.tipo] = res[i].data.ventas || []; });
    setVentas(map);
  }, []);
  useEffect(() => { load(); }, [load]);

  const enPeriodo = useMemo(() => {
    if (gran === "todo") return () => true;
    const [s, e] = periodoRange(gran, anchor);
    const a = s.getTime(), b = e.getTime();
    return (str) => { const t = new Date(str).getTime(); return !isNaN(t) && t >= a && t <= b; };
  }, [gran, anchor]);

  const periodoLabel = useMemo(() => {
    if (gran === "todo") return "Todas las ventas";
    const [s, e] = periodoRange(gran, anchor);
    if (gran === "anio") return `Año ${s.getFullYear()}`;
    if (gran === "mes") return `${MESES[s.getMonth()]} ${s.getFullYear()}`;
    return `Semana del ${s.getDate()} ${MESES_C[s.getMonth()]} al ${e.getDate()} ${MESES_C[e.getMonth()]} ${e.getFullYear()}`;
  }, [gran, anchor]);

  const { porCanal, totKg, totCestas, totIngreso, promKg, promCesta } = useMemo(() => {
    let tKg = 0, tRev = 0;
    const canales = CANALES.map((c) => {
      let rev = 0, kg = 0;
      (ventas[c.tipo] || []).forEach((v) => {
        if (SYSTEM_ORIGENES.includes(v.origen)) return;
        if (!enPeriodo(v.fecha)) return;
        rev += Number(v.total || 0);
        kg += Number(v.cantidad_kg || (Number(v.cantidad_cestas || 0) * KG_POR_CESTA));
      });
      tKg += kg; tRev += rev;
      return { ...c, kg, ingreso: rev, promKg: kg > 0 ? rev / kg : 0, promCesta: kg > 0 ? (rev / kg) * KG_POR_CESTA : 0 };
    });
    return { porCanal: canales, totKg: tKg, totCestas: tKg / KG_POR_CESTA, totIngreso: tRev, promKg: tKg > 0 ? tRev / tKg : 0, promCesta: tKg > 0 ? (tRev / tKg) * KG_POR_CESTA : 0 };
  }, [ventas, enPeriodo]);

  const hayDatos = porCanal.some((c) => c.kg > 0);

  // Promedio por kg del período ANTERIOR (para la tendencia ↑/↓)
  const prevPromKg = useMemo(() => {
    if (gran === "todo") return null;
    const [s, e] = periodoRange(gran, prevAnchor(gran, anchor));
    const a = s.getTime(), b = e.getTime();
    let kg = 0, rev = 0;
    CANALES.forEach((c) => (ventas[c.tipo] || []).forEach((v) => {
      if (SYSTEM_ORIGENES.includes(v.origen)) return;
      const t = new Date(v.fecha).getTime();
      if (isNaN(t) || t < a || t > b) return;
      rev += Number(v.total || 0);
      kg += Number(v.cantidad_kg || (Number(v.cantidad_cestas || 0) * KG_POR_CESTA));
    }));
    return kg > 0 ? rev / kg : null;
  }, [ventas, gran, anchor]);

  const deltaPct = (prevPromKg && prevPromKg > 0 && promKg > 0) ? ((promKg - prevPromKg) / prevPromKg) * 100 : null;

  return (
    <div className="card" style={{ borderColor: "#bbf7d0", background: "linear-gradient(135deg,#fff,#f0fdf4)", margin: 0 }} data-testid="er-venta-promedio-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: "#15803d" }}>
            <Tag size={15} style={{ verticalAlign: "middle", marginRight: 5 }} />PRECIO PROMEDIO DE VENTA
          </div>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>Promedio ponderado de ventas reales (finca + ciudad + refrigerar + congelar) · {periodoLabel} · 1 cesta = 14 kg</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-testid="vp-filtro">
          <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
            {[["todo", "Todo"], ["semana", "Semana"], ["mes", "Mes"], ["anio", "Año"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setGran(k)} data-testid={`vp-gran-${k}`}
                style={{ padding: "6px 13px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: gran === k ? "#15803d" : "transparent", color: gran === k ? "#fff" : "#475569" }}>
                {l}
              </button>
            ))}
          </div>
          {gran !== "todo" && (
            <input type="date" className="input" style={{ width: 160 }} value={anchor} onChange={(e) => setAnchor(e.target.value)} data-testid="vp-fecha" />
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 14 }}>
        <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#64748b", fontSize: 13, fontWeight: 600 }}>Precio promedio por kg</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#15803d", lineHeight: 1.2 }} data-testid="er-precio-prom-kg">{fmt(promKg)}<span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>/kg</span></div>
          <Trend pct={deltaPct} testid="er-prom-kg-trend" />
        </div>
        <div style={{ background: "#fff", border: "1px solid #bbf7d0", borderRadius: 12, padding: 16 }}>
          <div style={{ color: "#64748b", fontSize: 13, fontWeight: 600 }}>Precio promedio por cesta</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#15803d", lineHeight: 1.2 }} data-testid="er-precio-prom-cesta">{fmt(promCesta)}<span style={{ fontSize: 14, color: "#94a3b8", fontWeight: 600 }}>/cesta</span></div>
          <Trend pct={deltaPct} testid="er-prom-cesta-trend" />
        </div>
      </div>
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14, color: "#475569", fontSize: 13 }}>
        <span data-testid="er-vp-kg">Kg vendidos: <b>{numf(totKg)}</b></span>
        <span data-testid="er-vp-cestas">Cestas vendidas: <b>{numf(totCestas)}</b></span>
        <span data-testid="er-vp-ingreso">Ingreso total: <b>{fmt(totIngreso)}</b></span>
      </div>

      {hayDatos ? (
        <div style={{ marginTop: 16 }} data-testid="er-vp-por-canal">
          <div style={{ fontSize: 12, fontWeight: 700, color: "#15803d", marginBottom: 8 }}>PROMEDIO POR CANAL</div>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ minWidth: 460 }}>
              <thead><tr><th>Canal</th><th style={{ textAlign: "right" }}>Kg vendidos</th><th style={{ textAlign: "right" }}>Prom. por kg</th><th style={{ textAlign: "right" }}>Prom. por cesta</th></tr></thead>
              <tbody>
                {porCanal.map((c) => (
                  <tr key={c.tipo} data-testid={`er-vp-canal-${c.tipo}`} style={{ opacity: c.kg > 0 ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{c.label}</td>
                    <td style={{ textAlign: "right" }}>{numf(c.kg)}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "#15803d" }}>{c.kg > 0 ? `${fmt(c.promKg)}/kg` : "—"}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "#15803d" }}>{c.kg > 0 ? `${fmt(c.promCesta)}/cesta` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 14, color: "#94a3b8", fontSize: 13 }} data-testid="er-vp-vacio">No hay ventas registradas en este período.</div>
      )}
    </div>
  );
}
