import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Droplets, Plus, Trash2, BookOpen, X, CheckCircle, Clock, Eye, Pencil } from "lucide-react";
import { catBadge, catPill } from "../lib/categoryColors";
import { todayLocal, toLocalDateStr } from "../lib/dates";

const TIPOS = ["fertilizacion", "fungicida", "plaguicida", "herbicida", "tratamiento"];
const UNIDAD = "Unidades";

export default function Aplicaciones() {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [tab, setTab] = useState("aplicaciones");
  const [items, setItems] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [inventario, setInventario] = useState([]);
  const [plantaciones, setPlantaciones] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [showRecetaForm, setShowRecetaForm] = useState(false);
  const [viewReceta, setViewReceta] = useState(null);
  const [viewAplic, setViewAplic] = useState(null);
  const [editAplic, setEditAplic] = useState(null);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroPeriodo, setFiltroPeriodo] = useState("todos");

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

  const removeReceta = async (r) => {
    if (!window.confirm(`¿Eliminar receta "${r.nombre}"?`)) return;
    await api.delete(`/recetas/${r._id}`);
    toast.show("Receta eliminada");
    load();
  };

  const inPeriodo = (fechaStr) => {
    if (filtroPeriodo === "todos") return true;
    const f = new Date(fechaStr);
    if (isNaN(f.getTime())) return false;
    const now = new Date();
    if (filtroPeriodo === "hoy") {
      return f.toDateString() === now.toDateString();
    }
    if (filtroPeriodo === "semana") {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay()); // domingo
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      return f >= start && f < end;
    }
    if (filtroPeriodo === "mes") {
      return f.getMonth() === now.getMonth() && f.getFullYear() === now.getFullYear();
    }
    if (filtroPeriodo === "ano") {
      return f.getFullYear() === now.getFullYear();
    }
    return true;
  };

  const filtered = items.filter((a) => (filtroTipo ? a.tipo === filtroTipo : true) && inPeriodo(a.fecha));
  const confirmadas = items.filter((a) => a.estado === "confirmada").length;
  const pendientes = items.filter((a) => a.estado !== "confirmada").length;

  return (
    <div data-testid="aplicaciones-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Gestión de Aplicaciones</h1>
          <p className="page-subtitle">Control de aplicaciones de insumos agrícolas y recetas reutilizables</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setShowRecetaForm(true)} data-testid="receta-new-btn"><BookOpen size={16} /> Crear Receta</button>
          <button className="btn btn-primary" onClick={() => setShowForm(true)} data-testid="aplicacion-new-btn"><Plus size={16} /> Nueva Aplicación</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, borderBottom: "1px solid #e2e8f0" }}>
        {[
          { key: "aplicaciones", label: "Aplicaciones", icon: Droplets, color: "#0ea5e9", count: items.length },
          { key: "recetas", label: "Recetas", icon: BookOpen, color: "#8b5cf6", count: recetas.length },
        ].map((t) => {
          const Icon = t.icon;
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
              data-testid={`aplic-tab-${t.key}`}
            >
              <Icon size={16} /> {t.label}
              <span className="badge" style={{ background: t.color + "22", color: t.color, fontSize: 11 }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {tab === "aplicaciones" && (
        <>
          <div className="kpi-grid" style={{ marginBottom: 18 }}>
            <div className="card kpi-card"><div className="kpi-label">Total Aplicaciones</div><div className="kpi-value">{items.length}</div></div>
            <div className="card kpi-card"><div className="kpi-label">Confirmadas</div><div className="kpi-value" style={{ color: "#16a34a" }}>{confirmadas}</div></div>
            <div className="card kpi-card"><div className="kpi-label">Pendientes</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{pendientes}</div></div>
            <div className="card kpi-card"><div className="kpi-label">Recetas Guardadas</div><div className="kpi-value" style={{ color: "#8b5cf6" }}>{recetas.length}</div></div>
          </div>

          <div className="card" style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Periodo</div>
                <div className="pill-group" data-testid="aplic-filtro-periodo">
                  {[
                    { k: "hoy", label: "Hoy" },
                    { k: "semana", label: "Semana" },
                    { k: "mes", label: "Mes" },
                    { k: "ano", label: "Año" },
                    { k: "todos", label: "Todos" },
                  ].map((p) => (
                    <button key={p.k} className={`pill ${filtroPeriodo === p.k ? "active" : ""}`} onClick={() => setFiltroPeriodo(p.k)} data-testid={`aplic-periodo-${p.k}`}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ width: 1, height: 36, background: "#e2e8f0" }} />
              <div style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 6 }}>Tipo</div>
                <div className="pill-group">
                  <button className={`pill ${!filtroTipo ? "active" : ""}`} onClick={() => setFiltroTipo("")}>Todos</button>
                  {TIPOS.map((t) => (
                    <button
                      key={t}
                      className="pill"
                      style={catPill(t, filtroTipo === t)}
                      onClick={() => setFiltroTipo(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>Aplicaciones Registradas</h3>
            <table className="table">
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Lote</th><th>Insumos</th><th>Estado</th><th style={{ textAlign: "right" }}>Acciones</th></tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a._id}>
                    <td>{new Date(a.fecha).toLocaleDateString()}</td>
                    <td><span className="badge" style={catBadge(a.tipo)}>{a.tipo}</span></td>
                    <td><span className="badge badge-primary">{a.lote}</span></td>
                    <td style={{ fontSize: 13, color: "#64748b" }}>{a.insumos?.map((i) => `${i.nombre_producto} ${i.cantidad}${i.unidad}`).join(", ") || "—"}</td>
                    <td>{a.estado === "confirmada" ? <span className="badge badge-primary"><CheckCircle size={12} style={{ verticalAlign: "middle" }} /> Confirmada</span> : <span className="badge badge-warn"><Clock size={12} style={{ verticalAlign: "middle" }} /> Pendiente</span>}</td>
                    <td>
                      <div style={{ display: "inline-flex", gap: 4, justifyContent: "flex-end", width: "100%" }}>
                        <button className="btn-icon" title="Ver" onClick={() => setViewAplic(a)} data-testid={`aplic-view-${a._id}`} style={{ color: "#0ea5e9" }}><Eye size={16} /></button>
                        {canEdit("aplicaciones") && <button className="btn-icon" title="Editar" onClick={() => setEditAplic(a)} data-testid={`aplic-edit-${a._id}`} style={{ color: "#16a34a" }}><Pencil size={16} /></button>}
                        {canDelete("aplicaciones") && <button className="btn-icon" title="Eliminar" style={{ color: "#dc2626" }} onClick={() => remove(a)} data-testid={`aplic-delete-${a._id}`}><Trash2 size={16} /></button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="empty-state">No se encontraron aplicaciones</div>}
          </div>
        </>
      )}

      {tab === "recetas" && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recetas guardadas</h3>
          <p style={{ color: "#64748b", marginTop: -8, fontSize: 13 }}>Recetas reutilizables que podés seleccionar al crear una aplicación "por receta".</p>
          {recetas.length === 0 ? (
            <div className="empty-state" data-testid="recetas-empty">No hay recetas guardadas todavía. Crea tu primera receta con el botón "Nueva Receta".</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {recetas.map((r) => (
                <div key={r._id} className="card" style={{ padding: 14, border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: 8 }} data-testid={`receta-card-${r._id}`}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{r.nombre}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        <Droplets size={11} style={{ verticalAlign: "middle", color: "#0ea5e9" }} /> {r.cantidad_agua || 0} L de agua · {r.insumos?.length || 0} producto(s)
                      </div>
                    </div>
                    <span className="badge" style={{ background: "#f3e8ff", color: "#7c3aed", fontSize: 11 }}>Receta</span>
                  </div>
                  {r.insumos?.length > 0 && (
                    <div style={{ fontSize: 12, color: "#475569", background: "#f8fafc", padding: 8, borderRadius: 6 }}>
                      {r.insumos.slice(0, 3).map((i, idx) => (
                        <div key={idx}>• {i.nombre_producto} — {i.cantidad} {i.unidad}</div>
                      ))}
                      {r.insumos.length > 3 && <div style={{ color: "#94a3b8" }}>+ {r.insumos.length - 3} más</div>}
                    </div>
                  )}
                  {r.observaciones && (
                    <div style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>"{r.observaciones}"</div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 6 }}>
                    <button className="btn btn-sm" onClick={() => setViewReceta(r)} data-testid={`receta-view-${r._id}`}><Eye size={14} /> Ver</button>
                    {canDelete("aplicaciones") && (
                      <button className="btn-icon" style={{ color: "#dc2626", marginLeft: "auto" }} onClick={() => removeReceta(r)} data-testid={`receta-delete-${r._id}`}><Trash2 size={16} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showForm && <AplicacionForm inventario={inventario} plantaciones={plantaciones} recetas={recetas} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {editAplic && <AplicacionForm initial={editAplic} inventario={inventario} plantaciones={plantaciones} recetas={recetas} onClose={() => setEditAplic(null)} onSaved={() => { setEditAplic(null); load(); }} />}
      {viewAplic && <AplicacionDetail aplicacion={viewAplic} recetas={recetas} onClose={() => setViewAplic(null)} />}
      {showRecetaForm && <RecetaForm inventario={inventario} onClose={() => setShowRecetaForm(false)} onSaved={() => { setShowRecetaForm(false); load(); toast.show("Receta creada"); }} />}
      {viewReceta && <RecetaDetail receta={viewReceta} onClose={() => setViewReceta(null)} />}
    </div>
  );
}

function AplicacionForm({ initial, inventario, plantaciones, recetas, onClose, onSaved }) {
  const toast = useToast();
  const today = todayLocal();
  const isEdit = !!initial;
  const initialDate = initial?.fecha ? toLocalDateStr(initial.fecha) : today;
  const [form, setForm] = useState({
    tipo: initial?.tipo || "",
    subtipo: initial?.subtipo || "",
    lotes: initial?.lotes && initial.lotes.length > 0 ? initial.lotes : (initial?.lote ? [initial.lote] : []),
    fecha: initialDate,
    estado: initial?.estado || "pendiente",
    insumos: initial?.insumos || [],
    receta_id: initial?.receta_id || "",
    cantidad_agua: initial?.cantidad_agua || 0,
    modo_aplicacion: initial?.modo_aplicacion || "",
    observaciones: initial?.observaciones || "",
  });
  const initRows = initial?.insumos && initial.insumos.length > 0 && initial.subtipo !== "receta"
    ? initial.insumos.slice(0, 3).map((i) => ({ nombre_producto: i.nombre_producto, cantidad: i.cantidad, unidad: UNIDAD }))
    : [{ nombre_producto: "", cantidad: 0, unidad: UNIDAD }];
  const [productoRows, setProductoRows] = useState(initRows);
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
    setProductoRows([...productoRows, { nombre_producto: "", cantidad: 0, unidad: UNIDAD }]);
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
        estado: form.estado || "pendiente",
        insumos,
        receta_id: form.receta_id || null,
        cantidad_agua: Number(form.cantidad_agua || 0),
        modo_aplicacion: form.modo_aplicacion || null,
        observaciones: form.observaciones,
      };
      if (isEdit) {
        await api.put(`/aplicaciones/${initial._id}`, payload);
        toast.show("Aplicación actualizada");
      } else {
        await api.post("/aplicaciones", payload);
        toast.show("Aplicación creada");
      }
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  const lotesPlanta = Array.from(new Set(plantaciones.map((p) => ({ lote: p.lote, nombre: p.nombre })).filter((p) => p.lote).map((p) => JSON.stringify(p)))).map((s) => JSON.parse(s));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="aplicacion-modal">
        <h2 className="modal-title">{isEdit ? "Editar Aplicación" : "Nueva Aplicación"}</h2>
        <div className="modal-sub">{isEdit ? "Modifica los datos de la aplicación" : "Registra una nueva aplicación de insumos agrícolas"}</div>

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
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8, marginTop: 8, alignItems: "center" }}>
                <select className="select" value={row.nombre_producto} onChange={(e) => {
                  const nombre = e.target.value;
                  const rows = [...productoRows];
                  rows[i] = { ...rows[i], nombre_producto: nombre, unidad: UNIDAD };
                  setProductoRows(rows);
                }}>
                  <option value="">Producto</option>
                  {inventario.filter((x) => x.existencia).map((p, idx) => <option key={idx} value={p.nombre_producto}>{p.nombre_producto} ({p.total_disponible} {UNIDAD})</option>)}
                </select>
                <input type="number" className="input" placeholder={`Cantidad (${UNIDAD})`} value={row.cantidad || ""} onChange={(e) => updateRow(i, "cantidad", e.target.value)} />
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
            {recetas.length === 0 && (
              <div style={{ color: "#f59e0b", fontSize: 12, marginTop: 4 }}>
                No tenés recetas guardadas. Crealas desde la pestaña "Recetas".
              </div>
            )}
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
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="aplicacion-form-submit">{busy ? "..." : (isEdit ? "Guardar cambios" : "Crear Aplicación")}</button>
        </div>
      </form>
    </div>
  );
}

function RecetaForm({ inventario, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ nombre: "", cantidad_agua: "", observaciones: "" });
  const [productoRows, setProductoRows] = useState([{ nombre_producto: "", cantidad: "", unidad: UNIDAD }]);
  const [busy, setBusy] = useState(false);

  const updateRow = (i, key, val) => {
    const rows = [...productoRows];
    rows[i] = { ...rows[i], [key]: val };
    setProductoRows(rows);
  };
  const addRow = () => setProductoRows([...productoRows, { nombre_producto: "", cantidad: "", unidad: UNIDAD }]);
  const removeRow = (i) => setProductoRows(productoRows.filter((_, idx) => idx !== i));

  const guardar = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.show("Nombre requerido", "error"); return; }
    if (!form.cantidad_agua || Number(form.cantidad_agua) <= 0) { toast.show("Cantidad de agua requerida", "error"); return; }
    const insumos = productoRows
      .filter((r) => r.nombre_producto && Number(r.cantidad) > 0)
      .map((r) => ({ nombre_producto: r.nombre_producto, cantidad: Number(r.cantidad), unidad: r.unidad, categoria: "" }));
    if (insumos.length === 0) { toast.show("Agrega al menos un producto", "error"); return; }
    setBusy(true);
    try {
      await api.post("/recetas", {
        nombre: form.nombre.trim(),
        cantidad_agua: Number(form.cantidad_agua),
        observaciones: form.observaciones,
        insumos,
      });
      onSaved();
    } catch { toast.show("Error al crear receta", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()} onSubmit={guardar} data-testid="receta-modal">
        <h2 className="modal-title">Nueva Receta</h2>
        <div className="modal-sub">Crea una receta reutilizable que podrás aplicar a cualquier lote</div>

        <div className="form-grid">
          <div className="field">
            <label>Nombre de la receta *</label>
            <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required data-testid="receta-form-nombre" placeholder="Ej: Fertilización primaveral" />
          </div>
          <div className="field">
            <label>Cantidad de agua total (Litros) *</label>
            <input type="number" step="0.01" className="input"
              value={form.cantidad_agua}
              onChange={(e) => setForm({ ...form, cantidad_agua: e.target.value })}
              placeholder="0" required data-testid="receta-form-agua" />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Productos de la receta *</label>
          <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>Agrega los productos con su cantidad en {UNIDAD.toLowerCase()}.</div>
          {productoRows.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <select className="select" value={row.nombre_producto} onChange={(e) => updateRow(i, "nombre_producto", e.target.value)} data-testid={`receta-row-${i}-producto`}>
                <option value="">Producto</option>
                {inventario.filter((x) => x.existencia).map((p, idx) => <option key={idx} value={p.nombre_producto}>{p.nombre_producto} ({p.total_disponible} {UNIDAD})</option>)}
              </select>
              <input type="number" step="0.01" className="input" placeholder={`Cantidad (${UNIDAD})`} value={row.cantidad} onChange={(e) => updateRow(i, "cantidad", e.target.value)} data-testid={`receta-row-${i}-cantidad`} />
              {i === productoRows.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={addRow} style={{ padding: "8px 14px" }} data-testid="receta-add-row"><Plus size={16} /></button>
              ) : (
                <button type="button" className="btn-icon" onClick={() => removeRow(i)} style={{ color: "#dc2626" }}><X size={16} /></button>
              )}
            </div>
          ))}
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label>Observaciones</label>
          <textarea className="textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} placeholder="Notas sobre cuándo y cómo usar esta receta..." data-testid="receta-form-observaciones" />
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="receta-form-submit">{busy ? "Guardando..." : "Guardar receta"}</button>
        </div>
      </form>
    </div>
  );
}

function RecetaDetail({ receta, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()} data-testid="receta-detail">
        <h2 className="modal-title">{receta.nombre}</h2>
        <div className="modal-sub">Detalle de la receta</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Agua total</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0ea5e9" }}><Droplets size={16} style={{ verticalAlign: "middle" }} /> {receta.cantidad_agua || 0} L</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Productos</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#8b5cf6" }}>{receta.insumos?.length || 0}</div>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <h4 style={{ margin: "0 0 8px" }}>Productos</h4>
          <table className="table">
            <thead><tr><th>Producto</th><th>Cantidad</th><th>Unidad</th></tr></thead>
            <tbody>
              {receta.insumos?.map((i, idx) => (
                <tr key={idx}><td>{i.nombre_producto}</td><td>{i.cantidad}</td><td>{i.unidad}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        {receta.observaciones && (
          <div style={{ marginTop: 18 }}>
            <h4 style={{ margin: "0 0 8px" }}>Observaciones</h4>
            <div style={{ color: "#475569", fontSize: 13, background: "#f8fafc", padding: 10, borderRadius: 6 }}>{receta.observaciones}</div>
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}


function AplicacionDetail({ aplicacion, recetas, onClose }) {
  const a = aplicacion;
  const receta = a.receta_id ? recetas.find((r) => r._id === a.receta_id) : null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()} data-testid="aplicacion-detail">
        <h2 className="modal-title">Detalle de aplicación</h2>
        <div className="modal-sub">{new Date(a.fecha).toLocaleDateString()} · {a.tipo}{a.subtipo ? ` · ${a.subtipo}` : ""}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Estado</div>
            <div style={{ marginTop: 6 }}>
              {a.estado === "confirmada"
                ? <span className="badge badge-primary"><CheckCircle size={12} style={{ verticalAlign: "middle" }} /> Confirmada</span>
                : <span className="badge badge-warn"><Clock size={12} style={{ verticalAlign: "middle" }} /> Pendiente</span>}
            </div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>Agua</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#0ea5e9" }}><Droplets size={16} style={{ verticalAlign: "middle" }} /> {a.cantidad_agua || 0} L</div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Modo de aplicación</div>
            <div style={{ fontSize: 14 }}>{a.modo_aplicacion || "—"}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>Lotes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {(a.lotes && a.lotes.length > 0 ? a.lotes : [a.lote].filter(Boolean)).map((l) => (
                <span key={l} className="badge badge-primary">{l}</span>
              ))}
              {(!a.lotes || a.lotes.length === 0) && !a.lote && <span style={{ color: "#94a3b8" }}>—</span>}
            </div>
          </div>
        </div>

        {receta && (
          <div style={{ marginTop: 16, padding: 10, background: "#f5f3ff", borderRadius: 6, border: "1px solid #ddd6fe" }}>
            <div style={{ fontSize: 12, color: "#7c3aed", fontWeight: 600 }}><BookOpen size={12} style={{ verticalAlign: "middle" }} /> Aplicada con receta: {receta.nombre}</div>
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: "0 0 8px" }}>Insumos</h4>
          {a.insumos && a.insumos.length > 0 ? (
            <table className="table">
              <thead><tr><th>Producto</th><th>Cantidad</th><th>Unidad</th></tr></thead>
              <tbody>
                {a.insumos.map((i, idx) => (
                  <tr key={idx}><td>{i.nombre_producto}</td><td>{i.cantidad}</td><td>{i.unidad}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Sin insumos registrados</div>
          )}
        </div>

        {a.observaciones && (
          <div style={{ marginTop: 16 }}>
            <h4 style={{ margin: "0 0 8px" }}>Observaciones</h4>
            <div style={{ color: "#475569", fontSize: 13, background: "#f8fafc", padding: 10, borderRadius: 6 }}>{a.observaciones}</div>
          </div>
        )}

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
