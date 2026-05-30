import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Truck, Plus, Pencil, Trash2, Car, Wrench, Cog, Package } from "lucide-react";

const CATEGORIAS = ["vehiculo", "motor", "herramienta", "otros"];
const ESTADOS = ["activo", "mantenimiento", "inactivo"];

const CAT_LABELS = {
  vehiculo: { label: "Vehículos", icon: Car, color: "#3b82f6" },
  motor: { label: "Motores", icon: Cog, color: "#8b5cf6" },
  herramienta: { label: "Herramientas", icon: Wrench, color: "#f59e0b" },
  otros: { label: "Otros", icon: Package, color: "#64748b" },
};

export default function Equipos() {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const { categoria } = useParams(); // vehiculos | motores | herramientas | otros
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  // Mapeo URL → categoria almacenada
  const urlToCat = { vehiculos: "vehiculo", motores: "motor", herramientas: "herramienta", otros: "otros" };
  const filterCat = categoria ? urlToCat[categoria] : null;
  const meta = filterCat ? CAT_LABELS[filterCat] : { label: "Todos los equipos", icon: Truck, color: "#16a34a" };
  const Icon = meta.icon;

  const load = () => api.get("/equipos").then((r) => setItems(r.data.equipos));
  useEffect(() => { load(); }, []);

  const remove = async (e) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/equipos/${e._id}`);
    toast.show("Eliminado");
    load();
  };

  const filtered = filterCat ? items.filter((e) => (e.categoria || "otros") === filterCat) : items;

  // KPIs por categoría
  const kpis = CATEGORIAS.map((c) => ({
    cat: c,
    count: items.filter((e) => (e.categoria || "otros") === c).length,
  }));

  return (
    <div data-testid={`equipos-page${filterCat ? `-${filterCat}` : ""}`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Icon size={24} style={{ verticalAlign: "middle", color: meta.color }} /> Equipos — {meta.label}</h1>
          <p className="page-subtitle">Gestión de equipos. Algunos se crean automáticamente desde Compras (marcando "Equipo").</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ categoria: filterCat || "otros" })}><Plus size={16} /> Nuevo equipo</button>
      </div>

      {!filterCat && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          {kpis.map((k) => {
            const m = CAT_LABELS[k.cat];
            const KI = m.icon;
            return (
              <div key={k.cat} className="card kpi-card">
                <div className="kpi-head">
                  <div className="kpi-label">{m.label}</div>
                  <div className="kpi-icon-box" style={{ background: m.color + "22", color: m.color }}><KI size={18} /></div>
                </div>
                <div className="kpi-value" style={{ color: m.color }}>{k.count}</div>
              </div>
            );
          })}
        </div>
      )}

      <div className="card">
        <table className="table">
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Marca/Modelo</th><th>Estado</th><th>Costo</th><th>Responsable</th><th>Acciones</th></tr></thead>
          <tbody>
            {filtered.map((e) => {
              const cat = e.categoria || "otros";
              const m = CAT_LABELS[cat] || CAT_LABELS.otros;
              return (
                <tr key={e._id}>
                  <td style={{ fontWeight: 600 }}>{e.nombre}</td>
                  <td><span className="badge" style={{ background: m.color + "22", color: m.color }}>{m.label}</span></td>
                  <td>{[e.marca, e.modelo].filter(Boolean).join(" ") || "—"}</td>
                  <td><span className={`badge ${e.estado === "activo" ? "badge-primary" : e.estado === "mantenimiento" ? "badge-warn" : "badge-rose"}`}>{e.estado}</span></td>
                  <td>${e.costo_adquisicion || 0}</td>
                  <td>{e.responsable || "—"}</td>
                  <td>
                    {canEdit("equipos") && <button className="btn-icon" onClick={() => setEditing(e)}><Pencil size={16} /></button>}
                    {canDelete("equipos") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(e)}><Trash2 size={16} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">Sin equipos en esta categoría</div>}
      </div>

      {editing && <EquipoModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function EquipoModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const [form, setForm] = useState({
    nombre: "", categoria: "otros", marca: "", modelo: "", año: "",
    estado: "activo", costo_adquisicion: 0, ubicacion: "", responsable: "", observaciones: "",
    ...initial,
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, año: form.año ? Number(form.año) : null, costo_adquisicion: Number(form.costo_adquisicion || 0) };
      if (isNew) await api.post("/equipos", payload);
      else await api.put(`/equipos/${initial._id}`, payload);
      toast.show("Guardado");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="modal-title">{isNew ? "Nuevo equipo" : "Editar equipo"}</h2>
        <div className="form-grid">
          <div className="field"><label>Nombre</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></div>
          <div className="field"><label>Categoría</label><select className="select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABELS[c].label}</option>)}</select></div>
          <div className="field"><label>Marca</label><input className="input" value={form.marca || ""} onChange={(e) => setForm({ ...form, marca: e.target.value })} /></div>
          <div className="field"><label>Modelo</label><input className="input" value={form.modelo || ""} onChange={(e) => setForm({ ...form, modelo: e.target.value })} /></div>
          <div className="field"><label>Año</label><input type="number" className="input" value={form.año || ""} onChange={(e) => setForm({ ...form, año: e.target.value })} /></div>
          <div className="field"><label>Estado</label><select className="select" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>{ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="field"><label>Costo</label><input type="number" className="input" value={form.costo_adquisicion} onChange={(e) => setForm({ ...form, costo_adquisicion: e.target.value })} /></div>
          <div className="field"><label>Responsable</label><input className="input" value={form.responsable || ""} onChange={(e) => setForm({ ...form, responsable: e.target.value })} /></div>
        </div>
        <div className="field" style={{ marginTop: 12 }}><label>Observaciones</label><textarea className="textarea" value={form.observaciones || ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} /></div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
