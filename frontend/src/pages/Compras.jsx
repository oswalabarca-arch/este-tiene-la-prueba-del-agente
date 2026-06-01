import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { ShoppingCart, Plus, Pencil, Trash2, Car, Fuel, Wrench, Users as UsersIcon } from "lucide-react";
import { catBadge } from "../lib/categoryColors";
import { todayLocal } from "../lib/dates";
import { DecimalInput } from "../components/DecimalInput";

const CATEGORIAS = ["fertilizantes", "plaguicidas", "fungicidas", "herbicidas", "tratamiento", "semillas", "otros"];
const UNIDAD = "Unidades";

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
  const [filterCat, setFilterCat] = useState("");

  const load = () => api.get("/compras").then((r) => setItems(r.data.compras));
  useEffect(() => { load(); }, []);

  const remove = async (c) => {
    if (!window.confirm("¿Eliminar compra?")) return;
    await api.delete(`/compras/${c._id}`);
    toast.show("Eliminada");
    load();
  };

  const categoriasUsadas = Array.from(new Set(items.map((c) => c.categoria).filter(Boolean))).sort();
  const filtered = filterCat ? items.filter((c) => c.categoria === filterCat) : items;
  const total = filtered.reduce((s, c) => s + (c.precio || 0), 0);

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
        <div className="card kpi-card"><div className="kpi-label">Compras {filterCat ? "(filtradas)" : "totales"}</div><div className="kpi-value">{filtered.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Inversión {filterCat ? "(filtrada)" : "acumulada"}</div><div className="kpi-value" style={{ color: "#16a34a" }}>${total.toFixed(2)}</div></div>
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 0, marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Filtrar por categoría:</span>
            <select className="select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)} data-testid="compras-filter-cat" style={{ minWidth: 200 }}>
              <option value="">Todas las categorías</option>
              {categoriasUsadas.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {filterCat && <button type="button" className="btn" onClick={() => setFilterCat("")} data-testid="compras-limpiar">Limpiar</button>}
          </div>
          <h3 style={{ margin: 0 }}>Registros de Compra</h3>
        </div>
        <table className="table">
          <thead>
            <tr><th>Fecha</th><th>Categoría</th><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
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
        {filtered.length === 0 && (
          <div className="empty-state">
            {filterCat ? "No hay compras en esta categoría" : "Sin compras registradas"}
          </div>
        )}
      </div>

      {editing && <CompraModal initial={editing} compras={items} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {showGasto && <GastoVehiculoModal onClose={() => setShowGasto(false)} onSaved={() => setShowGasto(false)} />}
    </div>
  );
}

function GastoVehiculoModal({ onClose, onSaved }) {
  const toast = useToast();
  const today = todayLocal();
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
                <DecimalInput type="number" step="0.01" className="input"
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

function CompraModal({ initial, compras = [], onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const today = todayLocal();
  // Productos únicos previamente comprados, agrupados por categoría para sugerencias.
  const sugerencias = Array.from(new Map(
    compras
      .filter((c) => !c.es_equipo && c.nombre_producto)
      .map((c) => [c.nombre_producto.trim().toLowerCase(), { nombre: c.nombre_producto.trim(), categoria: c.categoria }])
  ).values());
  const [form, setForm] = useState({
    categoria: "fertilizantes",
    nombre_producto: "",
    precio: 0,
    cantidad: 0,
    unidad: "Unidades",
    descripcion: "",
    fecha_compra: today,
    es_equipo: false,
    ...initial,
    fecha_compra: (initial.fecha_compra || today).slice(0, 10),
  });
  const [busy, setBusy] = useState(false);

  // Coincidencias actuales para mostrar dropdown debajo del input
  const matches = form.nombre_producto.trim().length > 0
    ? sugerencias.filter((s) => s.nombre.toLowerCase().includes(form.nombre_producto.trim().toLowerCase()) && s.nombre.toLowerCase() !== form.nombre_producto.trim().toLowerCase()).slice(0, 6)
    : [];

  const pickSuggestion = (s) => {
    // Al elegir un producto ya existente, sincronizamos también su categoría.
    setForm((f) => ({ ...f, nombre_producto: s.nombre, categoria: s.categoria || f.categoria }));
  };

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
          <div className="field" style={{ position: "relative" }}>
            <label>Nombre del producto</label>
            <input
              className="input"
              value={form.nombre_producto}
              onChange={(e) => setForm({ ...form, nombre_producto: e.target.value })}
              list="compra-productos-historial"
              autoComplete="off"
              required
              data-testid="compra-form-nombre"
              placeholder={sugerencias.length > 0 ? "Empieza a escribir o elegí uno previo..." : ""}
            />
            {/* datalist provee autocompletado nativo del navegador */}
            <datalist id="compra-productos-historial">
              {sugerencias.map((s, idx) => (
                <option key={idx} value={s.nombre}>{s.categoria}</option>
              ))}
            </datalist>
            {/* Dropdown custom para feedback más visible */}
            {matches.length > 0 && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 30,
                background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
                boxShadow: "0 6px 24px rgba(15,23,42,0.08)", marginTop: 4, maxHeight: 220, overflowY: "auto",
              }} data-testid="compra-sugerencias">
                {matches.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => pickSuggestion(s)}
                    style={{
                      width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent",
                      border: "none", cursor: "pointer", borderBottom: i < matches.length - 1 ? "1px solid #f1f5f9" : "none",
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{s.nombre}</span>
                    <span className="badge" style={{ ...catBadge(s.categoria), fontSize: 11 }}>{s.categoria}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="field">
            <label>Cantidad</label>
            <DecimalInput
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
            <input className="input" value={UNIDAD} disabled style={{ background: "#f1f5f9", color: "#64748b" }} />
          </div>
          <div className="field">
            <label>Precio total ($)</label>
            <DecimalInput
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
