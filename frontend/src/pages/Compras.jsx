import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { ShoppingCart, Plus, Pencil, Trash2 } from "lucide-react";

const CATEGORIAS = ["fertilizantes", "plaguicidas", "fungicidas", "herbicidas", "tratamiento", "semillas", "otros"];
const UNIDADES = ["mililitros", "litros", "gramos", "kilogramos", "unidades"];
const EQUIPO_CATS = ["vehiculo", "herramienta", "maquinaria"];

export default function Compras() {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/compras").then((r) => setItems(r.data.compras));
  useEffect(() => { load(); }, []);

  const remove = async (c) => {
    if (!window.confirm("¿Eliminar compra?")) return;
    await api.delete(`/compras/${c._id}`);
    toast.show("Eliminada");
    load();
  };

  const total = items.reduce((s, c) => s + (c.precio || 0), 0);

  return (
    <div data-testid="compras-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><ShoppingCart size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Compras</h1>
          <p className="page-subtitle">Registra compras de insumos y equipos. Las compras alimentan Inventario y Equipos.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="compras-new-btn"><Plus size={16} /> Nueva Compra</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Compras totales</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Inversión acumulada</div><div className="kpi-value" style={{ color: "#16a34a" }}>${total.toFixed(2)}</div></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Registros de Compra</h3>
        <table className="table">
          <thead>
            <tr><th>Fecha</th><th>Categoría</th><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Tipo</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c._id}>
                <td>{new Date(c.fecha_compra).toLocaleDateString()}</td>
                <td><span className="badge badge-info">{c.categoria}</span></td>
                <td>{c.nombre_producto}</td>
                <td>{c.cantidad} {c.unidad}</td>
                <td>${c.precio}</td>
                <td>{c.es_equipo ? <span className="badge badge-purple">Equipo</span> : <span className="badge badge-primary">Insumo</span>}</td>
                <td>
                  {canEdit("compras") && <button className="btn-icon" onClick={() => setEditing(c)}><Pencil size={16} /></button>}
                  {canDelete("compras") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(c)}><Trash2 size={16} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty-state">Sin compras registradas</div>}
      </div>

      {editing && <CompraModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CompraModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    categoria: "fertilizantes",
    nombre_producto: "",
    precio: 0,
    cantidad: 0,
    unidad: "mililitros",
    descripcion: "",
    fecha_compra: today,
    es_equipo: false,
    equipo_categoria: "herramienta",
    equipo_marca: "",
    equipo_modelo: "",
    ...initial,
    fecha_compra: (initial.fecha_compra || today).slice(0, 10),
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, precio: Number(form.precio), cantidad: Number(form.cantidad), fecha_compra: form.fecha_compra + "T00:00:00.000Z" };
      if (isNew) await api.post("/compras", payload);
      else await api.put(`/compras/${initial._id}`, payload);
      toast.show(isNew ? "Compra registrada" : "Actualizada");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="compra-modal">
        <h2 className="modal-title">{isNew ? "Nueva compra" : "Editar compra"}</h2>
        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <button type="button" className={`pill ${!form.es_equipo ? "active" : ""}`} onClick={() => setForm({ ...form, es_equipo: false })}>📦 Insumo</button>
          <button type="button" className={`pill ${form.es_equipo ? "active" : ""}`} onClick={() => setForm({ ...form, es_equipo: true })}>🚜 Equipo</button>
        </div>
        <div className="form-grid">
          <div className="field">
            <label>Fecha de compra</label>
            <input type="date" className="input" value={form.fecha_compra} onChange={(e) => setForm({ ...form, fecha_compra: e.target.value })} required data-testid="compra-form-fecha" />
          </div>
          {!form.es_equipo ? (
            <div className="field">
              <label>Categoría</label>
              <select className="select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Tipo de equipo</label>
              <select className="select" value={form.equipo_categoria} onChange={(e) => setForm({ ...form, equipo_categoria: e.target.value })}>
                {EQUIPO_CATS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Nombre del producto</label>
            <input className="input" value={form.nombre_producto} onChange={(e) => setForm({ ...form, nombre_producto: e.target.value })} required data-testid="compra-form-nombre" />
          </div>
          <div className="field">
            <label>Cantidad</label>
            <input type="number" step="0.01" className="input" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} required data-testid="compra-form-cantidad" />
          </div>
          {!form.es_equipo && (
            <div className="field">
              <label>Unidad</label>
              <select className="select" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
                {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Precio total ($)</label>
            <input type="number" step="0.01" className="input" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} required data-testid="compra-form-precio" />
          </div>
          {form.es_equipo && (
            <>
              <div className="field"><label>Marca</label><input className="input" value={form.equipo_marca || ""} onChange={(e) => setForm({ ...form, equipo_marca: e.target.value })} /></div>
              <div className="field"><label>Modelo</label><input className="input" value={form.equipo_modelo || ""} onChange={(e) => setForm({ ...form, equipo_modelo: e.target.value })} /></div>
            </>
          )}
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Descripción</label>
          <textarea className="textarea" value={form.descripcion || ""} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="compra-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
