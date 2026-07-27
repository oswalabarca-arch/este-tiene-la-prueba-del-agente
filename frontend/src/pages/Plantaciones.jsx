import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Plus, Pencil, Trash2, MapPin, ImageOff, Sprout, X, Upload, Archive, ArchiveRestore } from "lucide-react";
import { DecimalInput } from "../components/DecimalInput";

export default function Plantaciones() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { canEdit, canDelete } = useAuth();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState("activos"); // activos | archivados

  const load = useCallback(() => api.get("/plantaciones").then((r) => setItems(r.data.plantaciones)), []);
  useEffect(() => { load(); }, [load]);

  // Si llegamos aquí con state.edit (desde el detalle al hacer "Editar")
  useEffect(() => {
    const editId = location.state?.edit;
    if (editId && items.length > 0) {
      const p = items.find((x) => x._id === editId);
      if (p) setEditing(p);
      // limpiar state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, items, navigate, location.pathname]);

  const remove = async (p) => {
    if (!window.confirm(`Eliminar plantación "${p.nombre}"?`)) return;
    await api.delete(`/plantaciones/${p._id}`);
    toast.show("Eliminada");
    load();
  };

  const archivar = async (p) => {
    if (!window.confirm(`¿Archivar el lote "${p.nombre}"? Se guardará toda su información pero dejará de aparecer entre los activos.`)) return;
    await api.post(`/plantaciones/${p._id}/archivar`);
    toast.show("Lote archivado");
    load();
  };

  const desarchivar = async (p) => {
    await api.post(`/plantaciones/${p._id}/desarchivar`);
    toast.show("Lote reactivado");
    load();
  };

  const nActivos = items.filter((p) => !p.archivada).length;
  const nArchivados = items.filter((p) => p.archivada).length;

  const filtered = items.filter(
    (p) => (view === "archivados" ? p.archivada : !p.archivada) &&
      (!search || JSON.stringify(p).toLowerCase().includes(search.toLowerCase()))
  );

  const cultivosOf = (p) => p.cultivos?.length ? p.cultivos : (p.cultivo ? [p.cultivo] : []);
  const variedadesOf = (p) => p.variedades?.length ? p.variedades : (p.variedad ? [p.variedad] : []);

  return (
    <div data-testid="plantaciones-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Sprout style={{ display: "inline", verticalAlign: "middle", color: "#16a34a" }} /> Plantaciones</h1>
          <p className="page-subtitle">Gestión de lotes / huertas. Cada plantación vincula sus aplicaciones, actividades y cosechas.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="plantaciones-new-btn">
          <Plus size={16} /> Nueva Plantación
        </button>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3, marginBottom: 14 }} data-testid="plantaciones-view-toggle">
          <button type="button" onClick={() => setView("activos")} data-testid="plantaciones-view-activos"
            style={{ padding: "7px 16px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, background: view === "activos" ? "#16a34a" : "transparent", color: view === "activos" ? "#fff" : "#475569" }}>
            Activos ({nActivos})
          </button>
          <button type="button" onClick={() => setView("archivados")} data-testid="plantaciones-view-archivados"
            style={{ padding: "7px 16px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, background: view === "archivados" ? "#64748b" : "transparent", color: view === "archivados" ? "#fff" : "#475569" }}>
            <Archive size={14} style={{ verticalAlign: "middle", marginRight: 5 }} />Archivados ({nArchivados})
          </button>
        </div>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 16 }}>
        {filtered.map((p) => {
          const cultivos = cultivosOf(p);
          const variedades = variedadesOf(p);
          const totalPlantas = Number(p.total_plantas || p.inventario_plantas || 0);
          return (
            <div key={p._id} className="plant-card" data-testid={`plantacion-card-${p._id}`} onClick={() => navigate(`/dashboard/plantaciones/${p._id}`)}>
              <div className="plant-card-lote">Lote {p.lote}{p.archivada && <span className="badge" style={{ marginLeft: 6, background: "#e2e8f0", color: "#475569", fontSize: 10 }}>Archivado</span>}</div>
              <div className="plant-card-img">
                {p.foto_principal ? <img src={p.foto_principal} alt={p.nombre} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImageOff size={40} />}
              </div>
              <div className="plant-card-body">
                <div style={{ fontSize: 16, fontWeight: 700 }}>{p.nombre}</div>
                <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {cultivos.slice(0, 3).map((c) => <span key={c} className="badge badge-primary" style={{ fontSize: 11 }}>{c}</span>)}
                  {cultivos.length === 0 && <span style={{ color: "#94a3b8", fontSize: 12 }}>Sin cultivo</span>}
                </div>
                {variedades.length > 0 && (
                  <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {variedades.slice(0, 3).map((v) => <span key={v} className="badge badge-purple" style={{ fontSize: 11 }}>{v}</span>)}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, color: "#64748b", fontSize: 12 }}>
                  <MapPin size={12} /> {p.superficie_geometrica ? `${p.superficie_geometrica} m²` : (p.recinto_agronomico || "—")}
                </div>
                {totalPlantas > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, color: "#16a34a", fontSize: 12, fontWeight: 600 }} data-testid={`plantacion-total-plantas-${p._id}`}>
                    <Sprout size={12} /> {totalPlantas.toLocaleString("es-ES")} plantas
                  </div>
                )}
                <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span className="badge badge-primary" style={{ fontSize: 11 }}>{p.tipo_plantacion}</span>
                  <div style={{ display: "flex", gap: 2 }}>
                    {canEdit("plantaciones") && !p.archivada && <button className="btn-icon" title="Editar" onClick={(e) => { e.stopPropagation(); setEditing(p); }}><Pencil size={14} /></button>}
                    {canEdit("plantaciones") && !p.archivada && <button className="btn-icon" title="Archivar lote finalizado" onClick={(e) => { e.stopPropagation(); archivar(p); }} data-testid={`plantacion-archivar-${p._id}`}><Archive size={14} /></button>}
                    {canEdit("plantaciones") && p.archivada && <button className="btn-icon" style={{ color: "#16a34a" }} title="Reactivar lote" onClick={(e) => { e.stopPropagation(); desarchivar(p); }} data-testid={`plantacion-desarchivar-${p._id}`}><ArchiveRestore size={14} /></button>}
                    {canDelete("plantaciones") && <button className="btn-icon" style={{ color: "#dc2626" }} title="Eliminar" onClick={(e) => { e.stopPropagation(); remove(p); }}><Trash2 size={14} /></button>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="empty-state">{view === "archivados" ? "No hay lotes archivados" : "Sin plantaciones activas"}</div>}
      </div>

      {editing && <PlantacionModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

// Convierte un archivo a base64 data URL
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function PlantacionModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;

  const initialCultivos = initial.cultivos?.length ? initial.cultivos : (initial.cultivo ? [initial.cultivo] : []);
  const initialVariedades = initial.variedades?.length ? initial.variedades : (initial.variedad ? [initial.variedad] : []);

  const [form, setForm] = useState({
    nombre: "",
    lote: "",
    superficie_geometrica: 0,
    fecha_inicio: "",
    fecha_finalizacion: "",
    sistema_riego: "",
    tipo_plantacion: "CONVENCIONAL",
    foto_principal: "",
    foto_secundaria: "",
    observaciones: "",
    ...initial,
    cultivos: initialCultivos,
    variedades: initialVariedades,
    plantas_por_variedad: initial.plantas_por_variedad || {},
    fecha_inicio: (initial.fecha_inicio || "").slice(0, 10),
    fecha_finalizacion: (initial.fecha_finalizacion || "").slice(0, 10),
  });
  const [busy, setBusy] = useState(false);
  const [cultivoInput, setCultivoInput] = useState("");
  const [variedadInput, setVariedadInput] = useState("");

  const addCultivo = () => {
    const v = cultivoInput.trim();
    if (!v) return;
    if (!form.cultivos.includes(v)) setForm({ ...form, cultivos: [...form.cultivos, v] });
    setCultivoInput("");
  };
  const removeCultivo = (c) => setForm({ ...form, cultivos: form.cultivos.filter((x) => x !== c) });

  const addVariedad = () => {
    const v = variedadInput.trim();
    if (!v) return;
    if (!form.variedades.includes(v)) {
      setForm({ ...form, variedades: [...form.variedades, v], plantas_por_variedad: { ...form.plantas_por_variedad, [v]: form.plantas_por_variedad[v] || 0 } });
    }
    setVariedadInput("");
  };
  const removeVariedad = (c) => {
    const { [c]: _omit, ...rest } = form.plantas_por_variedad;
    setForm({ ...form, variedades: form.variedades.filter((x) => x !== c), plantas_por_variedad: rest });
  };
  const setPlantasVariedad = (nombre, val) => {
    setForm((f) => ({ ...f, plantas_por_variedad: { ...f.plantas_por_variedad, [nombre]: val === "" ? 0 : Number(val) } }));
  };
  const totalPlantas = form.variedades.reduce((s, v) => s + Number(form.plantas_por_variedad[v] || 0), 0);
  const numPlantas = (n) => (n === 0 || n === undefined || n === null || n === "" ? "" : n);

  const handlePhotoChange = async (key, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.show("Imagen muy grande (máx 2 MB)", "error"); return; }
    const data = await fileToDataURL(file);
    setForm({ ...form, [key]: data });
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Mantener compatibilidad con campos legacy
      const payload = {
        ...form,
        cultivo: form.cultivos[0] || "",
        variedad: form.variedades[0] || "",
        plantas_por_variedad: form.plantas_por_variedad,
        total_plantas: totalPlantas,
        inventario_plantas: totalPlantas || Number(form.inventario_plantas || 0),
        fecha_inicio: form.fecha_inicio ? form.fecha_inicio + "T12:00:00.000Z" : null,
        fecha_finalizacion: form.fecha_finalizacion ? form.fecha_finalizacion + "T12:00:00.000Z" : null,
        superficie_geometrica: Number(form.superficie_geometrica || 0),
      };
      if (isNew) await api.post("/plantaciones", payload);
      else await api.put(`/plantaciones/${initial._id}`, payload);
      toast.show(isNew ? "Plantación creada" : "Actualizada");
      onSaved();
    } catch (err) {
      toast.show("Error", "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 800 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="plantacion-modal">
        <h2 className="modal-title">{isNew ? "Nueva plantación" : `Editar: ${initial.nombre}`}</h2>
        <div className="modal-sub">Datos generales del lote</div>

        <div className="form-grid">
          <div className="field">
            <label>Nombre</label>
            <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required data-testid="plant-form-nombre" />
          </div>
          <div className="field">
            <label>Identificador del lote</label>
            <input className="input" placeholder="Ej: A-01, Lote Norte" value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} required data-testid="plant-form-lote" />
          </div>
          <div className="field">
            <label>Superficie (m²)</label>
            <DecimalInput
              type="number" step="0.01" className="input"
              value={form.superficie_geometrica === 0 || form.superficie_geometrica === "" ? "" : form.superficie_geometrica}
              onChange={(e) => setForm({ ...form, superficie_geometrica: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.superficie_geometrica === 0) e.target.select(); }}
              placeholder="0"
              data-testid="plant-form-superficie"
            />
          </div>
          <div className="field">
            <label>Tipo de plantación</label>
            <select className="select" value={form.tipo_plantacion} onChange={(e) => setForm({ ...form, tipo_plantacion: e.target.value })}>
              <option value="CONVENCIONAL">CONVENCIONAL</option>
              <option value="ORGANICA">ORGÁNICA</option>
              <option value="HIDROPONICA">HIDROPÓNICA</option>
            </select>
          </div>
          <div className="field">
            <label>Fecha de siembra</label>
            <input type="date" className="input" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} data-testid="plant-form-fecha-inicio" />
          </div>
          <div className="field">
            <label>Fecha de finalización</label>
            <input type="date" className="input" value={form.fecha_finalizacion} onChange={(e) => setForm({ ...form, fecha_finalizacion: e.target.value })} data-testid="plant-form-fecha-fin" />
          </div>
          <div className="field">
            <label>Sistema de riego</label>
            <input className="input" placeholder="Ej: Goteo, Aspersión" value={form.sistema_riego} onChange={(e) => setForm({ ...form, sistema_riego: e.target.value })} data-testid="plant-form-riego" />
          </div>
        </div>

        {/* Cultivos */}
        <div style={{ marginTop: 18 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Tipos de cultivo</label>
          <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>Agrega uno o más cultivos (Fresa, Arándano, etc.)</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              className="input"
              placeholder="Ej: Fresa"
              value={cultivoInput}
              onChange={(e) => setCultivoInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCultivo(); } }}
              data-testid="plant-form-cultivo-input"
            />
            <button type="button" className="btn btn-primary" onClick={addCultivo} data-testid="plant-form-cultivo-add"><Plus size={14} /> Agregar</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {form.cultivos.map((c) => (
              <span key={c} className="badge badge-primary" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 12px" }}>
                {c}
                <button type="button" onClick={() => removeCultivo(c)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={12} /></button>
              </span>
            ))}
            {form.cultivos.length === 0 && <span style={{ color: "#94a3b8", fontSize: 13 }}>Sin cultivos agregados</span>}
          </div>
        </div>

        {/* Variedades */}
        <div style={{ marginTop: 18 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Variedades del cultivo</label>
          <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>Agrega una o más variedades e indica la cantidad de plantas de cada una (Albion, San Andreas, etc.)</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <input
              className="input"
              placeholder="Ej: Albion"
              value={variedadInput}
              onChange={(e) => setVariedadInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariedad(); } }}
              data-testid="plant-form-variedad-input"
            />
            <button type="button" className="btn btn-primary" onClick={addVariedad} data-testid="plant-form-variedad-add"><Plus size={14} /> Agregar</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {form.variedades.map((c) => (
              <div key={c} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, padding: "8px 12px" }} data-testid={`plant-form-variedad-row-${c}`}>
                <span className="badge badge-purple" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 8px 5px 12px" }}>
                  {c}
                  <button type="button" onClick={() => removeVariedad(c)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "inline-flex" }} title="Quitar variedad"><X size={12} /></button>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
                  <Sprout size={14} style={{ color: "#16a34a" }} />
                  <label style={{ fontSize: 12, color: "#64748b" }}>Plantas:</label>
                  <input
                    type="number" min="0" step="1" className="input" style={{ width: 130 }} placeholder="0"
                    value={numPlantas(form.plantas_por_variedad[c])}
                    onChange={(e) => setPlantasVariedad(c, e.target.value)}
                    data-testid={`plant-form-variedad-cantidad-${c}`}
                  />
                </div>
              </div>
            ))}
            {form.variedades.length === 0 && <span style={{ color: "#94a3b8", fontSize: 13 }}>Sin variedades agregadas</span>}
          </div>

          {/* Total de plantas (cuando hay más de una variedad) */}
          {form.variedades.length >= 2 && (
            <div style={{ marginTop: 12, padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }} data-testid="plant-form-total-plantas">
              <div style={{ fontSize: 14, color: "#15803d", fontWeight: 600 }}>
                <Sprout size={16} style={{ verticalAlign: "middle" }} /> Total de plantas de la plantación
                <span style={{ color: "#64748b", fontWeight: 400, fontSize: 12 }}> · {form.variedades.length} variedades</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#16a34a" }} data-testid="plant-form-total-plantas-valor">{totalPlantas.toLocaleString("es-ES")}</div>
            </div>
          )}
        </div>

        {/* Fotos */}
        <div style={{ marginTop: 18 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>Fotos del lote</label>
          <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>Sube hasta dos fotos (máx 2 MB cada una)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <PhotoSlot label="Foto principal" value={form.foto_principal} onChange={(e) => handlePhotoChange("foto_principal", e)} onClear={() => setForm({ ...form, foto_principal: "" })} testid="plant-form-foto-principal" />
            <PhotoSlot label="Foto secundaria" value={form.foto_secundaria} onChange={(e) => handlePhotoChange("foto_secundaria", e)} onClear={() => setForm({ ...form, foto_secundaria: "" })} testid="plant-form-foto-secundaria" />
          </div>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label>Observaciones</label>
          <textarea className="textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} data-testid="plant-form-observaciones" />
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="plant-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function PhotoSlot({ label, value, onChange, onClear, testid }) {
  const ref = useRef(null);
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>{label}</div>
      <div style={{ position: "relative", border: "2px dashed #cbd5e1", borderRadius: 10, background: "#f8fafc", height: 140, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", cursor: "pointer" }} onClick={() => ref.current?.click()}>
        {value ? (
          <>
            <img src={value} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button type="button" onClick={(e) => { e.stopPropagation(); onClear(); }} style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: 6, padding: 4, cursor: "pointer", display: "flex" }}><X size={14} /></button>
          </>
        ) : (
          <div style={{ textAlign: "center", color: "#64748b", fontSize: 13 }}>
            <Upload size={26} style={{ marginBottom: 4 }} />
            <div>Click para subir</div>
          </div>
        )}
        <input ref={ref} type="file" accept="image/*" onChange={onChange} style={{ display: "none" }} data-testid={testid} />
      </div>
    </div>
  );
}
