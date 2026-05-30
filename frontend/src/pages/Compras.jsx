import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { ShoppingCart, Plus, Pencil, Trash2, Car, Fuel, Wrench, Users as UsersIcon } from "lucide-react";

const CATEGORIAS = ["fertilizantes", "plaguicidas", "fungicidas", "herbicidas", "tratamiento", "semillas", "otros"];
const UNIDADES = ["CC", "Gr"];

// Color distintivo por categoría
const CAT_COLORS = {
  fertilizantes: { bg: "#dcfce7", color: "#15803d" },  // verde
  plaguicidas:   { bg: "#fee2e2", color: "#b91c1c" },  // rojo
  fungicidas:    { bg: "#ede9fe", color: "#6d28d9" },  // morado
  herbicidas:    { bg: "#fef3c7", color: "#b45309" },  // ámbar/naranja
  tratamiento:   { bg: "#e0f2fe", color: "#0369a1" },  // azul/cyan
  semillas:      { bg: "#fce7f3", color: "#be185d" },  // rosa
  otros:         { bg: "#f1f5f9", color: "#475569" },  // gris
};

const catBadge = (cat) => {
  const c = CAT_COLORS[cat] || CAT_COLORS.otros;
  return { background: c.bg, color: c.color };
};

const CATS_GASTO_VEH = [
  { key: "gasolina", label: "Gasolina", icon: Fuel, color: "#dc2626", bg: "#fee2e2" },
  { key: "repuestos", label: "Repuestos", icon: Wrench, color: "#f59e0b", bg: "#fef3c7" },
  { key: "mano_obra", label: "Mano de Obra", icon: UsersIcon, color: "#3b82f6", bg: "#dbeafe" },
];

export default function Compras() {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showGasto, setShowGasto] = useState(false);

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
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn" onClick={() => setShowGasto(true)} data-testid="gasto-vehiculo-btn"><Car size={16} /> Gastos de vehículo</button>
          <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="compras-new-btn"><Plus size={16} /> Nueva Compra</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Compras totales</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Inversión acumulada</div><div className="kpi-value" style={{ color: "#16a34a" }}>${total.toFixed(2)}</div></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Registros de Compra</h3>
        <table className="table">
          <thead>
            <tr><th>Fecha</th><th>Categoría</th><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {items.map((c) => (
              <tr key={c._id}>
                <td>{new Date(c.fecha_compra).toLocaleDateString()}</td>
                <td><span className="badge" style={catBadge(c.categoria)}>{c.categoria}</span></td>
                <td>{c.nombre_producto}</td>
                <td>{c.cantidad} {c.unidad}</td>
                <td>${c.precio}</td>
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
      {showGasto && <GastoVehiculoModal onClose={() => setShowGasto(false)} onSaved={() => setShowGasto(false)} />}
    </div>
  );
}

function GastoVehiculoModal({ onClose, onSaved }) {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [vehiculos, setVehiculos] = useState([]);
  const [form, setForm] = useState({
    vehiculo_id: "",
    categoria: "gasolina",
    monto: 0,
    fecha: today,
    descripcion: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/vehiculos").then((r) => setVehiculos(r.data.vehiculos));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.vehiculo_id) { toast.show("Selecciona un vehículo", "error"); return; }
    setBusy(true);
    try {
      await api.post("/gastos-vehiculos", { ...form, monto: Number(form.monto), fecha: form.fecha + "T12:00:00.000Z" });
      toast.show("Gasto registrado");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="gasto-vehiculo-modal">
        <h2 className="modal-title"><Car size={20} style={{ verticalAlign: "middle", color: "#3b82f6" }} /> Registrar gasto de vehículo</h2>
        <div className="modal-sub">El gasto se asocia a un vehículo y aparecerá en su detalle.</div>

        {vehiculos.length === 0 ? (
          <div className="empty-state" style={{ padding: 24, background: "#fef3c7", borderRadius: 8, color: "#b45309" }}>
            No tienes vehículos registrados. Ve a <b>Equipos → Vehículos</b> y crea uno primero.
          </div>
        ) : (
          <>
            <div className="form-grid">
              <div className="field">
                <label>Vehículo</label>
                <select className="select" value={form.vehiculo_id} onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })} required data-testid="gasto-form-vehiculo">
                  <option value="">Selecciona...</option>
                  {vehiculos.map((v) => <option key={v._id} value={v._id}>{v.nombre} {v.placa ? `(${v.placa})` : ""}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Categoría de gasto</label>
                <select className="select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} required data-testid="gasto-form-categoria">
                  {CATS_GASTO_VEH.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Fecha</label>
                <input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
              </div>
              <div className="field">
                <label>Monto ($)</label>
                <input type="number" step="0.01" className="input"
                  value={form.monto === 0 || form.monto === "" ? "" : form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value === "" ? 0 : Number(e.target.value) })}
                  onFocus={(e) => { if (form.monto === 0) e.target.select(); }}
                  placeholder="0"
                  required
                  data-testid="gasto-form-monto" />
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Descripción</label>
              <textarea className="textarea" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Llenado del tanque, cambio de aceite..." />
            </div>
          </>
        )}

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          {vehiculos.length > 0 && <button type="submit" className="btn btn-primary" disabled={busy} data-testid="gasto-form-submit">{busy ? "..." : "Registrar gasto"}</button>}
        </div>
      </form>
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
    unidad: "CC",
    descripcion: "",
    fecha_compra: today,
    es_equipo: false,
    ...initial,
    fecha_compra: (initial.fecha_compra || today).slice(0, 10),
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, es_equipo: false, precio: Number(form.precio), cantidad: Number(form.cantidad), fecha_compra: form.fecha_compra + "T00:00:00.000Z" };
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
        <div className="modal-sub">Registro de compras de insumos (fertilizantes, plaguicidas, etc.). Los equipos se registran en sus módulos respectivos.</div>
        <div className="form-grid">
          <div className="field">
            <label>Fecha de compra</label>
            <input type="date" className="input" value={form.fecha_compra} onChange={(e) => setForm({ ...form, fecha_compra: e.target.value })} required data-testid="compra-form-fecha" />
          </div>
          <div className="field">
            <label>Categoría</label>
            <select className="select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ marginTop: 4 }}>
              <span className="badge" style={catBadge(form.categoria)}>{form.categoria}</span>
            </div>
          </div>
          <div className="field">
            <label>Nombre del producto</label>
            <input className="input" value={form.nombre_producto} onChange={(e) => setForm({ ...form, nombre_producto: e.target.value })} required data-testid="compra-form-nombre" />
          </div>
          <div className="field">
            <label>Cantidad</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.cantidad === 0 || form.cantidad === "" ? "" : form.cantidad}
              onChange={(e) => setForm({ ...form, cantidad: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.cantidad === 0) e.target.select(); }}
              placeholder="0"
              required
              data-testid="compra-form-cantidad"
            />
          </div>
          <div className="field">
            <label>Unidad</label>
            <select className="select" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
              {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Precio total ($)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.precio === 0 || form.precio === "" ? "" : form.precio}
              onChange={(e) => setForm({ ...form, precio: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.precio === 0) e.target.select(); }}
              placeholder="0"
              required
              data-testid="compra-form-precio"
            />
          </div>
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
