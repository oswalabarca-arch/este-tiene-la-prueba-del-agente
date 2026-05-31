import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Send, Plus, Trash2, Truck, Snowflake, Home, AlertCircle } from "lucide-react";
import { todayLocal } from "../lib/dates";
import { CalidadBoxes } from "./Cosecha";

const DESTINOS = [
  { key: "venta_finca", label: "Venta en finca", icon: Home, color: "#16a34a", bg: "#dcfce7" },
  { key: "enviar_ciudad", label: "Envío a ciudad", icon: Truck, color: "#3b82f6", bg: "#dbeafe" },
  { key: "frio", label: "Cámara fría", icon: Snowflake, color: "#0ea5e9", bg: "#e0f2fe" },
  { key: "descarte", label: "Descarte", icon: AlertCircle, color: "#dc2626", bg: "#fee2e2" },
];

export default function AsignacionDestino() {
  const toast = useToast();
  const { canDelete } = useAuth();
  const [today] = useState(todayLocal());
  const [asignaciones, setAsignaciones] = useState([]);
  const [cosechas, setCosechas] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const [a, c] = await Promise.all([
      api.get(`/asignaciones-destino?fecha=${today}`),
      api.get(`/cosechas?fecha_desde=${today}T00:00:00.000Z&fecha_hasta=${today}T23:59:59.999Z`),
    ]);
    setAsignaciones(a.data.asignaciones);
    setCosechas(c.data.cosechas);
  };
  useEffect(() => { load(); }, [today]);

  // Total cosechado hoy en cestas
  const KG = 14;
  const cestas_hoy = cosechas.reduce((sum, c) => {
    const totalCalidad = (c.primera_calidad || 0) + (c.segunda_calidad || 0) + (c.tercera_calidad || 0) + (c.descarte || 0);
    return sum + (c.unidad === "kg" ? totalCalidad / KG : totalCalidad);
  }, 0);

  // Desglose de calidades de la cosecha del día (en cestas) para decidir destino
  const totalsCalidad = cosechas.reduce((acc, c) => {
    const mult = c.unidad === "kg" ? 1 / KG : 1;
    ["primera_calidad", "segunda_calidad", "tercera_calidad", "descarte"].forEach((k) => {
      acc[k] += (c[k] || 0) * mult;
    });
    return acc;
  }, { primera_calidad: 0, segunda_calidad: 0, tercera_calidad: 0, descarte: 0 });
  const sumCalidad = totalsCalidad.primera_calidad + totalsCalidad.segunda_calidad + totalsCalidad.tercera_calidad + totalsCalidad.descarte;
  const asignado = asignaciones.reduce((s, a) => s + (a.cantidad_cestas || 0), 0);
  const disponible = cestas_hoy - asignado;

  const totalsPorDestino = DESTINOS.reduce((acc, d) => {
    acc[d.key] = asignaciones.filter((a) => a.destino === d.key).reduce((s, a) => s + (a.cantidad_cestas || 0), 0);
    return acc;
  }, {});

  const remove = async (a) => {
    if (!window.confirm("¿Eliminar asignación?")) return;
    await api.delete(`/asignaciones-destino/${a._id}`);
    toast.show("Eliminada");
    load();
  };

  return (
    <div data-testid="asignacion-page">
      <h1 className="page-title"><Send size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Asignación de Destino</h1>
      <p className="page-subtitle">Distribuye la cosecha del día ({today}) hacia los diferentes destinos.</p>

      <div className="card" style={{ marginBottom: 18, background: "#f0fdf4", borderColor: "#bbf7d0" }} data-testid="asignacion-cosecha-dia">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0, color: "#15803d" }}>● Cosecha del día</h3>
            <div style={{ color: "#64748b", fontSize: 13 }}>Calidades cosechadas hoy ({today}). Úsalas para decidir el destino de cada calidad.</div>
          </div>
          <span className="badge badge-primary">{cosechas.length} cosecha(s) · {sumCalidad.toFixed(2)} cestas</span>
        </div>
        <CalidadBoxes totals={totalsCalidad} sum={sumCalidad} unidad="cestas" compact />
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card">
          <div className="kpi-label">Cosechado hoy</div>
          <div className="kpi-value">{cestas_hoy.toFixed(2)}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>cestas</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Ya asignado</div>
          <div className="kpi-value" style={{ color: "#3b82f6" }}>{asignado.toFixed(2)}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>cestas</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Disponible</div>
          <div className="kpi-value" style={{ color: disponible >= 0 ? "#16a34a" : "#dc2626" }}>{disponible.toFixed(2)}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>cestas</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Asignaciones registradas</div>
          <div className="kpi-value">{asignaciones.length}</div>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        {DESTINOS.map((d) => {
          const Icon = d.icon;
          return (
            <div key={d.key} className="card kpi-card" data-testid={`destino-card-${d.key}`}>
              <div className="kpi-head">
                <div className="kpi-label">{d.label}</div>
                <div className="kpi-icon-box" style={{ background: d.bg, color: d.color }}><Icon size={18} /></div>
              </div>
              <div className="kpi-value" style={{ color: d.color }}>{totalsPorDestino[d.key].toFixed(2)}</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>cestas</div>
              <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setEditing({ destino: d.key })} data-testid={`destino-add-${d.key}`}>
                <Plus size={14} /> Asignar a {d.label}
              </button>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>Asignaciones de hoy</h3>
          <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="asignacion-new-btn"><Plus size={16} /> Nueva asignación</button>
        </div>
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr><th>Destino</th><th>Cantidad ingresada</th><th>Cestas</th><th>kg</th><th>Observaciones</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {asignaciones.map((a) => {
              const d = DESTINOS.find((x) => x.key === a.destino);
              return (
                <tr key={a._id}>
                  <td><span className="badge" style={{ background: d?.bg, color: d?.color }}>{d?.label || a.destino}</span></td>
                  <td>{a.cantidad_ingresada} {a.unidad_ingreso}</td>
                  <td>{a.cantidad_cestas?.toFixed(2)}</td>
                  <td>{a.cantidad_kg?.toFixed(2)} kg</td>
                  <td>{a.observaciones}</td>
                  <td>{canDelete("cosecha") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(a)}><Trash2 size={16} /></button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {asignaciones.length === 0 && <div className="empty-state">No hay asignaciones hoy</div>}
      </div>

      {editing && <AsignacionModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function AsignacionModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    destino: initial.destino || "venta_finca",
    unidad_ingreso: "cestas",
    cantidad_ingresada: 0,
    fecha: todayLocal() + "T12:00:00.000Z",
    observaciones: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/asignaciones-destino", { ...form, cantidad_ingresada: Number(form.cantidad_ingresada) });
      toast.show("Asignación creada");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="asignacion-modal">
        <h2 className="modal-title">Nueva asignación de destino</h2>
        <div className="form-grid">
          <div className="field">
            <label>Destino</label>
            <select className="select" value={form.destino} onChange={(e) => setForm({ ...form, destino: e.target.value })} required>
              {DESTINOS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Unidad de ingreso</label>
            <select className="select" value={form.unidad_ingreso} onChange={(e) => setForm({ ...form, unidad_ingreso: e.target.value })}>
              <option value="cestas">Cestas</option>
              <option value="kg">Kilogramos</option>
            </select>
          </div>
          <div className="field">
            <label>Cantidad</label>
            <input type="number" step="0.01" className="input" value={form.cantidad_ingresada} onChange={(e) => setForm({ ...form, cantidad_ingresada: e.target.value })} required data-testid="asignacion-form-cantidad" />
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Observaciones</label>
          <textarea className="textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="asignacion-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
