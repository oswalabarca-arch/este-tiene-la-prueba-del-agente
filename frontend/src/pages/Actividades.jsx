import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Activity, Plus, Trash2, CheckCircle } from "lucide-react";
import { catBadge } from "../lib/categoryColors";

const TIPOS = ["deshierbar", "siembra", "poda", "limpieza", "transporte", "otro"];

function ActividadesBase({ filtro }) {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [items, setItems] = useState([]);
  const [aplicaciones, setAplicaciones] = useState([]);
  const [plantaciones, setPlantaciones] = useState([]);
  const [editing, setEditing] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);

  const load = async () => {
    const [a, ap, p] = await Promise.all([
      api.get("/actividades"), api.get("/aplicaciones"), api.get("/plantaciones"),
    ]);
    setItems(a.data.actividades);
    setAplicaciones(ap.data.aplicaciones);
    setPlantaciones(p.data.plantaciones);
  };
  useEffect(() => { load(); }, []);

  const remove = async (a) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/actividades/${a._id}`);
    toast.show("Eliminada");
    load();
  };

  const confirmarAplicacion = async (a) => {
    if (!window.confirm(`¿Confirmar que se ejecutó la aplicación de ${a.tipo} en el lote ${a.lote}? Se descontarán los insumos del inventario.`)) return;
    setConfirmingId(a._id);
    try {
      await api.put(`/aplicaciones/${a._id}`, {
        tipo: a.tipo,
        subtipo: a.subtipo || null,
        lote: a.lote || "",
        lotes: a.lotes || [],
        fecha: a.fecha,
        estado: "confirmada",
        insumos: a.insumos || [],
        receta_id: a.receta_id || null,
        cantidad_agua: a.cantidad_agua || 0,
        modo_aplicacion: a.modo_aplicacion || null,
        observaciones: a.observaciones || "",
      });
      await api.post("/actividades", {
        tipo: "aplicacion",
        tipo_personalizado: a.tipo,
        cantidad_trabajadores: 1,
        horas_trabajo: 1,
        lote: a.lote,
        fecha_actividad: a.fecha,
        observaciones: `Aplicación ${a.tipo} confirmada${a.subtipo ? ` (${a.subtipo})` : ""}`,
        origen: "aplicacion",
        aplicacion_id: a._id,
      });
      toast.show("Aplicación confirmada. Inventario actualizado.");
      load();
    } catch {
      toast.show("Error al confirmar", "error");
    } finally {
      setConfirmingId(null);
    }
  };

  const lotes = Array.from(new Set(plantaciones.map((p) => p.lote).filter(Boolean)));
  const totalHorasHombre = items.reduce((s, a) => s + (a.horas_hombre || 0), 0);

  return (
    <div data-testid="actividades-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Activity size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Actividades {filtro === "pendientes" ? "— Pendientes" : filtro === "registrar" ? "— Registrar" : ""}</h1>
          <p className="page-subtitle">{filtro === "pendientes" ? "Aplicaciones pendientes de ejecutar." : "Registra labores realizadas en el campo. Alimenta Recursos Humanos."}</p>
        </div>
        {filtro !== "pendientes" && <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="actividad-new-btn"><Plus size={16} /> Nueva actividad</button>}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Total actividades</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Horas-hombre acumuladas</div><div className="kpi-value" style={{ color: "#16a34a" }}>{totalHorasHombre.toFixed(1)} h</div></div>
        <div className="card kpi-card"><div className="kpi-label">Aplicaciones pendientes</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{aplicaciones.filter((a) => a.estado !== "confirmada").length}</div></div>
      </div>

      {filtro === "pendientes" ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Aplicaciones pendientes</h3>
          <p style={{ color: "#64748b", fontSize: 14 }}>Estas aplicaciones esperan ser confirmadas. Al confirmar, se registra la actividad y se descuentan los insumos del inventario.</p>
          <table className="table">
            <thead><tr><th>Fecha</th><th>Tipo</th><th>Lote</th><th>Insumos</th><th style={{ textAlign: "right" }}>Acciones</th></tr></thead>
            <tbody>
              {aplicaciones.filter((a) => a.estado !== "confirmada").map((a) => (
                <tr key={a._id}>
                  <td>{new Date(a.fecha).toLocaleDateString()}</td>
                  <td><span className="badge" style={catBadge(a.tipo)}>{a.tipo}</span></td>
                  <td><span className="badge badge-primary">{a.lote}</span></td>
                  <td style={{ fontSize: 13, color: "#64748b" }}>
                    {a.insumos?.length > 0
                      ? a.insumos.map((i) => `${i.nombre_producto} ${i.cantidad}${i.unidad}`).join(", ")
                      : "—"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {canEdit("actividades") && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => confirmarAplicacion(a)}
                        disabled={confirmingId === a._id}
                        data-testid={`pendiente-confirm-${a._id}`}
                      >
                        <CheckCircle size={14} /> {confirmingId === a._id ? "Confirmando..." : "Confirmar"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {aplicaciones.filter((a) => a.estado !== "confirmada").length === 0 && <div className="empty-state">Sin aplicaciones pendientes</div>}
        </div>
      ) : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Historial de actividades</h3>
          <table className="table">
            <thead>
              <tr><th>Fecha</th><th>Tipo</th><th>Lote</th><th>Trabajadores</th><th>Horas</th><th>Horas-hombre</th><th>Origen</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a._id}>
                  <td>{new Date(a.fecha_actividad).toLocaleDateString()}</td>
                  <td><span className="badge badge-purple">{a.tipo_personalizado || a.tipo}</span></td>
                  <td><span className="badge badge-primary">{a.lote}</span></td>
                  <td>{a.cantidad_trabajadores}</td>
                  <td>{a.horas_trabajo}</td>
                  <td style={{ fontWeight: 700 }}>{a.horas_hombre || 0}</td>
                  <td><span className="badge badge-info">{a.origen}</span></td>
                  <td>{canDelete("actividades") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(a)}><Trash2 size={16} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div className="empty-state">Sin actividades registradas</div>}
        </div>
      )}

      {editing && <ActividadModal lotes={lotes} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function ActividadModal({ lotes, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    tipo: "deshierbar",
    tipo_personalizado: "",
    cantidad_trabajadores: 1,
    horas_trabajo: 1,
    lote: "",
    fecha_actividad: new Date().toISOString().slice(0, 10),
    observaciones: "",
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/actividades", { ...form, fecha_actividad: form.fecha_actividad + "T12:00:00.000Z" });
      toast.show("Actividad registrada");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="actividad-modal">
        <h2 className="modal-title">Registrar actividad</h2>
        <div className="form-grid">
          <div className="field">
            <label>Tipo</label>
            <select className="select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          </div>
          {form.tipo === "otro" && (
            <div className="field">
              <label>Especifica</label>
              <input className="input" value={form.tipo_personalizado} onChange={(e) => setForm({ ...form, tipo_personalizado: e.target.value })} required />
            </div>
          )}
          <div className="field">
            <label>Lote</label>
            <select className="select" value={form.lote} onChange={(e) => setForm({ ...form, lote: e.target.value })} required>
              <option value="">Selecciona...</option>{lotes.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Fecha</label>
            <input type="date" className="input" value={form.fecha_actividad} onChange={(e) => setForm({ ...form, fecha_actividad: e.target.value })} required />
          </div>
          <div className="field">
            <label>Cantidad de trabajadores</label>
            <input type="number" className="input" value={form.cantidad_trabajadores} onChange={(e) => setForm({ ...form, cantidad_trabajadores: Number(e.target.value) })} required data-testid="act-form-trabajadores" />
          </div>
          <div className="field">
            <label>Horas de trabajo</label>
            <input type="number" step="0.5" className="input" value={form.horas_trabajo} onChange={(e) => setForm({ ...form, horas_trabajo: Number(e.target.value) })} required data-testid="act-form-horas" />
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Observaciones</label>
          <textarea className="textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
        </div>
        <div style={{ marginTop: 10, color: "#64748b", fontSize: 13 }}>
          Horas-hombre = {form.cantidad_trabajadores} × {form.horas_trabajo} = <b>{form.cantidad_trabajadores * form.horas_trabajo}</b>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="act-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

export function ActividadesPendientes() { return <ActividadesBase filtro="pendientes" />; }
export function ActividadesRegistrar() { return <ActividadesBase filtro="registrar" />; }
