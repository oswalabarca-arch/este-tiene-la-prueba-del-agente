import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Snowflake, Plus, Trash2 } from "lucide-react";
import { todayLocal } from "../lib/dates";

export default function Frio() {
  const toast = useToast();
  const { canDelete } = useAuth();
  const [items, setItems] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ fecha_ingreso: todayLocal(), cantidad_cestas: 0, lote: "", variedad: "", observaciones: "" });

  const load = () => api.get("/frio-registros").then((r) => setItems(r.data.registros));
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    await api.post("/frio-registros", { ...form, fecha_ingreso: form.fecha_ingreso + "T12:00:00.000Z", cantidad_cestas: Number(form.cantidad_cestas) });
    setShow(false);
    setForm({ fecha_ingreso: todayLocal(), cantidad_cestas: 0, lote: "", variedad: "", observaciones: "" });
    toast.show("Ingreso registrado");
    load();
  };

  const remove = async (r) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/frio-registros/${r._id}`);
    load();
  };

  const totalCestas = items.reduce((s, r) => s + (r.cantidad_cestas || 0), 0);

  return (
    <div data-testid="frio-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Snowflake size={24} style={{ verticalAlign: "middle", color: "#0ea5e9" }} /> Cámara Fría</h1>
          <p className="page-subtitle">Registros de fruta almacenada en cámara fría.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShow(true)}><Plus size={16} /> Nuevo ingreso</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Total registros</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Cestas almacenadas</div><div className="kpi-value" style={{ color: "#0ea5e9" }}>{totalCestas.toFixed(2)}</div></div>
      </div>

      <div className="card">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Lote</th><th>Variedad</th><th>Cestas</th><th>Origen</th><th>Observaciones</th><th>Acciones</th></tr></thead>
          <tbody>
            {items.map((r) => (
              <tr key={r._id}>
                <td>{new Date(r.fecha_ingreso).toLocaleDateString()}</td>
                <td>
                  {r.tipo_conservacion === "congelado"
                    ? <span className="badge" style={{ background: "#dbeafe", color: "#0284c7" }}>Congelado</span>
                    : r.tipo_conservacion === "refrigerado"
                    ? <span className="badge" style={{ background: "#e0f2fe", color: "#0ea5e9" }}>Refrigerado</span>
                    : "—"}
                </td>
                <td>{r.lote ? <span className="badge badge-primary">{r.lote}</span> : "—"}</td>
                <td>{r.variedad || "—"}</td>
                <td style={{ fontWeight: 700 }}>{r.cantidad_cestas}</td>
                <td>{r.origen === "asignacion_destino" ? <span className="badge" style={{ background: "#dcfce7", color: "#15803d" }}>Asignación</span> : <span style={{ color: "#94a3b8", fontSize: 12 }}>Manual</span>}</td>
                <td>{r.observaciones}</td>
                <td>{canDelete("frio") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(r)}><Trash2 size={16} /></button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty-state">Sin registros en frío</div>}
      </div>

      {show && (
        <div className="modal-overlay" onClick={() => setShow(false)}>
          <form className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2 className="modal-title">Nuevo ingreso a frío</h2>
            <div className="form-grid">
              <div className="field"><label>Fecha</label><input type="date" className="input" value={form.fecha_ingreso} onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })} required /></div>
              <div className="field"><label>Lote</label><input className="input" value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} /></div>
              <div className="field"><label>Variedad</label><input className="input" value={form.variedad} onChange={(e) => setForm({ ...form, variedad: e.target.value })} /></div>
              <div className="field"><label>Cantidad (cestas)</label><input type="number" step="0.01" className="input" value={form.cantidad_cestas} onChange={(e) => setForm({ ...form, cantidad_cestas: e.target.value })} required /></div>
            </div>
            <div className="field" style={{ marginTop: 12 }}><label>Observaciones</label><textarea className="textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setShow(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Guardar</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
