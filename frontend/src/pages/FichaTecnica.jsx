import { useEffect, useMemo, useRef, useState } from "react";
import { api, API } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { FileText, Plus, Trash2, Pencil, Eye, Upload, ImageOff, Image as ImageIcon, Loader2 } from "lucide-react";

const TIPOS = ["fertilizantes", "fungicidas", "plaguicida", "herbicidas", "tratamiento"];
const TIPO_COLOR = {
  fertilizantes: { bg: "#dcfce7", fg: "#15803d" },
  fungicidas: { bg: "#dbeafe", fg: "#1d4ed8" },
  plaguicida: { bg: "#fef3c7", fg: "#b45309" },
  herbicidas: { bg: "#fee2e2", fg: "#b91c1c" },
  tratamiento: { bg: "#f3e8ff", fg: "#7c3aed" },
};

const fileUrl = (path) => {
  if (!path) return null;
  const token = localStorage.getItem("erp_token");
  return `${API}/fichas-tecnicas/file/${path}?auth=${token}`;
};

export default function FichaTecnica() {
  const { canEdit, canDelete } = useAuth();
  const toast = useToast();
  const [fichas, setFichas] = useState([]);
  const [filterTipo, setFilterTipo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = () => {
    api.get("/fichas-tecnicas").then((r) => setFichas(r.data.fichas || []));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => (filterTipo ? fichas.filter((f) => f.tipo === filterTipo) : fichas),
    [fichas, filterTipo]
  );

  const remove = async (f) => {
    if (!window.confirm(`¿Eliminar la ficha de "${f.nombre_producto}"?`)) return;
    await api.delete(`/fichas-tecnicas/${f._id}`);
    toast.show("Ficha eliminada");
    load();
  };

  const countByTipo = (t) => fichas.filter((f) => f.tipo === t).length;

  return (
    <div data-testid="ficha-tecnica-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><FileText size={24} style={{ verticalAlign: "middle", color: "#0ea5e9" }} /> Ficha técnica de productos</h1>
          <p className="page-subtitle">Catálogo de productos con foto frontal (nombre y presentación) y foto trasera (ficha técnica).</p>
        </div>
        {canEdit("ficha_tecnica") && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true); }} data-testid="ficha-new-btn">
            <Plus size={16} /> Agregar ficha
          </button>
        )}
      </div>

      {/* Filtro por tipo */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }} data-testid="ficha-filtro">
        <button className={`btn btn-sm ${filterTipo === "" ? "btn-primary" : ""}`} onClick={() => setFilterTipo("")} data-testid="ficha-filtro-todos">
          Todos <span style={{ opacity: 0.7 }}>({fichas.length})</span>
        </button>
        {TIPOS.map((t) => (
          <button key={t} className={`btn btn-sm ${filterTipo === t ? "btn-primary" : ""}`} onClick={() => setFilterTipo(t)}
            data-testid={`ficha-filtro-${t}`} style={{ textTransform: "capitalize" }}>
            {t} <span style={{ opacity: 0.7 }}>({countByTipo(t)})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state" data-testid="ficha-empty">
          {fichas.length === 0 ? "No hay fichas técnicas todavía. Agregá tu primer producto con el botón \u201cAgregar ficha\u201d." : "No hay productos de este tipo."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {filtered.map((f) => {
            const c = TIPO_COLOR[f.tipo] || { bg: "#f1f5f9", fg: "#475569" };
            return (
              <div key={f._id} className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }} data-testid={`ficha-card-${f._id}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 15, overflow: "hidden", textOverflow: "ellipsis" }} data-testid="ficha-nombre">{f.nombre_producto}</div>
                    {f.presentacion && <div style={{ color: "#64748b", fontSize: 12 }}>{f.presentacion}</div>}
                  </div>
                  <span className="badge" style={{ background: c.bg, color: c.fg, fontSize: 11, textTransform: "capitalize", whiteSpace: "nowrap" }}>{f.tipo}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", color: "#64748b", fontSize: 12 }} data-testid="ficha-fotos-info">
                  <ImageIcon size={15} style={{ color: "#0ea5e9", flexShrink: 0 }} />
                  <span>{[f.foto_frontal && "frontal", f.foto_trasera && "ficha técnica"].filter(Boolean).join(" · ") || "Sin fotos"}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>Ver fotos →</span>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                  <button className="btn btn-sm" onClick={() => setViewing(f)} data-testid={`ficha-view-${f._id}`}><Eye size={14} /> Ver</button>
                  {canEdit("ficha_tecnica") && <button className="btn btn-sm" onClick={() => { setEditing(f); setShowForm(true); }} data-testid={`ficha-edit-${f._id}`}><Pencil size={14} /> Editar</button>}
                  {canDelete("ficha_tecnica") && <button className="btn-icon" style={{ color: "#dc2626", marginLeft: "auto" }} onClick={() => remove(f)} data-testid={`ficha-delete-${f._id}`}><Trash2 size={16} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && <FichaForm initial={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {viewing && <FichaView ficha={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function FichaForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    nombre_producto: initial?.nombre_producto || "",
    tipo: initial?.tipo || "",
    presentacion: initial?.presentacion || "",
    observaciones: initial?.observaciones || "",
    foto_frontal: initial?.foto_frontal || null,
    foto_trasera: initial?.foto_trasera || null,
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre_producto.trim()) { toast.show("Escribí el nombre del producto", "error"); return; }
    if (!form.tipo) { toast.show("Seleccioná el tipo", "error"); return; }
    setBusy(true);
    try {
      if (initial) await api.put(`/fichas-tecnicas/${initial._id}`, form);
      else await api.post("/fichas-tecnicas", form);
      toast.show(initial ? "Ficha actualizada" : "Ficha creada");
      onSaved();
    } catch {
      toast.show("Error al guardar", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="ficha-form-modal">
        <h2 className="modal-title"><FileText size={20} style={{ verticalAlign: "middle", color: "#0ea5e9" }} /> {initial ? "Editar ficha técnica" : "Nueva ficha técnica"}</h2>
        <div className="modal-sub">Registrá el producto con su tipo y subí las 2 fotos (frontal y ficha técnica).</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field">
              <label>Nombre del producto *</label>
              <input className="input" value={form.nombre_producto} onChange={(e) => setForm({ ...form, nombre_producto: e.target.value })} placeholder="Ej. Urea granulada" data-testid="ficha-form-nombre" />
            </div>
            <div className="field">
              <label>Tipo *</label>
              <select className="select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} data-testid="ficha-form-tipo">
                <option value="">Selecciona el tipo</option>
                {TIPOS.map((t) => <option key={t} value={t} style={{ textTransform: "capitalize" }}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Presentación</label>
              <input className="input" value={form.presentacion} onChange={(e) => setForm({ ...form, presentacion: e.target.value })} placeholder="Ej. Saco 25 kg / Botella 1 L" data-testid="ficha-form-presentacion" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <PhotoUpload label="Foto frontal (nombre y presentación)" value={form.foto_frontal} onChange={(p) => setForm({ ...form, foto_frontal: p })} testid="frontal" />
              <PhotoUpload label="Foto trasera (ficha técnica)" value={form.foto_trasera} onChange={(p) => setForm({ ...form, foto_trasera: p })} testid="trasera" />
            </div>
            <div className="field">
              <label>Observaciones</label>
              <textarea className="input" rows={2} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} data-testid="ficha-form-observaciones" />
            </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="ficha-form-save">{busy ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function PhotoUpload({ label, value, onChange, testid }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const url = fileUrl(value);

  const pick = () => inputRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.show("La imagen supera 10 MB", "error"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/fichas-tecnicas/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      onChange(r.data.path);
      toast.show("Foto subida");
    } catch (err) {
      toast.show(err?.response?.data?.detail || "No se pudo subir la foto", "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="field" style={{ margin: 0 }}>
      <label style={{ fontSize: 12 }}>{label}</label>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={onFile} data-testid={`ficha-upload-input-${testid}`} />
      <div
        onClick={pick}
        style={{ cursor: "pointer", borderRadius: 8, border: "2px dashed #cbd5e1", background: "#f8fafc", aspectRatio: "1 / 1", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}
        data-testid={`ficha-upload-${testid}`}
      >
        {uploading ? (
          <div style={{ color: "#64748b", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 12 }}>
            <Loader2 size={22} className="spin" /> Subiendo...
          </div>
        ) : url ? (
          <>
            <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <span style={{ position: "absolute", top: 6, right: 6, background: "rgba(15,23,42,0.7)", color: "#fff", fontSize: 10, padding: "3px 7px", borderRadius: 6 }}>Cambiar</span>
          </>
        ) : (
          <div style={{ color: "#64748b", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 12, textAlign: "center", padding: 8 }}>
            <Upload size={22} /> Subir foto
          </div>
        )}
      </div>
      {value && (
        <button type="button" className="btn btn-sm" style={{ marginTop: 6, color: "#dc2626" }} onClick={() => onChange(null)} data-testid={`ficha-upload-clear-${testid}`}>
          <Trash2 size={13} /> Quitar
        </button>
      )}
    </div>
  );
}

function FichaView({ ficha, onClose }) {
  const c = TIPO_COLOR[ficha.tipo] || { bg: "#f1f5f9", fg: "#475569" };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="ficha-view-modal">
        <h2 className="modal-title">{ficha.nombre_producto}</h2>
        <div className="modal-sub" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <span className="badge" style={{ background: c.bg, color: c.fg, fontSize: 11, textTransform: "capitalize" }}>{ficha.tipo}</span>
          {ficha.presentacion && <span style={{ color: "#64748b", fontSize: 13 }}>{ficha.presentacion}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <BigPhoto path={ficha.foto_frontal} label="Foto frontal" />
            <BigPhoto path={ficha.foto_trasera} label="Ficha técnica (trasera)" />
          </div>
          {ficha.observaciones && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 4 }}>OBSERVACIONES</div>
              <div style={{ color: "#334155", fontSize: 14 }}>{ficha.observaciones}</div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function BigPhoto({ path, label }) {
  const url = fileUrl(path);
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>{label}</div>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={label} style={{ width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", objectFit: "contain", background: "#f8fafc", maxHeight: 360 }} />
        </a>
      ) : (
        <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", gap: 6, fontSize: 13 }}>
          <ImageOff size={26} /> Sin foto cargada
        </div>
      )}
    </div>
  );
}
