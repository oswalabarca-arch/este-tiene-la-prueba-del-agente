import { useCallback, useEffect, useState } from "react";
import { api, BACKEND_URL } from "../lib/api";
import { useToast } from "../lib/toast";
import {
  MessageCircle, Bot, Send, CheckCircle2, XCircle, ShoppingBag, Truck,
  Settings, Phone, MapPin, Plus, Trash2, Power, AlertTriangle, Sparkles,
} from "lucide-react";

const fmtMoney = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const soloDig = (s) => (s || "").replace(/\D/g, "");

const TABS = [
  { id: "pedidos", label: "Pedidos por aprobar", icon: ShoppingBag },
  { id: "conversaciones", label: "Conversaciones", icon: MessageCircle },
  { id: "simular", label: "Probar agente", icon: Sparkles },
  { id: "repartidores", label: "Repartidores", icon: Truck },
  { id: "ajustes", label: "Ajustes", icon: Settings },
];

function Pill({ children, color }) {
  return <span style={{ background: color + "22", color, fontWeight: 700, fontSize: 11.5, padding: "2px 9px", borderRadius: 999 }}>{children}</span>;
}

export default function AgenteWhatsApp() {
  const toast = useToast();
  const [tab, setTab] = useState("pedidos");
  const [estado, setEstado] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [convs, setConvs] = useState([]);
  const [convSel, setConvSel] = useState(null);
  const [mensajes, setMensajes] = useState([]);
  const [reps, setReps] = useState([]);

  // simulador
  const [simTel, setSimTel] = useState("17869012439");
  const [simNombre, setSimNombre] = useState("Cliente de prueba");
  const [simText, setSimText] = useState("");
  const [simChat, setSimChat] = useState([]);
  const [simLoading, setSimLoading] = useState(false);

  // repartidor nuevo
  const [repForm, setRepForm] = useState({ nombre: "", telefono: "", zona: "" });

  const loadEstado = useCallback(() => api.get("/whatsapp/estado").then((r) => setEstado(r.data)).catch(() => {}), []);
  const loadPedidos = useCallback(() => api.get("/whatsapp/pedidos", { params: { estado: "pendiente" } }).then((r) => setPedidos(r.data.pedidos || [])).catch(() => {}), []);
  const loadConvs = useCallback(() => api.get("/whatsapp/conversaciones").then((r) => setConvs(r.data.conversaciones || [])).catch(() => {}), []);
  const loadReps = useCallback(() => api.get("/whatsapp/repartidores").then((r) => setReps(r.data.repartidores || [])).catch(() => {}), []);

  useEffect(() => { loadEstado(); loadPedidos(); loadConvs(); loadReps(); }, [loadEstado, loadPedidos, loadConvs, loadReps]);

  const abrirConv = (tel) => {
    setConvSel(tel);
    api.get(`/whatsapp/conversaciones/${tel}/mensajes`).then((r) => setMensajes(r.data.mensajes || [])).catch(() => {});
  };

  const enviarSim = async () => {
    const tel = soloDig(simTel);
    if (!tel || !simText.trim()) { toast.show("Escribe teléfono y mensaje", "error"); return; }
    const txt = simText.trim();
    setSimChat((c) => [...c, { quien: "Cliente", text: txt }]);
    setSimText("");
    setSimLoading(true);
    try {
      const r = await api.post("/whatsapp/simular", { telefono: tel, nombre: simNombre, text: txt });
      setSimChat((c) => [...c, { quien: "Agente", text: r.data.reply }]);
      if (r.data.pedido_id) { toast.show("¡El agente generó un pedido para aprobar! 🛒"); loadPedidos(); }
      loadConvs();
    } catch { toast.show("Error al contactar al agente", "error"); }
    setSimLoading(false);
  };

  const autorizar = async (p) => {
    if (!window.confirm(`¿Autorizar y CREAR la venta real?\n${p.cantidad_cestas} cestas · ${fmtMoney(p.total)}\n${p.direccion || ""}`)) return;
    try {
      await api.post(`/whatsapp/pedidos/${p._id}/autorizar`);
      toast.show("Pedido autorizado y venta creada ✅");
      loadPedidos();
    } catch (e) { toast.show(e?.response?.data?.detail || "No se pudo autorizar", "error"); }
  };
  const rechazar = async (p) => {
    if (!window.confirm("¿Rechazar este pedido?")) return;
    try { await api.post(`/whatsapp/pedidos/${p._id}/rechazar`); toast.show("Pedido rechazado"); loadPedidos(); }
    catch { toast.show("Error", "error"); }
  };

  const addRep = async () => {
    if (!repForm.nombre.trim() || !soloDig(repForm.telefono)) { toast.show("Nombre y teléfono son obligatorios", "error"); return; }
    try { await api.post("/whatsapp/repartidores", repForm); setRepForm({ nombre: "", telefono: "", zona: "" }); toast.show("Repartidor agregado"); loadReps(); }
    catch { toast.show("Error al agregar", "error"); }
  };
  const delRep = async (id) => { if (!window.confirm("¿Eliminar repartidor?")) return; await api.delete(`/whatsapp/repartidores/${id}`); loadReps(); };

  const guardarAjustes = async (campos) => {
    const next = { activo: estado.activo, vendedor_nombre: estado.vendedor_nombre, ...campos };
    try { await api.put("/whatsapp/config", next); setEstado((e) => ({ ...e, ...next })); toast.show("Ajustes guardados"); }
    catch { toast.show("Error al guardar", "error"); }
  };

  const webhookUrl = `${BACKEND_URL}/api/whatsapp/webhook`;

  return (
    <div data-testid="agente-whatsapp-page" style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <div style={{ background: "#25D366", width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center" }}>
          <Bot size={22} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", margin: 0 }}>Agente de ventas WhatsApp</h1>
          <div style={{ color: "#64748b", fontSize: 13 }}>Piloto · el agente solo lee datos; las ventas se crean solo cuando tú autorizas</div>
        </div>
      </div>

      {/* Estado */}
      {estado && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "14px 0" }}>
          <Pill color={estado.configurado ? "#16a34a" : "#dc2626"}>{estado.configurado ? "WhatsApp conectado" : "WhatsApp sin configurar"}</Pill>
          <Pill color={estado.firma_configurada ? "#16a34a" : "#d97706"}>{estado.firma_configurada ? "Firma verificada" : "Falta App Secret"}</Pill>
          <Pill color={estado.activo ? "#16a34a" : "#64748b"}>{estado.activo ? "Agente ACTIVO" : "Agente en pausa"}</Pill>
          <Pill color="#6366f1">Modelo: {estado.modelo}</Pill>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid #e2e8f0", marginBottom: 18 }}>
        {TABS.map((t) => {
          const Icon = t.icon; const on = tab === t.id;
          return (
            <button key={t.id} data-testid={`wa-tab-${t.id}`} onClick={() => setTab(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", border: "none", background: "none", cursor: "pointer",
                color: on ? "#25759e" : "#64748b", fontWeight: on ? 700 : 500, fontSize: 13.5, borderBottom: on ? "2px solid #25759e" : "2px solid transparent" }}>
              <Icon size={16} /> {t.label}
              {t.id === "pedidos" && pedidos.length > 0 && <span style={{ background: "#dc2626", color: "#fff", borderRadius: 999, fontSize: 11, padding: "0 7px", fontWeight: 700 }}>{pedidos.length}</span>}
            </button>
          );
        })}
      </div>

      {/* PEDIDOS */}
      {tab === "pedidos" && (
        <div data-testid="wa-pedidos-panel">
          {pedidos.length === 0 ? (
            <div style={{ color: "#64748b", padding: 30, textAlign: "center", border: "1px dashed #cbd5e1", borderRadius: 12 }}>
              No hay pedidos pendientes de aprobación.
            </div>
          ) : pedidos.map((p) => (
            <div key={p._id} data-testid={`wa-pedido-${p._id}`} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 16 }}>{p.nombre || p.telefono} · {fmtMoney(p.total)}</div>
                  <div style={{ color: "#475569", fontSize: 13.5, marginTop: 4 }}>
                    🧺 {p.cantidad_cestas} cestas × {fmtMoney(p.precio_unitario)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 13, marginTop: 4 }}><Phone size={13} /> {p.telefono}</div>
                  {p.direccion && <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 13, marginTop: 2 }}><MapPin size={13} /> {p.direccion}</div>}
                  {p.notas && <div style={{ color: "#94a3b8", fontSize: 12.5, marginTop: 2 }}>{p.notas}</div>}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <button data-testid={`wa-autorizar-${p._id}`} onClick={() => autorizar(p)}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "#16a34a", color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                    <CheckCircle2 size={16} /> Autorizar
                  </button>
                  <button data-testid={`wa-rechazar-${p._id}`} onClick={() => rechazar(p)}
                    style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#dc2626", border: "1px solid #fecaca", borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                    <XCircle size={16} /> Rechazar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONVERSACIONES */}
      {tab === "conversaciones" && (
        <div data-testid="wa-conversaciones-panel" style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", maxHeight: 480, overflowY: "auto" }}>
            {convs.length === 0 ? <div style={{ padding: 18, color: "#94a3b8", fontSize: 13 }}>Sin conversaciones aún.</div> :
              convs.map((c) => (
                <div key={c._id} data-testid={`wa-conv-${c._id}`} onClick={() => abrirConv(c._id)}
                  style={{ padding: "11px 14px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", background: convSel === c._id ? "#f0f9ff" : "#fff" }}>
                  <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13.5 }}>{c.nombre || c.telefono}</div>
                  <div style={{ color: "#94a3b8", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.ultimo_mensaje}</div>
                </div>
              ))}
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, minHeight: 300, maxHeight: 480, overflowY: "auto", background: "#f8fafc" }}>
            {!convSel ? <div style={{ color: "#94a3b8", fontSize: 13 }}>Selecciona una conversación.</div> :
              mensajes.map((m) => (
                <div key={m._id} style={{ display: "flex", justifyContent: m.direction === "inbound" ? "flex-start" : "flex-end", marginBottom: 8 }}>
                  <div style={{ maxWidth: "75%", background: m.direction === "inbound" ? "#fff" : "#dcf8c6", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", fontSize: 13.5, color: "#0f172a", whiteSpace: "pre-wrap" }}>{m.text}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* SIMULADOR */}
      {tab === "simular" && (
        <div data-testid="wa-simular-panel" style={{ maxWidth: 640 }}>
          <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", color: "#92400e", fontSize: 13, marginBottom: 14, display: "flex", gap: 8 }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            Modo prueba: escribe como si fueras el cliente. El agente responde aquí pero NO se envía ningún WhatsApp real.
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <input className="input" data-testid="wa-sim-telefono" style={{ flex: "1 1 180px" }} placeholder="Teléfono (ej. 17869012439)" value={simTel} onChange={(e) => setSimTel(e.target.value)} />
            <input className="input" data-testid="wa-sim-nombre" style={{ flex: "1 1 180px" }} placeholder="Nombre del cliente" value={simNombre} onChange={(e) => setSimNombre(e.target.value)} />
          </div>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, minHeight: 240, maxHeight: 360, overflowY: "auto", background: "#f8fafc", marginBottom: 10 }}>
            {simChat.length === 0 ? <div style={{ color: "#94a3b8", fontSize: 13 }}>Envía un mensaje para empezar a conversar con el agente…</div> :
              simChat.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.quien === "Cliente" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                  <div style={{ maxWidth: "80%", background: m.quien === "Cliente" ? "#dcf8c6" : "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 12px", fontSize: 13.5, color: "#0f172a", whiteSpace: "pre-wrap" }}>{m.text}</div>
                </div>
              ))}
            {simLoading && <div style={{ color: "#94a3b8", fontSize: 13 }}>El agente está escribiendo…</div>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="input" data-testid="wa-sim-text" style={{ flex: 1 }} placeholder="Escribe tu mensaje…" value={simText}
              onChange={(e) => setSimText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !simLoading) enviarSim(); }} />
            <button data-testid="wa-sim-enviar" onClick={enviarSim} disabled={simLoading}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#25D366", color: "#fff", border: "none", borderRadius: 10, padding: "0 18px", fontWeight: 700, cursor: "pointer" }}>
              <Send size={16} /> Enviar
            </button>
          </div>
        </div>
      )}

      {/* REPARTIDORES */}
      {tab === "repartidores" && (
        <div data-testid="wa-repartidores-panel" style={{ maxWidth: 760 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            <input className="input" data-testid="wa-rep-nombre" style={{ flex: "1 1 160px" }} placeholder="Nombre" value={repForm.nombre} onChange={(e) => setRepForm({ ...repForm, nombre: e.target.value })} />
            <input className="input" data-testid="wa-rep-telefono" style={{ flex: "1 1 140px" }} placeholder="WhatsApp (ej. 58414...)" value={repForm.telefono} onChange={(e) => setRepForm({ ...repForm, telefono: e.target.value })} />
            <input className="input" data-testid="wa-rep-zona" style={{ flex: "1 1 140px" }} placeholder="Zona que cubre" value={repForm.zona} onChange={(e) => setRepForm({ ...repForm, zona: e.target.value })} />
            <button data-testid="wa-rep-add" onClick={addRep} style={{ display: "flex", alignItems: "center", gap: 6, background: "#25759e", color: "#fff", border: "none", borderRadius: 10, padding: "0 16px", fontWeight: 700, cursor: "pointer" }}>
              <Plus size={16} /> Agregar
            </button>
          </div>
          <table className="table" data-testid="wa-rep-table">
            <thead><tr><th>Nombre</th><th>WhatsApp</th><th>Zona</th><th></th></tr></thead>
            <tbody>
              {reps.length === 0 ? <tr><td colSpan={4} style={{ color: "#94a3b8", textAlign: "center", padding: 18 }}>Aún no hay repartidores. (Se usarán en la Fase 2 para avisar los pedidos.)</td></tr> :
                reps.map((r) => (
                  <tr key={r._id}>
                    <td>{r.nombre}</td><td>{r.telefono}</td><td>{r.zona || "—"}</td>
                    <td><button data-testid={`wa-rep-del-${r._id}`} onClick={() => delRep(r._id)} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer" }}><Trash2 size={16} /></button></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {/* AJUSTES */}
      {tab === "ajustes" && estado && (
        <div data-testid="wa-ajustes-panel" style={{ maxWidth: 680 }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>Agente {estado.activo ? "activo" : "en pausa"}</div>
                <div style={{ color: "#64748b", fontSize: 13 }}>Si lo pausas, se guardan los mensajes entrantes pero el agente no responde automáticamente.</div>
              </div>
              <button data-testid="wa-toggle-activo" onClick={() => guardarAjustes({ activo: !estado.activo })}
                style={{ display: "flex", alignItems: "center", gap: 6, background: estado.activo ? "#dc2626" : "#16a34a", color: "#fff", border: "none", borderRadius: 10, padding: "9px 14px", fontWeight: 700, cursor: "pointer" }}>
                <Power size={16} /> {estado.activo ? "Pausar" : "Activar"}
              </button>
            </div>
          </div>

          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18, marginBottom: 16 }}>
            <label style={{ fontWeight: 700, color: "#0f172a", fontSize: 13.5 }}>Nombre del vendedor para ventas creadas por el agente</label>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input className="input" data-testid="wa-vendedor-nombre" style={{ flex: 1 }} value={estado.vendedor_nombre || ""} onChange={(e) => setEstado((s) => ({ ...s, vendedor_nombre: e.target.value }))} />
              <button data-testid="wa-vendedor-guardar" onClick={() => guardarAjustes({ vendedor_nombre: estado.vendedor_nombre })} style={{ background: "#25759e", color: "#fff", border: "none", borderRadius: 10, padding: "0 16px", fontWeight: 700, cursor: "pointer" }}>Guardar</button>
            </div>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
            <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 10 }}>Datos para configurar el webhook en Meta</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 4 }}>Callback URL</div>
            <code style={{ display: "block", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, wordBreak: "break-all", marginBottom: 12 }} data-testid="wa-webhook-url">{webhookUrl}</code>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 4 }}>Verify Token</div>
            <code style={{ display: "block", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", fontSize: 12.5, wordBreak: "break-all" }} data-testid="wa-verify-token">{estado.verify_token}</code>
          </div>
        </div>
      )}
    </div>
  );
}
