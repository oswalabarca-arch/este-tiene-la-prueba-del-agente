import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtKg = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg";
const fmtCostoKg = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function rangeLabel(d) {
  if (!d || !d.desde) return "Todos los registros";
  const s = new Date(d.desde + "T00:00:00"), e = new Date(d.hasta + "T00:00:00");
  if (d.gran === "anio") return `Año ${s.getFullYear()}`;
  if (d.gran === "mes") return `${MESES[s.getMonth()]} ${s.getFullYear()}`;
  return `Semana del ${s.getDate()} ${MESES_C[s.getMonth()]} al ${e.getDate()} ${MESES_C[e.getMonth()]} ${e.getFullYear()}`;
}

// Ancla del período ANTERIOR (semana pasada / mes pasado / año pasado)
function prevAnchor(gran, anchor) {
  const d = new Date(anchor + "T00:00:00");
  if (gran === "semana") { const p = new Date(d); p.setDate(d.getDate() - 7); return p.toISOString().slice(0, 10); }
  if (gran === "mes") return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
  if (gran === "anio") return new Date(d.getFullYear() - 1, 0, 1).toISOString().slice(0, 10);
  return null;
}

// % de variación: en costos, subir es desfavorable (rojo ↑), bajar favorable (verde ↓)
function deltaPct(cur, prev) {
  if (!prev || prev <= 0 || !cur || cur <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

function Trend({ pct, testid }) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0.05, down = pct < -0.05;
  const color = up ? "#dc2626" : down ? "#15803d" : "#64748b"; // costo: ↑ rojo (peor), ↓ verde (mejor)
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 700, color }} data-testid={testid}>
      <Icon size={12} />{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function CostosPorKg() {
  const [gran, setGran] = useState("mes");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [prev, setPrev] = useState(null);

  const load = useCallback(() => {
    const params = { gran };
    if (gran !== "todo") params.anchor = anchor;
    api.get("/analiticas/costos-kg", { params }).then((r) => setData(r.data)).catch(() => setData(null));
    // Período anterior para la tendencia (solo si no es "Todo")
    const pa = gran !== "todo" ? prevAnchor(gran, anchor) : null;
    if (pa) api.get("/analiticas/costos-kg", { params: { gran, anchor: pa } }).then((r) => setPrev(r.data)).catch(() => setPrev(null));
    else setPrev(null);
  }, [gran, anchor]);
  useEffect(() => { load(); }, [load]);

  const periodoLabel = useMemo(() => rangeLabel(data), [data]);

  const kgCos = data?.cosecha?.kg_cosechados || 0;
  const kgDesc = data?.cosecha?.kg_descarte || 0;
  const kgDon = data?.cosecha?.kg_donaciones || 0;
  const kgDescRe = data?.cosecha?.kg_descarte_reasignado || 0;
  const kgVend = data?.cosecha?.kg_vendible || 0;
  const kgVendidos = data?.cosecha?.kg_vendidos;
  const kgDisponible = data?.cosecha?.kg_disponible;

  return (
    <div className="card" style={{ width: "100%", margin: 0 }} data-testid="er-costos-kg-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: "#7c3aed" }}>COSTOS POR KILOGRAMO</div>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>
            {periodoLabel}{data?.dias ? ` · salarios prorrateados (${data.dias} día${data.dias === 1 ? "" : "s"})` : ""}{gran !== "todo" ? " · tendencia vs período anterior" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-testid="ck-filtro">
          <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
            {[["todo", "Todo"], ["semana", "Semana"], ["mes", "Mes"], ["anio", "Año"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setGran(k)} data-testid={`ck-gran-${k}`}
                style={{ padding: "6px 13px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: gran === k ? "#7c3aed" : "transparent", color: gran === k ? "#fff" : "#475569" }}>
                {l}
              </button>
            ))}
          </div>
          {gran !== "todo" && (
            <input type="date" className="input" style={{ width: 160 }} value={anchor} onChange={(e) => setAnchor(e.target.value)} data-testid="ck-fecha" />
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <KgChip label="Kg cosechados" value={kgCos} testid="er-kg-cosechados" />
        <KgChip label="Kg descarte" value={kgDesc} testid="er-kg-descarte" />
        <KgChip label="Kg descarte reasig." value={kgDescRe} testid="er-kg-descarte-reasig" />
        <KgChip label="Kg donaciones" value={kgDon} testid="er-kg-donaciones" />
        <KgChip label="Kg vendible" value={kgVend} testid="er-kg-vendible" />
      </div>

      {kgVendidos !== undefined && kgVendidos !== null && (
        <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }} data-testid="er-conciliacion-kg">
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", marginBottom: 6 }}>Conciliación de kg del período</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "#475569" }}>
            <span>Vendible: <b style={{ color: "#0f172a" }}>{fmtKg(kgVend)}</b></span>
            <span>= Vendidos: <b style={{ color: "#15803d" }}>{fmtKg(kgVendidos)}</b></span>
            <span>+ Disponible sin colocar: <b style={{ color: kgDisponible > 0.01 ? "#b45309" : "#0f172a" }} data-testid="er-kg-disponible">{fmtKg(kgDisponible)}</b></span>
          </div>
          {kgDisponible > 0.01 && (
            <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 4 }}>
              El "disponible" es fruta vendible que aún no vendiste ni reasignaste a descarte/donaciones. Colocala para que la utilidad por kg cierre exacto.
            </div>
          )}
        </div>
      )}
      {kgCos <= 0 && (
        <p style={{ color: "#b45309", background: "#fef3c7", borderRadius: 8, padding: "8px 12px", fontSize: 13 }} data-testid="er-costos-kg-vacio">
          No hay cosecha registrada en este período. Registrá cosechas para ver los costos por kg.
        </p>
      )}
      <CostoKgRow num={1} label="COSTO POR KG" hint="Costo total de ventas ÷ kg cosechados" value={data?.costo_por_kg} trend={deltaPct(data?.costo_por_kg, prev?.costo_por_kg)} testid="er-costo-por-kg" />
      <CostoKgRow num={2} label="COSTO TOTAL POR KG" hint="(Costo de ventas + gastos operativos) ÷ kg cosechados" value={data?.costo_total_por_kg} trend={deltaPct(data?.costo_total_por_kg, prev?.costo_total_por_kg)} testid="er-costo-total-por-kg" />
      <CostoKgRow num={3} label="COSTO REAL VENDIBLE" hint="Costo total de ventas ÷ (cosechados − descarte − reasignado a descarte − donaciones)" value={data?.costo_real_vendible} trend={deltaPct(data?.costo_real_vendible, prev?.costo_real_vendible)} testid="er-costo-real-vendible" />
      <CostoKgRow num={4} label="COSTO TOTAL REAL VENDIBLE" hint="(Costo de ventas + gastos operativos) ÷ (cosechados − descarte − reasignado a descarte − donaciones)" value={data?.costo_total_real_vendible} trend={deltaPct(data?.costo_total_real_vendible, prev?.costo_total_real_vendible)} testid="er-costo-total-real-vendible" />
    </div>
  );
}

function KgChip({ label, value, testid }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", flex: "1 1 auto", minWidth: 100 }}>
      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>{label}</div>
      <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 14 }} data-testid={testid}>{fmtKg(value)}</div>
    </div>
  );
}

function CostoKgRow({ num, label, hint, value, trend, testid }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, background: "#ede9fe", color: "#7c3aed", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{num}</span>
        <div>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13.5 }}>{label}</div>
          <div style={{ color: "#94a3b8", fontSize: 11.5 }}>{hint}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <span style={{ fontWeight: 800, color: "#7c3aed", fontSize: 15, whiteSpace: "nowrap" }} data-testid={testid}>{fmtCostoKg(value)}<span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>/kg</span></span>
        <Trend pct={trend} testid={`${testid}-trend`} />
      </div>
    </div>
  );
}
