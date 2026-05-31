import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Briefcase, Plus, Pencil, Trash2, DollarSign } from "lucide-react";
import { actBadge } from "../lib/categoryColors";

export function Trabajadores() {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/trabajadores").then((r) => setItems(r.data.trabajadores));
  useEffect(() => { load(); }, []);

  const remove = async (t) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/trabajadores/${t._id}`);
    load();
  };

  return (
    <div data-testid="trabajadores-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Briefcase size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Trabajadores</h1>
          <p className="page-subtitle">Gestiona el personal vinculado a las actividades de campo.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Nuevo trabajador</button>
      </div>

      <div className="card">
        <table className="table">
          <thead><tr><th>Nombre</th><th>Documento</th><th>Cargo</th><th>Salario diario</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {items.map((t) => (
              <tr key={t._id}>
                <td style={{ fontWeight: 600 }}>{t.nombre_completo}</td>
                <td>{t.documento}</td>
                <td>{t.cargo}</td>
                <td>${t.salario_diario}</td>
                <td>{t.activo ? <span className="badge badge-primary">Activo</span> : <span className="badge badge-rose">Inactivo</span>}</td>
                <td>
                  {canEdit("recursos_humanos") && <button className="btn-icon" onClick={() => setEditing(t)}><Pencil size={16} /></button>}
                  {canDelete("recursos_humanos") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(t)}><Trash2 size={16} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty-state">Sin trabajadores</div>}
      </div>

      {editing && <TrabajadorModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function TrabajadorModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const [form, setForm] = useState({ nombre_completo: "", documento: "", telefono: "", cargo: "", salario_diario: 0, fecha_ingreso: "", activo: true, ...initial });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, salario_diario: Number(form.salario_diario) };
      if (isNew) await api.post("/trabajadores", payload);
      else await api.put(`/trabajadores/${initial._id}`, payload);
      toast.show("Guardado");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="modal-title">{isNew ? "Nuevo trabajador" : "Editar trabajador"}</h2>
        <div className="form-grid">
          <div className="field"><label>Nombre completo</label><input className="input" value={form.nombre_completo} onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} required /></div>
          <div className="field"><label>Documento</label><input className="input" value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} /></div>
          <div className="field"><label>Teléfono</label><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
          <div className="field"><label>Cargo</label><input className="input" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></div>
          <div className="field"><label>Salario diario</label><input type="number" className="input" value={form.salario_diario} onChange={(e) => setForm({ ...form, salario_diario: e.target.value })} /></div>
          <div className="field"><label>Activo</label><select className="select" value={form.activo ? "1" : "0"} onChange={(e) => setForm({ ...form, activo: e.target.value === "1" })}><option value="1">Sí</option><option value="0">No</option></select></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>Guardar</button>
        </div>
      </form>
    </div>
  );
}

export function Nomina() {
  const [actividades, setActividades] = useState([]);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroLote, setFiltroLote] = useState("");
  const [filtroPeriodo, setFiltroPeriodo] = useState("todos");

  useEffect(() => {
    api.get("/actividades").then((r) => setActividades(r.data.actividades));
  }, []);

  // Filtro por periodo
  const inPeriodo = (fechaStr) => {
    if (filtroPeriodo === "todos") return true;
    const f = new Date(fechaStr);
    if (isNaN(f.getTime())) return false;
    const now = new Date();
    if (filtroPeriodo === "hoy") return f.toDateString() === now.toDateString();
    if (filtroPeriodo === "semana") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return f >= start && f < end;
    }
    if (filtroPeriodo === "mes") return f.getMonth() === now.getMonth() && f.getFullYear() === now.getFullYear();
    if (filtroPeriodo === "ano") return f.getFullYear() === now.getFullYear();
    return true;
  };

  const tiposUnicos = Array.from(new Set(actividades.map((a) => a.tipo_personalizado || a.tipo).filter(Boolean))).sort();
  const lotesUnicos = Array.from(new Set(actividades.map((a) => a.lote).filter(Boolean))).sort();

  const actividadesFiltradas = actividades.filter((a) => {
    if (!inPeriodo(a.fecha_actividad)) return false;
    if (filtroTipo && (a.tipo_personalizado || a.tipo) !== filtroTipo) return false;
    if (filtroLote && a.lote !== filtroLote) return false;
    return true;
  });

  // Resumen general (sobre datos filtrados, así KPIs reflejan los filtros activos)
  const horasTotales = actividadesFiltradas.reduce((s, a) => s + (a.horas_hombre || 0), 0);
  const costoTotal = actividadesFiltradas.reduce((s, a) => s + (a.costo_total || 0), 0);

  // Agrupar costos por origen
  const costoPorOrigen = actividadesFiltradas.reduce((acc, a) => {
    const k = a.origen || "registro_manual";
    if (!acc[k]) acc[k] = { horas: 0, costo: 0, count: 0 };
    acc[k].horas += (a.horas_hombre || 0);
    acc[k].costo += (a.costo_total || 0);
    acc[k].count += 1;
    return acc;
  }, {});

  // Agrupar por lote (para visibilidad rápida del gasto de mano de obra por lote)
  const costoPorLote = actividadesFiltradas.reduce((acc, a) => {
    const k = a.lote || "Sin lote";
    if (!acc[k]) acc[k] = { horas: 0, costo: 0, count: 0 };
    acc[k].horas += (a.horas_hombre || 0);
    acc[k].costo += (a.costo_total || 0);
    acc[k].count += 1;
    return acc;
  }, {});

  const limpiarFiltros = () => { setFiltroTipo(""); setFiltroLote(""); setFiltroPeriodo("todos"); };
  const filtrosActivos = filtroTipo || filtroLote || filtroPeriodo !== "todos";

  return (
    <div data-testid="nomina-page">
      <h1 className="page-title"><DollarSign size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Nómina</h1>
      <p className="page-subtitle">Resumen de mano de obra basado en las aplicaciones confirmadas y actividades registradas.</p>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Horas-hombre {filtrosActivos ? "(filtradas)" : "acumuladas"}</div><div className="kpi-value">{horasTotales.toFixed(1)} h</div></div>
        <div className="card kpi-card"><div className="kpi-label">Costo {filtrosActivos ? "(filtrado)" : "total"} mano de obra</div><div className="kpi-value" style={{ color: "#16a34a" }}>${costoTotal.toFixed(2)}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Actividades {filtrosActivos ? "(filtradas)" : "registradas"}</div><div className="kpi-value">{actividadesFiltradas.length}</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Costo por origen</h3>
          <table className="table">
            <thead><tr><th>Origen</th><th>Actividades</th><th>Horas-H</th><th>Costo</th></tr></thead>
            <tbody>
              {Object.entries(costoPorOrigen).map(([k, v]) => (
                <tr key={k}>
                  <td><span className="badge badge-info">{k}</span></td>
                  <td>{v.count}</td>
                  <td>{v.horas.toFixed(1)}</td>
                  <td style={{ fontWeight: 700, color: "#16a34a" }}>${v.costo.toFixed(2)}</td>
                </tr>
              ))}
              {Object.keys(costoPorOrigen).length === 0 && <tr><td colSpan="4" style={{ textAlign: "center", color: "#94a3b8" }}>Sin actividades</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Costo por lote</h3>
          <table className="table">
            <thead><tr><th>Lote</th><th>Actividades</th><th>Horas-H</th><th>Costo</th></tr></thead>
            <tbody>
              {Object.entries(costoPorLote).map(([k, v]) => (
                <tr key={k}>
                  <td><span className="badge badge-primary">{k}</span></td>
                  <td>{v.count}</td>
                  <td>{v.horas.toFixed(1)}</td>
                  <td style={{ fontWeight: 700, color: "#16a34a" }}>${v.costo.toFixed(2)}</td>
                </tr>
              ))}
              {Object.keys(costoPorLote).length === 0 && <tr><td colSpan="4" style={{ textAlign: "center", color: "#94a3b8" }}>Sin actividades</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Detalle de actividades</h3>
        <p style={{ color: "#64748b", marginTop: -8, fontSize: 13 }}>Cada actividad confirmada desde Aplicaciones aparece aquí, junto con las actividades registradas manualmente.</p>

        {/* Filtros */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end", marginBottom: 14, padding: 12, background: "#f8fafc", borderRadius: 8 }}>
          <div style={{ flex: "1 1 220px" }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Periodo</div>
            <div className="pill-group" data-testid="nomina-filtro-periodo">
              {[
                { k: "hoy", label: "Hoy" },
                { k: "semana", label: "Semana" },
                { k: "mes", label: "Mes" },
                { k: "ano", label: "Año" },
                { k: "todos", label: "Todos" },
              ].map((p) => (
                <button key={p.k} type="button" className={`pill ${filtroPeriodo === p.k ? "active" : ""}`} onClick={() => setFiltroPeriodo(p.k)} data-testid={`nomina-periodo-${p.k}`}>{p.label}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Tipo</div>
            <select className="select" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} data-testid="nomina-filtro-tipo">
              <option value="">Todos los tipos</option>
              {tiposUnicos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Lote</div>
            <select className="select" value={filtroLote} onChange={(e) => setFiltroLote(e.target.value)} data-testid="nomina-filtro-lote">
              <option value="">Todos los lotes</option>
              {lotesUnicos.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {filtrosActivos && (
            <button type="button" className="btn" onClick={limpiarFiltros} data-testid="nomina-limpiar-filtros">Limpiar filtros</button>
          )}
        </div>

        <table className="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Lote</th><th>Trabajadores</th><th>Horas</th><th>Precio/hr</th><th>Horas-H</th><th>Costo</th><th>Origen</th></tr></thead>
          <tbody>
            {actividadesFiltradas.map((a) => (
              <tr key={a._id}>
                <td>{new Date(a.fecha_actividad).toLocaleDateString()}</td>
                <td><span className="badge" style={actBadge(a.tipo_personalizado || a.tipo)}>{a.tipo_personalizado || a.tipo}</span></td>
                <td><span className="badge badge-primary">{a.lote || "—"}</span></td>
                <td>{Number(a.cantidad_trabajadores || 0).toFixed(2)}</td>
                <td>{a.horas_trabajo || 0}</td>
                <td>${Number(a.precio_hora || 0).toFixed(2)}</td>
                <td style={{ fontWeight: 600 }}>{Number(a.horas_hombre || 0).toFixed(2)}</td>
                <td style={{ fontWeight: 700, color: "#16a34a" }}>${Number(a.costo_total || 0).toFixed(2)}</td>
                <td><span className="badge badge-info">{a.origen}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {actividadesFiltradas.length === 0 && (
          <div className="empty-state">
            {actividades.length === 0
              ? "Sin actividades registradas todavía."
              : "No hay actividades que coincidan con los filtros seleccionados."}
          </div>
        )}
      </div>
    </div>
  );
}
