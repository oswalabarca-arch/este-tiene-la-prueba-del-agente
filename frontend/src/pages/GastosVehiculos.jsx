import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Car, Plus, Pencil, Trash2, Fuel, Wrench, Users as UsersIcon } from "lucide-react";

const CATEGORIAS = [
  { key: "gasolina", label: "Gasolina", icon: Fuel, color: "#dc2626", bg: "#fee2e2" },
  { key: "repuestos", label: "Repuestos", icon: Wrench, color: "#f59e0b", bg: "#fef3c7" },
  { key: "mano_obra", label: "Mano de Obra", icon: UsersIcon, color: "#3b82f6", bg: "#dbeafe" },
];

export default function GastosVehiculos() {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [items, setItems] = useState([]);
  const [filtroCat, setFiltroCat] = useState("");
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/gastos-vehiculos").then((r) => setItems(r.data.gastos));
  useEffect(() => { load(); }, []);

  const remove = async (g) => {
    if (!window.confirm("¿Eliminar gasto?")) return;
    await api.delete(`/gastos-vehiculos/${g._id}`);
    toast.show("Eliminado");
    load();
  };

  const filtered = filtroCat ? items.filter((g) => g.categoria === filtroCat) : items;

  const totalsPorCat = useMemo(() => {
    const o = { gasolina: 0, repuestos: 0, mano_obra: 0 };
    items.forEach((g) => { o[g.categoria] = (o[g.categoria] || 0) + (g.monto || 0); });
    return o;
  }, [items]);

  const totalGeneral = items.reduce((s, g) => s + (g.monto || 0), 0);

  return (
    <div data-testid="gastos-vehiculos-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Car size={24} style={{ verticalAlign: "middle", color: "#3b82f6" }} /> Vehículos — Gastos</h1>
          <p className="page-subtitle">Registro de gastos de vehículos: gasolina, repuestos y mano de obra.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ categoria: filtroCat || "gasolina" })} data-testid="gasto-new-btn"><Plus size={16} /> Nuevo gasto</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        {CATEGORIAS.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.key} className="card kpi-card" data-testid={`gasto-kpi-${c.key}`}>
              <div className="kpi-head">
                <div className="kpi-label">{c.label}</div>
                <div className="kpi-icon-box" style={{ background: c.bg, color: c.color }}><Icon size={18} /></div>
              </div>
              <div className="kpi-value" style={{ color: c.color }}>${totalsPorCat[c.key].toFixed(2)}</div>
              <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => setEditing({ categoria: c.key })}>
                <Plus size={14} /> Registrar
              </button>
            </div>
          );
        })}
        <div className="card kpi-card">
          <div className="kpi-label">Total general</div>
          <div className="kpi-value">${totalGeneral.toFixed(2)}</div>
          <div style={{ color: "#64748b", fontSize: 13 }}>{items.length} registros</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="pill-group">
          <button className={`pill ${!filtroCat ? "active" : ""}`} onClick={() => setFiltroCat("")} data-testid="gasto-filtro-todos">Todos</button>
          {CATEGORIAS.map((c) => (
            <button key={c.key} className={`pill ${filtroCat === c.key ? "active" : ""}`} onClick={() => setFiltroCat(c.key)} data-testid={`gasto-filtro-${c.key}`}>{c.label}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Registros de gasto</h3>
        <table className="table">
          <thead>
            <tr><th>Fecha</th><th>Categoría</th><th>Vehículo</th><th>Descripción</th><th>Monto</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {filtered.map((g) => {
              const c = CATEGORIAS.find((x) => x.key === g.categoria);
              return (
                <tr key={g._id}>
                  <td>{new Date(g.fecha).toLocaleDateString()}</td>
                  <td><span className="badge" style={{ background: c?.bg, color: c?.color }}>{c?.label || g.categoria}</span></td>
                  <td>{g.vehiculo || "—"}</td>
                  <td>{g.descripcion || "—"}</td>
                  <td style={{ fontWeight: 700, color: c?.color }}>${g.monto?.toFixed(2)}</td>
                  <td>
                    {canEdit("equipos") && <button className="btn-icon" onClick={() => setEditing(g)}><Pencil size={16} /></button>}
                    {canDelete("equipos") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(g)}><Trash2 size={16} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">Sin gastos registrados</div>}
      </div>

      {editing && <GastoModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function GastoModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    categoria: "gasolina",
    vehiculo: "",
    monto: 0,
    fecha: today,
    descripcion: "",
    ...initial,
    fecha: (initial.fecha || today).slice(0, 10),
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, monto: Number(form.monto), fecha: form.fecha + "T12:00:00.000Z" };
      if (isNew) await api.post("/gastos-vehiculos", payload);
      else await api.put(`/gastos-vehiculos/${initial._id}`, payload);
      toast.show("Guardado");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="gasto-modal">
        <h2 className="modal-title">{isNew ? "Nuevo gasto de vehículo" : "Editar gasto"}</h2>
        <div className="form-grid">
          <div className="field">
            <label>Categoría</label>
            <select className="select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} required data-testid="gasto-form-categoria">
              {CATEGORIAS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required />
          </div>
          <div className="field">
            <label>Vehículo (opcional)</label>
            <input className="input" placeholder="Camioneta, Tractor, etc." value={form.vehiculo} onChange={(e) => setForm({ ...form, vehiculo: e.target.value })} data-testid="gasto-form-vehiculo" />
          </div>
          <div className="field">
            <label>Monto ($)</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.monto === 0 || form.monto === "" ? "" : form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.monto === 0) e.target.select(); }}
              placeholder="0"
              required
              data-testid="gasto-form-monto"
            />
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Descripción</label>
          <textarea className="textarea" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Detalle del gasto..." />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="gasto-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
