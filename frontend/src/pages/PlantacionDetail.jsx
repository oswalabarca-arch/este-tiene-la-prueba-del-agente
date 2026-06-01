import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import {
  ArrowLeft, Pencil, Trash2, ImagePlus,
  Droplets, Users as UsersIcon, Apple, Sprout, TrendingUp,
} from "lucide-react";
import { catBadge, actBadge, catColor, actColor } from "../lib/categoryColors";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Legend } from "recharts";
import { PeriodPicker, currentMonthStr, currentYearStr } from "../components/PeriodPicker";

const TABS = [
  { key: "general",      label: "General",            icon: Sprout,    color: "#16a34a" },
  { key: "aplicaciones", label: "Aplicaciones",        icon: Droplets,  color: "#3b82f6" },
  { key: "labores",      label: "Labores de personal", icon: UsersIcon, color: "#8b5cf6" },
  { key: "cosechas",     label: "Cosechas",            icon: Apple,     color: "#dc2626" },
];

const PALE_BG = "#f1f8f1";
const KG_POR_CESTA = 14;
const CAL_COLORS = { primera: "#16a34a", segunda: "#3b82f6", tercera: "#f59e0b", descarte: "#dc2626" };
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const CAL_DEFS = [
  { key: "primera", name: "Primera", field: "primera_calidad" },
  { key: "segunda", name: "Segunda", field: "segunda_calidad" },
  { key: "tercera", name: "Tercera", field: "tercera_calidad" },
  { key: "descarte", name: "Descarte", field: "descarte" },
];

