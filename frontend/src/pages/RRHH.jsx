import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Briefcase, Plus, Pencil, Trash2, DollarSign } from "lucide-react";

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
  const [trabajadores, setTrabajadores] = useState([]);
  const [actividades, setActividades] = useState([]);

  useEffect(() => {
    Promise.all([api.get("/trabajadores"), api.get("/actividades")]).then(([t, a]) => {
      setTrabajadores(t.data.trabajadores);
      setActividades(a.data.actividades);
    });
  }, []);

  // Resumen general
  const horasTotales = actividades.reduce((s, a) => s + (a.horas_hombre || 0), 0);
  const costoTotal = actividades.reduce((s, a) => s + (a.costo_total || 0), 0);
  const trabajadoresActivos = trabajadores.filter((t) => t.activo);

  // Agrupar costos por origen
  const costoPorOrigen = actividades.reduce((acc, a) => {
    const k = a.origen || "registro_manual";
    if (!acc[k]) acc[k] = { horas: 0, costo: 0, count: 0 };
    acc[k].horas += (a.horas_hombre || 0);
    acc[k].costo += (a.costo_total || 0);
    acc[k].count += 1;
    return acc;
  }, {});

  // Agrupar por lote (para visibilidad rápida del gasto de mano de obra por lote)
  const costoPorLote = actividades.reduce((acc, a) => {
    const k = a.lote || "Sin lote";
    if (!acc[k]) acc[k] = { horas: 0, costo: 0, count: 0 };
    acc[k].horas += (a.horas_hombre || 0);
    acc[k].costo += (a.costo_total || 0);
    acc[k].count += 1;
    return acc;
  }, {});

  return (
    <div data-testid="nomina-page">
      <h1 className="page-title"><DollarSign size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Nómina</h1>
      <p className="page-subtitle">Resumen de mano de obra basado en las aplicaciones confirmadas y actividades registradas.</p>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Trabajadores activos</div><div className="kpi-value">{trabajadoresActivos.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Horas-hombre acumuladas</div><div className="kpi-value">{horasTotales.toFixed(1)} h</div></div>
        <div className="card kpi-card"><div className="kpi-label">Costo total mano de obra</div><div className="kpi-value" style={{ color: "#16a34a" }}>${costoTotal.toFixed(2)}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Actividades registradas</div><div className="kpi-value">{actividades.length}</div></div>
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
        <table className="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Lote</th><th>Trabajadores</th><th>Horas</th><th>Precio/hr</th><th>Horas-H</th><th>Costo</th><th>Origen</th></tr></thead>
          <tbody>
            {actividades.map((a) => (
              <tr key={a._id}>
                <td>{new Date(a.fecha_actividad).toLocaleDateString()}</td>
                <td><span className="badge badge-purple">{a.tipo_personalizado || a.tipo}</span></td>
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
        {actividades.length === 0 && <div className="empty-state">Sin actividades registradas todavía.</div>}
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Trabajadores</h3>
        <table className="table">
          <thead><tr><th>Nombre</th><th>Cargo</th><th>Salario diario</th><th>Estado</th></tr></thead>
          <tbody>
            {trabajadores.map((t) => (
              <tr key={t._id}>
                <td>{t.nombre_completo}</td>
                <td>{t.cargo}</td>
                <td>${t.salario_diario}</td>
                <td>{t.activo ? <span className="badge badge-primary">Activo</span> : <span className="badge badge-rose">Inactivo</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {trabajadores.length === 0 && <div className="empty-state">Sin trabajadores. Crea algunos en Recursos Humanos &gt; Trabajadores.</div>}
      </div>
    </div>
  );
}
