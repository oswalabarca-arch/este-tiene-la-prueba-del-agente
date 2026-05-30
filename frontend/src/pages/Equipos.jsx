import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Truck, Plus, Pencil, Trash2, Cog, Wrench, Package, List } from "lucide-react";

// "vehiculos" YA NO existe aquí - se maneja en GastosVehiculos.jsx
const CATEGORIAS = ["motor", "herramienta", "otros"];
const ESTADOS = ["activo", "mantenimiento", "inactivo"];

const CAT_LABELS = {
  motor: { label: "Motores", icon: Cog, color: "#8b5cf6", bg: "#ede9fe" },
  herramienta: { label: "Herramientas", icon: Wrench, color: "#f59e0b", bg: "#fef3c7" },
  otros: { label: "Otros", icon: Package, color: "#64748b", bg: "#f1f5f9" },
};

export default function Equipos() {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const { categoria } = useParams();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const urlToCat = { motores: "motor", herramientas: "herramienta", otros: "otros" };
  const filterCat = categoria ? urlToCat[categoria] : null;
  const meta = filterCat ? CAT_LABELS[filterCat] : { label: "Todos los equipos", icon: List, color: "#16a34a", bg: "#dcfce7" };
  const Icon = meta.icon;

  const load = () => api.get("/equipos").then((r) => {
    // Filtra cualquier dato antiguo con categoria="vehiculo" para no mostrarlo
    setItems(r.data.equipos.filter((e) => (e.categoria || "otros") !== "vehiculo"));
  });
  useEffect(() => { load(); }, []);

  const remove = async (e) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/equipos/${e._id}`);
    toast.show("Eliminado");
    load();
  };

  const filtered = filterCat ? items.filter((e) => (e.categoria || "otros") === filterCat) : items;
  const totalValor = filtered.reduce((s, e) => s + (e.costo_adquisicion || 0) * (e.cantidad || 1), 0);
  const totalUnidades = filtered.reduce((s, e) => s + (e.cantidad || 1), 0);

  const kpis = CATEGORIAS.map((c) => {
    const list = items.filter((e) => (e.categoria || "otros") === c);
    return {
      cat: c,
      count: list.length,
      unidades: list.reduce((s, e) => s + (e.cantidad || 1), 0),
      valor: list.reduce((s, e) => s + (e.costo_adquisicion || 0) * (e.cantidad || 1), 0),
    };
  });

  return (
    <div data-testid={`equipos-page${filterCat ? `-${filterCat}` : ""}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Icon size={24} style={{ verticalAlign: "middle", color: meta.color }} /> Equipos — {meta.label}</h1>
          <p className="page-subtitle">
            {filterCat
              ? `Inventario de ${meta.label.toLowerCase()} con su valor de adquisición.`
              : "Inventario general de motores, herramientas y otros equipos."}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ categoria: filterCat || "otros" })} data-testid="equipo-new-btn"><Plus size={16} /> Nuevo</button>
      </div>

      {!filterCat ? (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          {kpis.map((k) => {
            const m = CAT_LABELS[k.cat];
            const KI = m.icon;
            return (
              <div key={k.cat} className="card kpi-card" data-testid={`equipo-kpi-${k.cat}`}>
                <div className="kpi-head">
                  <div className="kpi-label">{m.label}</div>
                  <div className="kpi-icon-box" style={{ background: m.bg, color: m.color }}><KI size={18} /></div>
                </div>
                <div className="kpi-value" style={{ color: m.color }}>{k.unidades}</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>{k.count} registro(s) · ${k.valor.toFixed(2)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          <div className="card kpi-card"><div className="kpi-label">Registros</div><div className="kpi-value" style={{ color: meta.color }}>{filtered.length}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Unidades totales</div><div className="kpi-value">{totalUnidades}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Valor del inventario</div><div className="kpi-value" style={{ color: "#16a34a" }}>${totalValor.toFixed(2)}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Activos</div><div className="kpi-value">{filtered.filter((e) => e.estado === "activo").length}</div></div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{filterCat ? `Inventario de ${meta.label}` : "Todos los equipos"}</h3>
        <table className="table">
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Marca/Modelo</th><th>Estado</th><th>Cantidad</th><th>Precio unit.</th><th>Total</th><th>Acciones</th></tr></thead>
          <tbody>
            {filtered.map((e) => {
              const cat = e.categoria || "otros";
              const m = CAT_LABELS[cat] || CAT_LABELS.otros;
              const cantidad = e.cantidad || 1;
              const precio = e.costo_adquisicion || 0;
              return (
                <tr key={e._id} data-testid={`equipo-row-${e._id}`}>
                  <td style={{ fontWeight: 600 }}>{e.nombre}</td>
                  <td><span className="badge" style={{ background: m.bg, color: m.color }}>{m.label}</span></td>
                  <td>{[e.marca, e.modelo].filter(Boolean).join(" ") || "—"}</td>
                  <td><span className={`badge ${e.estado === "activo" ? "badge-primary" : e.estado === "mantenimiento" ? "badge-warn" : "badge-rose"}`}>{e.estado}</span></td>
                  <td style={{ fontWeight: 600 }}>{cantidad}</td>
                  <td>${precio.toFixed(2)}</td>
                  <td style={{ fontWeight: 700, color: "#16a34a" }}>${(cantidad * precio).toFixed(2)}</td>
                  <td>
                    {canEdit("equipos") && <button className="btn-icon" onClick={() => setEditing(e)}><Pencil size={16} /></button>}
                    {canDelete("equipos") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(e)}><Trash2 size={16} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">Sin elementos en esta categoría</div>}
      </div>

      {editing && <EquipoModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function EquipoModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    nombre: "", categoria: "otros", marca: "", modelo: "", año: "",
    estado: "activo", cantidad: 1, costo_adquisicion: 0, fecha_adquisicion: "",
    ubicacion: "", responsable: "", observaciones: "",
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

  const catLabel = CAT_LABELS[form.categoria]?.label || "Equipo";
  const cantidad = Number(form.cantidad) || 0;
  const precio = Number(form.costo_adquisicion) || 0;
  const total = cantidad * precio;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="equipo-modal">
        <h2 className="modal-title">{isNew ? `Nuevo: ${catLabel}` : `Editar: ${form.nombre}`}</h2>
        <div className="form-grid">
          <div className="field"><label>Nombre</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required data-testid="equipo-form-nombre" /></div>
          <div className="field"><label>Categoría</label><select className="select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c].label}</option>)}</select></div>
          <div className="field"><label>Marca</label><input className="input" value={form.marca || ""} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></div>
          <div className="field"><label>Modelo</label><input className="input" value={form.modelo || ""} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></div>
          <div className="field"><label>Año</label><input type="number" className="input" value={form.año || ""} onChange={(e) => setForm({ ...form, año: e.target.value })} placeholder="2024" /></div>
          <div className="field"><label>Estado</label><select className="select" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>{ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="field">
            <label>Cantidad</label>
            <input
              type="number"
              min="1"
              step="1"
              className="input"
              value={form.cantidad === 0 || form.cantidad === "" ? "" : form.cantidad}
              onChange={(e) => setForm({ ...form, cantidad: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.cantidad <= 1) e.target.select(); }}
              placeholder="1"
              required
              data-testid="equipo-form-cantidad"
            />
          </div>
          <div className="field">
            <label>Precio unitario ($)</label>
            <input type="number" step="0.01" className="input"
              value={form.costo_adquisicion === 0 || form.costo_adquisicion === "" ? "" : form.costo_adquisicion}
              onChange={(e) => setForm({ ...form, costo_adquisicion: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.costo_adquisicion === 0) e.target.select(); }}
              placeholder="0"
              data-testid="equipo-form-valor" />
          </div>
          <div className="field"><label>Fecha de adquisición</label><input type="date" className="input" value={form.fecha_adquisicion} onChange={(e) => setForm({ ...form, fecha_adquisicion: e.target.value })} /></div>
          <div className="field"><label>Responsable</label><input className="input" value={form.responsable || ""} onChange={(e) => setForm({ ...form, responsable: e.target.value })} /></div>
          <div className="field"><label>Ubicación</label><input className="input" value={form.ubicacion || ""} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} /></div>
        </div>
        <div style={{ marginTop: 12, padding: "12px 14px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, color: "#15803d" }}>
            Total: <b>{cantidad}</b> × ${precio.toFixed(2)} =
          </div>
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
