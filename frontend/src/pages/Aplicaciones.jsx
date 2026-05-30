import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Droplets, Plus, Trash2, BookOpen, X, CheckCircle, Clock } from "lucide-react";

const TIPOS = ["fertilizacion", "fungicida", "plaguicida", "herbicida", "tratamiento"];

export default function Aplicaciones() {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
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
                  {canEdit("aplicaciones") && a.estado !== "confirmada" && <button className="btn btn-sm btn-primary" onClick={() => confirmar(a)}>Confirmar</button>}
                  {canDelete("aplicaciones") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(a)}><Trash2 size={16} /></button>}
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
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    tipo: "",
    subtipo: "",
    lotes: [],
    fecha: today,
    estado: "pendiente",
    insumos: [],
    receta_id: "",
    cantidad_agua: 0,
    modo_aplicacion: "",
    observaciones: "",
  });
  const [productoRows, setProductoRows] = useState([{ nombre_producto: "", cantidad: 0, unidad: "Gramos" }]);
  const [loteInput, setLoteInput] = useState("");
  const [busy, setBusy] = useState(false);

  const requiresSubtipo = form.tipo === "fertilizacion" || form.tipo === "tratamiento";
  const isReceta = requiresSubtipo && form.subtipo === "receta";
  const showProductos = form.tipo && (!requiresSubtipo || form.subtipo === "producto");

  const updateRow = (i, key, val) => {
    const rows = [...productoRows];
    rows[i] = { ...rows[i], [key]: val };
    setProductoRows(rows);
  };
  const addRow = () => {
    if (productoRows.length >= 3) return;
    setProductoRows([...productoRows, { nombre_producto: "", cantidad: 0, unidad: "Gramos" }]);
  };
  const removeRow = (i) => setProductoRows(productoRows.filter((_, idx) => idx !== i));

  const toggleLote = (lote) => {
    setForm((f) => ({ ...f, lotes: f.lotes.includes(lote) ? f.lotes.filter((x) => x !== lote) : [...f.lotes, lote] }));
  };
  const addLoteFromInput = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const v = loteInput.trim();
      if (v && !form.lotes.includes(v)) setForm({ ...form, lotes: [...form.lotes, v] });
      setLoteInput("");
    }
  };
  const removeLote = (l) => setForm({ ...form, lotes: form.lotes.filter((x) => x !== l) });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.tipo) return toast.show("Selecciona el tipo de aplicación", "error");
    if (form.lotes.length === 0) return toast.show("Selecciona al menos un lote", "error");
    if (showProductos && productoRows.every((r) => !r.nombre_producto)) return toast.show("Agrega al menos un producto", "error");
    if (isReceta && !form.receta_id) return toast.show("Selecciona una receta", "error");

    setBusy(true);
    try {
      // Insumos a guardar
      let insumos = [];
      if (isReceta) {
        const r = recetas.find((x) => x._id === form.receta_id);
        insumos = r?.insumos || [];
      } else if (showProductos) {
        insumos = productoRows.filter((r) => r.nombre_producto && r.cantidad > 0).map((r) => ({
          nombre_producto: r.nombre_producto, cantidad: Number(r.cantidad), unidad: r.unidad, categoria: "",
        }));
      }
      const payload = {
        tipo: form.tipo,
        subtipo: form.subtipo || null,
        lote: form.lotes[0] || "",
        lotes: form.lotes,
        fecha: form.fecha + "T12:00:00.000Z",
        estado: "pendiente",
        insumos,
        receta_id: form.receta_id || null,
        cantidad_agua: Number(form.cantidad_agua || 0),
        modo_aplicacion: form.modo_aplicacion || null,
        observaciones: form.observaciones,
      };
      await api.post("/aplicaciones", payload);
      toast.show("Aplicación creada");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  const lotesPlanta = Array.from(new Set(plantaciones.map((p) => ({ lote: p.lote, nombre: p.nombre })).filter((p) => p.lote).map((p) => JSON.stringify(p)))).map((s) => JSON.parse(s));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="aplicacion-modal">
        <h2 className="modal-title">Nueva Aplicación</h2>
        <div className="modal-sub">Registra una nueva aplicación de insumos agrícolas</div>

        <div className="form-grid">
          <div className="field">
            <label>Tipo de Aplicación *</label>
            <select className="select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, subtipo: "" })} required data-testid="aplic-tipo">
              <option value="">Selecciona tipo</option>
              <option value="fertilizacion">Fertilización</option>
              <option value="plaguicida">Plaguicida</option>
              <option value="fungicida">Fungicida</option>
              <option value="herbicida">Herbicida</option>
              <option value="tratamiento">Tratamiento</option>
            </select>
          </div>
          {requiresSubtipo && (
            <div className="field">
              <label>Subtipo *</label>
              <select className="select" value={form.subtipo} onChange={(e) => setForm({ ...form, subtipo: e.target.value, receta_id: "" })} required data-testid="aplic-subtipo">
                <option value="">Selecciona subtipo</option>
                <option value="producto">Por producto</option>
                <option value="receta">Por receta</option>
              </select>
            </div>
          )}
        </div>

        {showProductos && (
          <div style={{ marginTop: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Productos (máx. 3)</label>
            {productoRows.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, marginTop: 8, alignItems: "center" }}>
                <select className="select" value={row.nombre_producto} onChange={(e) => updateRow(i, "nombre_producto", e.target.value)}>
                  <option value="">Producto</option>
                  {inventario.filter((x) => x.existencia).map((p, idx) => <option key={idx} value={p.nombre_producto}>{p.nombre_producto} ({p.total_disponible} {p.unidad})</option>)}
                </select>
                <input type="number" className="input" placeholder="Cantidad" value={row.cantidad || ""} onChange={(e) => updateRow(i, "cantidad", e.target.value)} />
                <select className="select" value={row.unidad} onChange={(e) => updateRow(i, "unidad", e.target.value)}>
                  <option value="Gramos">Gramos</option>
                  <option value="CC">CC</option>
                </select>
                {i === productoRows.length - 1 && productoRows.length < 3 ? (
                  <button type="button" className="btn btn-primary" onClick={addRow} style={{ padding: "8px 14px" }}><Plus size={16} /></button>
                ) : (
                  <button type="button" className="btn-icon" onClick={() => removeRow(i)} style={{ color: "#dc2626" }}><X size={16} /></button>
                )}
              </div>
            ))}
          </div>
        )}

        {isReceta && (
          <div className="field" style={{ marginTop: 18 }}>
            <label>Receta *</label>
            <select className="select" value={form.receta_id} onChange={(e) => setForm({ ...form, receta_id: e.target.value })} required data-testid="aplic-receta">
              <option value="">Selecciona una receta</option>
              {recetas.map((r) => <option key={r._id} value={r._id}>{r.nombre} ({r.insumos?.length || 0} insumos)</option>)}
            </select>
          </div>
        )}

        <div className="form-grid" style={{ marginTop: 18 }}>
          <div className="field">
            <label>Cantidad de Agua (Litros) *</label>
            <input type="number" step="0.01" className="input" value={form.cantidad_agua || ""} onChange={(e) => setForm({ ...form, cantidad_agua: e.target.value })} required data-testid="aplic-agua" placeholder="" />
          </div>
          <div className="field">
            <label>Modo de Aplicación *</label>
            <select className="select" value={form.modo_aplicacion} onChange={(e) => setForm({ ...form, modo_aplicacion: e.target.value })} required data-testid="aplic-modo">
              <option value="">Selecciona modo</option>
              <option value="foliar">Foliar</option>
              <option value="suelo">Suelo</option>
              <option value="riego">Riego</option>
              <option value="drench">Drench</option>
            </select>
          </div>
          <div className="field">
            <label>Fecha de Aplicación *</label>
            <input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#334155", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#f97316" }}>📍</span> Lote(s) / Sector destino *
          </label>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
            Podés seleccionar <b>varios lotes</b>. Las cantidades se repartirán equitativamente entre ellos.
          </div>
          {lotesPlanta.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: "#64748b" }}>Plantaciones:</span>
              {lotesPlanta.map((p) => {
                const isActive = form.lotes.includes(p.lote);
                return (
                  <button key={p.lote} type="button" onClick={() => toggleLote(p.lote)}
                    style={{
                      padding: "5px 12px", borderRadius: 999,
                      border: isActive ? "1px solid #16a34a" : "1px solid #bbf7d0",
                      background: isActive ? "#16a34a" : "#fff",
                      color: isActive ? "#fff" : "#15803d", cursor: "pointer", fontSize: 13,
                    }}>
                    {p.lote} · {p.nombre}
                  </button>
                );
              })}
            </div>
          )}
          <input className="input" style={{ marginTop: 8, width: "100%" }} placeholder="O escribe un lote y presiona Enter para agregarlo..."
            value={loteInput} onChange={(e) => setLoteInput(e.target.value)} onKeyDown={addLoteFromInput} />
          {form.lotes.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {form.lotes.map((l) => (
                <span key={l} className="badge badge-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 12px" }}>
                  {l}
                  <button type="button" onClick={() => removeLote(l)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>A qué lote o sector del campo está dirigida esta aplicación</div>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label>Observaciones</label>
          <textarea className="textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Escriba cualquier observación relevante sobre esta aplicación..." />
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>Campo opcional para notas del ingeniero agrónomo</div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="aplicacion-form-submit">{busy ? "..." : "Crear Aplicación"}</button>
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
