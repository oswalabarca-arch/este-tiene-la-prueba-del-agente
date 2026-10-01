import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { CalendarCheck, Plus, Trash2, Pencil, Users, CalendarDays, ClipboardList, X, ChevronLeft, ChevronRight, Send, Lock, CheckCircle2, Circle } from "lucide-react";


const ESTADOS = {
  presente: { label: "Presente", corto: "P", color: "#15803d", bg: "#dcfce7", border: "#86efac" },
  medio_dia: { label: "Medio día", corto: "½", color: "#7c3aed", bg: "#f3e8ff", border: "#d8b4fe" },
};
const ORDEN = ["presente", "medio_dia"];
const DIAS_SEM = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const fmtYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayStr = () => fmtYMD(new Date());

export default function ControlAsistencia() {
  const { canEdit, canDelete } = useAuth();
  const [tab, setTab] = useState("diario");
  const editable = canEdit("control_asistencia");
  const puedeDesbloquear = canDelete("control_asistencia");

  return (
    <div data-testid="control-asistencia-page">
      <div style={{ marginBottom: 16 }}>
        <h1 className="page-title"><CalendarCheck size={24} style={{ verticalAlign: "middle", color: "#0ea5e9" }} /> Control de asistencia</h1>
        <p className="page-subtitle">Asistencia diaria de los trabajadores. Módulo independiente.</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        <TabBtn active={tab === "diario"} onClick={() => setTab("diario")} icon={CalendarDays} label="Registro diario" testid="asis-tab-diario" />
        <TabBtn active={tab === "mensual"} onClick={() => setTab("mensual")} icon={ClipboardList} label="Planilla semanal" testid="asis-tab-mensual" />
        <TabBtn active={tab === "resumen"} onClick={() => setTab("resumen")} icon={CalendarCheck} label="Resumen mensual" testid="asis-tab-resumen" />
        <TabBtn active={tab === "obreros"} onClick={() => setTab("obreros")} icon={Users} label="Trabajadores" testid="asis-tab-obreros" />
      </div>

      {tab === "diario" && <RegistroDiario editable={editable} puedeDesbloquear={puedeDesbloquear} />}
      {tab === "mensual" && <PlanillaSemanal />}
      {tab === "resumen" && <ResumenMensual />}
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
function RegistroDiario({ editable, puedeDesbloquear }) {
  const toast = useToast();
  const [fecha, setFecha] = useState(todayStr());
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    api.get("/asistencia/dia", { params: { fecha } }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [fecha]);
  useEffect(() => { load(); }, [load]);

  const enviado = !!data?.enviado;
  const puedeMarcar = editable && !enviado;

  const marcar = async (obrero_id, estado, actual) => {
    if (!puedeMarcar) return;
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
    if (!puedeMarcar || !data) return;
    await Promise.all(data.filas.map((f) => api.post("/asistencia/marcar", { obrero_id: f.obrero_id, fecha, estado })));
    toast.show("Todos marcados como " + ESTADOS[estado].label);
    load();
  };

  const guardarHorasExtra = async (obrero_id, valor) => {
    if (!puedeMarcar) return;
    const horas = valor === "" ? 0 : Math.max(parseFloat(valor) || 0, 0);
    setData((d) => ({ ...d, filas: d.filas.map((f) => f.obrero_id === obrero_id ? { ...f, horas_extra: horas } : f) }));
    try {
      await api.post("/asistencia/horas-extra", { obrero_id, fecha, horas_extra: horas });
    } catch {
      toast.show("Error al guardar las horas extra", "error");
      load();
    }
  };

  const enviarAsistencia = async () => {
    if (!window.confirm("¿Enviar la asistencia de este día? Quedará bloqueada y no se podrá modificar (salvo con permiso de edición).")) return;
    try { await api.post("/asistencia/enviar", { fecha }); toast.show("Asistencia enviada y bloqueada"); load(); }
    catch { toast.show("Error al enviar", "error"); }
  };

  const reabrir = async () => {
    try { await api.post("/asistencia/reabrir", { fecha }); toast.show("Asistencia desbloqueada para editar"); load(); }
    catch (e) { toast.show(e?.response?.data?.detail || "No tenés permiso para editar", "error"); }
  };

  const filas = data?.filas || [];
  const resumen = ORDEN.reduce((acc, e) => ({ ...acc, [e]: filas.filter((f) => f.estado === e).length }), {});
  const sinMarcar = filas.filter((f) => !f.estado).length;
  const totalHE = filas.reduce((a, f) => a + (parseFloat(f.horas_extra) || 0), 0);

  return (
    <div className="card" data-testid="asis-diario">
      <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn-icon" onClick={() => setFecha((f) => shiftDate(f, -1))} data-testid="asis-dia-prev"><ChevronLeft size={18} /></button>
          <input type="date" className="input" style={{ width: 170 }} value={fecha} onChange={(e) => setFecha(e.target.value)} data-testid="asis-dia-fecha" />
          <button className="btn-icon" onClick={() => setFecha((f) => shiftDate(f, 1))} data-testid="asis-dia-next"><ChevronRight size={18} /></button>
          <button className="btn btn-sm" onClick={() => setFecha(todayStr())} data-testid="asis-dia-hoy">Hoy</button>
        </div>
        {puedeMarcar && filas.length > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Marcar todos:</span>
            <button className="btn btn-sm" style={{ color: ESTADOS.presente.color }} onClick={() => marcarTodos("presente")} data-testid="asis-todos-presente">Presentes</button>
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {editable && filas.length > 0 && (
            <button className="btn btn-primary btn-sm" onClick={enviarAsistencia} disabled={enviado} data-testid="asis-enviar-btn"><Send size={15} /> Enviar asistencia</button>
          )}
          {editable && filas.length > 0 && puedeDesbloquear && (
            <button className="btn btn-sm" onClick={reabrir} disabled={!enviado} data-testid="asis-editar-btn"
              title={enviado ? "Editar la asistencia enviada" : "Solo se puede editar una asistencia ya enviada"}
              style={{ borderColor: "#f59e0b", color: enviado ? "#b45309" : "#cbd5e1" }}><Pencil size={15} /> Editar</button>
          )}
        </div>
      </div>

      {enviado && (
        <div data-testid="asis-bloqueado-banner" style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", marginBottom: 14, color: "#15803d" }}>
          <Lock size={16} />
          <span style={{ fontWeight: 600 }}>Asistencia enviada{data?.enviado_por ? ` por ${data.enviado_por}` : ""}. Bloqueada para edición.</span>
          {!puedeDesbloquear && <span style={{ fontSize: 12, color: "#64748b" }}>Para modificarla necesitás el permiso de edición (Usuarios).</span>}
        </div>
      )}

      {filas.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }} data-testid="asis-diario-resumen">
          {ORDEN.map((e) => (
            <span key={e} style={{ background: ESTADOS[e].bg, color: ESTADOS[e].color, borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 13 }}>
              {resumen[e]} {ESTADOS[e].label}
            </span>
          ))}
          <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 13 }}>{sinMarcar} Sin marcar</span>
          {totalHE > 0 && (
            <span data-testid="asis-diario-total-he" style={{ background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: 8, padding: "5px 10px", fontWeight: 700, fontSize: 13 }}>
              {String(totalHE).replace(".", ",")} h extra
            </span>
          )}
        </div>
      )}

      {filas.length === 0 ? (
        <div className="empty-state" data-testid="asis-diario-empty">No hay trabajadores activos. Agregalos en la pestaña "Trabajadores".</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filas.map((f) => (
            <div key={f.obrero_id} data-testid={`asis-fila-${f.obrero_id}`}
              style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", opacity: enviado ? 0.85 : 1 }}>
              <div style={{ flex: "0 0 auto", width: 200, minWidth: 140 }}>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>{f.nombre}</div>
                {f.cargo && <div style={{ fontSize: 12, color: "#64748b" }}>{f.cargo}</div>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ORDEN.map((e) => {
                  const on = f.estado === e;
                  const c = ESTADOS[e];
                  return (
                    <button key={e} disabled={!puedeMarcar} onClick={() => marcar(f.obrero_id, e, f.estado)} data-testid={`asis-mark-${f.obrero_id}-${e}`}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid", cursor: puedeMarcar ? "pointer" : "not-allowed", fontWeight: 600, fontSize: 13,
                        borderColor: on ? c.border : "#e2e8f0", background: on ? c.bg : "#fff", color: on ? c.color : "#94a3b8" }}>
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <label style={{ fontSize: 12, color: "#c2410c", fontWeight: 600, whiteSpace: "nowrap" }}>Horas extra</label>
                <input type="number" step="0.5" min="0" className="input" disabled={!puedeMarcar}
                  style={{ width: 78, textAlign: "center", padding: "6px 6px", borderColor: (parseFloat(f.horas_extra) || 0) > 0 ? "#fb923c" : undefined }}
                  value={f.horas_extra === 0 || f.horas_extra === undefined || f.horas_extra === null ? "" : f.horas_extra}
                  onChange={(e) => setData((d) => ({ ...d, filas: d.filas.map((x) => x.obrero_id === f.obrero_id ? { ...x, horas_extra: e.target.value } : x) }))}
                  onBlur={(e) => guardarHorasExtra(f.obrero_id, e.target.value)}
                  placeholder="0" data-testid={`asis-he-${f.obrero_id}`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Planilla semanal ---------------- */
function PlanillaSemanal() {
  const toast = useToast();
  const { canEdit } = useAuth();
  const editable = canEdit("control_asistencia");
  const [fecha, setFecha] = useState(todayStr());
  const [data, setData] = useState(null);
  const [salarioDef, setSalarioDef] = useState("");
  const [tasa, setTasa] = useState("");
  const [salEdits, setSalEdits] = useState({}); // ediciones locales del salario por obrero
  const [pagoEdits, setPagoEdits] = useState({}); // estado local de "pagado" por obrero

  const load = useCallback(() => {
    api.get("/asistencia/semana", { params: { fecha } }).then((r) => {
      setData(r.data);
      setSalarioDef(r.data.salario_default ? String(r.data.salario_default) : "");
      setTasa(r.data.tasa ? String(r.data.tasa) : "");
      setSalEdits({});
      setPagoEdits({});
    }).catch(() => setData(null));
  }, [fecha]);
  useEffect(() => { load(); }, [load]);

  const desde = data?.desde;
  const dias = data?.dias_semana || [];
  const filas = data?.filas || [];
  const tasaNum = parseFloat(tasa) || 0;

  const rangoLabel = () => {
    if (!data) return "";
    const s = new Date(data.desde + "T00:00:00"), e = new Date(data.hasta + "T00:00:00");
    const MC = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return `${s.getDate()} ${MC[s.getMonth()]} — ${e.getDate()} ${MC[e.getMonth()]} ${e.getFullYear()}`;
  };

  const guardarConfig = async (campo, valor) => {
    if (!desde) return;
    try { await api.post("/asistencia/config", { desde, [campo]: valor === "" ? 0 : parseFloat(valor) }); load(); }
    catch { toast.show("Error al guardar", "error"); }
  };

  const guardarSalarioInd = async (obrero_id, valor) => {
    if (!desde) return;
    const salario = valor === "" ? null : parseFloat(valor);
    try { await api.post("/asistencia/config/salario", { desde, obrero_id, salario }); load(); }
    catch { toast.show("Error al guardar", "error"); }
  };

  const pagadoDe = (f) => (pagoEdits[f.obrero_id] !== undefined ? pagoEdits[f.obrero_id] : !!f.pagado);
  const togglePagado = async (f) => {
    if (!desde || !editable) return;
    const nuevo = !pagadoDe(f);
    setPagoEdits((p) => ({ ...p, [f.obrero_id]: nuevo })); // optimista
    try {
      await api.post("/asistencia/config/pagado", { desde, obrero_id: f.obrero_id, pagado: nuevo });
      toast.show(nuevo ? `${f.nombre} marcado como pagado` : `${f.nombre} marcado como pendiente`);
    } catch {
      setPagoEdits((p) => ({ ...p, [f.obrero_id]: !nuevo })); // revertir
      toast.show("Error al guardar el pago", "error");
    }
  };

  // salario efectivo por fila (usa edición local si existe, si no el del backend)
  const salarioDe = (f) => (salEdits[f.obrero_id] !== undefined ? parseFloat(salEdits[f.obrero_id]) || 0 : f.salario_diario);
  const heDe = (f) => parseFloat(f.horas_extra) || 0;
  // BCV $ = jornales × salario diario + horas extra × (salario diario / 8)
  const bcvDe = (f) => Math.round((f.jornales * salarioDe(f) + heDe(f) * (salarioDe(f) / 8)) * 100) / 100;
  const bsDe = (f) => Math.round(bcvDe(f) * tasaNum * 100) / 100;
  const totalBcv = filas.reduce((a, f) => a + bcvDe(f), 0);
  const totalBs = filas.reduce((a, f) => a + bsDe(f), 0);
  const totalHE = filas.reduce((a, f) => a + heDe(f), 0);
  const fmtH = (n) => String(Math.round((parseFloat(n) || 0) * 100) / 100).replace(".", ",");
  const fmt = (n) => {
    const [ent, dec] = Number(n || 0).toFixed(2).split(".");
    return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
  };

  return (
    <div className="card" data-testid="asis-mensual">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <button className="btn-icon" onClick={() => setFecha((f) => shiftDate(f, -7))} data-testid="asis-mes-prev"><ChevronLeft size={18} /></button>
        <div style={{ fontWeight: 700, fontSize: 15, minWidth: 180, textAlign: "center" }} data-testid="asis-mes-label">Semana: {rangoLabel()}</div>
        <button className="btn-icon" onClick={() => setFecha((f) => shiftDate(f, 7))} data-testid="asis-mes-next"><ChevronRight size={18} /></button>
        <button className="btn btn-sm" onClick={() => setFecha(todayStr())} data-testid="asis-semana-hoy">Semana actual</button>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
          <label style={{ fontSize: 12, color: "#64748b" }}>Salario diario $</label>
          <input type="number" step="0.01" min="0" className="input" style={{ width: 100 }} value={salarioDef} disabled={!editable}
            onChange={(e) => setSalarioDef(e.target.value)} onBlur={(e) => guardarConfig("salario_default", e.target.value)}
            placeholder="0" data-testid="asis-salario-default" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <label style={{ fontSize: 12, color: "#64748b" }}>Tasa de cambio</label>
          <input type="number" step="0.01" min="0" className="input" style={{ width: 110 }} value={tasa} disabled={!editable}
            onChange={(e) => setTasa(e.target.value)} onBlur={(e) => guardarConfig("tasa", e.target.value)}
            placeholder="0" data-testid="asis-tasa" />
        </div>
      </div>
      <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 14px" }}>
        Ordenado de mayor a menor jornales. Incluye sábado y domingo. <b>BCV $</b> = jornales × salario diario + horas extra × (salario diario ÷ 8) · <b>Bolívares</b> = BCV $ × tasa.
        El salario por defecto aplica a todos; podés cambiarlo por trabajador en la columna "Salario diario". Una hora extra vale el salario diario ÷ 8 (el día = 8 horas).
      </p>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
        {ORDEN.map((e) => (
          <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
            <span style={{ width: 18, height: 18, borderRadius: 4, background: ESTADOS[e].bg, border: `1px solid ${ESTADOS[e].border}`, color: ESTADOS[e].color, fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{ESTADOS[e].corto}</span>
            {ESTADOS[e].label}
          </span>
        ))}
        <span style={{ fontSize: 12, color: "#475569" }}>Jornales: Presente = 1 · Medio día = 0,5</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#c2410c" }}>
          <span style={{ width: 18, height: 18, borderRadius: 4, background: "#fff7ed", border: "1px solid #fed7aa", color: "#c2410c", fontSize: 10, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>+h</span>
          Horas extra
        </span>
      </div>

      {filas.length === 0 ? (
        <div className="empty-state" data-testid="asis-mensual-empty">No hay trabajadores activos para mostrar.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ minWidth: 1000 }} data-testid="asis-mensual-tabla">
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Trabajador</th>
                {dias.map((f, i) => {
                  const dd = new Date(f + "T00:00:00");
                  const finde = i >= 5;
                  return <th key={f} style={{ textAlign: "center", padding: "6px 4px", fontSize: 11, color: finde ? "#0ea5e9" : "#475569" }}>{DIAS_SEM[i]}<br />{dd.getDate()}</th>;
                })}
                <th style={{ textAlign: "center", fontSize: 12, background: "#f0fdf4" }}>Jornales</th>
                <th style={{ textAlign: "center", fontSize: 12, background: "#fff7ed", color: "#c2410c" }}>Horas extra</th>
                <th style={{ textAlign: "center", fontSize: 12, minWidth: 110 }}>Salario diario $</th>
                <th style={{ textAlign: "center", fontSize: 12, background: "#eff6ff", color: "#1d4ed8" }}>BCV $</th>
                <th style={{ textAlign: "center", fontSize: 12, background: "#fef9c3", color: "#a16207" }}>Bolívares</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, idx) => (
                <tr key={f.obrero_id} data-testid={`asis-mes-fila-${f.obrero_id}`}>
                  <td style={{ fontWeight: 600 }}>
                    {idx === 0 && f.jornales > 0 && <span style={{ color: "#ca8a04", marginRight: 4 }}>★</span>}
                    {f.nombre}
                    {f.cargo && <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>{f.cargo}</div>}
                  </td>
                  {dias.map((day) => {
                    const est = f.dias[day];
                    const c = est ? ESTADOS[est] : null;
                    const he = (f.horas_dias || {})[day] || 0;
                    return (
                      <td key={day} style={{ textAlign: "center", padding: 3 }}>
                        <span title={c ? c.label : ""} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, fontSize: 12, fontWeight: 800,
                          background: c ? c.bg : "transparent", color: c ? c.color : "#cbd5e1", border: c ? `1px solid ${c.border}` : "1px solid #f1f5f9" }}>
                          {c ? c.corto : "·"}
                        </span>
                        {he > 0 && (
                          <div title={`${fmtH(he)} horas extra`} data-testid={`asis-he-dia-${f.obrero_id}-${day}`}
                            style={{ fontSize: 10, fontWeight: 800, color: "#c2410c", marginTop: 1 }}>+{fmtH(he)}h</div>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "center", fontWeight: 800, color: "#15803d", background: "#f0fdf4", fontSize: 15 }} data-testid={`asis-jornales-${f.obrero_id}`}>
                    {String(f.jornales).replace(".", ",")}
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 800, color: heDe(f) > 0 ? "#c2410c" : "#cbd5e1", background: "#fff7ed", fontSize: 14 }} data-testid={`asis-he-sem-${f.obrero_id}`}>
                    {heDe(f) > 0 ? fmtH(heDe(f)) : "—"}
                  </td>
                  <td style={{ textAlign: "center", padding: 4 }}>
                    <input type="number" step="0.01" min="0" className="input" style={{ width: 90, textAlign: "center", padding: "5px 6px",
                      borderColor: f.salario_individual ? "#f59e0b" : undefined }}
                      disabled={!editable}
                      value={salEdits[f.obrero_id] !== undefined ? salEdits[f.obrero_id] : (f.salario_diario || "")}
                      onChange={(e) => setSalEdits((s) => ({ ...s, [f.obrero_id]: e.target.value }))}
                      onBlur={(e) => guardarSalarioInd(f.obrero_id, e.target.value)}
                      title={f.salario_individual ? "Salario individual (distinto al general)" : ""}
                      data-testid={`asis-salario-${f.obrero_id}`} />
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: "#1d4ed8", background: "#eff6ff" }} data-testid={`asis-bcv-${f.obrero_id}`}>{fmt(bcvDe(f))}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: "#a16207", background: "#fef9c3" }} data-testid={`asis-bolivares-${f.obrero_id}`}>{fmt(bsDe(f))}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid #e2e8f0" }}>
                <td colSpan={dias.length + 2} style={{ textAlign: "right", fontWeight: 700, color: "#475569" }}>Totales de la semana →</td>
                <td style={{ textAlign: "center", fontWeight: 800, color: totalHE > 0 ? "#c2410c" : "#cbd5e1", background: "#fff7ed" }} data-testid="asis-total-he">{totalHE > 0 ? fmtH(totalHE) : "—"}</td>
                <td></td>
                <td style={{ textAlign: "center", fontWeight: 800, color: "#1d4ed8", background: "#eff6ff" }} data-testid="asis-total-bcv">{fmt(totalBcv)}</td>
                <td style={{ textAlign: "center", fontWeight: 800, color: "#a16207", background: "#fef9c3" }} data-testid="asis-total-bolivares">{fmt(totalBs)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {filas.length > 0 && (
        <div style={{ marginTop: 20 }} data-testid="asis-pago-resumen">
          <div style={{ fontWeight: 700, fontSize: 14, color: "#334155", marginBottom: 4 }}>Resumen de pago (Bolívares)</div>
          <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 10px" }}>
            Toca el recuadro de cada trabajador cuando ya le hayas pagado: cambia de <b style={{ color: "#a16207" }}>amarillo (pendiente)</b> a <b style={{ color: "#15803d" }}>verde (pagado)</b>.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, maxWidth: 420 }}>
            {filas.map((f) => {
              const pagado = pagadoDe(f);
              return (
              <button key={f.obrero_id} type="button" onClick={() => togglePagado(f)} disabled={!editable}
                data-testid={`asis-pago-fila-${f.obrero_id}`}
                title={editable ? (pagado ? "Pagado — toca para marcar como pendiente" : "Pendiente — toca para marcar como pagado") : ""}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", textAlign: "left", width: "100%",
                  cursor: editable ? "pointer" : "default", transition: "background-color .15s, border-color .15s",
                  background: pagado ? "#dcfce7" : "#fefce8", border: pagado ? "1px solid #86efac" : "1px solid #fde68a", borderRadius: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, overflow: "hidden" }}>
                  {pagado
                    ? <CheckCircle2 size={18} style={{ color: "#16a34a", flexShrink: 0 }} data-testid={`asis-pago-check-${f.obrero_id}`} />
                    : <Circle size={18} style={{ color: "#d97706", flexShrink: 0 }} />}
                  <span style={{ fontWeight: 600, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.nombre}</span>
                  {pagado && <span style={{ fontSize: 11, fontWeight: 700, color: "#15803d", background: "#bbf7d0", padding: "1px 6px", borderRadius: 6 }}>Pagado</span>}
                </span>
                <span style={{ fontWeight: 800, color: pagado ? "#15803d" : "#a16207", whiteSpace: "nowrap", textDecoration: pagado ? "line-through" : "none" }} data-testid={`asis-pago-bs-${f.obrero_id}`}>Bs {fmt(bsDe(f))}</span>
              </button>
              );
            })}
          </div>
          {(() => {
            const pendienteBs = filas.filter((f) => !pagadoDe(f)).reduce((a, f) => a + bsDe(f), 0);
            const pagadoBs = totalBs - pendienteBs;
            return (
              <div style={{ maxWidth: 420, marginTop: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, fontWeight: 700, color: "#15803d", fontSize: 13 }} data-testid="asis-pago-pagado">
                  <span>Ya pagado</span>
                  <span>Bs {fmt(pagadoBs)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 12px", marginTop: 6, background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: 8, fontWeight: 800, color: "#92400e" }} data-testid="asis-pago-total">
                  <span>Pendiente por pagar</span>
                  <span>Bs {fmt(pendienteBs)}</span>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/* ---------------- Resumen mensual ---------------- */
function ResumenMensual() {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/asistencia/resumen-mensual", { params: { anio, mes } }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [anio, mes]);

  const cambiarMes = (delta) => {
    let m = mes + delta, a = anio;
    if (m < 1) { m = 12; a -= 1; } if (m > 12) { m = 1; a += 1; }
    setMes(m); setAnio(a);
  };

  const fmt = (n) => {
    const [ent, dec] = Number(n || 0).toFixed(2).split(".");
    return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
  };
  const filas = data?.filas || [];

  return (
    <div className="card" data-testid="asis-resumen">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
        <button className="btn-icon" onClick={() => cambiarMes(-1)} data-testid="asis-resumen-prev"><ChevronLeft size={18} /></button>
        <div style={{ fontWeight: 700, fontSize: 16, minWidth: 150, textAlign: "center" }} data-testid="asis-resumen-label">{MESES[mes - 1]} {anio}</div>
        <button className="btn-icon" onClick={() => cambiarMes(1)} data-testid="asis-resumen-next"><ChevronRight size={18} /></button>
      </div>
      <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 14px" }}>
        Total del mes por trabajador, sumando todas las semanas. Cada día usa la tasa y el salario de su semana respectiva.
      </p>

      {filas.length === 0 ? (
        <div className="empty-state" data-testid="asis-resumen-empty">No hay asistencia registrada en este mes.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" data-testid="asis-resumen-tabla">
            <thead>
              <tr>
                <th style={{ minWidth: 150 }}>Trabajador</th>
                <th style={{ textAlign: "center", background: "#f0fdf4" }}>Jornales</th>
                <th style={{ textAlign: "center", background: "#fff7ed", color: "#c2410c" }}>Horas extra</th>
                <th style={{ textAlign: "center", background: "#eff6ff", color: "#1d4ed8" }}>BCV $</th>
                <th style={{ textAlign: "center", background: "#fef9c3", color: "#a16207" }}>Bolívares</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, idx) => (
                <tr key={f.obrero_id} data-testid={`asis-resumen-fila-${f.obrero_id}`}>
                  <td style={{ fontWeight: 600 }}>
                    {idx === 0 && f.jornales > 0 && <span style={{ color: "#ca8a04", marginRight: 4 }}>★</span>}
                    {f.nombre}
                    {f.cargo && <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 400 }}>{f.cargo}</div>}
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 800, color: "#15803d", background: "#f0fdf4", fontSize: 15 }} data-testid={`asis-resumen-jornales-${f.obrero_id}`}>{String(f.jornales).replace(".", ",")}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: (f.horas_extra || 0) > 0 ? "#c2410c" : "#cbd5e1", background: "#fff7ed" }} data-testid={`asis-resumen-he-${f.obrero_id}`}>{(f.horas_extra || 0) > 0 ? String(f.horas_extra).replace(".", ",") : "—"}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: "#1d4ed8", background: "#eff6ff" }} data-testid={`asis-resumen-bcv-${f.obrero_id}`}>{fmt(f.bcv)}</td>
                  <td style={{ textAlign: "center", fontWeight: 700, color: "#a16207", background: "#fef9c3" }} data-testid={`asis-resumen-bolivares-${f.obrero_id}`}>{fmt(f.bolivares)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: "2px solid #e2e8f0" }}>
                <td style={{ textAlign: "right", fontWeight: 700, color: "#475569" }}>Totales del mes →</td>
                <td style={{ textAlign: "center", fontWeight: 800, color: "#15803d", background: "#f0fdf4" }} data-testid="asis-resumen-total-jornales">{String(data.total_jornales).replace(".", ",")}</td>
                <td style={{ textAlign: "center", fontWeight: 800, color: (data.total_horas_extra || 0) > 0 ? "#c2410c" : "#cbd5e1", background: "#fff7ed" }} data-testid="asis-resumen-total-he">{(data.total_horas_extra || 0) > 0 ? String(data.total_horas_extra).replace(".", ",") : "—"}</td>
                <td style={{ textAlign: "center", fontWeight: 800, color: "#1d4ed8", background: "#eff6ff" }} data-testid="asis-resumen-total-bcv">{fmt(data.total_bcv)}</td>
                <td style={{ textAlign: "center", fontWeight: 800, color: "#a16207", background: "#fef9c3" }} data-testid="asis-resumen-total-bolivares">{fmt(data.total_bolivares)}</td>
              </tr>
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
    toast.show("Trabajador eliminado");
    load();
  };

  return (
    <div className="card" data-testid="asis-obreros">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>Trabajadores ({obreros.length})</h3>
        {editable && <button className="btn btn-primary btn-sm" onClick={() => { setEditing(null); setShowForm(true); }} data-testid="asis-obrero-new"><Plus size={15} /> Agregar trabajador</button>}
      </div>
      {obreros.length === 0 ? (
        <div className="empty-state" data-testid="asis-obreros-empty">No hay trabajadores registrados. Agregá el primero.</div>
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
      toast.show(initial ? "Trabajador actualizado" : "Trabajador agregado");
      onSaved();
    } catch { toast.show("Error al guardar", "error"); } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="asis-obrero-modal">
        <h2 className="modal-title">{initial ? "Editar trabajador" : "Nuevo trabajador"}</h2>
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
  return fmtYMD(d);
}
