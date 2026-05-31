import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import {
  ArrowLeft, Pencil, Trash2, ImagePlus,
  Droplets, Users as UsersIcon, Apple, Sprout,
} from "lucide-react";
import { catBadge, actBadge } from "../lib/categoryColors";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
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
const CAL_DEFS = [
  { key: "primera", name: "Primera", field: "primera_calidad" },
  { key: "segunda", name: "Segunda", field: "segunda_calidad" },
  { key: "tercera", name: "Tercera", field: "tercera_calidad" },
  { key: "descarte", name: "Descarte", field: "descarte" },
];

// Etiqueta de porcentaje DENTRO de cada porción (evita que el recuadro corte los % afuera)
const renderPctLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (!percent || percent < 0.06) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#fff" fontSize={11} fontWeight={700} textAnchor="middle" dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

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
  if (items.length === 0) return <div className="card empty-state">Sin aplicaciones registradas en este lote</div>;
  const totalCosto = items.reduce((s, a) => s + (a.costo_insumos || 0), 0);
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>
        Aplicaciones · {items.length}
        <span style={{ float: "right", color: "#16a34a", fontSize: 16 }}>
          Costo total (PEPS): ${totalCosto.toFixed(2)}
        </span>
      </h3>
      <p style={{ color: "#64748b", marginTop: -4, fontSize: 12 }}>
        Costo calculado por método PEPS (primero en entrar, primero en salir) usando los precios históricos de compras.
      </p>
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
          {items.map((a) => (
            <tr key={a._id}>
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
    </div>
  );
}

function LaboresTab({ items }) {
  if (items.length === 0) return <div className="card empty-state">Sin labores registradas en este lote</div>;
  const totalHH = items.reduce((s, a) => s + (a.horas_hombre || 0), 0);
  const totalCosto = items.reduce((s, a) => s + (a.costo_total || 0), 0);
  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="card kpi-card"><div className="kpi-label">Labores</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Horas-hombre acumuladas</div><div className="kpi-value" style={{ color: "#8b5cf6" }}>{totalHH.toFixed(2)}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Costo mano de obra</div><div className="kpi-value" style={{ color: "#16a34a" }}>${totalCosto.toFixed(2)}</div></div>
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

  return (
    <>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Cosechas · {itemsF.length}{itemsF.length !== items.length ? ` de ${items.length}` : ""}</h3>
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

      {/* Fila: Calidades del lote (mitad) + Rendimiento por planta (mitad) */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 18, alignItems: "stretch" }}>
        {loteTotalKg > 0 && (
          <div className="card" style={{ flex: "1 1 320px", minWidth: 0, marginTop: 0 }} data-testid="plant-calidades-chart">
            <h3 style={{ marginTop: 0, marginBottom: 2 }}>Calidades del lote</h3>
            <p style={{ color: "#64748b", marginTop: 0, marginBottom: 10, fontSize: 12 }}>
              Distribución de calidades en porcentaje. Rendimiento total: <b style={{ color: "#16a34a" }}>{loteTotalKg.toFixed(2)} kg</b>.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
              <div style={{ width: 190, height: 190, position: "relative", flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={mainData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="none">
                      {mainData.map((d) => <Cell key={d.key} fill={CAL_COLORS[d.key]} />)}
                    </Pie>
                    <Tooltip formatter={(val) => [`${Number(val).toFixed(2)} kg (${((Number(val) / loteTotalKg) * 100).toFixed(1)}%)`, ""]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
                  <div style={{ fontSize: 10, color: "#64748b" }}>Rendimiento</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#16a34a" }}>{loteTotalKg.toFixed(0)}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>kg</div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160, flex: 1 }}>
                {mainData.map((d) => {
                  const pct = loteTotalKg > 0 ? (d.value / loteTotalKg) * 100 : 0;
                  return (
                    <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 8 }} data-testid={`plant-calidad-legend-${d.key}`}>
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: CAL_COLORS[d.key], flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{d.name}</span>
                      <span style={{ marginLeft: "auto", color: "#475569", fontWeight: 600, fontSize: 13 }}>{pct.toFixed(1)}%</span>
                      <span style={{ color: "#94a3b8", minWidth: 66, textAlign: "right", fontSize: 12 }}>{d.value.toFixed(2)} kg</span>
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
        <div className="card" style={{ marginTop: 18 }} data-testid="plant-calidades-variedad-chart">
          <h3 style={{ marginTop: 0, marginBottom: 2 }}>Calidades por variedad</h3>
          <p style={{ color: "#64748b", marginTop: 0, marginBottom: 12, fontSize: 12 }}>Porcentaje de cada calidad (1ª, 2ª, 3ª y descarte) por variedad.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
            {variedadCharts.filter((v) => v.total > 0).map((v) => (
              <div key={v.variedad} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }} data-testid={`plant-variedad-chart-${v.variedad}`}>
                <div style={{ fontWeight: 700, marginBottom: 6, textAlign: "center", color: "#7c3aed" }}>{v.variedad}</div>
                <div style={{ width: "100%", height: 180 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                      <Pie data={v.data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72} label={renderPctLabel} labelLine={false} stroke="#fff" strokeWidth={1}>
                        {v.data.map((d) => <Cell key={d.key} fill={CAL_COLORS[d.key]} />)}
                      </Pie>
                      <Tooltip formatter={(val, name) => [`${Number(val).toFixed(2)} kg (${((Number(val) / v.total) * 100).toFixed(1)}%)`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", marginTop: 4 }}>Total: {v.total.toFixed(2)} kg</div>
              </div>
            ))}
          </div>
          {/* Leyenda compartida */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: 14 }}>
            {CAL_DEFS.map((d) => (
              <div key={d.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: CAL_COLORS[d.key] }} />
                <span style={{ fontSize: 12, color: "#475569" }}>{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
