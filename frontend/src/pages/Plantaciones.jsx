import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { Plus, Pencil, Trash2, MapPin, ImageOff, Sprout } from "lucide-react";

export default function Plantaciones() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/plantaciones").then((r) => setItems(r.data.plantaciones));
  useEffect(() => { load(); }, []);

  const remove = async (p) => {
    if (!window.confirm(`Eliminar plantación "${p.nombre}"?`)) return;
    await api.delete(`/plantaciones/${p._id}`);
    toast.show("Eliminada");
    load();
  };

  const filtered = items.filter(
    (p) => !search || JSON.stringify(p).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div data-testid="plantaciones-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Sprout style={{ display: "inline", verticalAlign: "middle", color: "#16a34a" }} /> Plantaciones</h1>
          <p className="page-subtitle">Gestión de lotes / huertas. Cada plantación vincula sus aplicaciones, actividades, labores y cosechas.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="plantaciones-new-btn">
          <Plus size={16} /> Nueva Plantación
        </button>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 8 }}>Buscar</label>
        <input
          className="input"
          style={{ width: "100%" }}
          placeholder="Buscar por nombre, lote, cultivo o variedad..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="plantaciones-search-input"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16 }}>
        {filtered.map((p) => (
          <div key={p._id} className="plant-card" data-testid={`plantacion-card-${p._id}`} onClick={() => setEditing(p)}>
            <div className="plant-card-lote">Lote {p.lote}</div>
            <div className="plant-card-img">
              {p.foto_principal ? <img src={p.foto_principal} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageOff size={40} />}
            </div>
            <div className="plant-card-body">
              <div style={{ fontSize: 16, fontWeight: 700 }}>{p.nombre}</div>
              <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>{p.cultivo || "Sin cultivo"} · {p.variedad || "Sin variedad"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "#64748b", fontSize: 13 }}>
                <MapPin size={14} /> {p.recinto_agronomico || "—"}
              </div>
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="badge badge-primary">{p.tipo_plantacion}</span>
                <div>
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setEditing(p); }}><Pencil size={14} /></button>
                  <button className="btn-icon" style={{ color: "#dc2626" }} onClick={(e) => { e.stopPropagation(); remove(p); }}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="empty-state">Sin plantaciones</div>}
      </div>

      {editing && <PlantacionModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function PlantacionModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const [form, setForm] = useState({
    nombre: "",
    lote: "",
    recinto_agronomico: "",
    cultivo: "",
    variedad: "",
    tipo_plantacion: "CONVENCIONAL",
    superficie_geometrica: 0,
    inventario_plantas: 0,
    sistema_riego: "",
    observaciones: "",
    ...initial,
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isNew) await api.post("/plantaciones", form);
      else await api.put(`/plantaciones/${initial._id}`, form);
      toast.show(isNew ? "Plantación creada" : "Actualizada");
      onSaved();
    } catch (err) {
      toast.show("Error", "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="plantacion-modal">
        <h2 className="modal-title">{isNew ? "Nueva plantación" : `Editar: ${initial.nombre}`}</h2>
        <div className="form-grid">
          <Field label="Nombre" value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} required testid="plant-form-nombre" />
          <Field label="Lote" value={form.lote} onChange={(v) => setForm({ ...form, lote: v })} required testid="plant-form-lote" />
          <Field label="Recinto agronómico" value={form.recinto_agronomico} onChange={(v) => setForm({ ...form, recinto_agronomico: v })} />
          <Field label="Cultivo" value={form.cultivo} onChange={(v) => setForm({ ...form, cultivo: v })} />
          <Field label="Variedad" value={form.variedad} onChange={(v) => setForm({ ...form, variedad: v })} />
          <div className="field">
            <label>Tipo de plantación</label>
            <select className="select" value={form.tipo_plantacion} onChange={(e) => setForm({ ...form, tipo_plantacion: e.target.value })}>
              <option value="CONVENCIONAL">CONVENCIONAL</option>
              <option value="ORGANICA">ORGÁNICA</option>
              <option value="HIDROPONICA">HIDROPÓNICA</option>
            </select>
          </div>
          <Field label="Superficie geométrica (m²)" type="number" value={form.superficie_geometrica} onChange={(v) => setForm({ ...form, superficie_geometrica: Number(v) })} />
          <Field label="Inventario de plantas" type="number" value={form.inventario_plantas} onChange={(v) => setForm({ ...form, inventario_plantas: Number(v) })} />
          <Field label="Sistema de riego" value={form.sistema_riego} onChange={(v) => setForm({ ...form, sistema_riego: v })} />
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Observaciones</label>
          <textarea className="textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="plant-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required, testid }) {
  return (
    <div className="field">
      <label>{label}{required && " *"}</label>
      <input type={type} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} required={required} data-testid={testid} />
    </div>
  );
}
