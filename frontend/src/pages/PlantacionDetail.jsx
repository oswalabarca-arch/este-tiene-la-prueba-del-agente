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

const TABS = [
  { key: "general",      label: "General",            icon: Sprout,    color: "#16a34a" },
  { key: "aplicaciones", label: "Aplicaciones",        icon: Droplets,  color: "#3b82f6" },
  { key: "labores",      label: "Labores de personal", icon: UsersIcon, color: "#8b5cf6" },
  { key: "cosechas",     label: "Cosechas",            icon: Apple,     color: "#dc2626" },
];

const PALE_BG = "#f1f8f1";

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
                  <Field label="Inventario (plantas)" value={plantacion.inventario_plantas ?? 0} />
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
          {tab === "cosechas"     && <CosechasTab items={cosLote} tipos={tipos} variedades={variedades} />}
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

function CosechasTab({ items, tipos, variedades }) {
  if (items.length === 0) return <div className="card empty-state">Sin cosechas registradas en este lote</div>;
  const labelTipo = (id) => tipos.find((t) => t._id === id)?.nombre || id;
  const labelVar = (id) => variedades.find((v) => v._id === id)?.nombre || id;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Cosechas · {items.length}</h3>
      <table className="table">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Variedad</th><th>Cestas</th><th>Peso (Kg)</th></tr></thead>
        <tbody>
          {items.map((c) => (
            <tr key={c._id}>
              <td>{new Date(c.fecha).toLocaleDateString()}</td>
              <td>{labelTipo(c.tipo_fruta_id)}</td>
              <td>{labelVar(c.variedad_id)}</td>
              <td>{c.cantidad_cestas}</td>
              <td>{c.peso_kg}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
