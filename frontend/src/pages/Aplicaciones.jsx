import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { Droplets, Plus, Trash2, BookOpen, X, CheckCircle, Clock } from "lucide-react";

const TIPOS = ["fertilizacion", "fungicida", "plaguicida", "herbicida", "tratamiento"];

export default function Aplicaciones() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [inventario, setInventario] = useState([]);
  const [plantaciones, setPlantaciones] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showRecetas, setShowRecetas] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState("");

  const load = async () => {
    const [a, r, i, p] = await Promise.all([
      api.get("/aplicaciones"), api.get("/recetas"),
      api.get("/inventario"), api.get("/plantaciones"),
    ]);
    setItems(a.data.aplicaciones);
    setRecetas(r.data.recetas);
    setInventario(i.data.inventario);
    setPlantaciones(p.data.plantaciones);
  };
  useEffect(() => { load(); }, []);

  const remove = async (a) => {
    if (!window.confirm("¿Eliminar aplicación?")) return;
    await api.delete(`/aplicaciones/${a._id}`);
    toast.show("Eliminada");
    load();
  };

  const confirmar = async (a) => {
    // pasa a actividades automáticamente
    await api.put(`/aplicaciones/${a._id}`, { ...a, estado: "confirmada" });
    await api.post(`/actividades`, {
      tipo: "aplicacion",
      tipo_personalizado: a.tipo,
      cantidad_trabajadores: 1,
      horas_trabajo: 1,
      lote: a.lote,
      fecha_actividad: a.fecha,
      observaciones: `Aplicación ${a.tipo} confirmada`,
      origen: "aplicacion",
      aplicacion_id: a._id,
    });
    toast.show("Aplicación confirmada y enviada a Actividades");
    load();
  };

  const filtered = filtroTipo ? items.filter((a) => a.tipo === filtroTipo) : items;
  const confirmadas = items.filter((a) => a.estado === "confirmada").length;
  const pendientes = items.filter((a) => a.estado !== "confirmada").length;

  return (
    <div data-testid="aplicaciones-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Gestión de Aplicaciones</h1>
          <p className="page-subtitle">Control de aplicaciones de insumos agrícolas</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowRecetas(true)} data-testid="recetas-btn"><BookOpen size={16} /> Crear Receta</button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)} data-testid="aplicacion-new-btn"><Plus size={16} /> Nueva Aplicación</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Total Aplicaciones</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Confirmadas</div><div className="kpi-value" style={{ color: "#16a34a" }}>{confirmadas}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Pendientes</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{pendientes}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Recetas Guardadas</div><div className="kpi-value" style={{ color: "#8b5cf6" }}>{recetas.length}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="pill-group">
          <button className={`pill ${!filtroTipo ? "active" : ""}`} onClick={() => setFiltroTipo("")}>Todos</button>
          {TIPOS.map((t) => <button key={t} className={`pill ${filtroTipo === t ? "active" : ""}`} onClick={() => setFiltroTipo(t)}>{t}</button>)}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Aplicaciones Registradas</h3>
        <table className="table">
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>Lote</th><th>Insumos</th><th>Estado</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a._id}>
                <td>{new Date(a.fecha).toLocaleDateString()}</td>
                <td><span className="badge badge-info">{a.tipo}</span></td>
                <td><span className="badge badge-primary">{a.lote}</span></td>
                <td style={{ fontSize: 13, color: "#64748b" }}>{a.insumos?.map((i) => `${i.nombre_producto} ${i.cantidad}${i.unidad}`).join(", ") || "—"}</td>
                <td>{a.estado === "confirmada" ? <span className="badge badge-primary"><CheckCircle size={12} style={{ verticalAlign: "middle" }} /> Confirmada</span> : <span className="badge badge-warn"><Clock size={12} style={{ verticalAlign: "middle" }} /> Pendiente</span>}</td>
                <td>
                  {a.estado !== "confirmada" && <button className="btn btn-sm btn-primary" onClick={() => confirmar(a)}>Confirmar</button>}
                  <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(a)}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">No se encontraron aplicaciones</div>}
      </div>

      {showForm && <AplicacionForm inventario={inventario} plantaciones={plantaciones} recetas={recetas} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {showRecetas && <RecetasModal recetas={recetas} inventario={inventario} onClose={() => setShowRecetas(false)} onChange={load} />}
    </div>
  );
}

