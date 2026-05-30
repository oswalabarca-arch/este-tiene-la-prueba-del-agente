import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Plus, Pencil, Trash2, Eye, Award, TrendingUp, TrendingDown, AlertCircle, Apple, Filter } from "lucide-react";

const KG_POR_CESTA = 14;

export default function Cosecha() {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [cosechas, setCosechas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [variedades, setVariedades] = useState([]);
  const [plantaciones, setPlantaciones] = useState([]);
  const [editing, setEditing] = useState(null);
  const [period, setPeriod] = useState("todo");  // hoy | semana | mes | año | todo
  const [unidadVista, setUnidadVista] = useState("cestas");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroVariedad, setFiltroVariedad] = useState("");
  const [filtroLote, setFiltroLote] = useState("");
  const [search, setSearch] = useState("");

  const loadAll = async () => {
    const [c, t, v, p] = await Promise.all([
      api.get("/cosechas"),
      api.get("/tipos-fruta"),
      api.get("/variedades-fruta"),
      api.get("/plantaciones"),
    ]);
    setCosechas(c.data.cosechas);
    setTipos(t.data.tipos_fruta);
    setVariedades(v.data.variedades);
    setPlantaciones(p.data.plantaciones);
  };
  useEffect(() => { loadAll(); }, []);

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    const now = new Date();
    return cosechas.filter((c) => {
      const d = new Date(c.fecha_cosecha);
      if (period === "hoy") { if (d.toISOString().slice(0, 10) !== today) return false; }
      else if (period === "semana") { const diff = (now - d) / 86400000; if (diff > 7) return false; }
      else if (period === "mes") { const diff = (now - d) / 86400000; if (diff > 31) return false; }
      else if (period === "año") { if (d.getFullYear() !== now.getFullYear()) return false; }
      if (filtroTipo && c.tipo_fruta_id !== filtroTipo) return false;
      if (filtroVariedad && c.variedad_id !== filtroVariedad) return false;
      if (filtroLote && c.lote !== filtroLote) return false;
      if (search) {
        const tipo = tipos.find((t) => t._id === c.tipo_fruta_id)?.nombre || "";
        const variedad = variedades.find((v) => v._id === c.variedad_id)?.nombre || "";
        if (!`${tipo} ${variedad} ${c.lote}`.toLowerCase().includes(search.toLowerCase())) return false;
      }
      return true;
    });
  }, [cosechas, period, today, filtroTipo, filtroVariedad, filtroLote, search, tipos, variedades]);

  const todayCosechas = cosechas.filter((c) => c.fecha_cosecha?.slice(0, 10) === today);

  const totals = (list) => {
    const o = { primera_calidad: 0, segunda_calidad: 0, tercera_calidad: 0, descarte: 0 };
    list.forEach((c) => {
      const mult = (c.unidad === "kg" && unidadVista === "cestas") ? 1 / KG_POR_CESTA
                 : (c.unidad === "cestas" && unidadVista === "kg") ? KG_POR_CESTA : 1;
      ["primera_calidad", "segunda_calidad", "tercera_calidad", "descarte"].forEach((k) => {
        o[k] += (c[k] || 0) * mult;
      });
    });
    return o;
  };

  const periodTotals = totals(filtered);
  const todayTotals = totals(todayCosechas);
  const periodSum = periodTotals.primera_calidad + periodTotals.segunda_calidad + periodTotals.tercera_calidad + periodTotals.descarte;
  const todaySum = todayTotals.primera_calidad + todayTotals.segunda_calidad + todayTotals.tercera_calidad + todayTotals.descarte;
  const pct = (v, sum) => sum ? ((v / sum) * 100).toFixed(1) : "0.0";

  const remove = async (c) => {
    if (!window.confirm("¿Eliminar registro?")) return;
    await api.delete(`/cosechas/${c._id}`);
    toast.show("Eliminado");
    loadAll();
  };

  const variedadesFiltradas = filtroTipo ? variedades.filter((v) => v.tipo_fruta_id === filtroTipo) : variedades;
  const lotes = Array.from(new Set(plantaciones.map((p) => p.lote).filter(Boolean)));

  return (
    <div data-testid="cosecha-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Módulo de Cosecha</h1>
          <p className="page-subtitle">Gestión completa de cosechas, tipos de fruta y variedades</p>
        </div>
        <div className="pill-group">
          <button className={`pill ${unidadVista === "cestas" ? "active" : ""}`} onClick={() => setUnidadVista("cestas")} data-testid="cosecha-unidad-cestas">Cestas</button>
          <button className={`pill ${unidadVista === "kg" ? "active" : ""}`} onClick={() => setUnidadVista("kg")} data-testid="cosecha-unidad-kg">kg</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ color: "#64748b", fontSize: 14 }}><Filter size={14} style={{ verticalAlign: "middle" }} /> Filtrar por:</span>
          {["hoy", "semana", "mes", "año", "todo"].map((p) => (
            <button key={p} className={`pill ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)} data-testid={`cosecha-periodo-${p}`}>
              {p === "hoy" ? "Hoy" : p === "semana" ? "Esta Semana" : p === "mes" ? "Este Mes" : p === "año" ? "Este Año" : "Todo"}
            </button>
          ))}
        </div>
      </div>

      <CalidadBoxes label="Período seleccionado" totals={periodTotals} sum={periodSum} unidad={unidadVista} />

      <div className="card" style={{ marginTop: 18, background: "#f0fdf4", borderColor: "#bbf7d0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div>
            <h3 style={{ margin: 0, color: "#15803d" }}>● Cosecha del día</h3>
            <div style={{ color: "#64748b", fontSize: 13 }}>Sólo registros de hoy ({today}). Alimenta "Asignación de destino".</div>
          </div>
          <span className="badge badge-primary">{todayCosechas.length} cosecha(s) · {todaySum.toFixed(2)} {unidadVista}</span>
        </div>
        <CalidadBoxes totals={todayTotals} sum={todaySum} unidad={unidadVista} compact />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="form-grid">
          <div className="field">
            <label>Tipo de Fruta</label>
            <select className="select" value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setFiltroVariedad(""); }} data-testid="cosecha-filtro-tipo">
              <option value="">Todas las frutas</option>
              {tipos.map((t) => <option key={t._id} value={t._id}>{t.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Variedad</label>
            <select className="select" value={filtroVariedad} onChange={(e) => setFiltroVariedad(e.target.value)} data-testid="cosecha-filtro-variedad">
              <option value="">Todas las variedades</option>
              {variedadesFiltradas.map((v) => <option key={v._id} value={v._id}>{v.nombre}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Lote</label>
            <select className="select" value={filtroLote} onChange={(e) => setFiltroLote(e.target.value)} data-testid="cosecha-filtro-lote">
              <option value="">Todos los lotes</option>
              {lotes.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => { setFiltroTipo(""); setFiltroVariedad(""); setFiltroLote(""); setSearch(""); }}>Limpiar Filtros</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
        <input className="input" placeholder="🔍 Buscar por tipo, variedad o lote..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 360 }} data-testid="cosecha-search-input" />
        <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="cosecha-new-btn"><Plus size={16} /> Nueva Cosecha</button>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h2 style={{ margin: "0 0 4px" }}>Registros de Cosecha</h2>
        <div style={{ color: "#64748b", fontSize: 14, marginBottom: 12 }}>{filtered.length} cosecha(s) registrada(s)</div>
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th><th>Lote</th><th>Tipo Fruta</th><th>Variedad</th>
              <th>1ª ({unidadVista})</th><th>2ª ({unidadVista})</th><th>3ª ({unidadVista})</th><th>Descarte ({unidadVista})</th>
              <th>Total ({unidadVista})</th><th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const mult = (c.unidad === "kg" && unidadVista === "cestas") ? 1 / KG_POR_CESTA
                         : (c.unidad === "cestas" && unidadVista === "kg") ? KG_POR_CESTA : 1;
              const conv = (v) => ((v || 0) * mult).toFixed(2);
              const total = (c.primera_calidad + c.segunda_calidad + c.tercera_calidad + c.descarte) * mult;
              const tipo = tipos.find((t) => t._id === c.tipo_fruta_id);
              const variedad = variedades.find((v) => v._id === c.variedad_id);
              return (
                <tr key={c._id} data-testid={`cosecha-row-${c._id}`}>
                  <td>{new Date(c.fecha_cosecha).toLocaleDateString()}</td>
                  <td><span className="badge badge-primary">{c.lote}</span></td>
                  <td>{tipo?.nombre || "—"}</td>
                  <td>{variedad?.nombre || "—"}</td>
                  <td style={{ color: "#16a34a", fontWeight: 600 }}>{conv(c.primera_calidad)}</td>
                  <td style={{ color: "#3b82f6" }}>{conv(c.segunda_calidad)}</td>
                  <td style={{ color: "#f59e0b" }}>{conv(c.tercera_calidad)}</td>
                  <td style={{ color: "#dc2626" }}>{conv(c.descarte)}</td>
                  <td style={{ fontWeight: 700 }}>{total.toFixed(2)} {unidadVista}</td>
                  <td>
                    {canEdit("cosecha") && <button className="btn-icon" onClick={() => setEditing(c)}><Pencil size={16} /></button>}
                    {canDelete("cosecha") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(c)}><Trash2 size={16} /></button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">Sin cosechas para los filtros aplicados</div>}
      </div>

      {editing && (
        <CosechaModal
          initial={editing}
          tipos={tipos}
          variedades={variedades}
          plantaciones={plantaciones}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadAll(); }}
          onCatalogRefresh={loadAll}
        />
      )}
    </div>
  );
}

function CalidadBoxes({ label, totals, sum, unidad, compact }) {
  const items = [
    { key: "primera_calidad", label: "Primera Calidad", color: "#16a34a", bg: "#dcfce7", icon: Award },
    { key: "segunda_calidad", label: "Segunda Calidad", color: "#3b82f6", bg: "#dbeafe", icon: TrendingUp },
    { key: "tercera_calidad", label: "Tercera Calidad", color: "#f59e0b", bg: "#fef3c7", icon: TrendingDown },
    { key: "descarte", label: "Descarte", color: "#dc2626", bg: "#fee2e2", icon: AlertCircle },
  ];
  return (
    <div>
      {label && <h3 style={{ margin: "12px 0 8px" }}>{label}</h3>}
      <div className="kpi-grid">
        {items.map((it) => {
          const Icon = it.icon;
          const p = sum ? ((totals[it.key] / sum) * 100).toFixed(1) : "0.0";
          return (
            <div key={it.key} className={compact ? "" : "card"} style={compact ? { background: "#fff", padding: 14, borderRadius: 10, border: "1px solid #bbf7d0" } : {}}>
              <div className="kpi-head">
                <div>
                  <div style={{ color: "#64748b", fontSize: 13 }}>{it.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: it.color }}>{p}%</div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>{(totals[it.key] || 0).toFixed(2)} {unidad}</div>
                </div>
                <div className="kpi-icon-box" style={{ background: it.bg, color: it.color }}><Icon size={18} /></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CosechaModal({ initial, tipos, variedades, plantaciones, onClose, onSaved, onCatalogRefresh }) {
  const toast = useToast();
  const isNew = !initial._id;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    tipo_fruta_id: initial.tipo_fruta_id || "",
    variedad_id: initial.variedad_id || "",
    primera_calidad: initial.primera_calidad || 0,
    segunda_calidad: initial.segunda_calidad || 0,
    tercera_calidad: initial.tercera_calidad || 0,
    descarte: initial.descarte || 0,
    unidad: initial.unidad || "cestas",
    fecha_cosecha: (initial.fecha_cosecha || today + "T12:00:00.000Z").slice(0, 10),
    lote: initial.lote || "",
  });
  const [busy, setBusy] = useState(false);
  const [newTipo, setNewTipo] = useState("");
  const [newVariedad, setNewVariedad] = useState("");

  const variedadesFiltradas = form.tipo_fruta_id ? variedades.filter((v) => v.tipo_fruta_id === form.tipo_fruta_id) : [];

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = { ...form, fecha_cosecha: form.fecha_cosecha + "T12:00:00.000Z" };
      if (isNew) await api.post("/cosechas", payload);
      else await api.put(`/cosechas/${initial._id}`, payload);
      toast.show(isNew ? "Cosecha registrada" : "Cosecha actualizada");
      onSaved();
    } catch (err) {
      toast.show("Error", "error");
    } finally { setBusy(false); }
  };

  const crearTipo = async () => {
    if (!newTipo.trim()) return;
    await api.post("/tipos-fruta", { nombre: newTipo.trim() });
    setNewTipo("");
    onCatalogRefresh();
    toast.show("Tipo creado");
  };
  const crearVariedad = async () => {
    if (!newVariedad.trim() || !form.tipo_fruta_id) return;
    await api.post("/variedades-fruta", { tipo_fruta_id: form.tipo_fruta_id, nombre: newVariedad.trim() });
    setNewVariedad("");
    onCatalogRefresh();
    toast.show("Variedad creada");
  };

  const lotes = Array.from(new Set(plantaciones.map((p) => p.lote).filter(Boolean)));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="cosecha-modal">
        <h2 className="modal-title">{isNew ? "Nueva cosecha" : "Editar cosecha"}</h2>
        <div className="form-grid">
          <div className="field">
            <label>Fecha</label>
            <input type="date" className="input" value={form.fecha_cosecha} onChange={(e) => setForm({ ...form, fecha_cosecha: e.target.value })} required data-testid="cos-form-fecha" />
          </div>
          <div className="field">
            <label>Lote</label>
            <select className="select" value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} required data-testid="cos-form-lote">
              <option value="">Selecciona...</option>
              {lotes.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Unidad</label>
            <select className="select" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
              <option value="cestas">Cestas</option>
              <option value="kg">Kilogramos</option>
            </select>
          </div>
          <div className="field">
            <label>Tipo de Fruta</label>
            <select className="select" value={form.tipo_fruta_id} onChange={(e) => setForm({ ...form, tipo_fruta_id: e.target.value, variedad_id: "" })} required data-testid="cos-form-tipo">
              <option value="">Selecciona...</option>
              {tipos.map((t) => <option key={t._id} value={t._id}>{t.nombre}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="input" placeholder="+ nuevo tipo" value={newTipo} onChange={(e) => setNewTipo(e.target.value)} style={{ flex: 1, fontSize: 12, padding: "6px 8px" }} />
              <button type="button" className="btn btn-sm" onClick={crearTipo}>+</button>
            </div>
          </div>
          <div className="field">
            <label>Variedad</label>
            <select className="select" value={form.variedad_id} onChange={(e) => setForm({ ...form, variedad_id: e.target.value })} required data-testid="cos-form-variedad">
              <option value="">Selecciona...</option>
              {variedadesFiltradas.map((v) => <option key={v._id} value={v._id}>{v.nombre}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="input" placeholder="+ nueva variedad" value={newVariedad} onChange={(e) => setNewVariedad(e.target.value)} style={{ flex: 1, fontSize: 12, padding: "6px 8px" }} />
              <button type="button" className="btn btn-sm" onClick={crearVariedad} disabled={!form.tipo_fruta_id}>+</button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <h4 style={{ margin: "0 0 8px" }}>Calidades ({form.unidad})</h4>
          <div className="form-grid">
            <Field label="1ª Calidad" type="number" step="0.01" value={form.primera_calidad} onChange={(v) => setForm({ ...form, primera_calidad: Number(v) })} testid="cos-form-primera" />
            <Field label="2ª Calidad" type="number" step="0.01" value={form.segunda_calidad} onChange={(v) => setForm({ ...form, segunda_calidad: Number(v) })} />
            <Field label="3ª Calidad" type="number" step="0.01" value={form.tercera_calidad} onChange={(v) => setForm({ ...form, tercera_calidad: Number(v) })} />
            <Field label="Descarte" type="number" step="0.01" value={form.descarte} onChange={(v) => setForm({ ...form, descarte: Number(v) })} />
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="cos-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", step, testid }) {
  return (
    <div className="field">
      <label>{label}</label>
      <input type={type} step={step} className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
    </div>
  );
}
