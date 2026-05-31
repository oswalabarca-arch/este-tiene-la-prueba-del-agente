import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import {
  Activity, Plus, Trash2, CheckCircle, Calendar, MapPin, Users as UsersIcon,
  Clock, Droplets, Eye, X, DollarSign, Sprout, Leaf, Droplet, Wrench, Apple,
} from "lucide-react";
import { catBadge, actBadge, actTile } from "../lib/categoryColors";

const TIPOS_REGISTRAR = [
  { key: "abonar",     label: "Abonar",          icon: Sprout },
  { key: "cosechar",   label: "Cosechar",        icon: Apple },
  { key: "deshierbar", label: "Deshierbar",      icon: Leaf },
  { key: "riego",      label: "Riego",           icon: Droplet },
  { key: "otra",       label: "Otra actividad…", icon: Wrench },
];

function ActividadesBase({ filtro }) {
  const toast = useToast();
  const { canEdit, canDelete } = useAuth();
  const [items, setItems] = useState([]);
  const [aplicaciones, setAplicaciones] = useState([]);
  const [plantaciones, setPlantaciones] = useState([]);
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
          <h1 className="page-title">
            {filtro === "registrar"
              ? <><Plus size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Registrar Actividad</>
              : <><Activity size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Actividades — Pendientes</>}
          </h1>
          <p className="page-subtitle">
            {filtro === "registrar"
              ? "Captura una actividad ya ejecutada en campo (mano de obra, lote y tipo de labor)"
              : "Aplicaciones pendientes de ejecutar. Al marcar como aplicada se descuenta el inventario."}
          </p>
        </div>
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
        <>
          <RegistrarActividadForm plantaciones={plantaciones} onSaved={load} />
          <div className="card" style={{ marginTop: 18 }}>
            <h3 style={{ marginTop: 0 }}>Historial de actividades</h3>
            <table className="table">
              <thead>
                <tr><th>Fecha</th><th>Tipo</th><th>Lote</th><th>Trabajadores</th><th>Horas</th><th>Precio/hr</th><th>Horas-H</th><th>Costo</th><th>Origen</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a._id}>
                    <td>{new Date(a.fecha_actividad).toLocaleDateString()}</td>
                    <td><span className="badge" style={actBadge(a.tipo_personalizado || a.tipo)}>{a.tipo_personalizado || a.tipo}</span></td>
                    <td><span className="badge badge-primary">{a.lote}</span></td>
                    <td>{Number(a.cantidad_trabajadores || 0).toFixed(2)}</td>
                    <td>{a.horas_trabajo}</td>
                    <td>${Number(a.precio_hora || 0).toFixed(2)}</td>
                    <td style={{ fontWeight: 600 }}>{Number(a.horas_hombre || 0).toFixed(2)}</td>
                    <td style={{ fontWeight: 700, color: "#16a34a" }}>${Number(a.costo_total || 0).toFixed(2)}</td>
                    <td><span className="badge badge-info">{a.origen}</span></td>
                    <td>{canDelete("actividades") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(a)}><Trash2 size={16} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <div className="empty-state">Sin actividades registradas</div>}
          </div>
        </>
      )}

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

