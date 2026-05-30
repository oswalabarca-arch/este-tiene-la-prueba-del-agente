import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import {
  ArrowLeft, Pencil, Trash2, MapPin, Calendar, Droplet, Sprout, ImageOff,
  Droplets, Users as UsersIcon, Apple, Info,
} from "lucide-react";

const TABS = [
  { key: "general", label: "Información general", icon: Info, color: "#16a34a" },
  { key: "aplicaciones", label: "Aplicaciones", icon: Droplets, color: "#3b82f6" },
  { key: "labores", label: "Labores de personal", icon: UsersIcon, color: "#8b5cf6" },
  { key: "cosechas", label: "Cosechas", icon: Apple, color: "#dc2626" },
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
  const aplicLote = useMemo(() => aplicaciones.filter((a) => a.lote === lote), [aplicaciones, lote]);
  const activLote = useMemo(() => actividades.filter((a) => a.lote === lote), [actividades, lote]);
  const cosLote = useMemo(() => cosechas.filter((c) => c.lote === lote), [cosechas, lote]);

  if (!plantacion) {
    return (
      <div>
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

  const cultivos = plantacion.cultivos?.length ? plantacion.cultivos : (plantacion.cultivo ? [plantacion.cultivo] : []);
  const variedadesP = plantacion.variedades?.length ? plantacion.variedades : (plantacion.variedad ? [plantacion.variedad] : []);

  return (
    <div data-testid="plantacion-detail-page">
      <button className="btn" onClick={() => navigate("/dashboard/plantaciones")} style={{ marginBottom: 18 }} data-testid="plant-detail-back"><ArrowLeft size={16} /> Volver a plantaciones</button>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, gap: 16 }}>
        <div>
          <h1 className="page-title"><Sprout size={26} style={{ verticalAlign: "middle", color: "#16a34a" }} /> {plantacion.nombre}</h1>
          <p className="page-subtitle">
            <MapPin size={14} style={{ verticalAlign: "middle" }} /> Lote <b>{plantacion.lote}</b> · {plantacion.superficie_geometrica || 0} m² · {plantacion.tipo_plantacion}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit("plantaciones") && <button className="btn" onClick={() => navigate("/dashboard/plantaciones", { state: { edit: plantacion._id } })} data-testid="plant-detail-edit"><Pencil size={14} /> Editar</button>}
          {canDelete("plantaciones") && <button className="btn btn-danger" onClick={remove} data-testid="plant-detail-delete"><Trash2 size={14} /> Eliminar</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, borderBottom: "1px solid #e2e8f0", paddingBottom: 0 }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const counts = t.key === "aplicaciones" ? aplicLote.length : t.key === "labores" ? activLote.length : t.key === "cosechas" ? cosLote.length : null;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                background: "transparent", border: "none", padding: "10px 16px", cursor: "pointer",
                color: active ? t.color : "#64748b", fontWeight: active ? 700 : 500,
                borderBottom: active ? `3px solid ${t.color}` : "3px solid transparent",
                display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: -1,
              }}
              data-testid={`plant-tab-${t.key}`}
            >
              <Icon size={16} /> {t.label}
              {counts !== null && <span className="badge" style={{ background: t.color + "22", color: t.color, fontSize: 11 }}>{counts}</span>}
            </button>
          );
        })}
      </div>

      {tab === "general" && (
        <GeneralTab plantacion={plantacion} cultivos={cultivos} variedadesP={variedadesP} />
      )}
      {tab === "aplicaciones" && <AplicacionesTab items={aplicLote} />}
      {tab === "labores" && <LaboresTab items={activLote} />}
      {tab === "cosechas" && <CosechasTab items={cosLote} tipos={tipos} variedades={variedades} />}
    </div>
  );
}

