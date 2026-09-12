import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import {
  Send, Plus, Trash2, Home, Truck, MapPin, Thermometer, Snowflake, Heart,
  Award, TrendingUp, TrendingDown, AlertCircle, Ban, Pencil, Check, X,
} from "lucide-react";
import { todayLocal } from "../lib/dates";
import { PeriodPicker, currentMonthStr, currentDayStr, currentWeekStr } from "../components/PeriodPicker";
import { DecimalInput } from "../components/DecimalInput";

const KG = 14;

const DESTINOS = [
  { key: "venta_finca", label: "Venta en finca", icon: Home, color: "#16a34a" },
  { key: "enviar_ciudad", label: "Enviar a ciudad", icon: Truck, color: "#3b82f6" },
  { key: "enviar_otra_ciudad", label: "Enviar a otra ciudad", icon: MapPin, color: "#7c3aed" },
  { key: "refrigerar", label: "Refrigerado", icon: Thermometer, color: "#0ea5e9" },
  { key: "congelar", label: "Congelado", icon: Snowflake, color: "#0284c7" },
  { key: "descarte", label: "Descarte", icon: Trash2, color: "#dc2626" },
  { key: "donaciones", label: "Donaciones", icon: Heart, color: "#db2777" },
  { key: "asignacion_error", label: "Asignación por error", icon: Ban, color: "#64748b" },
];

const CALIDADES = [
  { key: "primera_calidad", label: "Primera Calidad", color: "#16a34a", bg: "#dcfce7", icon: Award },
  { key: "segunda_calidad", label: "Segunda Calidad", color: "#3b82f6", bg: "#dbeafe", icon: TrendingUp },
  { key: "tercera_calidad", label: "Tercera Calidad", color: "#f59e0b", bg: "#fef3c7", icon: TrendingDown },
  { key: "descarte", label: "Descarte (cosecha)", color: "#dc2626", bg: "#fee2e2", icon: AlertCircle },
];

