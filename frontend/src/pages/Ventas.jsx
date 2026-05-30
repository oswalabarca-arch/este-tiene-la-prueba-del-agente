import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Plus, Trash2, Home, Truck, DollarSign, Snowflake, AlertCircle, Heart } from "lucide-react";

const TIPO_META = {
  finca: { label: "Venta en finca", icon: Home, color: "#16a34a" },
  ciudad: { label: "Envío a ciudad", icon: Truck, color: "#3b82f6" },
  refrigerar: { label: "Refrigerar", icon: Snowflake, color: "#0ea5e9" },
  descarte: { label: "Descarte", icon: AlertCircle, color: "#dc2626" },
  donaciones: { label: "Donaciones", icon: Heart, color: "#ec4899" },
};

export function VentasFinca() { return <Ventas tipo="finca" />; }
export function VentasCiudad() { return <Ventas tipo="ciudad" />; }
export function VentasRefrigerar() { return <Ventas tipo="refrigerar" />; }
export function VentasDescarte() { return <Ventas tipo="descarte" />; }
export function VentasDonaciones() { return <Ventas tipo="donaciones" />; }

function Ventas({ tipo }) {
  const toast = useToast();
  const { canDelete } = useAuth();
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);

  const load = () => api.get(`/ventas-${tipo}`).then((r) => setItems(r.data.ventas));
  useEffect(() => { load(); }, [tipo]);

  const remove = async (v) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/ventas-${tipo}/${v._id}`);
    toast.show("Eliminada");
    load();
  };

  const total = items.reduce((s, v) => s + (v.total || 0), 0);
  const totalCestas = items.reduce((s, v) => s + (v.cantidad_cestas || 0), 0);

  const meta = TIPO_META[tipo] || TIPO_META.finca;
  const Icon = meta.icon;
  const esIngreso = tipo === "finca" || tipo === "ciudad";  // los demás no son ventas con $$

  return (
    <div data-testid={`ventas-${tipo}-page`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Icon size={24} style={{ verticalAlign: "middle", color: meta.color }} /> {meta.label}</h1>
          <p className="page-subtitle">{esIngreso ? "Registro de ventas recibidas desde Asignación de Destino." : `Registro de ${meta.label.toLowerCase()} (sin valor de venta).`}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)} data-testid="venta-new-btn"><Plus size={16} /> Nuevo registro</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Total registros</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Cestas</div><div className="kpi-value" style={{ color: meta.color }}>{totalCestas.toFixed(2)}</div></div>
        {esIngreso && <div className="card kpi-card"><div className="kpi-label">Ingresos totales</div><div className="kpi-value" style={{ color: "#16a34a" }}>${total.toFixed(2)}</div></div>}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Registros de venta</h3>
        <table className="table">
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Cestas</th><th>kg</th><th>Precio unitario</th><th>Total</th><th>Acciones</th></tr></thead>
          <tbody>
            {items.map((v) => (
              <tr key={v._id}>
                <td>{new Date(v.fecha).toLocaleDateString()}</td>
                <td>{v.cliente || "—"}</td>
                <td>{v.cantidad_cestas}</td>
                <td>{v.cantidad_kg}</td>
                <td>${v.precio_unitario}</td>
                <td style={{ fontWeight: 700, color: "#16a34a" }}>${v.total}</td>
                <td>{canDelete("ventas") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(v)}><Trash2 size={16} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty-state">Sin ventas registradas</div>}
      </div>

      {showForm && <VentaForm tipo={tipo} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function VentaForm({ tipo, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    cantidad_cestas: 0,
    cantidad_kg: 0,
    precio_unitario: 0,
    total: 0,
    cliente: "",
    observaciones: "",
  });
  const [busy, setBusy] = useState(false);

  const onCestasChange = (v) => {
    setForm((f) => ({ ...f, cantidad_cestas: v, cantidad_kg: Number(v) * 14, total: Number(v) * Number(f.precio_unitario) }));
  };
  const onPrecioChange = (v) => {
    setForm((f) => ({ ...f, precio_unitario: v, total: Number(f.cantidad_cestas) * Number(v) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/ventas-${tipo}`, { ...form, fecha: form.fecha + "T12:00:00.000Z", cantidad_cestas: Number(form.cantidad_cestas), cantidad_kg: Number(form.cantidad_kg), precio_unitario: Number(form.precio_unitario), total: Number(form.total) });
      toast.show("Venta creada");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="venta-modal">
        <h2 className="modal-title">Nueva venta</h2>
        <div className="form-grid">
          <div className="field"><label>Fecha</label><input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required /></div>
          <div className="field"><label>Cliente</label><input className="input" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} /></div>
          <div className="field"><label>Cestas</label><input type="number" step="0.01" className="input" value={form.cantidad_cestas} onChange={(e) => onCestasChange(e.target.value)} required data-testid="venta-form-cestas" /></div>
          <div className="field"><label>Precio por cesta ($)</label><input type="number" step="0.01" className="input" value={form.precio_unitario} onChange={(e) => onPrecioChange(e.target.value)} required data-testid="venta-form-precio" /></div>
          <div className="field"><label>kg (auto)</label><input className="input" value={form.cantidad_kg} readOnly /></div>
          <div className="field"><label>Total (auto)</label><input className="input" value={`$${form.total}`} readOnly /></div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="venta-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

export default Ventas;
