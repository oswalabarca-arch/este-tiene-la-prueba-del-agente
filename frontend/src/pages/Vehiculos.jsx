import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Car, Plus, Pencil, Trash2, Fuel, Wrench, Users as UsersIcon, ArrowLeft, DollarSign } from "lucide-react";

const COMBUSTIBLES = ["gasolina", "diesel", "electrico", "hibrido"];
const ESTADOS = ["activo", "mantenimiento", "inactivo"];

const CATS_GASTO = [
  { key: "gasolina", label: "Gasolina", icon: Fuel, color: "#dc2626", bg: "#fee2e2" },
  { key: "repuestos", label: "Repuestos", icon: Wrench, color: "#f59e0b", bg: "#fef3c7" },
  { key: "mano_obra", label: "Mano de Obra", icon: UsersIcon, color: "#3b82f6", bg: "#dbeafe" },
];

export default function Vehiculos() {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [vehiculos, setVehiculos] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);  // vehículo seleccionado para detalle

  const load = async () => {
    const [v, g] = await Promise.all([api.get("/vehiculos"), api.get("/gastos-vehiculos")]);
    setVehiculos(v.data.vehiculos);
    setGastos(g.data.gastos);
  };
  useEffect(() => { load(); }, []);

  const remove = async (v) => {
    if (!window.confirm(`¿Eliminar vehículo "${v.nombre}"? Los gastos asociados no se borran.`)) return;
    await api.delete(`/vehiculos/${v._id}`);
    toast.show("Eliminado");
    load();
  };

  const totalsPorVehiculo = useMemo(() => {
    const o = {};
    gastos.forEach((g) => {
      if (!o[g.vehiculo_id]) o[g.vehiculo_id] = { gasolina: 0, repuestos: 0, mano_obra: 0, total: 0, count: 0 };
      o[g.vehiculo_id][g.categoria] = (o[g.vehiculo_id][g.categoria] || 0) + (g.monto || 0);
      o[g.vehiculo_id].total += g.monto || 0;
      o[g.vehiculo_id].count += 1;
    });
    return o;
  }, [gastos]);

  const totalGastosTodos = gastos.reduce((s, g) => s + (g.monto || 0), 0);
  const totalInversion = vehiculos.reduce((s, v) => s + (v.costo_adquisicion || 0), 0);

  // Vista de detalle
  if (selected) {
    const gastosVehiculo = gastos.filter((g) => g.vehiculo_id === selected._id);
    const totals = totalsPorVehiculo[selected._id] || { gasolina: 0, repuestos: 0, mano_obra: 0, total: 0 };

    return (
      <div data-testid="vehiculo-detail-page">
        <button className="btn" onClick={() => setSelected(null)} style={{ marginBottom: 18 }}><ArrowLeft size={16} /> Volver a vehículos</button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h1 className="page-title"><Car size={24} style={{ verticalAlign: "middle", color: "#3b82f6" }} /> {selected.nombre}</h1>
            <p className="page-subtitle">
              {[selected.marca, selected.modelo, selected.año].filter(Boolean).join(" ")}
              {selected.placa && ` · Placa: ${selected.placa}`}
              {" · "}Adquisición: <b>${(selected.costo_adquisicion || 0).toFixed(2)}</b>
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setEditing(selected)}><Pencil size={16} /> Editar vehículo</button>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          {CATS_GASTO.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.key} className="card kpi-card">
                <div className="kpi-head">
                  <div className="kpi-label">{c.label}</div>
                  <div className="kpi-icon-box" style={{ background: c.bg, color: c.color }}><Icon size={18} /></div>
                </div>
                <div className="kpi-value" style={{ color: c.color }}>${totals[c.key].toFixed(2)}</div>
              </div>
            );
          })}
          <div className="card kpi-card">
            <div className="kpi-label">Total gastado</div>
            <div className="kpi-value">${totals.total.toFixed(2)}</div>
            <div style={{ color: "#64748b", fontSize: 13 }}>{gastosVehiculo.length} gastos</div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Historial de gastos</h3>
          <table className="table">
            <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th></tr></thead>
            <tbody>
              {gastosVehiculo.map((g) => {
                const c = CATS_GASTO.find((x) => x.key === g.categoria);
                return (
                  <tr key={g._id}>
                    <td>{new Date(g.fecha).toLocaleDateString()}</td>
                    <td><span className="badge" style={{ background: c?.bg, color: c?.color }}>{c?.label || g.categoria}</span></td>
                    <td>{g.descripcion || "—"}</td>
                    <td style={{ fontWeight: 700, color: c?.color }}>${g.monto?.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {gastosVehiculo.length === 0 && <div className="empty-state">Sin gastos. Registra desde el módulo Compras → "Gastos de vehículo".</div>}
        </div>

        {editing && <VehiculoModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      </div>
    );
  }

  // Vista de lista
  return (
    <div data-testid="vehiculos-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Car size={24} style={{ verticalAlign: "middle", color: "#3b82f6" }} /> Vehículos</h1>
          <p className="page-subtitle">Registro de vehículos y control de sus gastos. Los gastos se registran desde Compras → "Gastos de vehículo".</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="vehiculo-new-btn"><Plus size={16} /> Nuevo vehículo</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Vehículos registrados</div><div className="kpi-value" style={{ color: "#3b82f6" }}>{vehiculos.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Inversión en vehículos</div><div className="kpi-value" style={{ color: "#16a34a" }}>${totalInversion.toFixed(2)}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Total gastos operativos</div><div className="kpi-value" style={{ color: "#dc2626" }}>${totalGastosTodos.toFixed(2)}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Gastos registrados</div><div className="kpi-value">{gastos.length}</div></div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))", gap: 16 }}>
        {vehiculos.map((v) => {
          const t = totalsPorVehiculo[v._id] || { gasolina: 0, repuestos: 0, mano_obra: 0, total: 0, count: 0 };
          return (
            <div key={v._id} className="card" data-testid={`vehiculo-card-${v._id}`} style={{ cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }} onClick={() => setSelected(v)}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 16px rgba(15,23,42,0.06)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{v.nombre}</div>
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
                    {[v.marca, v.modelo, v.año].filter(Boolean).join(" ") || "—"}
                  </div>
                  {v.placa && <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>Placa: <b>{v.placa}</b></div>}
                </div>
                <span className={`badge ${v.estado === "activo" ? "badge-primary" : v.estado === "mantenimiento" ? "badge-warn" : "badge-rose"}`}>{v.estado}</span>
              </div>

              <div style={{ marginTop: 12, padding: "10px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 12, color: "#64748b" }}>Valor de adquisición</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#16a34a" }}>${(v.costo_adquisicion || 0).toFixed(2)}</div>
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Gastos operativos ({t.count})</div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                  <span style={{ color: "#dc2626" }}>⛽ Gasolina</span><b>${t.gasolina.toFixed(2)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                  <span style={{ color: "#f59e0b" }}>🔧 Repuestos</span><b>${t.repuestos.toFixed(2)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span style={{ color: "#3b82f6" }}>👷 Mano de obra</span><b>${t.mano_obra.toFixed(2)}</b>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px dashed #e2e8f0", fontWeight: 700 }}>
                  <span>Total</span><span>${t.total.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 12 }}>
                {canEdit("equipos") && <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setEditing(v); }}><Pencil size={16} /></button>}
                {canDelete("equipos") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={(e) => { e.stopPropagation(); remove(v); }}><Trash2 size={16} /></button>}
              </div>
            </div>
          );
        })}
      </div>
      {vehiculos.length === 0 && <div className="card empty-state">Sin vehículos registrados. Crea el primero con "Nuevo vehículo".</div>}

      {editing && <VehiculoModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function VehiculoModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    nombre: "", marca: "", modelo: "", año: "", placa: "", color: "",
    tipo_combustible: "gasolina", kilometraje_inicial: 0, costo_adquisicion: 0,
    fecha_adquisicion: "", estado: "activo", responsable: "", observaciones: "",
    ...initial,
    fecha_adquisicion: (initial.fecha_adquisicion || "").slice(0, 10),
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        año: form.año ? Number(form.año) : null,
        kilometraje_inicial: Number(form.kilometraje_inicial || 0),
        costo_adquisicion: Number(form.costo_adquisicion || 0),
        fecha_adquisicion: form.fecha_adquisicion || null,
      };
      if (isNew) await api.post("/vehiculos", payload);
      else await api.put(`/vehiculos/${initial._id}`, payload);
      toast.show("Guardado");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="vehiculo-modal">
        <h2 className="modal-title">{isNew ? "Nuevo vehículo" : `Editar: ${form.nombre}`}</h2>
        <div className="form-grid">
          <div className="field"><label>Nombre / Identificador</label><input className="input" placeholder="Camioneta, Tractor 1, etc." value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required data-testid="vehiculo-form-nombre" /></div>
          <div className="field"><label>Placa</label><input className="input" value={form.placa || ""} onChange={(e) => setForm({ ...form, placa: e.target.value })} /></div>
          <div className="field"><label>Marca</label><input className="input" value={form.marca || ""} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></div>
          <div className="field"><label>Modelo</label><input className="input" value={form.modelo || ""} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></div>
          <div className="field"><label>Año</label><input type="number" className="input" value={form.año || ""} onChange={(e) => setForm({ ...form, año: e.target.value })} placeholder="2024" /></div>
          <div className="field"><label>Color</label><input className="input" value={form.color || ""} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
          <div className="field"><label>Combustible</label><select className="select" value={form.tipo_combustible} onChange={(e) => setForm({ ...form, tipo_combustible: e.target.value })}>{COMBUSTIBLES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="field"><label>Estado</label><select className="select" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>{ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="field">
            <label>Valor de adquisición ($)</label>
            <input type="number" step="0.01" className="input"
              value={form.costo_adquisicion === 0 || form.costo_adquisicion === "" ? "" : form.costo_adquisicion}
              onChange={(e) => setForm({ ...form, costo_adquisicion: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.costo_adquisicion === 0) e.target.select(); }}
              placeholder="0"
              data-testid="vehiculo-form-valor" />
          </div>
          <div className="field"><label>Fecha de adquisición</label><input type="date" className="input" value={form.fecha_adquisicion} onChange={(e) => setForm({ ...form, fecha_adquisicion: e.target.value })} /></div>
          <div className="field"><label>Kilometraje inicial</label><input type="number" className="input"
            value={form.kilometraje_inicial === 0 || form.kilometraje_inicial === "" ? "" : form.kilometraje_inicial}
            onChange={(e) => setForm({ ...form, kilometraje_inicial: e.target.value === "" ? 0 : Number(e.target.value) })}
            onFocus={(e) => { if (form.kilometraje_inicial === 0) e.target.select(); }}
            placeholder="0" /></div>
          <div className="field"><label>Responsable</label><input className="input" value={form.responsable || ""} onChange={(e) => setForm({ ...form, responsable: e.target.value })} /></div>
        </div>
        <div className="field" style={{ marginTop: 12 }}><label>Observaciones</label><textarea className="textarea" value={form.observaciones || ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="vehiculo-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
