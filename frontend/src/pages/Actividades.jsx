import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import {
  Activity, Plus, Trash2, CheckCircle, Calendar, MapPin, Users as UsersIcon,
  Clock, Droplets, Eye, X, DollarSign,
} from "lucide-react";
import { catBadge } from "../lib/categoryColors";

const TIPOS = ["deshierbar", "siembra", "poda", "limpieza", "transporte", "otro"];

function ActividadesBase({ filtro }) {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [items, setItems] = useState([]);
  const [aplicaciones, setAplicaciones] = useState([]);
  const [plantaciones, setPlantaciones] = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

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

  const lotes = Array.from(new Set(plantaciones.map((p) => p.lote).filter(Boolean)));
  const pendientes = aplicaciones.filter((a) => a.estado !== "confirmada");
  const totalHorasHombre = items.reduce((s, a) => s + (a.horas_hombre || 0), 0);

  return (
    <div data-testid="actividades-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Activity size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Actividades {filtro === "pendientes" ? "— Pendientes" : "— Registrar"}</h1>
          <p className="page-subtitle">{filtro === "pendientes" ? "Aplicaciones pendientes de ejecutar. Al marcar como aplicada se descuenta el inventario." : "Registra labores realizadas en el campo. Alimenta Recursos Humanos."}</p>
        </div>
        {filtro !== "pendientes" && <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="actividad-new-btn"><Plus size={16} /> Nueva actividad</button>}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Aplicaciones pendientes</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{pendientes.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Actividades registradas</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Horas-hombre acumuladas</div><div className="kpi-value" style={{ color: "#16a34a" }}>{totalHorasHombre.toFixed(1)} h</div></div>
      </div>

      {filtro === "pendientes" ? (
        pendientes.length === 0 ? (
          <div className="card"><div className="empty-state" data-testid="pendientes-empty">Sin aplicaciones pendientes</div></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16 }}>
            {pendientes.map((a) => (
              <PendienteCard key={a._id} aplicacion={a} lotesDisponibles={lotes} canEdit={canEdit("actividades")} onConfirmed={load} />
            ))}
          </div>
        )
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
      {viewing && <DetalleAplicacion aplicacion={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function PendienteCard({ aplicacion: a, lotesDisponibles, canEdit, onConfirmed }) {
  const toast = useToast();
  const initialLotes = (a.lotes_destino && a.lotes_destino.length > 0)
    ? a.lotes_destino
    : (a.lotes && a.lotes.length > 0 ? a.lotes : (a.lote ? [a.lote] : []));
  const [trabajadores, setTrabajadores] = useState(a.cantidad_trabajadores || 1);
  const [horas, setHoras] = useState(a.horas_trabajo || 1);
  const [precioHora, setPrecioHora] = useState(a.precio_hora || 0);
  const [lotesDestino, setLotesDestino] = useState(initialLotes);
  const [showDetalle, setShowDetalle] = useState(false);
  const [busy, setBusy] = useState(false);

  const cat = catBadge(a.tipo);
  const cantidadLotes = lotesDestino.length;
  const totalHorasHombre = Number(trabajadores) * Number(horas);
  const costoTotal = totalHorasHombre * Number(precioHora);

  const toggleLote = (lote) => {
    setLotesDestino((prev) => prev.includes(lote) ? prev.filter((x) => x !== lote) : [...prev, lote]);
  };
  const removeLote = (lote) => setLotesDestino((prev) => prev.filter((x) => x !== lote));

  const confirmar = async () => {
    if (lotesDestino.length === 0) { toast.show("Selecciona al menos un lote destino", "error"); return; }
    if (!trabajadores || Number(trabajadores) < 1) { toast.show("Indica la cantidad de trabajadores", "error"); return; }
    if (!horas || Number(horas) <= 0) { toast.show("Indica las horas de trabajo", "error"); return; }
    if (!precioHora || Number(precioHora) <= 0) { toast.show("Indica el precio por hora", "error"); return; }
    if (!window.confirm(`¿Marcar como aplicada? Se descontarán los insumos del inventario y se registrará en Nómina y Plantaciones.`)) return;
    setBusy(true);
    try {
      // 1. Confirmar la aplicación (descuenta inventario)
      await api.put(`/aplicaciones/${a._id}`, {
        tipo: a.tipo,
        subtipo: a.subtipo || null,
        lote: lotesDestino[0] || a.lote || "",
        lotes: a.lotes || [],
        lotes_destino: lotesDestino,
        fecha: a.fecha,
        estado: "confirmada",
        insumos: a.insumos || [],
        receta_id: a.receta_id || null,
        cantidad_agua: a.cantidad_agua || 0,
        modo_aplicacion: a.modo_aplicacion || null,
        observaciones: a.observaciones || "",
        cantidad_trabajadores: Number(trabajadores),
        horas_trabajo: Number(horas),
        precio_hora: Number(precioHora),
      });

      // 2. Crear actividad por cada lote destino (reparte trabajadores entre lotes)
      //    Esto alimenta: Nómina (horas_hombre × precio_hora = costo) y la pestaña Labores de cada Plantación
      const N = lotesDestino.length;
      const trabPorLote = Number(trabajadores) / N;
      for (const lote of lotesDestino) {
        await api.post("/actividades", {
          tipo: "aplicacion",
          tipo_personalizado: a.tipo,
          cantidad_trabajadores: trabPorLote,
          horas_trabajo: Number(horas),
          precio_hora: Number(precioHora),
          lote,
          fecha_actividad: a.fecha,
          observaciones: `Aplicación ${a.tipo}${a.subtipo ? ` (${a.subtipo})` : ""}${N > 1 ? ` — repartida entre ${N} lotes` : ""}`,
          origen: "aplicacion",
          aplicacion_id: a._id,
        });
      }

      toast.show("Aplicación confirmada. Inventario, Nómina y Plantaciones actualizados.");
      onConfirmed();
    } catch {
      toast.show("Error al confirmar", "error");
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ padding: 0, borderLeft: `4px solid ${cat.color}`, overflow: "hidden" }} data-testid={`pendiente-card-${a._id}`}>
      <div style={{ padding: 16 }}>
        {/* Header: categoría + estado */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <span className="badge" style={{ ...catBadge(a.tipo), fontWeight: 700, padding: "4px 10px" }}>{a.tipo}</span>
          <span className="badge badge-warn"><Clock size={11} style={{ verticalAlign: "middle" }} /> Pendiente</span>
        </div>

        {/* Cantidad de productos */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
          <Droplets size={20} style={{ color: "#0ea5e9" }} />
          {a.insumos?.length || 0} producto(s)
        </div>

        {/* Meta: fecha · modo · lotes originales */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6, color: "#64748b", fontSize: 13, alignItems: "center" }}>
          <span><Calendar size={12} style={{ verticalAlign: "middle" }} /> {new Date(a.fecha).toLocaleDateString()}</span>
          {a.modo_aplicacion && <><span>·</span><span style={{ textTransform: "capitalize" }}>{a.modo_aplicacion}</span></>}
          {(a.lotes?.length > 0 || a.lote) && <><span>·</span><span style={{ color: "#dc2626", fontWeight: 600 }}><MapPin size={12} style={{ verticalAlign: "middle" }} /> {(a.lotes?.length > 0 ? a.lotes : [a.lote]).join(", ")}</span></>}
        </div>

        {/* Banner multi-lote */}
        {lotesDestino.length > 1 && (
          <div style={{ marginTop: 12, padding: 10, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 8, fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: "#065f46", marginBottom: 4 }}>
              <MapPin size={12} style={{ verticalAlign: "middle" }} /> Multi-lote ({lotesDestino.length}): {lotesDestino.join(" · ")}
            </div>
            <div style={{ color: "#047857" }}>
              Al ejecutar, los productos, agua y horas-hombre se repartirán equitativamente entre estos {lotesDestino.length} lotes. Solo necesitas indicar el total de trabajadores y horas una vez.
            </div>
          </div>
        )}

        {/* Agua */}
        {a.cantidad_agua > 0 && (
          <div style={{ marginTop: 12, fontSize: 16 }}>
            <Droplets size={16} style={{ verticalAlign: "middle", color: "#0ea5e9" }} />{" "}
            <b>{a.cantidad_agua} L</b> <span style={{ color: "#64748b", fontSize: 13 }}>de agua (total)</span>
          </div>
        )}

        {/* Insumos */}
        {a.insumos?.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {a.insumos.map((i, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", background: "#f8fafc", padding: "6px 10px", borderRadius: 6, marginBottom: 4, fontSize: 13 }}>
                <span>{i.nombre_producto}</span>
                <span style={{ color: "#475569" }}>{i.cantidad} {i.unidad}</span>
              </div>
            ))}
          </div>
        )}

        {/* Ver detalle */}
        <button className="btn" style={{ width: "100%", marginTop: 10 }} onClick={() => setShowDetalle(true)} data-testid={`pendiente-detalle-${a._id}`}>
          <Eye size={14} /> Ver Detalle
        </button>

        <hr style={{ margin: "16px 0", border: 0, borderTop: "1px solid #e2e8f0" }} />

        {/* Registrar ejecución */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "#16a34a", marginBottom: 10 }}>
          <CheckCircle size={16} /> Registrar ejecución
        </div>

        <div className="form-grid" style={{ gap: 10 }}>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}><UsersIcon size={13} /> Trabajadores *</label>
            <input type="number" min="1" required className="input" value={trabajadores}
              onChange={(e) => setTrabajadores(e.target.value)}
              data-testid={`pendiente-trabajadores-${a._id}`} />
          </div>
          <div className="field">
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}><Clock size={13} /> Horas * <span style={{ color: "#94a3b8", fontWeight: 400 }}>(por trabajador)</span></label>
            <input type="number" step="0.5" min="0.5" required className="input" value={horas}
              onChange={(e) => setHoras(e.target.value)}
              data-testid={`pendiente-horas-${a._id}`} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}><DollarSign size={13} /> Precio por hora *</label>
            <input type="number" step="0.01" min="0.01" required className="input" value={precioHora}
              onChange={(e) => setPrecioHora(e.target.value)}
              placeholder="Ej: 5.00"
              data-testid={`pendiente-precio-${a._id}`} />
          </div>
        </div>

        {/* Lotes destino */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontWeight: 600, fontSize: 13, color: "#334155", display: "flex", alignItems: "center", gap: 6 }}>
              <MapPin size={13} style={{ color: "#dc2626" }} /> Lote(s) destino *
            </label>
            <span className="badge badge-primary" style={{ fontSize: 11 }}>{cantidadLotes} lote{cantidadLotes !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ color: "#64748b", fontSize: 12, marginBottom: 8 }}>
            Podés seleccionar varios. Productos, agua y trabajadores se repartirán equitativamente.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {lotesDisponibles.length === 0 && <span style={{ fontSize: 13, color: "#94a3b8" }}>Sin lotes disponibles</span>}
            {lotesDisponibles.map((l) => {
              const active = lotesDestino.includes(l);
              return (
                <button key={l} type="button" onClick={() => toggleLote(l)}
                  data-testid={`pendiente-lote-${a._id}-${l}`}
                  style={{
                    padding: "5px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                    border: active ? "1px solid #16a34a" : "1px solid #bbf7d0",
                    background: active ? "#16a34a" : "#fff",
                    color: active ? "#fff" : "#15803d", fontWeight: active ? 600 : 500,
                  }}>
                  {active && "✓ "}{l}
                </button>
              );
            })}
          </div>
          {lotesDestino.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {lotesDestino.map((l) => (
                <span key={l} style={{ background: "#ecfdf5", color: "#065f46", padding: "4px 8px 4px 12px", borderRadius: 999, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {l}
                  <button type="button" onClick={() => removeLote(l)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Reparto */}
        {lotesDestino.length > 1 && a.insumos?.length > 0 && (
          <div style={{ marginTop: 14, padding: 10, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 8, fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: "#065f46", marginBottom: 4 }}>Reparto entre {lotesDestino.length} lotes (cada uno):</div>
            {a.insumos.map((i, idx) => (
              <div key={idx} style={{ color: "#065f46" }}>• {i.nombre_producto}: {(i.cantidad / lotesDestino.length).toFixed(2)} {i.unidad}</div>
            ))}
            {a.cantidad_agua > 0 && (
              <div style={{ color: "#065f46" }}>• Agua: {(a.cantidad_agua / lotesDestino.length).toFixed(1)} L</div>
            )}
            {trabajadores > 0 && (
              <div style={{ color: "#065f46" }}>• Trabajadores: {(Number(trabajadores) / lotesDestino.length).toFixed(2)} · Horas: {horas} (por persona)</div>
            )}
          </div>
        )}

        {/* Totales */}
        <div style={{ marginTop: 12, padding: 10, background: "#f0fdf4", borderRadius: 8, fontSize: 13 }}>
          <div>Total horas-hombre: <b style={{ color: "#15803d" }}>{totalHorasHombre.toFixed(2)} h</b></div>
          {precioHora > 0 && (
            <div>Costo total de mano de obra: <b style={{ color: "#15803d" }}>${costoTotal.toFixed(2)}</b></div>
          )}
        </div>

        {canEdit && (
          <button
            className="btn btn-primary"
            style={{ width: "100%", marginTop: 14, padding: "12px 16px", fontSize: 15, fontWeight: 700 }}
            disabled={busy}
            onClick={confirmar}
            data-testid={`pendiente-confirm-${a._id}`}
          >
            <CheckCircle size={18} /> {busy ? "Aplicando..." : "Marcar como Aplicada"}
          </button>
        )}
      </div>

      {showDetalle && <DetalleAplicacion aplicacion={a} onClose={() => setShowDetalle(false)} />}
    </div>
  );
}

function DetalleAplicacion({ aplicacion: a, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Detalle de aplicación</h2>
        <div className="modal-sub">{new Date(a.fecha).toLocaleDateString()} · {a.tipo}{a.subtipo ? ` · ${a.subtipo}` : ""}</div>

        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "#f8fafc", borderRadius: 6 }}>
            <span style={{ color: "#64748b" }}>Modo aplicación</span><b>{a.modo_aplicacion || "—"}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "#f8fafc", borderRadius: 6, marginTop: 4 }}>
            <span style={{ color: "#64748b" }}>Agua total</span><b>{a.cantidad_agua || 0} L</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: 8, background: "#f8fafc", borderRadius: 6, marginTop: 4 }}>
            <span style={{ color: "#64748b" }}>Lotes originales</span><b>{(a.lotes?.length > 0 ? a.lotes : [a.lote]).filter(Boolean).join(", ") || "—"}</b>
          </div>
        </div>

        {a.insumos?.length > 0 && (
          <>
            <h4 style={{ marginTop: 16, marginBottom: 8 }}>Insumos</h4>
            <table className="table">
              <thead><tr><th>Producto</th><th>Cantidad</th><th>Unidad</th></tr></thead>
              <tbody>{a.insumos.map((i, idx) => <tr key={idx}><td>{i.nombre_producto}</td><td>{i.cantidad}</td><td>{i.unidad}</td></tr>)}</tbody>
            </table>
          </>
        )}

        {a.observaciones && (
          <div style={{ marginTop: 12 }}>
            <h4 style={{ margin: "0 0 6px" }}>Observaciones</h4>
            <div style={{ color: "#475569", fontSize: 13, background: "#f8fafc", padding: 8, borderRadius: 6 }}>{a.observaciones}</div>
          </div>
        )}

        <div className="modal-footer"><button type="button" className="btn" onClick={onClose}>Cerrar</button></div>
      </div>
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