export default function PlantacionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [plantacion, setPlantacion] = useState(null);
  const [tab, setTab] = useState("general");
  const [aplicaciones, setAplicaciones] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [cosechas, setCosechas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [variedades, setVariedades] = useState([]);

  const load = async () => {
    const [pl, ap, ac, co, ti, va] = await Promise.all([
      api.get("/plantaciones"),
      api.get("/aplicaciones"),
      api.get("/actividades"),
      api.get("/cosechas"),
      api.get("/tipos-fruta"),
      api.get("/variedades-fruta"),
    ]);
    const p = pl.data.plantaciones.find((x) => x._id === id);
    setPlantacion(p);
    setAplicaciones(ap.data.aplicaciones || []);
    setActividades(ac.data.actividades || []);
    setCosechas(co.data.cosechas || []);
    setTipos(ti.data.tipos_fruta || []);
    setVariedades(va.data.variedades || []);
  };
  useEffect(() => { load(); }, [id]);

  const lote = plantacion?.lote;
  // Una aplicación puede afectar a múltiples lotes (lote, lotes[] o lotes_destino[]).
  // Para este lote en particular mostramos la PORCIÓN proporcional de insumos y costo.
  const aplicLote = useMemo(() => {
    if (!lote) return [];
    return aplicaciones
      .filter((a) => {
        if (a.lote === lote) return true;
        if (Array.isArray(a.lotes) && a.lotes.includes(lote)) return true;
        if (Array.isArray(a.lotes_destino) && a.lotes_destino.includes(lote)) return true;
        return false;
      })
      .map((a) => {
        // Total de lotes que comparten la aplicación
        const todos = (a.lotes_destino && a.lotes_destino.length > 0)
          ? a.lotes_destino
          : (a.lotes && a.lotes.length > 0 ? a.lotes : [a.lote].filter(Boolean));
        const n = Math.max(todos.length || 1, 1);
        const share = (v) => Number((v || 0) / n);
        return {
          ...a,
          _share_n: n,
          // Insumos: cantidad proporcional
          insumos: (a.insumos || []).map((i) => ({ ...i, cantidad: share(i.cantidad) })),
          // Costo PEPS proporcional
          insumos_costo: (a.insumos_costo || []).map((ic) => ({
            ...ic,
            cantidad: share(ic.cantidad),
            costo: Number((ic.costo || 0) / n),
          })),
          costo_insumos: Number((a.costo_insumos || 0) / n),
          cantidad_agua: share(a.cantidad_agua),
        };
      });
  }, [aplicaciones, lote]);
  const activLote = useMemo(() => actividades.filter((a) => a.lote === lote), [actividades, lote]);
  const cosLote   = useMemo(() => cosechas.filter((c) => c.lote === lote), [cosechas, lote]);

  if (!plantacion) {
    return (
      <div style={{ background: PALE_BG, minHeight: "100%", padding: 24 }}>
        <button className="btn" onClick={() => navigate("/dashboard/plantaciones")}><ArrowLeft size={16} /> Volver</button>
        <div className="empty-state card" style={{ marginTop: 18 }}>Plantación no encontrada</div>
      </div>
    );
  }

  const remove = async () => {
    if (!window.confirm(`Eliminar plantación "${plantacion.nombre}"?`)) return;
    await api.delete(`/plantaciones/${plantacion._id}`);
    toast.show("Eliminada");
    navigate("/dashboard/plantaciones");
  };

  const cultivos    = plantacion.cultivos?.length    ? plantacion.cultivos    : (plantacion.cultivo  ? [plantacion.cultivo]  : []);
  const variedadesP = plantacion.variedades?.length  ? plantacion.variedades  : (plantacion.variedad ? [plantacion.variedad] : []);
  const plantasPorVar = plantacion.plantas_por_variedad || {};
  const variedadesConPlantas = Object.entries(plantasPorVar).filter(([, c]) => Number(c) > 0);
  const totalPlantasInv = Number(plantacion.total_plantas || plantacion.inventario_plantas || 0);
  const fechaAlta = plantacion.created_at || plantacion.fecha_inicio;

  return (
    <div style={{ background: PALE_BG, margin: -24, padding: 24, minHeight: "calc(100vh - 0px)" }} data-testid="plantacion-detail-page">
      <button
        onClick={() => navigate("/dashboard/plantaciones")}
        style={{ background: "transparent", border: "none", color: "#475569", cursor: "pointer", fontSize: 15, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 18, padding: 4 }}
        data-testid="plant-detail-back"
      >
        <ArrowLeft size={18} /> Volver al listado
      </button>

      {/* 3-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr 300px", gap: 18, alignItems: "start" }}>
        {/* LEFT COLUMN */}
        <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {/* Foto principal */}
          <div className="card" style={{ padding: 16 }}>
            <PhotoUpload value={plantacion.foto_principal} label="Subir foto" />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              {canEdit("plantaciones") && (
                <button className="btn" style={{ flex: 1 }} onClick={() => navigate("/dashboard/plantaciones", { state: { edit: plantacion._id } })} data-testid="plant-detail-edit">
                  <Pencil size={14} /> Editar
                </button>
              )}
              {canDelete("plantaciones") && (
                <button className="btn" style={{ flex: 1, color: "#dc2626", borderColor: "#fecaca" }} onClick={remove} data-testid="plant-detail-delete">
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
            </div>
          </div>

          {/* Plantación card */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, letterSpacing: 0.5 }}>Plantación</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a", marginTop: 4 }}>{plantacion.nombre}</div>
            <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: "12px 0" }} />
            <MetaRow label="ID" value={<span style={{ fontFamily: "monospace", fontSize: 12 }}>{plantacion._id?.slice(0, 8)}…</span>} />
            <MetaRow label="Lote" value={<span className="badge badge-primary">{plantacion.lote}</span>} />
            <MetaRow label="Fecha alta" value={fechaAlta ? new Date(fechaAlta).toLocaleDateString() : "—"} />
          </div>

          {/* Navegación */}
          <div className="card" style={{ padding: 8 }}>
            {TABS.map((t) => {
              const Icon = t.icon;
              const counts = t.key === "aplicaciones" ? aplicLote.length
                : t.key === "labores" ? activLote.length
                : t.key === "cosechas" ? cosLote.length : null;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  data-testid={`plant-tab-${t.key}`}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", border: "none", cursor: "pointer", borderRadius: 8,
                    background: active ? "#dcfce7" : "transparent",
                    color: active ? "#15803d" : "#475569",
                    fontWeight: active ? 700 : 500, fontSize: 14, textAlign: "left",
                  }}
                >
                  <Icon size={16} /> <span style={{ flex: 1 }}>{t.label}</span>
                  {counts !== null && counts > 0 && (
                    <span className="badge" style={{ background: active ? "#bbf7d0" : "#f1f5f9", color: active ? "#15803d" : "#64748b", fontSize: 11 }}>{counts}</span>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* CENTER COLUMN */}
        <main>
          {tab === "general" && (
            <div className="card" style={{ padding: 28 }}>
              <h1 style={{ margin: 0, fontSize: 26, color: "#0f172a", fontWeight: 700 }}>Plantación ({plantacion.nombre}) — Detalles</h1>
              <p style={{ color: "#64748b", marginTop: 4, marginBottom: 24 }}>Información general de la plantación.</p>

              <Section title="DATOS GENERALES">
                <FieldGrid>
                  <Field label="Nombre" value={plantacion.nombre} />
                  <Field label="Identificador de lote" value={plantacion.lote} />
                  <Field label="Recinto agronómico" value={plantacion.recinto_agronomico} />
                  <Field label="Huerta (UHC)" value={plantacion.huerta_uhc} />
                  <Field label="Código externo" value={plantacion.codigo_externo} />
                </FieldGrid>
              </Section>

              <Section title="SUPERFICIE">
                <FieldGrid>
                  <Field label="Superficie geométrica (ha)" value={plantacion.superficie_geometrica ?? 0} />
                  <Field label="Superficie declarada (ha)" value={plantacion.superficie_declarada ?? 0} />
                </FieldGrid>
              </Section>

              <Section title="ESTADO ACTUAL">
                <FieldGrid>
                  <Field label="Fecha de inicio" value={plantacion.fecha_inicio ? new Date(plantacion.fecha_inicio).toLocaleDateString() : null} />
                  <Field label="Fecha de finalización" value={plantacion.fecha_finalizacion ? new Date(plantacion.fecha_finalizacion).toLocaleDateString() : null} />
                </FieldGrid>
              </Section>

              <Section title="OTRA INFORMACIÓN">
                <FieldGrid>
                  <Field label="Cultivo" value={cultivos.length > 0 ? cultivos.join(", ") : null} />
                  <Field label="Variedad" value={variedadesP.length > 0 ? variedadesP.join(", ") : null} />
                  <Field label="Inventario (plantas)" value={
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} data-testid="plant-detail-inventario-plantas">
                      <span style={{ fontSize: 16, fontWeight: 600 }}>{totalPlantasInv.toLocaleString("es-ES")}</span>
                      {variedadesConPlantas.length > 0 && (
                        <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                          {variedadesConPlantas.map(([nombre, cant]) => (
                            <span key={nombre} className="badge badge-purple" style={{ fontSize: 11 }} data-testid={`plant-detail-plantas-${nombre}`}>
                              {nombre}: {Number(cant).toLocaleString("es-ES")}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                  } />
                  <Field label="Cobertura" value={plantacion.cobertura} />
                  <Field label="Sistema de riego" value={plantacion.sistema_riego} />
                  <Field label="Tipo de plantación" value={plantacion.tipo_plantacion ? <b style={{ textTransform: "uppercase" }}>{plantacion.tipo_plantacion}</b> : null} />
                  <Field label="Distancia entre plantas (m)" value={plantacion.distancia_plantas ?? 0} />
                  <Field label="Distancia entre filas (m)" value={plantacion.distancia_filas ?? 0} />
                </FieldGrid>
              </Section>

              <Section title="OBSERVACIONES" last>
                <div style={{ color: "#0f172a", whiteSpace: "pre-wrap", fontSize: 15 }}>
                  {plantacion.observaciones || <span style={{ color: "#94a3b8" }}>—</span>}
                </div>
              </Section>
            </div>
          )}

          {tab === "aplicaciones" && <AplicacionesTab items={aplicLote} />}
          {tab === "labores"      && <LaboresTab items={activLote} />}
          {tab === "cosechas"     && <CosechasTab items={cosLote} tipos={tipos} variedades={variedades} plantasPorVar={plantasPorVar} />}
        </main>

        {/* RIGHT COLUMN */}
        <aside>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Foto secundaria</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2, marginBottom: 12 }}>Mapa, vista aérea, etc.</div>
            <PhotoUpload value={plantacion.foto_secundaria} label="Click para subir" />
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 10 }}>Máx 800KB</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MetaRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", fontSize: 13 }}>
      <span style={{ color: "#64748b" }}>{label}</span>
      <span style={{ color: "#0f172a", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

function Section({ title, children, last }) {
  return (
    <div style={{ marginBottom: last ? 0 : 28 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1.2, fontWeight: 700, textTransform: "uppercase", marginBottom: 14 }}>{title}</div>
      {children}
    </div>
  );
}

function FieldGrid({ children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 32px" }}>{children}</div>
  );
}

function Field({ label, value }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: empty ? "#94a3b8" : "#0f172a" }}>
        {empty ? "—" : value}
      </div>
    </div>
  );
}

function PhotoUpload({ value, label }) {
  return (
    <div style={{
      height: 220, borderRadius: 10,
      background: value ? "#fff" : "#eef2eb",
      border: value ? "1px solid #e2e8f0" : "2px dashed #cbd5cb",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", color: "#94a3b8", overflow: "hidden", cursor: "pointer",
    }}>
      {value
        ? <img src={value} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <>
            <ImagePlus size={42} strokeWidth={1.5} />
            <div style={{ marginTop: 8, fontSize: 14 }}>{label}</div>
          </>}
    </div>
  );
}

function AplicacionesTab({ items }) {
  const [aplicMetric, setAplicMetric] = useState("cantidad"); // cantidad | costo | pct
  const [period, setPeriod] = useState("todo"); // todo | semana | mes | año
  const [mesSel, setMesSel] = useState(currentMonthStr);
  const [anioSel, setAnioSel] = useState(currentYearStr);
  const [filtroTipo, setFiltroTipo] = useState("");

  if (items.length === 0) return <div className="card empty-state">Sin aplicaciones registradas en este lote</div>;

  const totalCosto = items.reduce((s, a) => s + (a.costo_insumos || 0), 0);

  // Agrupación por tipo (para la gráfica circular) — usa TODAS las aplicaciones del lote
  const porTipo = {};
  items.forEach((a) => {
    const tipo = a.tipo || "otros";
    if (!porTipo[tipo]) porTipo[tipo] = { tipo, count: 0, costo: 0 };
    porTipo[tipo].count += 1;
    porTipo[tipo].costo += (a.costo_insumos || 0);
  });
  const sortVal = (d) => (aplicMetric === "cantidad" ? d.count : d.costo);
  const tipoData = Object.values(porTipo).sort((a, b) => sortVal(b) - sortVal(a));

  // Métrica activa de la gráfica circular
  const totalMetric = aplicMetric === "cantidad" ? items.length : totalCosto;
  const metricKey = aplicMetric === "cantidad" ? "count" : "costo";
  const fmtMetricVal = (d) => {
    if (aplicMetric === "cantidad") return `${d.count}`;
    if (aplicMetric === "pct") return `${totalCosto > 0 ? ((d.costo / totalCosto) * 100).toFixed(0) : "0"}%`;
    return `$${d.costo.toFixed(2)}`;
  };
  const center = aplicMetric === "cantidad"
    ? { num: items.length, label: "aplicaciones" }
    : { num: `$${totalCosto.toFixed(0)}`, label: "costo total" };
  const metricToggle = (
    <div className="pill-group" style={{ display: "inline-flex", gap: 6 }} data-testid="plant-aplicaciones-metric">
      {[["cantidad", "Cantidad"], ["costo", "Costo $"], ["pct", "Costo %"]].map(([k, l]) => (
        <button key={k} type="button" className={`pill ${aplicMetric === k ? "active" : ""}`} onClick={() => setAplicMetric(k)} data-testid={`plant-aplicaciones-metric-${k}`}>{l}</button>
      ))}
    </div>
  );

  // Filtros del registro (tabla): período + tipo
  const tiposDisponibles = Array.from(new Set(items.map((a) => a.tipo || "otros"))).sort();
  const yearSet = new Set(items.map((a) => { const d = new Date(a.fecha); return isNaN(d.getTime()) ? null : String(d.getFullYear()); }).filter(Boolean));
  yearSet.add(currentYearStr());
  const years = [...yearSet].sort((a, b) => b.localeCompare(a));
  const inPeriodo = (fechaStr) => {
    if (period === "todo") return true;
    const f = new Date(fechaStr);
    if (isNaN(f.getTime())) return false;
    const now = new Date();
    if (period === "semana") { const s = new Date(now); s.setDate(now.getDate() - now.getDay()); s.setHours(0, 0, 0, 0); const e = new Date(s); e.setDate(s.getDate() + 7); return f >= s && f < e; }
    if (period === "mes") return f.getFullYear() === Number(mesSel.slice(0, 4)) && (f.getMonth() + 1) === Number(mesSel.slice(5, 7));
    if (period === "año") return f.getFullYear() === Number(anioSel);
    return true;
  };
  const itemsF = items.filter((a) => inPeriodo(a.fecha) && (filtroTipo ? (a.tipo || "otros") === filtroTipo : true));
  const totalCostoF = itemsF.reduce((s, a) => s + (a.costo_insumos || 0), 0);
  const limpiarFiltros = () => { setPeriod("todo"); setFiltroTipo(""); };
  // Totales por tipo (solo Tipo + Costo real), ordenado por costo desc
  const costoRows = Object.values(porTipo).slice().sort((a, b) => b.costo - a.costo);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Fila: Totales por tipo (izquierda) + Gráfica circular a media columna (derecha) */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "stretch" }}>
        {/* Totales por tipo — solo Tipo y Costo real (lado izquierdo) */}
        <div className="card" style={{ flex: "1 1 300px", minWidth: 0 }} data-testid="plant-aplicaciones-totales-tipo">
          <h3 style={{ marginTop: 0, marginBottom: 2 }}>Totales por tipo</h3>
          <p style={{ color: "#64748b", marginTop: 0, marginBottom: 14, fontSize: 12 }}>
            Costo real (PEPS) acumulado por tipo de aplicación.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th style={{ textAlign: "right" }}>Costo real</th>
              </tr>
            </thead>
            <tbody>
              {costoRows.map((r) => (
                <tr key={r.tipo} data-testid="plant-aplicaciones-totales-row">
                  <td><span className="badge" style={catBadge(r.tipo)}>{r.tipo}</span></td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "#16a34a" }}>${r.costo.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
                <td>Total general</td>
                <td style={{ textAlign: "right", color: "#16a34a" }}>${totalCosto.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Gráfica circular por tipo — diseño moderno (media columna) */}
        <div className="card" style={{ flex: "1 1 320px", minWidth: 0, padding: 0, overflow: "hidden", border: "1px solid #e2e8f0" }} data-testid="plant-aplicaciones-tipo-chart">
        <div style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)", padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 9, fontSize: 16, color: "#0f172a" }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: "#3b82f6", color: "#fff" }}>
                <Droplets size={17} />
              </span>
              Aplicaciones por tipo
            </h3>
            <p style={{ margin: "6px 0 0 39px", color: "#64748b", fontSize: 12.5 }}>
              {aplicMetric === "cantidad"
                ? `Distribución de las ${items.length} aplicaciones de este lote según su tipo.`
                : `Distribución del costo real (PEPS) por tipo. Costo total del lote: $${totalCosto.toFixed(2)}.`}
            </p>
          </div>
          {metricToggle}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, padding: "20px" }}>
          {/* Donut */}
          <div style={{ width: 180, height: 180, position: "relative", flexShrink: 0, margin: "0 auto" }}>
            <PieChart width={180} height={180}>
              <Pie data={tipoData} dataKey={metricKey} nameKey="tipo" cx="50%" cy="50%" innerRadius={52} outerRadius={82} paddingAngle={3} stroke="#fff" strokeWidth={2} cornerRadius={6}>
                {tipoData.map((d) => <Cell key={d.tipo} fill={catColor(d.tipo).color} />)}
              </Pie>
              <Tooltip
                formatter={(_val, _n, p) => [fmtMetricVal(p?.payload || {}), p?.payload?.tipo]}
                contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, textTransform: "capitalize" }}
              />
            </PieChart>
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
              <div style={{ fontSize: aplicMetric === "cantidad" ? 26 : 20, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{center.num}</div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>{center.label}</div>
            </div>
          </div>

          {/* Leyenda moderna */}
          <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 10 }}>
            {tipoData.map((d) => {
              const ratio = totalMetric > 0 ? (sortVal(d) / totalMetric) * 100 : 0;
              const col = catColor(d.tipo).color;
              return (
                <div key={d.tipo} data-testid={`plant-aplicaciones-tipo-row-${d.tipo}`} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 4, background: col, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5, color: "#334155", textTransform: "capitalize" }}>{d.tipo}</span>
                      <span style={{ fontSize: 12.5, color: "#0f172a", fontWeight: 700 }}>{fmtMetricVal(d)}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                      <div style={{ width: `${ratio}%`, height: "100%", borderRadius: 999, background: col, transition: "width .4s ease" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      </div>

      {/* Tabla de aplicaciones */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          Aplicaciones · {itemsF.length}{itemsF.length !== items.length ? ` de ${items.length}` : ""}
          <span style={{ float: "right", color: "#16a34a", fontSize: 16 }}>
            Costo total (PEPS): ${totalCostoF.toFixed(2)}
          </span>
        </h3>
        <p style={{ color: "#64748b", marginTop: -4, fontSize: 12 }}>
          Costo calculado por método PEPS (primero en entrar, primero en salir) usando los precios históricos de compras.
        </p>

        {/* Filtros: período + tipo */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginBottom: 14, padding: 12, background: "#f8fafc", borderRadius: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Periodo</div>
            <div className="pill-group" data-testid="aplic-filtro-periodo" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {[["semana", "Semana"], ["mes", "Mes"], ["año", "Año"], ["todo", "Todo"]].map(([k, l]) => (
                <button key={k} type="button" className={`pill ${period === k ? "active" : ""}`} onClick={() => setPeriod(k)} data-testid={`aplic-filtro-periodo-${k}`}>{l}</button>
              ))}
              <PeriodPicker isMonth={period === "mes"} isYear={period === "año"} mes={mesSel} setMes={setMesSel} anio={anioSel} setAnio={setAnioSel} years={years} testidPrefix="aplic-filtro" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Tipo</div>
            <select className="select" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} data-testid="aplic-filtro-tipo" style={{ minWidth: 180, textTransform: "capitalize" }}>
              <option value="">Todos los tipos</option>
              {tiposDisponibles.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {(period !== "todo" || filtroTipo) && (
            <button type="button" className="btn btn-sm" onClick={limpiarFiltros} data-testid="aplic-filtro-limpiar">Limpiar filtros</button>
          )}
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Insumos</th>
              <th>Estado</th>
              <th style={{ textAlign: "right" }}>Costo real</th>
            </tr>
          </thead>
          <tbody>
            {itemsF.map((a) => (
              <tr key={a._id} data-testid="aplic-row">
                <td>{new Date(a.fecha).toLocaleDateString()}</td>
                <td><span className="badge" style={catBadge(a.tipo)}>{a.tipo}</span></td>
                <td style={{ fontSize: 12, color: "#475569" }}>
                  {a.insumos_costo && a.insumos_costo.length > 0
                    ? a.insumos_costo.map((ic, i) => (
                        <div key={i}>
                          {ic.nombre_producto} <b>{Number(ic.cantidad).toFixed(2)}</b> {ic.unidad} · <span style={{ color: "#16a34a" }}>${ic.costo.toFixed(2)}</span>
                          {ic.cantidad_sin_cobertura > 0 && <span style={{ color: "#dc2626", fontSize: 11 }}> ⚠ {ic.cantidad_sin_cobertura} sin stock comprado</span>}
                        </div>
                      ))
                    : (a.insumos?.map((i) => `${i.nombre_producto} ${Number(i.cantidad).toFixed(2)}${i.unidad}`).join(", ") || "—")}
                  {a._share_n > 1 && (
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Porción del lote (1/{a._share_n})</div>
                  )}
                </td>
                <td>{a.estado === "confirmada" ? <span className="badge badge-primary">Confirmada</span> : <span className="badge badge-warn">Pendiente</span>}</td>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#16a34a" }}>${Number(a.costo_insumos || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {itemsF.length === 0 && <div className="empty-state">Sin aplicaciones para los filtros aplicados</div>}
      </div>
    </div>
  );
}

function LaboresTab({ items }) {
  const [laborMetric, setLaborMetric] = useState("horas"); // horas | costo | pct

  if (items.length === 0) return <div className="card empty-state">Sin labores registradas en este lote</div>;
  const totalHH = items.reduce((s, a) => s + (a.horas_hombre || 0), 0);
  const totalCosto = items.reduce((s, a) => s + (a.costo_total || 0), 0);

  // Totales por tipo de labor (tipo_personalizado || tipo)
  const porTipo = {};
  items.forEach((a) => {
    const tipo = a.tipo_personalizado || a.tipo || "—";
    if (!porTipo[tipo]) porTipo[tipo] = { tipo, count: 0, hh: 0, costo: 0 };
    porTipo[tipo].count += 1;
    porTipo[tipo].hh += (a.horas_hombre || 0);
    porTipo[tipo].costo += (a.costo_total || 0);
  });
  const tipoRows = Object.values(porTipo).sort((a, b) => b.costo - a.costo);

  // Métrica activa de la gráfica circular (horas | costo | pct)
  const dataKey = laborMetric === "horas" ? "hh" : "costo";
  const totalMetric = laborMetric === "horas" ? totalHH : totalCosto;
  const fmtLabor = (r) => {
    if (laborMetric === "horas") return `${(r.hh || 0).toFixed(2)} h`;
    if (laborMetric === "pct") return `${totalCosto > 0 ? (((r.costo || 0) / totalCosto) * 100).toFixed(0) : "0"}%`;
    return `$${(r.costo || 0).toFixed(2)}`;
  };
  const centerLabor = laborMetric === "horas"
    ? { num: totalHH.toFixed(0), label: "horas-hombre" }
    : { num: `$${totalCosto.toFixed(0)}`, label: "costo total" };

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="card kpi-card"><div className="kpi-label">Labores</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Horas-hombre acumuladas</div><div className="kpi-value" style={{ color: "#8b5cf6" }}>{totalHH.toFixed(2)}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Costo mano de obra</div><div className="kpi-value" style={{ color: "#16a34a" }}>${totalCosto.toFixed(2)}</div></div>
      </div>

      {/* Fila: Totales por tipo (mitad) + Distribución por tipo (mitad) — arriba de los registros */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 14, alignItems: "stretch" }}>
        {/* Totales por tipo — sin columna "Labores" */}
        <div className="card" style={{ flex: "1 1 320px", minWidth: 0, marginBottom: 0 }} data-testid="plant-labores-totales-tipo">
          <h3 style={{ marginTop: 0, marginBottom: 2 }}>Totales por tipo</h3>
          <p style={{ color: "#64748b", marginTop: 0, marginBottom: 14, fontSize: 12 }}>
            Horas-hombre y costo de mano de obra agrupados por tipo de labor.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th style={{ textAlign: "right" }}>Horas-hombre</th>
                <th style={{ textAlign: "right" }}>Costo</th>
              </tr>
            </thead>
            <tbody>
              {tipoRows.map((r) => (
                <tr key={r.tipo} data-testid="plant-labores-tipo-row">
                  <td><span className="badge" style={actBadge(r.tipo)}>{r.tipo}</span></td>
                  <td style={{ textAlign: "right", fontWeight: 600, color: "#8b5cf6" }}>{r.hh.toFixed(2)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, color: "#16a34a" }}>${r.costo.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
                <td>Total general</td>
                <td style={{ textAlign: "right", color: "#8b5cf6" }}>{totalHH.toFixed(2)}</td>
                <td style={{ textAlign: "right", color: "#16a34a" }}>${totalCosto.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Distribución por tipo — gráfica circular con toggle de métrica */}
        <div className="card" style={{ flex: "1 1 320px", minWidth: 0, marginBottom: 0 }} data-testid="plant-labores-tipo-chart">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>Distribución por tipo</h3>
            <div className="pill-group" style={{ display: "inline-flex", gap: 6 }} data-testid="plant-labores-metric">
              {[["horas", "Horas-H"], ["costo", "Costo $"], ["pct", "%"]].map(([k, l]) => (
                <button key={k} type="button" className={`pill ${laborMetric === k ? "active" : ""}`} onClick={() => setLaborMetric(k)} data-testid={`plant-labores-metric-${k}`}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
            <div style={{ width: 180, height: 180, position: "relative", flexShrink: 0, margin: "0 auto" }}>
              <PieChart width={180} height={180}>
                <Pie data={tipoRows} dataKey={dataKey} nameKey="tipo" cx="50%" cy="50%" innerRadius={54} outerRadius={84} paddingAngle={3} stroke="#fff" strokeWidth={2} cornerRadius={6}>
                  {tipoRows.map((r) => <Cell key={r.tipo} fill={actColor(r.tipo).color} />)}
                </Pie>
                <Tooltip formatter={(_v, _n, p) => [fmtLabor(p?.payload || {}), p?.payload?.tipo]} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, textTransform: "capitalize" }} />
              </PieChart>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{centerLabor.num}</div>
                <div style={{ fontSize: 9.5, color: "#64748b", marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 }}>{centerLabor.label}</div>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 8 }}>
              {tipoRows.map((r) => {
                const ratio = totalMetric > 0 ? ((laborMetric === "horas" ? r.hh : r.costo) / totalMetric) * 100 : 0;
                const col = actColor(r.tipo).color;
                return (
                  <div key={r.tipo} data-testid={`plant-labores-legend-${r.tipo}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 11, height: 11, borderRadius: 4, background: col, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                        <span style={{ fontWeight: 600, fontSize: 12.5, color: "#334155", textTransform: "capitalize" }}>{r.tipo}</span>
                        <span style={{ fontSize: 12, color: "#0f172a", fontWeight: 700 }}>{fmtLabor(r)}</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                        <div style={{ width: `${ratio}%`, height: "100%", borderRadius: 999, background: col, transition: "width .4s ease" }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Trabajadores</th><th>Horas</th><th>Precio/hr</th><th>Horas-H</th><th>Costo</th><th>Origen</th></tr></thead>
          <tbody>
            {items.map((a) => (
              <tr key={a._id}>
                <td>{new Date(a.fecha_actividad).toLocaleDateString()}</td>
                <td><span className="badge" style={actBadge(a.tipo_personalizado || a.tipo)}>{a.tipo_personalizado || a.tipo}</span></td>
                <td>{Number(a.cantidad_trabajadores || 0).toFixed(2)}</td>
                <td>{a.horas_trabajo}</td>
                <td>${Number(a.precio_hora || 0).toFixed(2)}</td>
                <td style={{ fontWeight: 600 }}>{Number(a.horas_hombre || 0).toFixed(2)}</td>
                <td style={{ fontWeight: 700, color: "#16a34a" }}>${Number(a.costo_total || 0).toFixed(2)}</td>
                <td><span className="badge badge-info">{a.origen}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CosechasTab({ items, tipos, variedades, plantasPorVar = {} }) {
  const [unidadVista, setUnidadVista] = useState("cestas");
  const [period, setPeriod] = useState("todo");
  const [mesSel, setMesSel] = useState(currentMonthStr);
  const [anioSel, setAnioSel] = useState(currentYearStr);
  const [filtroVariedad, setFiltroVariedad] = useState("");
  const [serieGran, setSerieGran] = useState("mes"); // semana | mes
  const [serieAnio, setSerieAnio] = useState(currentYearStr);
  const [serieVariedad, setSerieVariedad] = useState("");
  const [calVisible, setCalVisible] = useState({ primera: true, segunda: true, tercera: true, descarte: true });
  const [calUnidad, setCalUnidad] = useState("kg"); // kg | cestas | pct (gráficos circulares)
  const [serieUnidad, setSerieUnidad] = useState("kg"); // kg | cestas (producción en el tiempo)
  const labelTipo = (c) => c.tipo_fruta || tipos.find((t) => t._id === c.tipo_fruta_id)?.nombre || "—";
  const labelVar = (c) => c.variedad || variedades.find((v) => v._id === c.variedad_id)?.nombre || "—";

  if (items.length === 0) return <div className="card empty-state">Sin cosechas registradas en este lote</div>;

  // Opciones para los filtros
  const variedadesDisponibles = Array.from(new Set(items.map(labelVar).filter((v) => v && v !== "—"))).sort();
  const yearSet = new Set(items.map((c) => { const d = new Date(c.fecha_cosecha); return isNaN(d.getTime()) ? null : String(d.getFullYear()); }).filter(Boolean));
  yearSet.add(currentYearStr());
  const years = [...yearSet].sort((a, b) => b.localeCompare(a));

  // Filtro por período + variedad sobre los registros
  const inPeriodo = (fechaStr) => {
    if (period === "todo") return true;
    const f = new Date(fechaStr);
    if (isNaN(f.getTime())) return false;
    const now = new Date();
    if (period === "hoy") return f.toDateString() === now.toDateString();
    if (period === "semana") { const s = new Date(now); s.setDate(now.getDate() - now.getDay()); s.setHours(0, 0, 0, 0); const e = new Date(s); e.setDate(s.getDate() + 7); return f >= s && f < e; }
    if (period === "mes") return f.getFullYear() === Number(mesSel.slice(0, 4)) && (f.getMonth() + 1) === Number(mesSel.slice(5, 7));
    if (period === "año") return f.getFullYear() === Number(anioSel);
    return true;
  };
  const limpiarFiltros = () => { setPeriod("todo"); setFiltroVariedad(""); };
  const itemsF = items.filter((c) => inPeriodo(c.fecha_cosecha) && (filtroVariedad ? labelVar(c) === filtroVariedad : true));

  // Factor de conversión según la unidad en que se guardó la cosecha vs la que se quiere ver
  const multDe = (c) => (c.unidad === "kg" && unidadVista === "cestas") ? 1 / KG_POR_CESTA
                      : (c.unidad === "cestas" && unidadVista === "kg") ? KG_POR_CESTA : 1;
  const totalDe = (c) => (c.primera_calidad || 0) + (c.segunda_calidad || 0) + (c.tercera_calidad || 0) + (c.descarte || 0);
  const u = unidadVista === "kg" ? "kg" : "cestas";
  const totalGeneral = itemsF.reduce((s, c) => s + totalDe(c) * multDe(c), 0);

  // Rendimiento por planta: kg totales de cada (tipo de fruta + variedad) ÷ plantas registradas de esa variedad
  const kgDe = (c) => (c.unidad === "kg") ? totalDe(c) : totalDe(c) * KG_POR_CESTA;
  // Mapa normalizado (trim + minúsculas) para cruzar variedad↔plantas sin fallar por mayúsculas/espacios
  const plantasNorm = {};
  Object.entries(plantasPorVar || {}).forEach(([k, v]) => { plantasNorm[k.trim().toLowerCase()] = Number(v) || 0; });
  const grupos = {};
  itemsF.forEach((c) => {
    const tipo = labelTipo(c);
    const variedad = labelVar(c);
    const key = `${tipo}||${variedad}`;
    if (!grupos[key]) grupos[key] = { tipo, variedad, kg: 0 };
    grupos[key].kg += kgDe(c);
  });
  const filasRend = Object.values(grupos).map((g) => {
    const plantas = plantasNorm[g.variedad.trim().toLowerCase()] || 0;
    return { ...g, plantas, rendimiento: plantas > 0 ? g.kg / plantas : null };
  });

  // Calidades del lote (en kg) para el gráfico principal
  const fKg = (c) => (c.unidad === "kg") ? 1 : KG_POR_CESTA;
  const loteCal = { primera: 0, segunda: 0, tercera: 0, descarte: 0 };
  itemsF.forEach((c) => { CAL_DEFS.forEach((d) => { loteCal[d.key] += (c[d.field] || 0) * fKg(c); }); });
  const loteTotalKg = CAL_DEFS.reduce((s, d) => s + loteCal[d.key], 0);
  const mainData = CAL_DEFS.map((d) => ({ key: d.key, name: d.name, value: loteCal[d.key] })).filter((d) => d.value > 0);

  // Formato de los gráficos circulares según la unidad activa (kg | cestas | %)
  const fmtCal = (kgVal, totalKg) => {
    if (calUnidad === "cestas") return `${(kgVal / KG_POR_CESTA).toFixed(2)} cestas`;
    if (calUnidad === "pct") return `${totalKg > 0 ? ((kgVal / totalKg) * 100).toFixed(1) : "0"}%`;
    return `${kgVal.toFixed(2)} kg`;
  };
  const calNum = (totalKg) => (calUnidad === "cestas" ? (totalKg / KG_POR_CESTA).toFixed(0) : totalKg.toFixed(0));
  const calToggle = (
    <div className="pill-group" style={{ display: "inline-flex", gap: 6 }} data-testid="plant-calidades-unidad">
      {[["kg", "kg"], ["cestas", "Cestas"], ["pct", "%"]].map(([k, l]) => (
        <button key={k} type="button" className={`pill ${calUnidad === k ? "active" : ""}`} onClick={() => setCalUnidad(k)} data-testid={`plant-calidades-unidad-${k}`}>{l}</button>
      ))}
    </div>
  );

  // Calidades por variedad (en kg) para los gráficos secundarios
  const porVariedad = {};
  itemsF.forEach((c) => {
    const variedad = labelVar(c);
    if (!porVariedad[variedad]) porVariedad[variedad] = { variedad, primera: 0, segunda: 0, tercera: 0, descarte: 0 };
    CAL_DEFS.forEach((d) => { porVariedad[variedad][d.key] += (c[d.field] || 0) * fKg(c); });
  });
  const variedadCharts = Object.values(porVariedad).map((v) => {
    const total = CAL_DEFS.reduce((s, d) => s + v[d.key], 0);
    return { variedad: v.variedad, total, data: CAL_DEFS.map((d) => ({ key: d.key, name: d.name, value: v[d.key] })).filter((d) => d.value > 0) };
  });

  // Totales consolidados por variedad — suma TODAS las cosechas sin importar la fecha (ignora los filtros)
  const consolidado = {};
  items.forEach((c) => {
    const tipo = labelTipo(c);
    const variedad = labelVar(c);
    const key = `${tipo}||${variedad}`;
    const m = multDe(c);
    if (!consolidado[key]) consolidado[key] = { tipo, variedad, primera: 0, segunda: 0, tercera: 0, descarte: 0, total: 0 };
    consolidado[key].primera += (c.primera_calidad || 0) * m;
    consolidado[key].segunda += (c.segunda_calidad || 0) * m;
    consolidado[key].tercera += (c.tercera_calidad || 0) * m;
    consolidado[key].descarte += (c.descarte || 0) * m;
    consolidado[key].total += totalDe(c) * m;
  });
  const consolidadoRows = Object.values(consolidado).sort((a, b) => b.total - a.total);
  const consolidadoTotal = consolidadoRows.reduce((s, r) => s + r.total, 0);

  // ── Producción en el tiempo: kg apilados por calidad, del año seleccionado ──
  const MES_CAP = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const CAL_LEG = { primera: "1ª calidad", segunda: "2ª calidad", tercera: "3ª calidad", descarte: "Descarte" };
  const fmtKg = (n) => Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 2 });
  const serieVariedadesOpts = variedadesDisponibles;
  const serieItems = items.filter((c) => {
    const d = new Date(c.fecha_cosecha);
    if (isNaN(d.getTime())) return false;
    if (String(d.getFullYear()) !== String(serieAnio)) return false;
    if (serieVariedad && labelVar(c) !== serieVariedad) return false;
    return true;
  });
  const nBuckets = serieGran === "semana" ? 52 : 12;
  const buckets = Array.from({ length: nBuckets }, (_, i) => ({
    idx: i,
    label: serieGran === "semana" ? `S${i + 1}` : MES_CAP[i],
    nombre: serieGran === "semana" ? `Semana ${i + 1}` : MES_CAP[i],
    primera: 0, segunda: 0, tercera: 0, descarte: 0,
  }));
  serieItems.forEach((c) => {
    const d = new Date(c.fecha_cosecha);
    let bi;
    if (serieGran === "semana") {
      const soY = new Date(d.getFullYear(), 0, 1);
      bi = Math.max(0, Math.min(51, Math.floor((d - soY) / (7 * 86400000))));
    } else {
      bi = d.getMonth();
    }
    CAL_DEFS.forEach((def) => { buckets[bi][def.key] += (c[def.field] || 0) * fKg(c); });
  });
  buckets.forEach((b) => {
    CAL_DEFS.forEach((def) => { b[def.key] = Number(b[def.key].toFixed(2)); });
    b.total = Number(CAL_DEFS.reduce((s, def) => s + b[def.key], 0).toFixed(2));
  });
  const bucketsConDatos = buckets.filter((b) => b.total > 0);
  const serieTotalAnio = buckets.reduce((s, b) => s + b.total, 0);
  const picoBucket = bucketsConDatos.reduce((m, b) => (!m || b.total > m.total ? b : m), null);
  const minBucket = bucketsConDatos.reduce((m, b) => (!m || b.total < m.total ? b : m), null);
  const promedioConDatos = bucketsConDatos.length > 0 ? serieTotalAnio / bucketsConDatos.length : 0;

  // Unidad de la serie (kg | cestas): los buckets están en kg; escalamos para mostrar
  const serieFactor = serieUnidad === "cestas" ? 1 / KG_POR_CESTA : 1;
  const uSerie = serieUnidad === "cestas" ? "cestas" : "kg";
  const bucketsDisplay = buckets.map((b) => {
    const o = { label: b.label, nombre: b.nombre };
    CAL_DEFS.forEach((def) => { o[def.key] = Number((b[def.key] * serieFactor).toFixed(2)); });
    o.total = Number((b.total * serieFactor).toFixed(2));
    return o;
  });
  const serieToggle = (
    <div className="pill-group" style={{ display: "inline-flex", gap: 6 }} data-testid="plant-serie-unidad">
      {[["kg", "kg"], ["cestas", "Cestas"]].map(([k, l]) => (
        <button key={k} type="button" className={`pill ${serieUnidad === k ? "active" : ""}`} onClick={() => setSerieUnidad(k)} data-testid={`plant-serie-unidad-${k}`}>{l}</button>
      ))}
    </div>
  );

  return (
    <>
      {/* Totales por variedad (todas las fechas, sin importar filtros) */}
      <div className="card" style={{ marginTop: 18 }} data-testid="plant-cosecha-consolidado">
        <h3 style={{ marginTop: 0, marginBottom: 2 }}>Totales por variedad (todas las fechas)</h3>
        <p style={{ color: "#64748b", marginTop: 0, marginBottom: 14, fontSize: 12 }}>
          Suma de todas las cosechas de cada variedad sin importar la fecha (no afectado por los filtros de arriba). Cantidades en <b>{u}</b>.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Tipo de fruta</th><th>Variedad</th>
              <th>1ª ({u})</th><th>2ª ({u})</th><th>3ª ({u})</th><th>Descarte ({u})</th><th>Total ({u})</th>
            </tr>
          </thead>
          <tbody>
            {consolidadoRows.map((r, i) => (
              <tr key={i} data-testid="plant-consolidado-row">
                <td>{r.tipo}</td>
                <td><span className="badge badge-purple">{r.variedad}</span></td>
                <td style={{ color: "#16a34a", fontWeight: 600 }}>{r.primera.toFixed(2)}</td>
                <td style={{ color: "#3b82f6" }}>{r.segunda.toFixed(2)}</td>
                <td style={{ color: "#f59e0b" }}>{r.tercera.toFixed(2)}</td>
                <td style={{ color: "#dc2626" }}>{r.descarte.toFixed(2)}</td>
                <td style={{ fontWeight: 700 }} data-testid={`plant-consolidado-total-${r.variedad}`}>{r.total.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 800 }}>
              <td colSpan={6} style={{ textAlign: "right" }}>Total general</td>
              <td>{consolidadoTotal.toFixed(2)} {u}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Producción en el tiempo — áreas apiladas por calidad (kg) */}
      <div className="card" style={{ marginTop: 18 }} data-testid="plant-cosecha-serie">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
          <h3 style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <TrendingUp size={18} color="#16a34a" /> Producción en el tiempo
          </h3>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Año:</span>
              <select className="select" value={serieAnio} onChange={(e) => setSerieAnio(e.target.value)} data-testid="cosecha-serie-anio" style={{ minWidth: 90 }}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="pill-group" style={{ display: "inline-flex", gap: 6 }} data-testid="cosecha-serie-granularidad">
              <button type="button" className={`pill ${serieGran === "semana" ? "active" : ""}`} onClick={() => setSerieGran("semana")} data-testid="cosecha-serie-semana">Por semana (52)</button>
              <button type="button" className={`pill ${serieGran === "mes" ? "active" : ""}`} onClick={() => setSerieGran("mes")} data-testid="cosecha-serie-mes">Por mes (12)</button>
            </div>
            {serieToggle}
          </div>
        </div>
        <p style={{ color: "#64748b", marginTop: 4, marginBottom: 10, fontSize: 12 }}>
          Producción ({uSerie}) por calidad a lo largo de {serieAnio} — cada calidad se mide desde 0 con su valor real. Usá los filtros para ver una variedad o aislar calidades.
        </p>

        {/* Filtro de variedad + toggles de calidad */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Variedad:</span>
            <select className="select" value={serieVariedad} onChange={(e) => setSerieVariedad(e.target.value)} data-testid="cosecha-serie-variedad" style={{ minWidth: 160 }}>
              <option value="">Todas</option>
              {serieVariedadesOpts.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Calidad:</span>
            {CAL_DEFS.map((d) => (
              <button key={d.key} type="button" onClick={() => setCalVisible((p) => ({ ...p, [d.key]: !p[d.key] }))}
                data-testid={`cosecha-serie-cal-${d.key}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", background: calVisible[d.key] ? "#fff" : "#f1f5f9", opacity: calVisible[d.key] ? 1 : 0.5, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: CAL_COLORS[d.key] }} />
                {CAL_LEG[d.key]}
              </button>
            ))}
          </div>
        </div>

        {serieTotalAnio > 0 ? (
          <>
            <div style={{ width: "100%", height: 320 }} data-testid="cosecha-serie-chart">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={bucketsDisplay} margin={{ top: 10, right: 20, bottom: 0, left: 8 }}>
                  <defs>
                    {CAL_DEFS.map((d) => (
                      <linearGradient key={d.key} id={`grad-${d.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CAL_COLORS[d.key]} stopOpacity={0.30} />
                        <stop offset="95%" stopColor={CAL_COLORS[d.key]} stopOpacity={0.04} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} interval={serieGran === "semana" ? 3 : 0} />
                  <YAxis tick={{ fontSize: 12, fill: "#64748b" }} allowDecimals={false} label={{ value: `Producción (${uSerie})`, angle: -90, position: "insideLeft", fontSize: 12, fill: "#64748b", style: { textAnchor: "middle" } }} />
                  <Tooltip formatter={(val, name) => [`${Number(val).toFixed(2)} ${uSerie}`, name]} labelFormatter={(l) => bucketsDisplay.find((b) => b.label === l)?.nombre || l} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {CAL_DEFS.filter((d) => calVisible[d.key]).map((d) => (
                    <Area key={d.key} type="monotone" dataKey={d.key} name={CAL_LEG[d.key]} stroke={CAL_COLORS[d.key]} strokeWidth={2.5} fill={`url(#grad-${d.key})`} dot={false} activeDot={{ r: 4 }} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* 4 tarjetas resumen */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 16 }} data-testid="cosecha-serie-resumen">
              <ResumenCard label="PICO MÁXIMO" value={picoBucket ? `${picoBucket.label} · ${fmtKg(picoBucket.total * serieFactor)} ${uSerie}` : "—"} color="#16a34a" testid="cosecha-serie-pico" />
              <ResumenCard label="MÍNIMO (CON DATOS)" value={minBucket ? `${minBucket.label} · ${fmtKg(minBucket.total * serieFactor)} ${uSerie}` : "—"} color="#dc2626" testid="cosecha-serie-minimo" />
              <ResumenCard label="PROMEDIO (PERÍODOS CON DATOS)" value={`${fmtKg(promedioConDatos * serieFactor)} ${uSerie}`} color="#3b82f6" testid="cosecha-serie-promedio" />
              <ResumenCard label={`TOTAL ${serieAnio}`} value={`${fmtKg(serieTotalAnio * serieFactor)} ${uSerie}`} color="#f59e0b" testid="cosecha-serie-total" />
            </div>
          </>
        ) : (
          <div className="empty-state" data-testid="cosecha-serie-empty">Sin datos de cosecha para {serieAnio}{serieVariedad ? ` · ${serieVariedad}` : ""}</div>
        )}
      </div>

      {/* Fila: Calidades del lote (mitad) + Rendimiento por planta (mitad) */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 18, alignItems: "stretch" }}>
        {loteTotalKg > 0 && (
          <div className="card" style={{ flex: "1 1 320px", minWidth: 0, marginTop: 0, padding: 0, overflow: "hidden", border: "1px solid #e2e8f0" }} data-testid="plant-calidades-chart">
            <ChartHeader icon={Apple} iconBg="#dc2626" title="Calidades del lote" subtitle={`Distribución de calidades del lote. Rendimiento total: ${loteTotalKg.toFixed(2)} kg.`} right={calToggle} />
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 24, padding: 24 }}>
              <div style={{ width: 200, height: 200, position: "relative", flexShrink: 0, margin: "0 auto" }}>
                <PieChart width={200} height={200}>
                  <Pie data={mainData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={92} paddingAngle={3} stroke="#fff" strokeWidth={2} cornerRadius={6}>
                    {mainData.map((d) => <Cell key={d.key} fill={CAL_COLORS[d.key]} />)}
                  </Pie>
                  <Tooltip formatter={(val, _n, p) => [fmtCal(Number(val), loteTotalKg), p?.payload?.name]} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                </PieChart>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{calNum(loteTotalKg)}</div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>{calUnidad === "cestas" ? "cestas" : "kg"} totales</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 10 }}>
                {mainData.map((d) => {
                  const ratio = loteTotalKg > 0 ? (d.value / loteTotalKg) * 100 : 0;
                  return (
                    <div key={d.key} data-testid={`plant-calidad-legend-${d.key}`} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 12, height: 12, borderRadius: 4, background: CAL_COLORS[d.key], flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: 13.5, color: "#334155" }}>{d.name}</span>
                          <span style={{ fontSize: 12.5, color: "#0f172a", fontWeight: 700 }}>{fmtCal(d.value, loteTotalKg)}</span>
                        </div>
                        <div style={{ height: 6, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                          <div style={{ width: `${ratio}%`, height: "100%", borderRadius: 999, background: CAL_COLORS[d.key], transition: "width .4s ease" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Rendimiento por planta — al lado de Calidades del lote */}
        <div className="card" style={{ flex: "1 1 320px", minWidth: 0, marginTop: 0 }} data-testid="plant-rendimiento-card">
          <h3 style={{ marginTop: 0, marginBottom: 2, fontSize: 15 }}>Rendimiento por planta</h3>
          <p style={{ color: "#64748b", marginTop: 0, marginBottom: 14, fontSize: 12 }}>
            Kg totales cosechados de cada variedad ÷ cantidad de plantas registradas.
          </p>
          <table className="table">
            <thead>
              <tr><th>Tipo de fruta</th><th>Variedad</th><th style={{ textAlign: "right" }}>Plantas</th><th style={{ textAlign: "right" }}>Rend./planta</th></tr>
            </thead>
            <tbody>
              {filasRend.map((f, i) => (
                <tr key={i} data-testid="plant-rendimiento-row">
                  <td>{f.tipo}</td>
                  <td><span className="badge badge-purple">{f.variedad}</span></td>
                  <td style={{ textAlign: "right", fontWeight: 600 }} data-testid="plant-rendimiento-plantas">{f.plantas > 0 ? f.plantas.toLocaleString("es-ES") : "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {f.rendimiento != null
                      ? <>
                          <div style={{ fontWeight: 700, color: "#16a34a", fontSize: 14 }}>{f.rendimiento.toFixed(2)} kg/planta</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{f.kg.toFixed(2)} kg ÷ {f.plantas.toLocaleString("es-ES")}</div>
                        </>
                      : <span style={{ color: "#94a3b8" }} title="Registra la cantidad de plantas de esta variedad en la plantación">Sin plantas ({f.kg.toFixed(2)} kg)</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gráficos secundarios: calidades por variedad */}
      {variedadCharts.some((v) => v.total > 0) && (
        <div className="card" style={{ marginTop: 18, padding: 0, overflow: "hidden", border: "1px solid #e2e8f0" }} data-testid="plant-calidades-variedad-chart">
          <ChartHeader icon={Apple} iconBg="#dc2626" title="Calidades por variedad" subtitle="Distribución de calidades (1ª, 2ª, 3ª y descarte) por cada variedad." right={calToggle} />
          <div style={{ padding: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
              {variedadCharts.filter((v) => v.total > 0).map((v) => (
                <div key={v.variedad} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, background: "#fff" }} data-testid={`plant-variedad-chart-${v.variedad}`}>
                  <div style={{ fontWeight: 700, marginBottom: 8, textAlign: "center", color: "#7c3aed", textTransform: "capitalize" }}>{v.variedad}</div>
                  <div style={{ width: 150, height: 150, position: "relative", margin: "0 auto" }}>
                    <PieChart width={150} height={150}>
                      <Pie data={v.data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} stroke="#fff" strokeWidth={2} cornerRadius={5}>
                        {v.data.map((d) => <Cell key={d.key} fill={CAL_COLORS[d.key]} />)}
                      </Pie>
                      <Tooltip formatter={(val, _n, p) => [fmtCal(Number(val), v.total), p?.payload?.name]} contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
                    </PieChart>
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{calNum(v.total)}</div>
                      <div style={{ fontSize: 9.5, color: "#64748b", textTransform: "uppercase" }}>{calUnidad === "cestas" ? "cestas" : "kg"}</div>
                    </div>
                  </div>
                  {/* Desglose por calidad (fuera del gráfico), en la unidad activa */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                    {v.data.map((d) => {
                      const ratio = v.total > 0 ? (d.value / v.total) * 100 : 0;
                      return (
                        <div key={d.key} data-testid={`plant-variedad-legend-${v.variedad}-${d.key}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 11, height: 11, borderRadius: 4, background: CAL_COLORS[d.key], flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                              <span style={{ fontWeight: 600, fontSize: 12.5, color: "#334155" }}>{d.name}</span>
                              <span style={{ fontSize: 12, color: "#0f172a", fontWeight: 700 }}>{fmtCal(d.value, v.total)}</span>
                            </div>
                            <div style={{ height: 5, borderRadius: 999, background: "#f1f5f9", overflow: "hidden" }}>
                              <div style={{ width: `${ratio}%`, height: "100%", borderRadius: 999, background: CAL_COLORS[d.key], transition: "width .4s ease" }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Registro de cosecha — movido al final, debajo de Calidades por variedad */}
      <div className="card" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Registro de cosecha · {itemsF.length}{itemsF.length !== items.length ? ` de ${items.length}` : ""}</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: "#dc2626", fontSize: 16, fontWeight: 700 }} data-testid="plant-cosecha-total">Total: {totalGeneral.toFixed(2)} {u}</span>
            <div className="pill-group" style={{ display: "inline-flex", gap: 6 }}>
              <button type="button" className={`pill ${unidadVista === "cestas" ? "active" : ""}`} onClick={() => setUnidadVista("cestas")} data-testid="plant-cosecha-unidad-cestas">Cestas</button>
              <button type="button" className={`pill ${unidadVista === "kg" ? "active" : ""}`} onClick={() => setUnidadVista("kg")} data-testid="plant-cosecha-unidad-kg">kg</button>
            </div>
          </div>
        </div>
        <p style={{ color: "#64748b", marginTop: 6, marginBottom: 14, fontSize: 12 }}>
          Registros de cosecha de este lote (provenientes del módulo Cosecha). Cantidades mostradas en <b>{u}</b>.
        </p>

        {/* Filtros: período + variedad */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginBottom: 14, padding: 12, background: "#f8fafc", borderRadius: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Periodo</div>
            <div className="pill-group" data-testid="cosecha-filtro-periodo" style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {[["hoy", "Hoy"], ["semana", "Semana"], ["mes", "Mes"], ["año", "Año"], ["todo", "Todo"]].map(([k, l]) => (
                <button key={k} type="button" className={`pill ${period === k ? "active" : ""}`} onClick={() => setPeriod(k)} data-testid={`cosecha-filtro-periodo-${k}`}>{l}</button>
              ))}
              <PeriodPicker isMonth={period === "mes"} isYear={period === "año"} mes={mesSel} setMes={setMesSel} anio={anioSel} setAnio={setAnioSel} years={years} testidPrefix="cosecha-filtro" />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Variedad</div>
            <select className="select" value={filtroVariedad} onChange={(e) => setFiltroVariedad(e.target.value)} data-testid="cosecha-filtro-variedad" style={{ minWidth: 180 }}>
              <option value="">Todas las variedades</option>
              {variedadesDisponibles.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          {(period !== "todo" || filtroVariedad) && (
            <button type="button" className="btn btn-sm" onClick={limpiarFiltros} data-testid="cosecha-filtro-limpiar">Limpiar filtros</button>
          )}
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th><th>Tipo Fruta</th><th>Variedad</th>
              <th>1ª ({u})</th><th>2ª ({u})</th><th>3ª ({u})</th><th>Descarte ({u})</th><th>Total ({u})</th>
            </tr>
          </thead>
          <tbody>
            {itemsF.map((c) => {
              const m = multDe(c);
              return (
                <tr key={c._id} data-testid="cosecha-row">
                  <td>{c.fecha_cosecha ? new Date(c.fecha_cosecha).toLocaleDateString() : "—"}</td>
                  <td>{labelTipo(c)}</td>
                  <td>{labelVar(c)}</td>
                  <td style={{ color: "#16a34a", fontWeight: 600 }}>{((c.primera_calidad || 0) * m).toFixed(2)}</td>
                  <td style={{ color: "#3b82f6" }}>{((c.segunda_calidad || 0) * m).toFixed(2)}</td>
                  <td style={{ color: "#f59e0b" }}>{((c.tercera_calidad || 0) * m).toFixed(2)}</td>
                  <td style={{ color: "#dc2626" }}>{((c.descarte || 0) * m).toFixed(2)}</td>
                  <td style={{ fontWeight: 700 }}>{(totalDe(c) * m).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {itemsF.length === 0 && <div className="empty-state">Sin cosechas para los filtros aplicados</div>}
      </div>
    </>
  );
}

function ResumenCard({ label, value, color, testid }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #eef2f7", borderRadius: 10, padding: "12px 14px" }} data-testid={testid}>
      <div style={{ fontSize: 10.5, color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.4, lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function ChartHeader({ icon: Icon, iconBg, title, subtitle, right }) {
  return (
    <div style={{ background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)", padding: "18px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 9, fontSize: 16, color: "#0f172a" }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 9, background: iconBg, color: "#fff" }}>
            <Icon size={17} />
          </span>
          {title}
        </h3>
        {subtitle && <p style={{ margin: "6px 0 0 39px", color: "#64748b", fontSize: 12.5 }}>{subtitle}</p>}
      </div>
      {right && <div style={{ flexShrink: 0 }}>{right}</div>}
    </div>
  );
}