export default function AsignacionDestino() {
  const toast = useToast();
  const { canDelete } = useAuth();
  const [realToday, setRealToday] = useState(todayLocal());
  const [selectedDate, setSelectedDate] = useState(todayLocal());
  const [asignaciones, setAsignaciones] = useState([]);
  const [cosechas, setCosechas] = useState([]);
  const [inputs, setInputs] = useState({}); // { destinoKey: { cantidad, unidad } }
  const [busy, setBusy] = useState("");
  const isToday = selectedDate === realToday;
  // Editable en cualquier fecha seleccionada (no se puede elegir fecha futura por el max del selector).
  const editable = selectedDate <= realToday;

  // Historial de asignaciones (consulta + borrado de cualquier fecha)
  const monthStart = () => todayLocal().slice(0, 8) + "01";
  const [histPreset, setHistPreset] = useState("mes");
  const [histDesde, setHistDesde] = useState(monthStart());
  const [histHasta, setHistHasta] = useState(todayLocal());
  const [histDia, setHistDia] = useState(currentDayStr);
  const [histSemana, setHistSemana] = useState(currentWeekStr);
  const [histMes, setHistMes] = useState(currentMonthStr);
  const [historial, setHistorial] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editCant, setEditCant] = useState("");
  const [editUnidad, setEditUnidad] = useState("cestas");
  const lastDayOfMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m, 0).getDate(); };
  const weekRange = (ym, wk) => {
    const starts = { "1": 1, "2": 8, "3": 15, "4": 22 };
    const ends = { "1": 7, "2": 14, "3": 21, "4": lastDayOfMonth(ym) };
    const pad = (n) => String(n).padStart(2, "0");
    return [`${ym}-${pad(starts[wk])}`, `${ym}-${pad(ends[wk])}`];
  };

  const load = useCallback(async () => {
    const [a, c] = await Promise.all([
      api.get(`/asignaciones-destino?fecha=${selectedDate}`),
      api.get(`/cosechas?fecha_desde=${selectedDate}T00:00:00.000Z&fecha_hasta=${selectedDate}T23:59:59.999Z`),
    ]);
    setAsignaciones(a.data.asignaciones);
    setCosechas(c.data.cosechas);
  }, [selectedDate]);
  useEffect(() => { load(); }, [load]);

  // Mantiene actualizada la fecha "hoy" (para el botón "Ir a hoy"), SIN reiniciar ni
  // borrar nada a medianoche. Las cestas sin asignar quedan disponibles hasta que las asignes.
  useEffect(() => {
    const iv = setInterval(() => setRealToday(todayLocal()), 60000);
    return () => clearInterval(iv);
  }, []);

  // Cosecha del día en cestas, desglosada por calidad
  const toCestas = (c, key) => (c.unidad === "kg" ? (c[key] || 0) / KG : (c[key] || 0));
  const totalsCalidad = cosechas.reduce(
    (acc, c) => {
      ["primera_calidad", "segunda_calidad", "tercera_calidad", "descarte"].forEach((k) => { acc[k] += toCestas(c, k); });
      return acc;
    },
    { primera_calidad: 0, segunda_calidad: 0, tercera_calidad: 0, descarte: 0 }
  );
  const cosechaTotal = totalsCalidad.primera_calidad + totalsCalidad.segunda_calidad + totalsCalidad.tercera_calidad + totalsCalidad.descarte;
  const asignadoTotal = asignaciones.reduce((s, a) => s + (a.cantidad_cestas || 0), 0);
  const disponible = cosechaTotal - asignadoTotal;

  const acumuladoDe = (key) => asignaciones.filter((a) => a.destino === key).reduce((s, a) => s + (a.cantidad_cestas || 0), 0);

  const setInput = (key, field, val) =>
    setInputs((prev) => ({
      ...prev,
      [key]: { cantidad: prev[key]?.cantidad ?? "", unidad: prev[key]?.unidad ?? "cestas", [field]: val },
    }));

  const agregar = async (key) => {
    if (!editable) { toast.show("No puedes asignar cosecha de una fecha futura", "error"); return; }
    const inp = inputs[key] || {};
    const cantidad = Number(inp.cantidad);
    if (!cantidad || cantidad <= 0) { toast.show("Ingresa una cantidad válida", "error"); return; }
    const unidad = inp.unidad || "cestas";
    const cestas = unidad === "kg" ? cantidad / KG : cantidad;
    if (cestas > disponible + 0.001) {
      toast.show(`No hay cestas disponibles suficientes. Disponible: ${Math.max(disponible, 0).toFixed(2)} cestas`, "error");
      return;
    }
    if (key === "asignacion_error") {
      if (!window.confirm(`⚠️ "Asignación por error" SACA la fruta del sistema (no es una venta ni un envío; no se puede vender después).\n\nVas a retirar ${cantidad} ${unidad}. ¿Continuar?\n\nSi lo que querías era mandarla a la ciudad, cancelá y usá la fila "Enviar a ciudad".`)) return;
    }
    setBusy(key);
    try {
      await api.post("/asignaciones-destino", {
        destino: key,
        unidad_ingreso: unidad,
        cantidad_ingresada: cantidad,
        fecha: selectedDate + "T12:00:00.000Z",
        observaciones: "",
      });
      toast.show("Asignado a " + (DESTINOS.find((d) => d.key === key)?.label || key));
      setInputs((prev) => ({ ...prev, [key]: { cantidad: "", unidad } }));
      load();
    } catch (err) {
      toast.show(err?.response?.data?.detail || "Error", "error");
    }
    finally { setBusy(""); }
  };

  // Elimina una asignación; si el backend avisa que dejaría sobreventa (409), pide confirmación.
  const eliminarConAviso = async (id) => {
    try {
      await api.delete(`/asignaciones-destino/${id}`);
      return true;
    } catch (e) {
      const det = e?.response?.data?.detail;
      if (e?.response?.status === 409 && det?.tipo === "sobreventa") {
        const lista = (det.avisos || []).map((x) => `• ${x.canal}: ${x.cestas_de_mas} cesta(s) de más`).join("\n");
        if (window.confirm(`⚠️ ${det.mensaje}\n\n${lista}\n\n¿Eliminar de todas formas?`)) {
          await api.delete(`/asignaciones-destino/${id}?confirmar=true`);
          return true;
        }
        return false;
      }
      toast.show(det?.mensaje || det || "No se pudo eliminar", "error");
      return false;
    }
  };

  const remove = async (a) => {
    if (!editable) { toast.show("No puedes modificar asignaciones de una fecha futura", "error"); return; }
    if (!window.confirm("¿Eliminar este movimiento?")) return;
    if (await eliminarConAviso(a._id)) { toast.show("Eliminado"); load(); }
  };

  const loadHistorial = useCallback(() => {
    api.get(`/asignaciones-destino?fecha_desde=${histDesde}&fecha_hasta=${histHasta}`)
      .then((r) => setHistorial(r.data.asignaciones || []))
      .catch(() => setHistorial([]));
  }, [histDesde, histHasta]);
  useEffect(() => { loadHistorial(); }, [loadHistorial, asignaciones]);

  const aplicarPreset = (p) => {
    setHistPreset(p);
  };

  useEffect(() => {
    if (histPreset === "hoy") { setHistDesde(histDia); setHistHasta(histDia); }
    else if (histPreset === "semana") { const [s, e] = weekRange(histMes, histSemana); setHistDesde(s); setHistHasta(e); }
    else if (histPreset === "mes") { setHistDesde(`${histMes}-01`); setHistHasta(`${histMes}-${String(lastDayOfMonth(histMes)).padStart(2, "0")}`); }
    // "rango": el usuario define histDesde/histHasta manualmente
  }, [histPreset, histDia, histSemana, histMes]);

  const startEdit = (a) => { setEditId(a._id); setEditCant(String(a.cantidad_ingresada ?? a.cantidad_cestas ?? "")); setEditUnidad(a.unidad_ingreso || "cestas"); };
  const cancelEdit = () => { setEditId(null); setEditCant(""); };
  const saveEdit = async (a, confirmar = false) => {
    const cant = parseFloat(editCant);
    if (!cant || cant <= 0) { toast.show("Ingresá una cantidad mayor a 0", "error"); return; }
    try {
      await api.put(`/asignaciones-destino/${a._id}${confirmar ? "?confirmar=true" : ""}`, { unidad_ingreso: editUnidad, cantidad_ingresada: cant });
      toast.show("Asignación actualizada");
      setEditId(null); setEditCant("");
      loadHistorial(); load();
    } catch (e) {
      const d = e?.response?.data?.detail;
      if (e?.response?.status === 409 && d?.tipo === "sobreventa") {
        const av = (d.avisos || []).map((x) => `${x.canal}: ${x.cestas_de_mas} de más`).join(", ");
        if (window.confirm(`Reducir esta asignación dejará sobreventa en el canal destino (${av}).\n\n¿Continuar de todos modos?`)) return saveEdit(a, true);
      } else {
        toast.show(typeof d === "string" ? d : "No se pudo editar la asignación", "error");
      }
    }
  };

  const removeHist = async (a) => {
    if (a.origen === "cosecha_descarte_auto") {
      toast.show("El descarte de cosecha es automático. Ajústalo desde el módulo Cosecha.", "error");
      return;
    }
    const d = DESTINOS.find((x) => x.key === a.destino);
    if (!window.confirm(`¿Eliminar esta asignación del ${(a.fecha || "").slice(0, 10)} → ${d?.label || a.destino} (${a.cantidad_cestas?.toFixed(2)} cestas)?\n\nOJO: también se quitarán esas cestas del canal de Ventas correspondiente. Úsalo para corregir stock fantasma de días pasados.`)) return;
    if (await eliminarConAviso(a._id)) {
      toast.show("Asignación eliminada");
      loadHistorial();
      load();
    }
  };

  return (
    <div data-testid="asignacion-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}><Send size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Asignación de Destino</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ color: "#64748b", fontSize: 13 }}>Registro del día:</label>
          <input
            type="date"
            className="input"
            style={{ width: 170 }}
            value={selectedDate}
            max={realToday}
            onChange={(e) => setSelectedDate(e.target.value || realToday)}
            data-testid="asignacion-fecha-selector"
          />
          {!isToday && (
            <button className="btn btn-sm" onClick={() => setSelectedDate(realToday)} data-testid="asignacion-hoy-btn">Ir a hoy</button>
          )}
        </div>
      </div>

      {!isToday && (
        <div className="card" style={{ marginTop: 12, background: "#eff6ff", borderColor: "#bfdbfe", color: "#1e40af", display: "flex", alignItems: "center", gap: 8 }} data-testid="asignacion-fecha-banner">
          <AlertCircle size={16} /> Estás viendo el <b>{selectedDate}</b>. Puedes asignar o corregir las cestas de esta fecha con normalidad.
        </div>
      )}

      {/* Tarjeta: Fruta total cosechada (del día) */}
      <div className="card" style={{ marginTop: 12, background: "#f0fdf4", borderColor: "#bbf7d0" }} data-testid="asignacion-cosecha-dia">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, color: "#15803d" }}>● Fruta total cosechada {isToday ? "(hoy)" : `(${selectedDate})`}</h3>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
              {selectedDate} · {cosechas.length} cosecha(s). Se descuenta a medida que asignás a un destino.
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: disponible > 0.001 ? "#15803d" : "#94a3b8" }} data-testid="asignacion-disponible">
              {disponible.toFixed(2)} cestas
            </div>
            <div style={{ color: "#64748b", fontSize: 12 }}>
              Sin asignar · Cosecha {cosechaTotal.toFixed(2)} − Asignado {asignadoTotal.toFixed(2)} cestas
            </div>
          </div>
        </div>
        <div className="kpi-grid">
          {CALIDADES.map((it) => {
            const Icon = it.icon;
            return (
              <div key={it.key} style={{ background: "#fff", padding: 16, borderRadius: 10, border: "1px solid #bbf7d0" }} data-testid={`calidad-box-${it.key}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ color: "#334155", fontSize: 14 }}>{it.label}</div>
                  <div className="kpi-icon-box" style={{ background: it.bg, color: it.color }}><Icon size={16} /></div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: it.color }}>{(totalsCalidad[it.key] || 0).toFixed(2)} cestas</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tarjeta: Distribución del día */}
      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ margin: 0 }}><Send size={18} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Distribución del día</h3>
        <div style={{ color: "#64748b", fontSize: 13, margin: "4px 0 14px" }}>
          Ingresá la cantidad y unidad por destino y pulsá "Agregar". Podés agregar varias veces al mismo destino, se acumulan.
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Destino</th>
              <th>Acumulado</th>
              <th>Cantidad</th>
              <th>Unidad</th>
              <th style={{ textAlign: "right" }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {DESTINOS.map((d) => {
              const Icon = d.icon;
              const acum = acumuladoDe(d.key);
              const inp = inputs[d.key] || {};
              return (
                <tr key={d.key} data-testid={`destino-row-${d.key}`}>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
                      <Icon size={16} style={{ color: d.color }} /> {d.label}
                    </span>
                    {d.key === "descarte" && (
                      <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>
                        El descarte de cosecha se asigna aquí automáticamente
                      </div>
                    )}
                    {d.key === "asignacion_error" && (
                      <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>
                        Vacío de salida: saca la fruta del sistema (no cuenta como venta ni descarte)
                      </div>
                    )}
                  </td>
                  <td style={{ color: acum > 0 ? "#15803d" : "#94a3b8", fontWeight: acum > 0 ? 600 : 400 }}>
                    {acum > 0 ? `${acum.toFixed(2)} cestas` : "—"}
                  </td>
                  <td>
                    <DecimalInput
                      type="number" step="0.01" min="0"
                      className="input"
                      style={{ width: 120 }}
                      placeholder="0"
                      value={inp.cantidad ?? ""}
                      disabled={!editable}
                      onChange={(e) => setInput(d.key, "cantidad", e.target.value)}
                      data-testid={`destino-cantidad-${d.key}`}
                    />
                  </td>
                  <td>
                    <select
                      className="select"
                      style={{ width: 120 }}
                      value={inp.unidad || "cestas"}
                      disabled={!editable}
                      onChange={(e) => setInput(d.key, "unidad", e.target.value)}
                      data-testid={`destino-unidad-${d.key}`}
                    >
                      <option value="cestas">cestas</option>
                      <option value="kg">kg</option>
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => agregar(d.key)}
                      disabled={busy === d.key || disponible <= 0.001 || !editable}
                      data-testid={`destino-agregar-${d.key}`}
                    >
                      <Plus size={14} /> {busy === d.key ? "..." : "Agregar"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Movimientos del día (registro / gestión) */}
      {asignaciones.length > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <h3 style={{ marginTop: 0 }}>
            Movimientos del día · {asignaciones.length}
            <span style={{ float: "right", fontSize: 14, color: disponible > 0.001 ? "#dc2626" : "#16a34a" }}>
              Cestas sin asignar: {disponible.toFixed(2)}
            </span>
          </h3>
          <table className="table">
            <thead>
              <tr><th>Destino</th><th>Cantidad ingresada</th><th>Cestas</th><th>kg</th><th style={{ textAlign: "right" }}>Acción</th></tr>
            </thead>
            <tbody>
              {asignaciones.map((a) => {
                const d = DESTINOS.find((x) => x.key === a.destino);
                const auto = a.origen === "cosecha_descarte_auto";
                const enEdicion = editId === a._id;
                return (
                  <tr key={a._id}>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {d && <d.icon size={15} style={{ color: d.color }} />} {d?.label || a.destino}
                      </span>
                    </td>
                    <td>
                      {enEdicion ? (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <DecimalInput type="number" step="0.01" min="0" className="input" style={{ width: 90 }} value={editCant} onChange={(e) => setEditCant(e.target.value)} data-testid={`mov-edit-cant-${a._id}`} />
                          <select className="select" style={{ width: 90 }} value={editUnidad} onChange={(e) => setEditUnidad(e.target.value)}>
                            <option value="cestas">cestas</option><option value="kg">kg</option>
                          </select>
                        </span>
                      ) : (<>{a.cantidad_ingresada} {a.unidad_ingreso}</>)}
                    </td>
                    <td>{a.cantidad_cestas?.toFixed(2)}</td>
                    <td>{a.cantidad_kg?.toFixed(2)} kg</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {auto
                        ? <span className="badge" style={{ background: "#fee2e2", color: "#dc2626" }}>Auto · descarte</span>
                        : !editable
                        ? <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
                        : enEdicion
                        ? (<>
                            <button className="btn-icon" style={{ color: "#16a34a" }} title="Guardar" onClick={() => saveEdit(a)} data-testid={`mov-save-${a._id}`}><Check size={16} /></button>
                            <button className="btn-icon" style={{ color: "#64748b" }} title="Cancelar" onClick={cancelEdit}><X size={16} /></button>
                          </>)
                        : (<>
                            <button className="btn-icon" style={{ color: "#2563eb" }} title="Editar cantidad" onClick={() => startEdit(a)} data-testid={`mov-edit-${a._id}`}><Pencil size={15} /></button>
                            {canDelete("asignacion_destino") && <button className="btn-icon" style={{ color: "#dc2626" }} title="Eliminar (devolver a sin asignar)" onClick={() => remove(a)}><Trash2 size={16} /></button>}
                          </>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* Historial de asignaciones (consulta + borrado por fecha) */}
      <div className="card" style={{ marginTop: 18 }} data-testid="asignacion-historial">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h3 style={{ margin: 0 }}>📋 Historial de asignaciones</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
              {[["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"], ["rango", "Rango"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => aplicarPreset(k)} data-testid={`hist-preset-${k}`}
                  style={{ padding: "5px 12px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                    background: histPreset === k ? "#16a34a" : "transparent", color: histPreset === k ? "#fff" : "#475569" }}>{l}</button>
              ))}
            </div>
            <PeriodPicker isDay={histPreset === "hoy"} isWeek={histPreset === "semana"} isMonth={histPreset === "mes"}
              dia={histDia} setDia={setHistDia} semana={histSemana} setSemana={setHistSemana} mes={histMes} setMes={setHistMes} testidPrefix="hist" />
            {histPreset === "rango" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <input type="date" className="input" style={{ width: 150 }} value={histDesde} max={realToday} onChange={(e) => setHistDesde(e.target.value)} data-testid="hist-desde" />
                <span style={{ color: "#94a3b8" }}>→</span>
                <input type="date" className="input" style={{ width: 150 }} value={histHasta} max={realToday} onChange={(e) => setHistHasta(e.target.value)} data-testid="hist-hasta" />
              </span>
            )}
          </div>
        </div>
        <div style={{ color: "#64748b", fontSize: 12.5, margin: "6px 0 10px" }}>
          Consulta, edita (✏️) o elimina asignaciones de cualquier fecha. Editar a una cantidad menor devuelve las cestas a "sin asignar"; eliminar quita todas. Los cambios se reflejan también en el canal de Ventas. El descarte automático de cosecha no se edita aquí.
        </div>
        {historial.length === 0 ? (
          <div className="empty-state" data-testid="hist-empty">No hay asignaciones en este período.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%" }} data-testid="hist-table">
              <thead>
                <tr><th>Fecha</th><th>Destino</th><th style={{ textAlign: "right" }}>Cestas</th><th style={{ textAlign: "right" }}>kg</th><th>Nota</th>{canDelete("asignacion_destino") && <th style={{ textAlign: "center" }}>Acción</th>}</tr>
              </thead>
              <tbody>
                {historial.map((a) => {
                  const d = DESTINOS.find((x) => x.key === a.destino);
                  const auto = a.origen === "cosecha_descarte_auto";
                  const enEdicion = editId === a._id;
                  return (
                    <tr key={a._id} data-testid={`hist-row-${a._id}`}>
                      <td style={{ whiteSpace: "nowrap" }}>{(a.fecha || "").slice(0, 10)}</td>
                      <td><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>{d && <d.icon size={15} style={{ color: d.color }} />} {d?.label || a.destino}</span></td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>
                        {enEdicion ? (
                          <span style={{ display: "inline-flex", gap: 6, justifyContent: "flex-end" }}>
                            <DecimalInput type="number" step="0.01" min="0" className="input" style={{ width: 80 }} value={editCant} onChange={(e) => setEditCant(e.target.value)} data-testid={`hist-edit-cant-${a._id}`} />
                            <select className="select" style={{ width: 80 }} value={editUnidad} onChange={(e) => setEditUnidad(e.target.value)}>
                              <option value="cestas">cestas</option><option value="kg">kg</option>
                            </select>
                          </span>
                        ) : a.cantidad_cestas?.toFixed(2)}
                      </td>
                      <td style={{ textAlign: "right" }}>{a.cantidad_kg?.toFixed(2)}</td>
                      <td style={{ fontSize: 12.5, color: "#64748b" }}>{a.observaciones || (auto ? "Descarte automático" : "—")}</td>
                      {canDelete("asignacion_destino") && (
                        <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                          {auto
                            ? <span className="badge" style={{ background: "#fee2e2", color: "#dc2626" }}>Auto</span>
                            : enEdicion
                            ? (<>
                                <button className="btn-icon" style={{ color: "#16a34a" }} title="Guardar" onClick={() => saveEdit(a)} data-testid={`hist-save-${a._id}`}><Check size={16} /></button>
                                <button className="btn-icon" style={{ color: "#64748b" }} title="Cancelar" onClick={cancelEdit}><X size={16} /></button>
                              </>)
                            : (<>
                                <button className="btn-icon" style={{ color: "#2563eb" }} title="Editar cantidad" onClick={() => startEdit(a)} data-testid={`hist-edit-${a._id}`}><Pencil size={15} /></button>
                                <button className="btn-icon" style={{ color: "#dc2626" }} title="Eliminar asignación" onClick={() => removeHist(a)} data-testid={`hist-delete-${a._id}`}><Trash2 size={15} /></button>
                              </>)}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