function AplicacionForm({ inventario, plantaciones, recetas, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    tipo: "fertilizacion",
    lote: "",
    fecha: new Date().toISOString().slice(0, 10),
    estado: "pendiente",
    insumos: [],
    observaciones: "",
  });
  const [busy, setBusy] = useState(false);

  const addInsumo = (inv) => {
    if (form.insumos.some((i) => i.nombre_producto === inv.nombre_producto)) return;
    setForm((f) => ({ ...f, insumos: [...f.insumos, { nombre_producto: inv.nombre_producto, cantidad: 0, unidad: inv.unidad, categoria: inv.categoria }] }));
  };

  const cargarReceta = (r) => {
    setForm((f) => ({ ...f, insumos: r.insumos.map((i) => ({ ...i })) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/aplicaciones", { ...form, fecha: form.fecha + "T12:00:00.000Z" });
      toast.show("Aplicación creada");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  const lotes = Array.from(new Set(plantaciones.map((p) => p.lote).filter(Boolean)));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 800 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="aplicacion-modal">
        <h2 className="modal-title">Nueva aplicación</h2>
        <div className="form-grid">
          <div className="field">
            <label>Tipo</label>
            <select className="select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          <div className="field">
            <label>Lote</label>
            <select className="select" value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} required>
              <option value="">Selecciona...</option>{lotes.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          </div>
        </div>

        {recetas.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Cargar receta (opcional)</label>
            <div className="pill-group" style={{ marginTop: 6 }}>
              {recetas.map((r) => <button key={r._id} type="button" className="pill" onClick={() => cargarReceta(r)}>{r.nombre}</button>)}
            </div>
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>Insumos disponibles (clic para añadir)</label>
          <div className="pill-group" style={{ marginTop: 6, maxHeight: 120, overflow: "auto" }}>
            {inventario.filter((i) => i.existencia).map((i, idx) => (
              <button key={idx} type="button" className="pill" onClick={() => addInsumo(i)}>{i.nombre_producto} ({i.total_disponible} {i.unidad})</button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 8px" }}>Insumos seleccionados</h4>
          {form.insumos.map((ins, idx) => (
            <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
              <div style={{ flex: 1, fontSize: 14 }}>{ins.nombre_producto}</div>
              <input type="number" className="input" style={{ width: 100 }} value={ins.cantidad} onChange={(e) => {
                const v = Number(e.target.value);
                setForm((f) => { const ins2 = [...f.insumos]; ins2[idx].cantidad = v; return { ...f, insumos: ins2 }; });
              }} />
              <div style={{ width: 80, fontSize: 13, color: "#64748b" }}>{ins.unidad}</div>
              <button type="button" className="btn-icon" style={{ color: "#dc2626" }} onClick={() => setForm((f) => ({ ...f, insumos: f.insumos.filter((_, i) => i !== idx) }))}><X size={16} /></button>
            </div>
          ))}
          {form.insumos.length === 0 && <div style={{ color: "#94a3b8", fontSize: 14 }}>Sin insumos. Selecciona de la lista arriba.</div>}
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Observaciones</label>
          <textarea className="textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="aplicacion-form-submit">{busy ? "..." : "Crear aplicación"}</button>
        </div>
      </form>
    </div>
  );
}

function RecetasModal({ recetas, inventario, onClose, onChange }) {
  const toast = useToast();
  const [form, setForm] = useState({ nombre: "", descripcion: "", insumos: [] });
  const [busy, setBusy] = useState(false);

  const addInsumo = (inv) => {
    if (form.insumos.some((i) => i.nombre_producto === inv.nombre_producto)) return;
    setForm((f) => ({ ...f, insumos: [...f.insumos, { nombre_producto: inv.nombre_producto, cantidad: 0, unidad: inv.unidad, categoria: inv.categoria }] }));
  };

  const guardar = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/recetas", form);
      toast.show("Receta creada");
      setForm({ nombre: "", descripcion: "", insumos: [] });
      onChange();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  const remove = async (r) => {
    if (!window.confirm("¿Eliminar receta?")) return;
    await api.delete(`/recetas/${r._id}`);
    onChange();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()} data-testid="recetas-modal">
        <h2 className="modal-title">Recetas</h2>
        <div style={{ marginBottom: 16 }}>
          {recetas.map((r) => (
            <div key={r._id} className="card" style={{ marginBottom: 8, padding: 12, display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.nombre}</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>{r.insumos?.length || 0} insumos</div>
              </div>
              <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(r)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <form onSubmit={guardar}>
          <h4 style={{ margin: "0 0 8px" }}>Nueva receta</h4>
          <div className="form-grid">
            <div className="field">
              <label>Nombre</label>
              <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required />
            </div>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Descripción</label>
            <input className="input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Añadir insumos</label>
            <div className="pill-group" style={{ marginTop: 6 }}>
              {inventario.filter((i) => i.existencia).map((i, idx) => (
                <button key={idx} type="button" className="pill" onClick={() => addInsumo(i)}>+ {i.nombre_producto}</button>
              ))}
            </div>
            {form.insumos.map((ins, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                <div style={{ flex: 1, fontSize: 14 }}>{ins.nombre_producto}</div>
                <input type="number" className="input" style={{ width: 100 }} value={ins.cantidad} onChange={(e) => {
                  const v = Number(e.target.value);
                  setForm((f) => { const ins2 = [...f.insumos]; ins2[idx].cantidad = v; return { ...f, insumos: ins2 }; });
                }} />
                <div style={{ width: 80, fontSize: 13, color: "#64748b" }}>{ins.unidad}</div>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn" onClick={onClose}>Cerrar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>Guardar receta</button>
          </div>
        </form>
      </div>
    </div>
  );
}
