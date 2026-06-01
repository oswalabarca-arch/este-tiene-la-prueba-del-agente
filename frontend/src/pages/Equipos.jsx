import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Plus, Pencil, Trash2, Cog, Wrench, Eye } from "lucide-react";
import { DecimalInput } from "../components/DecimalInput";

// Sólo dos categorías ahora: motor y herramienta
const ESTADOS = ["activo", "mantenimiento", "inactivo"];

const CAT_LABELS = {
  motor: { label: "Motores", icon: Cog, color: "#8b5cf6", bg: "#ede9fe" },
  herramienta: { label: "Herramientas", icon: Wrench, color: "#f59e0b", bg: "#fef3c7" },
};

const URL_TO_CAT = { motores: "motor", herramientas: "herramienta" };

export default function Equipos() {
  const toast = useToast();
  const navigate = useNavigate();
  const { canEdit, canDelete } = useAuth();
  const { categoria } = useParams();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);  // equipo a ver (solo lectura)

  const filterCat = categoria ? URL_TO_CAT[categoria] : null;

  // Redirección defensiva: si la URL no tiene una categoría válida, ir a motores
  useEffect(() => {
    if (!filterCat) navigate("/dashboard/equipos/motores", { replace: true });
  }, [filterCat, navigate]);

  const load = () => api.get("/equipos").then((r) => setItems(r.data.equipos)).catch(() => {});
  useEffect(() => { if (filterCat) load(); }, [filterCat]);

  if (!filterCat) return null;  // mientras redirige

  const meta = CAT_LABELS[filterCat];
  const Icon = meta.icon;

  const remove = async (e) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/equipos/${e._id}`);
    toast.show("Eliminado");
    load();
  };

  const filtered = items.filter((e) => (e.categoria || "") === filterCat);
  const totalValor = filtered.reduce((s, e) => s + (e.costo_adquisicion || 0) * (e.cantidad || 1), 0);
  const totalUnidades = filtered.reduce((s, e) => s + (e.cantidad || 1), 0);

  return (
    <div data-testid={`equipos-page-${filterCat}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Icon size={24} style={{ verticalAlign: "middle", color: meta.color }} /> Equipos — {meta.label}</h1>
          <p className="page-subtitle">Inventario de {meta.label.toLowerCase()} con su precio unitario y cantidad.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ categoria: filterCat })} data-testid="equipo-new-btn"><Plus size={16} /> Nuevo</button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Registros</div><div className="kpi-value" style={{ color: meta.color }}>{filtered.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Unidades totales</div><div className="kpi-value">{totalUnidades}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Valor del inventario</div><div className="kpi-value" style={{ color: "#16a34a" }}>${totalValor.toFixed(2)}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Activos</div><div className="kpi-value">{filtered.filter((e) => e.estado === "activo").length}</div></div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Inventario de {meta.label}</h3>
        <table className="table">
          <thead><tr><th>Nombre</th><th>Marca/Modelo</th><th>Estado</th><th>Cantidad</th><th>Precio unit.</th><th>Total</th><th>Acciones</th></tr></thead>
          <tbody>
            {filtered.map((e) => {
              const cantidad = e.cantidad || 1;
              const precio = e.costo_adquisicion || 0;
              return (
                <tr key={e._id} data-testid={`equipo-row-${e._id}`}>
                  <td style={{ fontWeight: 600 }}>{e.nombre}</td>
                  <td>{[e.marca, e.modelo].filter(Boolean).join(" ") || "—"}</td>
                  <td><span className={`badge ${e.estado === "activo" ? "badge-primary" : e.estado === "mantenimiento" ? "badge-warn" : "badge-rose"}`}>{e.estado}</span></td>
                  <td style={{ fontWeight: 600 }}>{cantidad}</td>
                  <td>${precio.toFixed(2)}</td>
                  <td style={{ fontWeight: 700, color: "#16a34a" }}>${(cantidad * precio).toFixed(2)}</td>
                  <td>
                    <button className="btn-icon" style={{ color: "#3b82f6" }} title="Ver" onClick={() => setViewing(e)} data-testid={`equipo-ver-${e._id}`}><Eye size={16} /></button>
                    {canEdit("equipos") && <button className="btn-icon" title="Editar" onClick={() => setEditing(e)}><Pencil size={16} /></button>}
                    {canDelete("equipos") && <button className="btn-icon" style={{ color: "#dc2626" }} title="Eliminar" onClick={() => remove(e)}><Trash2 size={16} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">Sin {meta.label.toLowerCase()} registrados. Usa el botón "Nuevo" para empezar.</div>}
      </div>

      {editing && <EquipoModal initial={editing} filterCat={filterCat} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {viewing && <EquipoViewModal equipo={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function EquipoModal({ initial, filterCat, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const lockedCategoria = isNew ? filterCat : (initial.categoria || filterCat);
  const [form, setForm] = useState({
    nombre: "", marca: "", modelo: "", año: "",
    estado: "activo", cantidad: 1, costo_adquisicion: 0, fecha_adquisicion: "",
    ubicacion: "", responsable: "", observaciones: "",
    ...initial,
    categoria: lockedCategoria,
    fecha_adquisicion: (initial.fecha_adquisicion || "").slice(0, 10),
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        categoria: lockedCategoria,
        año: form.año ? Number(form.año) : null,
        cantidad: Math.max(1, Number(form.cantidad || 1)),
        costo_adquisicion: Number(form.costo_adquisicion || 0),
        fecha_adquisicion: form.fecha_adquisicion || null,
      };
      if (isNew) await api.post("/equipos", payload);
      else await api.put(`/equipos/${initial._id}`, payload);
      toast.show("Guardado");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  const catLabel = CAT_LABELS[lockedCategoria]?.label || "Equipo";
  const cantidad = Number(form.cantidad) || 0;
  const precio = Number(form.costo_adquisicion) || 0;
  const total = cantidad * precio;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="equipo-modal">
        <h2 className="modal-title">{isNew ? `Nuevo: ${catLabel}` : `Editar: ${form.nombre}`}</h2>
        <div className="form-grid">
          <div className="field"><label>Nombre</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required data-testid="equipo-form-nombre" /></div>
          <div className="field"><label>Marca</label><input className="input" value={form.marca || ""} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></div>
          <div className="field"><label>Modelo</label><input className="input" value={form.modelo || ""} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></div>
          <div className="field"><label>Año</label><input type="number" className="input" value={form.año || ""} onChange={(e) => setForm({ ...form, año: e.target.value })} placeholder="2024" /></div>
          <div className="field"><label>Estado</label><select className="select" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>{ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="field">
            <label>Cantidad</label>
            <input
              type="number" min="1" step="1" className="input"
              value={form.cantidad === 0 || form.cantidad === "" ? "" : form.cantidad}
              onChange={(e) => setForm({ ...form, cantidad: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.cantidad <= 1) e.target.select(); }}
              placeholder="1" required data-testid="equipo-form-cantidad"
            />
          </div>
          <div className="field">
            <label>Precio unitario ($)</label>
            <DecimalInput type="number" step="0.01" className="input"
              value={form.costo_adquisicion === 0 || form.costo_adquisicion === "" ? "" : form.costo_adquisicion}
              onChange={(e) => setForm({ ...form, costo_adquisicion: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.costo_adquisicion === 0) e.target.select(); }}
              placeholder="0" data-testid="equipo-form-valor" />
          </div>
          <div className="field"><label>Fecha de adquisición</label><input type="date" className="input" value={form.fecha_adquisicion} onChange={(e) => setForm({ ...form, fecha_adquisicion: e.target.value })} /></div>
          <div className="field"><label>Responsable</label><input className="input" value={form.responsable || ""} onChange={(e) => setForm({ ...form, responsable: e.target.value })} /></div>
          <div className="field"><label>Ubicación</label><input className="input" value={form.ubicacion || ""} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} /></div>
        </div>
        <div style={{ marginTop: 12, padding: "12px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, color: "#15803d" }}>Total: <b>{cantidad}</b> × ${precio.toFixed(2)} =</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }}>${total.toFixed(2)}</div>
        </div>
        <div className="field" style={{ marginTop: 12 }}><label>Observaciones</label><textarea className="textarea" value={form.observaciones || ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="equipo-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function EquipoViewModal({ equipo, onClose }) {
  const meta = CAT_LABELS[equipo.categoria] || { label: "Equipo", color: "#64748b", bg: "#f1f5f9" };
  const Icon = meta.icon;
  const cantidad = equipo.cantidad || 1;
  const precio = equipo.costo_adquisicion || 0;
  const Row = ({ label, value }) => (
    <div>
      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600 }}>{value || "—"}</div>
    </div>
  );
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()} data-testid="equipo-view-modal">
        <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Icon && <Icon size={20} style={{ color: meta.color }} />} {equipo.nombre}
        </h2>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span className="badge" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
          <span className={`badge ${equipo.estado === "activo" ? "badge-primary" : equipo.estado === "mantenimiento" ? "badge-warn" : "badge-rose"}`}>{equipo.estado}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          <Row label="Marca" value={equipo.marca} />
          <Row label="Modelo" value={equipo.modelo} />
          <Row label="Año" value={equipo.año} />
          <Row label="Cantidad" value={cantidad} />
          <Row label="Precio unitario" value={`$${precio.toFixed(2)}`} />
          <Row label="Valor total" value={<span style={{ color: "#16a34a", fontWeight: 800 }}>${(cantidad * precio).toFixed(2)}</span>} />
          <Row label="Fecha de adquisición" value={equipo.fecha_adquisicion ? new Date(equipo.fecha_adquisicion).toLocaleDateString() : "—"} />
          <Row label="Responsable" value={equipo.responsable} />
          <Row label="Ubicación" value={equipo.ubicacion} />
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ color: "#64748b", fontSize: 12, marginBottom: 2 }}>Observaciones</div>
          <div>{equipo.observaciones || "—"}</div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={onClose} data-testid="equipo-view-close">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

