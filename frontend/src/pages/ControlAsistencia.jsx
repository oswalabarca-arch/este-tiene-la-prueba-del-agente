import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { CalendarCheck, Plus, Trash2, Pencil, Users, CalendarDays, ClipboardList, X, ChevronLeft, ChevronRight } from "lucide-react";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const ESTADOS = {
  presente: { label: "Presente", corto: "P", color: "#15803d", bg: "#dcfce7", border: "#86efac" },
  ausente: { label: "Ausente", corto: "A", color: "#b91c1c", bg: "#fee2e2", border: "#fca5a5" },
  permiso: { label: "Permiso", corto: "Pe", color: "#1d4ed8", bg: "#dbeafe", border: "#93c5fd" },
  reposo: { label: "Reposo", corto: "R", color: "#c2410c", bg: "#ffedd5", border: "#fdba74" },
  medio_dia: { label: "Medio día", corto: "½", color: "#7c3aed", bg: "#f3e8ff", border: "#d8b4fe" },
};
const ORDEN = ["presente", "ausente", "permiso", "reposo", "medio_dia"];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function ControlAsistencia() {
  const { canEdit } = useAuth();
  const [tab, setTab] = useState("diario");
  const editable = canEdit("control_asistencia");

  return (
    <div data-testid="control-asistencia-page">
      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title"><CalendarCheck size={24} style={{ verticalAlign: "middle", color: "#0ea5e9" }} /> Control de asistencia</h1>
        <p className="page-subtitle">Asistencia diaria de los obreros. Módulo independiente.</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <TabBtn active={tab === "diario"} onClick={() => setTab("diario")} icon={CalendarDays} label="Registro diario" testid="asis-tab-diario" />
        <TabBtn active={tab === "mensual"} onClick={() => setTab("mensual")} icon={ClipboardList} label="Planilla mensual" testid="asis-tab-mensual" />
        <TabBtn active={tab === "obreros"} onClick={() => setTab("obreros")} icon={Users} label="Obreros" testid="asis-tab-obreros" />
      </div>

      {tab === "diario" && <RegistroDiario editable={editable} />}
      {tab === "mensual" && <PlanillaMensual />}
      {tab === "obreros" && <Obreros editable={editable} />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label, testid }) {
  return (
    <button onClick={onClick} data-testid={testid}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 10, border: "1px solid",
        borderColor: active ? "#0ea5e9" : "#e2e8f0", background: active ? "#0ea5e9" : "#fff", color: active ? "#fff" : "#475569",
        fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
      <Icon size={16} /> {label}
    </button>
  );
}

/* ---------------- Registro diario ---------------- */
function RegistroDiario({ editable }) {
  const toast = useToast();
  const [fecha, setFecha] = useState(todayStr());
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api.get("/asistencia/dia", { params: { fecha } }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [fecha]);
  useEffect(() => { load(); }, [load]);

  const marcar = async (obrero_id, estado, actual) => {
    if (!editable) return;
    const nuevo = actual === estado ? "" : estado; // click en el mismo => desmarca
    setData((d) => ({ ...d, filas: d.filas.map((f) => f.obrero_id === obrero_id ? { ...f, estado: nuevo || null } : f) }));
    try {
      await api.post("/asistencia/marcar", { obrero_id, fecha, estado: nuevo });
    } catch {
      toast.show("Error al guardar", "error");
      load();
    }
  };

  const marcarTodos = async (estado) => {
    if (!editable || !data) return;
    await Promise.all(data.filas.map((f) => api.post("/asistencia/marcar", { obrero_id: f.obrero_id, fecha, estado })));
    toast.show("Todos marcados como " + ESTADOS[estado].label);
    load();
  };

  const filas = data?.filas || [];
  const resumen = ORDEN.reduce((acc, e) => ({ ...acc, [e]: filas.filter((f) => f.estado === e).length }), {});
  const sinMarcar = filas.filter((f) => !f.estado).length;

  return (
    <div className="card" data-testid="asis-diario">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn-icon" onClick={() => setFecha((f) => shiftDate(f, -1))} data-testid="asis-dia-prev"><ChevronLeft size={18} /></button>
          <input type="date" className="input" style={{ width: 170 }} value={fecha} onChange={(e) => setFecha(e.target.value)} data-testid="asis-dia-fecha" />
          <button className="btn-icon" onClick={() => setFecha((f) => shiftDate(f, 1))} data-testid="asis-dia-next"><ChevronRight size={18} /></button>
          <button className="btn btn-sm" onClick={() => setFecha(todayStr())} data-testid="asis-dia-hoy">Hoy</button>
        </div>
        {editable && filas.length > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Marcar todos:</span>
            <button className="btn btn-sm" style={{ color: ESTADOS.presente.color }} onClick={() => marcarTodos("presente")} data-testid="asis-todos-presente">Presentes</button>
            <button className="btn btn-sm" style={{ color: ESTADOS.ausente.color }} onClick={() => marcarTodos("ausente")} data-testid="asis-todos-ausente">Ausentes</button>
          </div>
        )}
      </div>

      {filas.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }} data-testid="asis-diario-resumen">
          {ORDEN.map((e) => (
            <span key={e} style={{ background: ESTADOS[e].bg, color: ESTADOS[e].color, borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 13 }}>
              {resumen[e]} {ESTADOS[e].label}
            </span>
          ))}
          <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 13 }}>{sinMarcar} Sin marcar</span>
        </div>
      )}

      {filas.length === 0 ? (
        <div className="empty-state" data-testid="asis-diario-empty">No hay obreros activos. Agregalos en la pestaña "Obreros".</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filas.map((f) => (
            <div key={f.obrero_id} data-testid={`asis-fila-${f.obrero_id}`}
              style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px" }}>
              <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{f.nombre}</div>
                {f.cargo && <div style={{ fontSize: 12, color: "#64748b" }}>{f.cargo}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ORDEN.map((e) => {
                  const on = f.estado === e;
                  const c = ESTADOS[e];
                  return (
                    <button key={e} disabled={!editable} onClick={() => marcar(f.obrero_id, e, f.estado)} data-testid={`asis-mark-${f.obrero_id}-${e}`}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid", cursor: editable ? "pointer" : "default", fontWeight: 600, fontSize: 13,
                        borderColor: on ? c.border : "#e2e8f0", background: on ? c.bg : "#fff", color: on ? c.color : "#94a3b8" }}>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Planilla mensual ---------------- */
function PlanillaMensual() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/asistencia/mes", { params: { anio, mes } }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [anio, mes]);

  const dias = useMemo(() => Array.from({ length: data?.dias_mes || 0 }, (_, i) => i + 1), [data]);
  const filas = data?.filas || [];

  const cambiarMes = (delta) => {
    let m = mes + delta, a = anio;
    if (m < 1) { m = 12; a -= 1; } if (m > 12) { m = 1; a += 1; }
    setMes(m); setAnio(a);
  };

  return (
    <div className="card" data-testid="asis-mensual">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <button className="btn-icon" onClick={() => cambiarMes(-1)} data-testid="asis-mes-prev"><ChevronLeft size={18} /></button>
        <div style={{ fontWeight: 700, fontSize: 16, minWidth: 150, textAlign: "center" }} data-testid="asis-mes-label">{MESES[mes - 1]} {anio}</div>
        <button className="btn-icon" onClick={() => cambiarMes(1)} data-testid="asis-mes-next"><ChevronRight size={18} /></button>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {ORDEN.map((e) => (
          <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
            <span style={{ width: 16, height: 16, borderRadius: 4, background: ESTADOS[e].bg, border: `1px solid ${ESTADOS[e].border}`, color: ESTADOS[e].color, fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{ESTADOS[e].corto}</span>
            {ESTADOS[e].label}
          </span>
        ))}
      </div>

      {filas.length === 0 ? (
        <div className="empty-state" data-testid="asis-mensual-empty">No hay obreros activos para mostrar.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 700 }} data-testid="asis-mensual-tabla">
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, background: "#f8fafc", minWidth: 130, zIndex: 1 }}>Obrero</th>
                {dias.map((d) => <th key={d} style={{ textAlign: "center", padding: "6px 4px", fontSize: 11 }}>{d}</th>)}
                {ORDEN.map((e) => <th key={e} style={{ textAlign: "center", fontSize: 11, color: ESTADOS[e].color }}>{ESTADOS[e].corto}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.obrero_id} data-testid={`asis-mes-fila-${f.obrero_id}`}>
                  <td style={{ position: "sticky", left: 0, background: "#fff", fontWeight: 600, zIndex: 1 }}>{f.nombre}</td>
                  {dias.map((d) => {
                    const est = f.dias[String(d)];
                    const c = est ? ESTADOS[est] : null;
                    return (
                      <td key={d} style={{ textAlign: "center", padding: 2 }}>
                        <span title={c ? c.label : ""} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 5, fontSize: 11, fontWeight: 800,
                          background: c ? c.bg : "transparent", color: c ? c.color : "#cbd5e1", border: c ? `1px solid ${c.border}` : "1px solid #f1f5f9" }}>
                          {c ? c.corto : "·"}
                        </span>
                      </td>
                    );
                  })}
                  {ORDEN.map((e) => <td key={e} style={{ textAlign: "center", fontWeight: 700, color: ESTADOS[e].color }}>{f.totales[e] || 0}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Obreros (CRUD) ---------------- */
function Obreros({ editable }) {
  const toast = useToast();
  const [obreros, setObreros] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/asistencia/obreros").then((r) => setObreros(r.data.obreros || []));
  useEffect(() => { load(); }, []);

  const remove = async (o) => {
    if (!window.confirm(`¿Eliminar a "${o.nombre}"? Se borrará también su asistencia registrada.`)) return;
    await api.delete(`/asistencia/obreros/${o._id}`);
    toast.show("Obrero eliminado");
    load();
  };

  return (
    <div className="card" data-testid="asis-obreros">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>Obreros ({obreros.length})</h3>
        {editable && <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true); }} data-testid="asis-obrero-new"><Plus size={15} /> Agregar obrero</button>}
      </div>
      {obreros.length === 0 ? (
        <div className="empty-state" data-testid="asis-obreros-empty">No hay obreros registrados. Agregá el primero.</div>
      ) : (
        <table className="table" data-testid="asis-obreros-tabla">
          <thead><tr><th>Nombre</th><th>Cargo</th><th>Estado</th>{editable && <th style={{ textAlign: "right" }}>Acciones</th>}</tr></thead>
          <tbody>
            {obreros.map((o) => (
              <tr key={o._id} data-testid={`asis-obrero-${o._id}`}>
                <td style={{ fontWeight: 600 }}>{o.nombre}</td>
                <td style={{ color: "#64748b" }}>{o.cargo || "—"}</td>
                <td><span className="badge" style={{ background: o.activo ? "#dcfce7" : "#f1f5f9", color: o.activo ? "#15803d" : "#64748b" }}>{o.activo ? "Activo" : "Inactivo"}</span></td>
                {editable && (
                  <td style={{ textAlign: "right" }}>
                    <button className="btn-icon" onClick={() => { setEditing(o); setShowForm(true); }} data-testid={`asis-obrero-edit-${o._id}`}><Pencil size={15} /></button>
                    <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(o)} data-testid={`asis-obrero-delete-${o._id}`}><Trash2 size={15} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {showForm && <ObreroForm initial={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function ObreroForm({ initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ nombre: initial?.nombre || "", cargo: initial?.cargo || "", activo: initial?.activo ?? true });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { toast.show("Escribí el nombre", "error"); return; }
    setBusy(true);
    try {
      if (initial) await api.put(`/asistencia/obreros/${initial._id}`, form);
      else await api.post("/asistencia/obreros", form);
      toast.show(initial ? "Obrero actualizado" : "Obrero agregado");
      onSaved();
    } catch { toast.show("Error al guardar", "error"); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="asis-obrero-modal">
        <h2 className="modal-title">{initial ? "Editar obrero" : "Nuevo obrero"}</h2>
        <button type="button" className="btn-icon" onClick={onClose} style={{ position: "absolute", top: 14, right: 14 }}><X size={20} /></button>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="field">
            <label>Nombre *</label>
            <input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} data-testid="asis-obrero-nombre" />
          </div>
          <div className="field">
            <label>Cargo</label>
            <input className="input" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} placeholder="Ej. Cosechador" data-testid="asis-obrero-cargo" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} data-testid="asis-obrero-activo" />
            Activo (aparece en el registro diario)
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="asis-obrero-save">{busy ? "Guardando..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function shiftDate(str, delta) {
  const d = new Date(str + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