function RegistrarActividadForm({ plantaciones, onSaved }) {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const empty = {
    tipo: "",
    tipo_personalizado: "",
    trabajadores: "",
    horas: "",
    precio_hora: "",
    fecha: today,
    observaciones: "",
  };
  const [form, setForm] = useState(empty);
  const [lotesDestino, setLotesDestino] = useState([]);
  const [loteInput, setLoteInput] = useState("");
  const [busy, setBusy] = useState(false);

  const lotesPlanta = Array.from(new Set(
    plantaciones.map((p) => JSON.stringify({ lote: p.lote, nombre: p.nombre })).filter(Boolean)
  )).map((s) => JSON.parse(s)).filter((p) => p.lote);

  const toggleLote = (l) => setLotesDestino((prev) => prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l]);
  const removeLote = (l) => setLotesDestino((prev) => prev.filter((x) => x !== l));
  const addFromInput = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const parts = loteInput.split(",").map((s) => s.trim()).filter(Boolean);
      const nuevos = parts.filter((p) => !lotesDestino.includes(p));
      if (nuevos.length > 0) setLotesDestino([...lotesDestino, ...nuevos]);
      setLoteInput("");
    }
  };

  const reset = () => { setForm(empty); setLotesDestino([]); setLoteInput(""); };

  const trabajadores = Number(form.trabajadores || 0);
  const horas = Number(form.horas || 0);
  const precio = Number(form.precio_hora || 0);
  const totalHH = trabajadores * horas;
  const costo = totalHH * precio;

  const submit = async (e) => {
    e.preventDefault();
    if (!form.tipo) { toast.show("Selecciona el tipo de actividad", "error"); return; }
    if (form.tipo === "otra" && !form.tipo_personalizado.trim()) { toast.show("Especifica el tipo de actividad", "error"); return; }
    if (lotesDestino.length === 0) { toast.show("Selecciona al menos un lote", "error"); return; }
    if (trabajadores < 1) { toast.show("Indica la cantidad de trabajadores", "error"); return; }
    if (horas <= 0) { toast.show("Indica las horas de trabajo", "error"); return; }
    if (precio <= 0) { toast.show("Indica el precio por hora", "error"); return; }

    setBusy(true);
    try {
      const N = lotesDestino.length;
      const trabPorLote = trabajadores / N;
      for (const lote of lotesDestino) {
        await api.post("/actividades", {
          tipo: form.tipo,
          tipo_personalizado: form.tipo === "otra" ? form.tipo_personalizado.trim() : null,
          cantidad_trabajadores: trabPorLote,
          horas_trabajo: horas,
          precio_hora: precio,
          lote,
          fecha_actividad: form.fecha + "T12:00:00.000Z",
          observaciones: form.observaciones + (N > 1 ? ` (repartida entre ${N} lotes)` : ""),
          origen: "registro_manual",
        });
      }
      toast.show(`Actividad registrada en ${N} lote${N > 1 ? "s" : ""}. Nómina y Plantaciones actualizadas.`);
      reset();
      onSaved();
    } catch {
      toast.show("Error al registrar", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" style={{ padding: 24 }} onSubmit={submit} data-testid="registrar-actividad-form">
      <h2 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>Nueva Actividad</h2>
      <p style={{ color: "#64748b", marginTop: 4, marginBottom: 18, fontSize: 14 }}>Completa los campos para dejar registro de la labor realizada</p>

      {/* Tipo de actividad — tiles */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600, fontSize: 14, color: "#334155" }}>Tipo de Actividad *</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 8 }}>
          {TIPOS_REGISTRAR.map((t) => {
            const Icon = t.icon;
            const active = form.tipo === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setForm({ ...form, tipo: t.key, tipo_personalizado: t.key === "otra" ? form.tipo_personalizado : "" })}
                data-testid={`act-tipo-${t.key}`}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  gap: 8, padding: "20px 12px", borderRadius: 12, cursor: "pointer",
                  fontWeight: active ? 700 : 500,
                  transition: "all 0.15s",
                  ...actTile(t.key, active),
                }}
              >
                <Icon size={28} strokeWidth={1.5} />
                <span style={{ fontSize: 14 }}>{t.label}</span>
              </button>
            );
          })}
        </div>
        {form.tipo === "otra" && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Especifica la actividad *</label>
            <input className="input" placeholder="Ej: poda, transporte, limpieza..." value={form.tipo_personalizado}
              onChange={(e) => setForm({ ...form, tipo_personalizado: e.target.value })}
              data-testid="act-tipo-personalizado" />
          </div>
        )}
      </div>

      {/* Lotes */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontWeight: 600, fontSize: 14, color: "#334155", display: "flex", alignItems: "center", gap: 6 }}>
          <MapPin size={15} style={{ color: "#f97316" }} /> Lote(s) de Campo *
        </label>
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 4, marginBottom: 8 }}>
          Podés seleccionar varios. Trabajadores se repartirán equitativamente entre los lotes (horas por persona se mantienen).
        </div>
        {lotesPlanta.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>Plantaciones:</span>
            {lotesPlanta.map((p) => {
              const active = lotesDestino.includes(p.lote);
              return (
                <button key={p.lote} type="button" onClick={() => toggleLote(p.lote)}
                  data-testid={`act-lote-${p.lote}`}
                  style={{
                    padding: "5px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                    border: active ? "1px solid #16a34a" : "1px solid #bbf7d0",
                    background: active ? "#16a34a" : "#fff",
                    color: active ? "#fff" : "#15803d", fontWeight: active ? 600 : 500,
                  }}>
                  {p.lote} · {p.nombre}
                </button>
              );
            })}
          </div>
        )}
        <input className="input" style={{ width: "100%" }}
          placeholder="Agregar más lotes (separados por comas) y Enter…"
          value={loteInput} onChange={(e) => setLoteInput(e.target.value)} onKeyDown={addFromInput}
          data-testid="act-lote-input" />
        {lotesDestino.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {lotesDestino.map((l) => (
              <span key={l} style={{ background: "#ecfdf5", color: "#065f46", padding: "4px 8px 4px 12px", borderRadius: 999, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                {l}
                <button type="button" onClick={() => removeLote(l)} style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", padding: 0, display: "inline-flex" }}><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Trabajadores · Horas · Precio · Fecha */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}><UsersIcon size={14} style={{ color: "#3b82f6" }} /> Trabajadores *</label>
          <input type="number" min="1" required className="input" placeholder="Ej: 3"
            value={form.trabajadores} onChange={(e) => setForm({ ...form, trabajadores: e.target.value })}
            data-testid="act-trabajadores" />
        </div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}><Clock size={14} style={{ color: "#f97316" }} /> Horas * <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 400 }}>(por trabajador)</span></label>
          <input type="number" step="0.5" min="0.5" required className="input" placeholder="Ej: 4.5"
            value={form.horas} onChange={(e) => setForm({ ...form, horas: e.target.value })}
            data-testid="act-horas" />
        </div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}><DollarSign size={14} style={{ color: "#16a34a" }} /> Precio por hora *</label>
          <input type="number" step="0.01" min="0.01" required className="input" placeholder="Ej: 5.00"
            value={form.precio_hora} onChange={(e) => setForm({ ...form, precio_hora: e.target.value })}
            data-testid="act-precio" />
        </div>
        <div className="field">
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}><Calendar size={14} style={{ color: "#64748b" }} /> Fecha *</label>
          <input type="date" required className="input"
            value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })}
            data-testid="act-fecha" />
        </div>
      </div>

      {/* Totales */}
      {(trabajadores > 0 && horas > 0) && (
        <div style={{ marginBottom: 16, padding: 10, background: "#f0fdf4", borderRadius: 8, fontSize: 13, color: "#065f46" }}>
          Total horas-hombre: <b>{totalHH.toFixed(2)} h</b>
          {precio > 0 && <> · Costo total: <b>${costo.toFixed(2)}</b></>}
          {lotesDestino.length > 1 && <> · Por lote: <b>{(trabajadores / lotesDestino.length).toFixed(2)} trab × {horas} h = ${(costo / lotesDestino.length).toFixed(2)}</b></>}
        </div>
      )}

      {/* Observaciones */}
      <div className="field" style={{ marginBottom: 18 }}>
        <label>Observaciones</label>
        <textarea className="textarea" rows="4" placeholder="Detalles adicionales sobre la labor realizada (opcional)…"
          value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })}
          data-testid="act-observaciones" />
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", gap: 12 }}>
        <button type="button" className="btn" onClick={reset} data-testid="act-limpiar" style={{ minWidth: 120 }}>Limpiar</button>
        <button type="submit" className="btn btn-primary" disabled={busy} data-testid="act-submit" style={{ flex: 1, padding: "12px 16px", fontSize: 15, fontWeight: 700 }}>
          <Plus size={18} /> {busy ? "Registrando…" : "Registrar Actividad"}
        </button>
      </div>
    </form>
  );
}

export function ActividadesPendientes() { return <ActividadesBase filtro="pendientes" />; }
export function ActividadesRegistrar() { return <ActividadesBase filtro="registrar" />; }
