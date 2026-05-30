// Submenús de Plantaciones: muestran información de otros módulos agrupada por lote
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { Droplets, Users as UsersIcon, Apple, Sprout, ChevronDown, ChevronRight, MapPin } from "lucide-react";

function PlantacionRelacionada({ tipo }) {
  const [plantaciones, setPlantaciones] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [expanded, setExpanded] = useState({});  // { lote: true/false }
  const [tipos, setTipos] = useState([]);
  const [variedades, setVariedades] = useState([]);

  const META = {
    aplicaciones: { label: "Aplicaciones", icon: Droplets, color: "#16a34a", endpoint: "/aplicaciones", key: "aplicaciones", emptyMsg: "Sin aplicaciones registradas en este lote" },
    labores: { label: "Labores de personal", icon: UsersIcon, color: "#3b82f6", endpoint: "/actividades", key: "actividades", emptyMsg: "Sin labores registradas en este lote" },
    cosechas: { label: "Cosechas", icon: Apple, color: "#dc2626", endpoint: "/cosechas", key: "cosechas", emptyMsg: "Sin cosechas registradas en este lote" },
  };
  const m = META[tipo];
  const Icon = m.icon;

  useEffect(() => {
    Promise.all([
      api.get("/plantaciones"),
      api.get(m.endpoint),
      tipo === "cosechas" ? api.get("/tipos-fruta") : Promise.resolve({ data: { tipos_fruta: [] } }),
      tipo === "cosechas" ? api.get("/variedades-fruta") : Promise.resolve({ data: { variedades: [] } }),
    ]).then(([p, r, t, v]) => {
      setPlantaciones(p.data.plantaciones);
      setRegistros(r.data[m.key] || []);
      setTipos(t.data.tipos_fruta || []);
      setVariedades(v.data.variedades || []);
    });
  }, [tipo]);

  const porLote = useMemo(() => {
    const acc = {};
    registros.forEach((r) => {
      const lote = r.lote || "Sin lote";
      if (!acc[lote]) acc[lote] = [];
      acc[lote].push(r);
    });
    return acc;
  }, [registros]);

  const toggle = (lote) => setExpanded((o) => ({ ...o, [lote]: !o[lote] }));

  return (
    <div data-testid={`plantaciones-${tipo}-page`}>
      <h1 className="page-title"><Sprout style={{ display: "inline", verticalAlign: "middle", color: "#16a34a" }} /> Plantaciones · <span style={{ color: m.color }}>{m.label}</span></h1>
      <p className="page-subtitle">{m.label} agrupadas por lote/plantación. Los registros provienen del módulo {m.label.toLowerCase()}.</p>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card">
          <div className="kpi-head"><div className="kpi-label">Plantaciones</div><div className="kpi-icon-box" style={{ background: "#dcfce7", color: "#16a34a" }}><Sprout size={18} /></div></div>
          <div className="kpi-value">{plantaciones.length}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-head"><div className="kpi-label">Total {m.label.toLowerCase()}</div><div className="kpi-icon-box" style={{ background: m.color + "22", color: m.color }}><Icon size={18} /></div></div>
          <div className="kpi-value" style={{ color: m.color }}>{registros.length}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Lotes con registros</div>
          <div className="kpi-value">{Object.keys(porLote).length}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {plantaciones.map((p) => {
          const items = porLote[p.lote] || [];
          const isOpen = expanded[p.lote] ?? false;
          return (
            <div key={p._id} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => toggle(p.lote)}
                style={{ width: "100%", background: "transparent", border: "none", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left" }}
                data-testid={`plant-row-${p.lote}-toggle`}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.nombre}</div>
                    <div style={{ color: "#64748b", fontSize: 13, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <MapPin size={12} /> Lote {p.lote} · {(p.cultivos?.length ? p.cultivos : (p.cultivo ? [p.cultivo] : ["sin cultivo"])).join(", ")}
                    </div>
                  </div>
                </div>
                <span className="badge" style={{ background: m.color + "22", color: m.color }}>{items.length} {m.label.toLowerCase()}</span>
              </button>
              {isOpen && (
                <div style={{ borderTop: "1px solid #e2e8f0", padding: "12px 20px 16px" }}>
                  {items.length === 0 ? (
                    <div style={{ color: "#94a3b8", padding: "16px 0", textAlign: "center", fontSize: 14 }}>{m.emptyMsg}</div>
                  ) : (
                    <RecordsTable tipo={tipo} items={items} tipos={tipos} variedades={variedades} />
                  )}
                </div>
              )}
            </div>
          );
        })}
        {plantaciones.length === 0 && <div className="empty-state card">No hay plantaciones registradas. Crea una primero en el módulo Plantaciones.</div>}
      </div>
    </div>
  );
}

function RecordsTable({ tipo, items, tipos, variedades }) {
  if (tipo === "aplicaciones") {
    return (
      <table className="table">
        <thead><tr><th>Fecha</th><th>Tipo</th><th>Insumos</th><th>Estado</th></tr></thead>
        <tbody>
          {items.map((a) => (
            <tr key={a._id}>
              <td>{new Date(a.fecha).toLocaleDateString()}</td>
              <td><span className="badge badge-info">{a.tipo}</span></td>
              <td style={{ fontSize: 13 }}>{a.insumos?.length || 0} insumo(s)</td>
              <td>{a.estado === "confirmada" ? <span className="badge badge-primary">Confirmada</span> : <span className="badge badge-warn">Pendiente</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (tipo === "labores") {
    return (
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
    );
  }
  // cosechas
  return (
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
  );
}

export function PlantacionesAplicaciones() { return <PlantacionRelacionada tipo="aplicaciones" />; }
export function PlantacionesLabores() { return <PlantacionRelacionada tipo="labores" />; }
export function PlantacionesCosechas() { return <PlantacionRelacionada tipo="cosechas" />; }
