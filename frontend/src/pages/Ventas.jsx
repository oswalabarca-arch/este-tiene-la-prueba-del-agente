import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Plus, Pencil, Trash2, Home, Truck, DollarSign, Snowflake, AlertCircle, Heart, TrendingUp, Wallet, AlertTriangle } from "lucide-react";
import { todayLocal } from "../lib/dates";

const TIPO_META = {
  finca: { label: "Venta en finca", icon: Home, color: "#16a34a" },
  ciudad: { label: "Envío a ciudad", icon: Truck, color: "#3b82f6" },
  refrigerar: { label: "Refrigerar", icon: Snowflake, color: "#0ea5e9" },
  descarte: { label: "Descarte", icon: AlertCircle, color: "#dc2626" },
  donaciones: { label: "Donaciones", icon: Heart, color: "#ec4899" },
};

const fmtMoney = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function VentasFinca() { return <Ventas tipo="finca" />; }
export function VentasCiudad() { return <Ventas tipo="ciudad" />; }
export function VentasRefrigerar() { return <Ventas tipo="refrigerar" />; }
export function VentasDescarte() { return <Ventas tipo="descarte" />; }
export function VentasDonaciones() { return <Ventas tipo="donaciones" />; }

function SubCard({ label, value, sub, color }) {
  return (
    <div style={{ background: "#fff", padding: 16, borderRadius: 10, border: "1px solid #bbf7d0" }}>
      <div style={{ color: "#64748b", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 6 }}>{value}</div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function MoneyCard({ title, icon: Icon, color, value, sub, testid }) {
  return (
    <div className="card" data-testid={testid}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, color: "#334155" }}>{title}</div>
        <Icon size={18} style={{ color }} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 8 }}>{value}</div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Ventas({ tipo }) {
  const toast = useToast();
  const { canDelete, canEdit } = useAuth();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null); // null=cerrado, {}=nuevo, {...}=editar
  const [unidad, setUnidad] = useState("cestas");

  const load = () => api.get(`/ventas-${tipo}`).then((r) => setItems(r.data.ventas));
  useEffect(() => { load(); }, [tipo]);

  const remove = async (v) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/ventas-${tipo}/${v._id}`);
    toast.show("Eliminada");
    load();
  };

  const meta = TIPO_META[tipo] || TIPO_META.finca;
  const Icon = meta.icon;
  const esIngreso = tipo === "finca" || tipo === "ciudad";  // los demás no son ventas con $$

  // Separar el stock recibido desde Asignación de destino vs las ventas reales (manuales)
  const realToday = todayLocal();
  const isAsig = (v) => v.origen === "asignacion_destino";
  const esHoy = (v) => (v.fecha || "").slice(0, 10) === realToday;
  const cestasDe = (v) => v.cantidad_cestas || 0;

  const ventas = items.filter((v) => !isAsig(v));    // ventas reales
  const asignados = items.filter((v) => isAsig(v));  // cestas recibidas (stock)

  // Cestas (hoy)
  const asignadoHoy = asignados.filter(esHoy).reduce((s, v) => s + cestasDe(v), 0);
  const movAsignado = asignados.filter(esHoy).length;
  const ventasHoy = ventas.filter(esHoy);
  const vendidoHoyCestas = ventasHoy.reduce((s, v) => s + cestasDe(v), 0);
  const disponible = asignadoHoy - vendidoHoyCestas;

  // Dinero
  const vendidoHoyDinero = ventasHoy.reduce((s, v) => s + (v.total || 0), 0);
  const totalVendido = ventas.reduce((s, v) => s + (v.total || 0), 0);
  const cobrado = ventas.reduce((s, v) => s + (v.abono_inicial || 0), 0);
  const deuda = ventas.reduce((s, v) => s + Math.max((v.total || 0) - (v.abono_inicial || 0), 0), 0);
  const deudores = ventas.filter((v) => (v.total || 0) - (v.abono_inicial || 0) > 0.001).length;
  const pctCobrado = totalVendido > 0 ? (cobrado / totalVendido) * 100 : 0;

  const factor = unidad === "kg" ? 14 : 1;
  const u = unidad === "kg" ? "kg" : "cestas";
  const fc = (cestas) => `${(cestas * factor).toFixed(2)} ${u}`;

  const rows = esIngreso ? ventas : items;

  return (
    <div data-testid={`ventas-${tipo}-page`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}><Icon size={24} style={{ verticalAlign: "middle", color: meta.color }} /> {meta.label}</h1>
          <p className="page-subtitle" style={{ marginTop: 4 }}>{esIngreso ? "Registro de ventas directas con seguimiento de abonos y saldos pendientes." : `Registro de ${meta.label.toLowerCase()} (sin valor de venta).`}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {esIngreso && (
            <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {["cestas", "kg"].map((opt) => (
                <button key={opt} type="button"
                  onClick={() => setUnidad(opt)}
                  data-testid={`ventas-toggle-${opt}`}
                  style={{ padding: "8px 16px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                    background: unidad === opt ? meta.color : "#fff", color: unidad === opt ? "#fff" : "#64748b" }}>
                  {opt === "cestas" ? "Cestas" : "kg"}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="venta-new-btn"><Plus size={16} /> {esIngreso ? "Nueva venta" : "Nuevo registro"}</button>
        </div>
      </div>

      {esIngreso && (
        <>
          {/* Acumulado de hoy */}
          <div className="card" style={{ background: "#f0fdf4", borderColor: "#bbf7d0", marginBottom: 16 }} data-testid="ventas-acumulado-hoy">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div className="kpi-icon-box" style={{ background: "#dcfce7", color: "#16a34a", width: 44, height: 44 }}><Icon size={20} /></div>
                <div>
                  <h3 style={{ margin: 0, color: "#15803d" }}>● Acumulado de hoy · {meta.label}</h3>
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 2, maxWidth: 620 }}>
                    {realToday} · Saldo inicial proveniente de "Asignación de destino &gt; Distribución del día", se descuenta al registrar cada venta.
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 30, fontWeight: 800, color: disponible > 0.001 ? "#15803d" : "#94a3b8" }} data-testid="ventas-disponible-grande">{fc(disponible)}</div>
                <div style={{ color: "#64748b", fontSize: 12 }}>Disponible para vender hoy</div>
              </div>
            </div>
            <div className="kpi-grid" style={{ marginTop: 16, gridTemplateColumns: "repeat(3, 1fr)" }}>
              <SubCard label="Asignado hoy" value={fc(asignadoHoy)} sub={`${movAsignado} movimiento(s) desde Asignación de destino`} color="#16a34a" />
              <SubCard label="Vendido hoy" value={fc(vendidoHoyCestas)} sub={`${ventasHoy.length} venta(s) registrada(s)`} color="#3b82f6" />
              <SubCard label="Disponible" value={fc(disponible)} sub="Restante a vender" color={disponible > 0.001 ? "#16a34a" : "#94a3b8"} />
            </div>
          </div>

          {/* Barra de dinero */}
          <div className="kpi-grid" style={{ marginBottom: 16, gridTemplateColumns: "repeat(4, 1fr)" }}>
            <MoneyCard title="Vendido (hoy)" icon={TrendingUp} color="#16a34a" value={fmtMoney(vendidoHoyDinero)} sub={`${vendidoHoyCestas.toFixed(2)} cestas en ${ventasHoy.length} venta(s)`} testid="money-vendido-hoy" />
            <MoneyCard title="Total vendido" icon={DollarSign} color="#0f172a" value={fmtMoney(totalVendido)} sub={`${ventas.length} venta(s) en vista`} testid="money-total-vendido" />
            <MoneyCard title="Cobrado" icon={Wallet} color="#3b82f6" value={fmtMoney(cobrado)} sub={`${pctCobrado.toFixed(1)}% del total`} testid="money-cobrado" />
            <MoneyCard title="Saldo / Deuda" icon={AlertTriangle} color="#dc2626" value={fmtMoney(deuda)} sub={`${deudores} deudor(es)`} testid="money-deuda" />
          </div>
        </>
      )}

      {!esIngreso && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          <div className="card kpi-card"><div className="kpi-label">Total registros</div><div className="kpi-value">{items.length}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Cestas</div><div className="kpi-value" style={{ color: meta.color }}>{items.reduce((s, v) => s + cestasDe(v), 0).toFixed(2)}</div></div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{esIngreso ? "Ventas registradas" : "Registros"}</h3>
        <table className="table">
          <thead><tr><th>Fecha</th><th>Cliente</th><th>Teléfono</th><th>Cestas</th><th>kg</th><th>Precio unitario</th><th>Total</th><th>Abono</th><th>Saldo</th>{!esIngreso && <th>Origen</th>}<th>Acciones</th></tr></thead>
          <tbody>
            {rows.map((v) => {
              const saldo = (v.total || 0) - (v.abono_inicial || 0);
              return (
              <tr key={v._id}>
                <td>{new Date(v.fecha).toLocaleDateString()}</td>
                <td>{v.cliente || "—"}</td>
                <td>{v.telefono || "—"}</td>
                <td>{v.cantidad_cestas}</td>
                <td>{v.cantidad_kg}</td>
                <td>${v.precio_unitario}</td>
                <td style={{ fontWeight: 700, color: "#16a34a" }}>${v.total}</td>
                <td>${v.abono_inicial || 0}</td>
                <td style={{ fontWeight: 600, color: saldo > 0 ? "#dc2626" : "#16a34a" }}>${saldo.toFixed(2)}</td>
                {!esIngreso && <td>{v.origen === "asignacion_destino" ? <span className="badge" style={{ background: "#dcfce7", color: "#15803d" }}>Asignación</span> : <span style={{ color: "#94a3b8", fontSize: 12 }}>Manual</span>}</td>}
                <td>
                  {canEdit("ventas") && <button className="btn-icon" onClick={() => setEditing(v)} title="Editar"><Pencil size={16} /></button>}
                  {canDelete("ventas") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(v)}><Trash2 size={16} /></button>}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty-state">{esIngreso ? "Sin ventas registradas. Usá \"Nueva venta\" para registrar una." : "Sin registros"}</div>}
      </div>

      {editing && <VentaForm tipo={tipo} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function VentaForm({ tipo, initial = {}, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!initial._id;
  const [form, setForm] = useState({
    fecha: (initial.fecha || todayLocal()).slice(0, 10),
    cantidad_cestas: initial.cantidad_cestas ?? 0,
    cantidad_kg: initial.cantidad_kg ?? 0,
    precio_unitario: initial.precio_unitario ?? 0,
    total: initial.total ?? 0,
    cliente: initial.cliente || "",
    telefono: initial.telefono || "",
    abono_inicial: initial.abono_inicial ?? 0,
    observaciones: initial.observaciones || "",
  });
  const [busy, setBusy] = useState(false);

  const num = (v) => (v === 0 || v === "" || v == null ? "" : v);
  const saldo = Number(form.total || 0) - Number(form.abono_inicial || 0);

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
      const payload = {
        ...form,
        fecha: form.fecha + "T12:00:00.000Z",
        cantidad_cestas: Number(form.cantidad_cestas),
        cantidad_kg: Number(form.cantidad_kg),
        precio_unitario: Number(form.precio_unitario),
        total: Number(form.total),
        abono_inicial: Number(form.abono_inicial),
      };
      if (isEdit) await api.put(`/ventas-${tipo}/${initial._id}`, payload);
      else await api.post(`/ventas-${tipo}`, payload);
      toast.show(isEdit ? "Registro actualizado" : "Registro creado");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="venta-modal">
        <h2 className="modal-title">{isEdit ? "Editar registro de venta" : "Nuevo registro de venta"}</h2>
        <div className="form-grid">
          <div className="field"><label>Nombre del cliente</label><input className="input" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} data-testid="venta-form-cliente" /></div>
          <div className="field"><label>Teléfono</label><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Ej: 0414-1234567" data-testid="venta-form-telefono" /></div>
          <div className="field"><label>Cantidad de cestas</label><input type="number" step="0.01" min="0" className="input" value={num(form.cantidad_cestas)} placeholder="0" onChange={(e) => onCestasChange(e.target.value)} required data-testid="venta-form-cestas" /></div>
          <div className="field"><label>Precio por cesta ($)</label><input type="number" step="0.01" min="0" className="input" value={num(form.precio_unitario)} placeholder="0" onChange={(e) => onPrecioChange(e.target.value)} required data-testid="venta-form-precio" /></div>
          <div className="field"><label>kg (auto)</label><input className="input" value={form.cantidad_kg} readOnly /></div>
          <div className="field"><label>Total (auto)</label><input className="input" value={`$${form.total}`} readOnly data-testid="venta-form-total" /></div>
          <div className="field"><label>Abono inicial ($)</label><input type="number" step="0.01" min="0" className="input" value={num(form.abono_inicial)} placeholder="0" onChange={(e) => setForm({ ...form, abono_inicial: e.target.value })} data-testid="venta-form-abono" /></div>
          <div className="field"><label>Saldo pendiente (auto)</label><input className="input" value={`$${saldo.toFixed(2)}`} readOnly style={{ color: saldo > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }} data-testid="venta-form-saldo" /></div>
          <div className="field"><label>Fecha</label><input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required data-testid="venta-form-fecha" /></div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Observaciones</label>
          <textarea className="textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} data-testid="venta-form-observaciones" />
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
