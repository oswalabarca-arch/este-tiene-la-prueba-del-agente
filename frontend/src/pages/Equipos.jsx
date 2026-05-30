import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { Truck, Plus, Pencil, Trash2 } from "lucide-react";

const CATEGORIAS = ["vehiculo", "herramienta", "maquinaria"];
const ESTADOS = ["activo", "mantenimiento", "inactivo"];

export default function Equipos() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/equipos").then((r) => setItems(r.data.equipos));
  useEffect(() => { load(); }, []);

  const remove = async (e) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/equipos/${e._id}`);
    toast.show("Eliminado");
    load();
  };

  return (
    <div data-testid="equipos-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Truck size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Equipos</h1>
          <p className="page-subtitle">Gestión de equipos y vehículos. Algunos se crean automáticamente desde Compras.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}><Plus size={16} /> Nuevo equipo</button>
      </div>

      <div className="card">
        <table className="table">
          <thead><tr><th>Nombre</th><th>Categoría</th><th>Marca/Modelo</th><th>Estado</th><th>Costo</th><th>Acciones</th></tr></thead>
          <tbody>
            {items.map((e) => (
              <tr key={e._id}>
                <td style={{ fontWeight: 600 }}>{e.nombre}</td>
                <td><span className="badge badge-info">{e.categoria}</span></td>
                <td>{[e.marca, e.modelo].filter(Boolean).join(" ") || "—"}</td>
                <td><span className={`badge ${e.estado === "activo" ? "badge-primary" : e.estado === "mantenimiento" ? "badge-warn" : "badge-rose"}`}>{e.estado}</span></td>
                <td>${e.costo_adquisicion || 0}</td>
                <td>
                  <button className="btn-icon" onClick={() => setEditing(e)}><Pencil size={16} /></button>
                  <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(e)}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <div className="empty-state">Sin equipos</div>}
      </div>

      {editing && <EquipoModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function EquipoModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const [form, setForm] = useState({
    nombre: "", categoria: "herramienta", marca: "", modelo: "", año: "",
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
          <div className="field"><label>Categoría</label><select className="select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
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