function GeneralTab({ plantacion, cultivos, variedadesP }) {
  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card">
          <div className="kpi-head"><div className="kpi-label">Superficie</div><div className="kpi-icon-box" style={{ background: "#dcfce7", color: "#16a34a" }}><MapPin size={18} /></div></div>
          <div className="kpi-value">{plantacion.superficie_geometrica || 0}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>m²</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-head"><div className="kpi-label">Fecha siembra</div><div className="kpi-icon-box" style={{ background: "#dbeafe", color: "#3b82f6" }}><Calendar size={18} /></div></div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{plantacion.fecha_inicio ? new Date(plantacion.fecha_inicio).toLocaleDateString() : "—"}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-head"><div className="kpi-label">Fecha finalización</div><div className="kpi-icon-box" style={{ background: "#fef3c7", color: "#f59e0b" }}><Calendar size={18} /></div></div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{plantacion.fecha_finalizacion ? new Date(plantacion.fecha_finalizacion).toLocaleDateString() : "—"}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-head"><div className="kpi-label">Sistema de riego</div><div className="kpi-icon-box" style={{ background: "#e0f2fe", color: "#0ea5e9" }}><Droplet size={18} /></div></div>
          <div className="kpi-value" style={{ fontSize: 18 }}>{plantacion.sistema_riego || "—"}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Cultivos y variedades</h3>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>Tipos de cultivo</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {cultivos.length > 0 ? cultivos.map((c) => <span key={c} className="badge badge-primary">{c}</span>) : <span style={{ color: "#94a3b8", fontSize: 13 }}>Sin cultivos</span>}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>Variedades</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {variedadesP.length > 0 ? variedadesP.map((v) => <span key={v} className="badge badge-purple">{v}</span>) : <span style={{ color: "#94a3b8", fontSize: 13 }}>Sin variedades</span>}
            </div>
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Identificación</h3>
          <Row label="Lote" value={plantacion.lote} />
          <Row label="Tipo" value={plantacion.tipo_plantacion} />
          {plantacion.recinto_agronomico && <Row label="Recinto" value={plantacion.recinto_agronomico} />}
        </div>
      </div>

      {/* Fotos */}
      <div className="card" style={{ marginBottom: 18 }}>
        <h3 style={{ marginTop: 0 }}>Fotos del lote</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <PhotoBox value={plantacion.foto_principal} label="Foto principal" />
          <PhotoBox value={plantacion.foto_secundaria} label="Foto secundaria" />
        </div>
      </div>

      {plantacion.observaciones && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Observaciones</h3>
          <p style={{ color: "#334155", whiteSpace: "pre-wrap", margin: 0 }}>{plantacion.observaciones}</p>
        </div>
      )}
    </>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ color: "#64748b", fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: 600, fontSize: 14 }}>{value}</span>
    </div>
  );
}

function PhotoBox({ value, label }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 6 }}>{label}</div>
      <div style={{ height: 220, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {value ? <img src={value} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageOff size={40} color="#cbd5e1" />}
      </div>
    </div>
  );
}

function AplicacionesTab({ items }) {
  if (items.length === 0) return <div className="card empty-state">Sin aplicaciones registradas en este lote</div>;
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Aplicaciones · {items.length}</h3>
      <table className="table">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Insumos</th><th>Estado</th></tr></thead>
        <tbody>
          {items.map((a) => (
            <tr key={a._id}>
              <td>{new Date(a.fecha).toLocaleDateString()}</td>
              <td><span className="badge badge-info">{a.tipo}</span></td>
              <td style={{ fontSize: 13, color: "#64748b" }}>{a.insumos?.map((i) => `${i.nombre_producto} ${i.cantidad}${i.unidad}`).join(", ") || "—"}</td>
              <td>{a.estado === "confirmada" ? <span className="badge badge-primary">Confirmada</span> : <span className="badge badge-warn">Pendiente</span>}</td>
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
  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="card kpi-card"><div className="kpi-label">Labores</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Horas-hombre acumuladas</div><div className="kpi-value" style={{ color: "#8b5cf6" }}>{totalHH.toFixed(1)}</div></div>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Trabajadores</th><th>Horas</th><th>Horas-hombre</th></tr></thead>
          <tbody>
            {items.map((a) => (
              <tr key={a._id}>
                <td>{new Date(a.fecha_actividad).toLocaleDateString()}</td>
                <td><span className="badge badge-purple">{a.tipo_personalizado || a.tipo}</span></td>
                <td>{a.cantidad_trabajadores}</td>
                <td>{a.horas_trabajo}</td>
                <td style={{ fontWeight: 700 }}>{a.horas_hombre || 0}</td>
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
  const total = items.reduce((s, c) => s + (c.primera_calidad + c.segunda_calidad + c.tercera_calidad + c.descarte), 0);
  const primera = items.reduce((s, c) => s + c.primera_calidad, 0);
  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 14 }}>
        <div className="card kpi-card"><div className="kpi-label">Cosechas</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Volumen total</div><div className="kpi-value" style={{ color: "#16a34a" }}>{total.toFixed(2)}</div></div>
        <div className="card kpi-card"><div className="kpi-label">1ª calidad</div><div className="kpi-value" style={{ color: "#16a34a" }}>{primera.toFixed(2)}</div></div>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Tipo Fruta</th><th>Variedad</th><th>1ª</th><th>2ª</th><th>3ª</th><th>Descarte</th><th>Unidad</th></tr></thead>
          <tbody>
            {items.map((c) => {
              const t = tipos.find((x) => x._id === c.tipo_fruta_id);
              const v = variedades.find((x) => x._id === c.variedad_id);
              return (
                <tr key={c._id}>
                  <td>{new Date(c.fecha_cosecha).toLocaleDateString()}</td>
                  <td>{t?.nombre || "—"}</td>
                  <td>{v?.nombre || "—"}</td>
                  <td style={{ color: "#16a34a", fontWeight: 600 }}>{c.primera_calidad}</td>
                  <td style={{ color: "#3b82f6" }}>{c.segunda_calidad}</td>
                  <td style={{ color: "#f59e0b" }}>{c.tercera_calidad}</td>
                  <td style={{ color: "#dc2626" }}>{c.descarte}</td>
                  <td>{c.unidad}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
