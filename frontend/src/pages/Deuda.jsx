import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { HandCoins, ChevronDown, ChevronRight, CreditCard, CheckCircle2, User, Phone, AlertTriangle } from "lucide-react";

const fmt = (n) => {
  const [ent, dec] = Number(n || 0).toFixed(2).split(".");
  return ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + dec;
};

const CANAL_COLOR = {
  "Venta en finca": "#16a34a",
  "Envío a ciudad": "#3b82f6",
  "Refrigerado": "#0ea5e9",
  "Congelado": "#6366f1",
};

const tipoDeModulo = (label) => ({
  "Venta en finca": "finca", "Envío a ciudad": "ciudad", "Refrigerado": "refrigerar", "Congelado": "congelar",
}[label] || "finca");

export default function Deuda() {
  const toast = useToast();
  const { canEdit } = useAuth();
  const editable = canEdit("deuda");
  const [data, setData] = useState(null);
  const [orden, setOrden] = useState("deuda"); // deuda | dias
  const [vendedorFiltro, setVendedorFiltro] = useState("todos");
  const [abierto, setAbierto] = useState(null); // key cliente|telefono
  const [detalle, setDetalle] = useState({}); // key -> {ventas, loading}
  const [abonoInput, setAbonoInput] = useState({}); // ventaId -> monto
  const [tasa, setTasa] = useState(""); // tasa de cambio del día (Bs por US$) — solo informativo
  const tasaNum = parseFloat(tasa) || 0;
  const bs = (usd) => fmt((Number(usd) || 0) * tasaNum);

  const load = useCallback(() => {
    api.get("/analiticas/cuentas-por-cobrar").then((r) => setData(r.data)).catch(() => setData(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  const keyDe = (c) => `${(c.cliente || "").toLowerCase()}|${c.telefono || ""}`;

  const vendedoresLista = [...new Set((data?.cuentas || []).flatMap((c) => c.vendedores || []))].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const cuentas = [...(data?.cuentas || [])]
    .filter((c) => vendedorFiltro === "todos" || (c.vendedores || []).some((v) => v.toLowerCase() === vendedorFiltro))
    .sort((a, b) => (orden === "dias" ? b.dias_max - a.dias_max : b.saldo - a.saldo));

  const toggle = async (c) => {
    const key = keyDe(c);
    if (abierto === key) { setAbierto(null); return; }
    setAbierto(key);
    if (!detalle[key]) {
      setDetalle((d) => ({ ...d, [key]: { loading: true, ventas: [] } }));
      try {
        const r = await api.get("/analiticas/cuentas-por-cobrar/detalle", { params: { cliente: c.cliente, telefono: c.telefono } });
        setDetalle((d) => ({ ...d, [key]: { loading: false, ventas: r.data.ventas || [] } }));
      } catch {
        setDetalle((d) => ({ ...d, [key]: { loading: false, ventas: [] } }));
      }
    }
  };

  const refrescarDetalle = async (c) => {
    const key = keyDe(c);
    try {
      const r = await api.get("/analiticas/cuentas-por-cobrar/detalle", { params: { cliente: c.cliente, telefono: c.telefono } });
      setDetalle((d) => ({ ...d, [key]: { loading: false, ventas: r.data.ventas || [] } }));
    } catch { /* noop */ }
    load();
  };

  const putAbono = async (c, v, nuevoAbono) => {
    await api.put(`/ventas-${v._tipo}/${v._id}`, {
      fecha: v.fecha, cantidad_cestas: v.cantidad_cestas, cantidad_kg: v.cantidad_kg,
      precio_unitario: v.precio_unitario, total: v.total, unidad_venta: "cestas",
      cliente: c.cliente, telefono: c.telefono, abono_inicial: nuevoAbono, observaciones: v.observaciones,
    });
  };

  const abonar = async (c, v) => {
    const monto = Number(abonoInput[v._id] || 0);
    if (!(monto > 0)) { toast.show("Escribe un monto mayor a 0", "error"); return; }
    const nuevo = Math.min((v.abono_inicial || 0) + monto, v.total || 0);
    try {
      await putAbono(c, v, nuevo);
      setAbonoInput((s) => ({ ...s, [v._id]: "" }));
      toast.show(`Abono de $${fmt(monto)} registrado`);
      await refrescarDetalle(c);
    } catch { toast.show("Error al registrar el abono", "error"); }
  };

  const marcarPagado = async (c, v) => {
    if (!window.confirm(`¿Marcar como PAGADA esta venta de ${c.cliente} (saldo $${fmt(v.saldo)})?`)) return;
    try {
      await putAbono(c, v, v.total || 0);
      toast.show("Venta marcada como pagada");
      await refrescarDetalle(c);
    } catch { toast.show("Error al marcar como pagada", "error"); }
  };

  return (
    <div data-testid="deuda-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><HandCoins size={26} style={{ verticalAlign: "-4px", marginRight: 8, color: "#dc2626" }} />Deuda</h1>
          <p className="page-subtitle">Todos los deudores de Ventas (finca, ciudad, refrigerado y congelado), agrupados por cliente.</p>
        </div>
      </div>

      {/* Totales */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 16 }}>
        <div className="card" style={{ background: "#fef2f2", borderColor: "#fecaca" }} data-testid="deuda-total">
          <div className="kpi-label" style={{ color: "#b91c1c" }}>Deuda total por cobrar</div>
          <div className="kpi-value" style={{ color: "#dc2626" }}>US$ {fmt(data?.total_deuda)}</div>
          {tasaNum > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#a16207" }} data-testid="deuda-total-bs">Bs {bs(data?.total_deuda)}</div>}
          <div style={{ fontSize: 12, color: "#94a3b8" }}>{data?.n_deudores || 0} deudor(es)</div>
        </div>
        <div className="card" data-testid="deuda-vendido">
          <div className="kpi-label">Total vendido (a estos clientes)</div>
          <div className="kpi-value" style={{ color: "#0f172a" }}>US$ {fmt(data?.total_vendido)}</div>
        </div>
        <div className="card" style={{ background: "#f0fdf4", borderColor: "#bbf7d0" }} data-testid="deuda-cobrado">
          <div className="kpi-label" style={{ color: "#15803d" }}>Ya cobrado (abonos)</div>
          <div className="kpi-value" style={{ color: "#16a34a" }}>US$ {fmt(data?.total_cobrado)}</div>
        </div>
      </div>

      {/* Orden + tasa de cambio del día (solo informativo) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>Ordenar por:</span>
        <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
          {[["deuda", "Mayor deuda"], ["dias", "Más días de atraso"]].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setOrden(k)} data-testid={`deuda-orden-${k}`}
              style={{ padding: "6px 13px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                background: orden === k ? "#dc2626" : "transparent", color: orden === k ? "#fff" : "#475569" }}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <label style={{ fontSize: 13, color: "#64748b" }}>Vendedor:</label>
          <select className="input" value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)} data-testid="deuda-filtro-vendedor"
            style={{ width: "auto", minWidth: 150, padding: "7px 10px", fontWeight: 600 }}>
            <option value="todos">Todos los vendedores</option>
            {vendedoresLista.map((v) => <option key={v} value={v.toLowerCase()}>{v}</option>)}
          </select>
        </div>
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, background: "#fef9c3", border: "1px solid #fde68a", borderRadius: 10, padding: "6px 12px" }} data-testid="deuda-tasa-box">
          <label style={{ fontSize: 12, color: "#a16207", fontWeight: 600 }}>Tasa de cambio del día (Bs/US$)</label>
          <input type="number" step="0.01" min="0" value={tasa} onChange={(e) => setTasa(e.target.value)}
            placeholder="0" data-testid="deuda-tasa-input"
            style={{ width: 100, padding: "5px 8px", border: "1px solid #fbbf24", borderRadius: 6, fontSize: 13 }} />
        </div>
      </div>

      <div className="card">
        {cuentas.length === 0 ? (
          <div className="empty-state" data-testid="deuda-vacio">
            <CheckCircle2 size={32} style={{ color: "#16a34a", marginBottom: 8 }} />
            <div>¡Sin deudores! Todas las ventas están cobradas.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cuentas.map((c) => {
              const key = keyDe(c);
              const open = abierto === key;
              const det = detalle[key];
              const alerta = c.dias_max >= 15;
              return (
                <div key={key} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }} data-testid={`deuda-cliente-${key}`}>
                  <button type="button" onClick={() => toggle(c)} data-testid={`deuda-toggle-${key}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", padding: "12px 14px",
                      background: open ? "#fef2f2" : "#fff", border: "none", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      {open ? <ChevronDown size={18} color="#dc2626" /> : <ChevronRight size={18} color="#94a3b8" />}
                      <span style={{ minWidth: 0 }}>
                        <span style={{ fontWeight: 700, color: "#0f172a", display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <User size={14} color="#94a3b8" />{c.cliente}
                          {c.telefono && <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400 }}><Phone size={11} style={{ verticalAlign: "-1px" }} /> {c.telefono}</span>}
                        </span>
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3 }}>
                          {(c.modulos || []).map((m) => (
                            <span key={m} style={{ fontSize: 11, fontWeight: 600, color: CANAL_COLOR[m] || "#475569", background: `${CANAL_COLOR[m] || "#475569"}18`, padding: "1px 7px", borderRadius: 6 }}>{m}</span>
                          ))}
                          <span style={{ fontSize: 11, color: "#94a3b8" }}>{c.n_ventas} venta(s)</span>
                          {(c.vendedores || []).length > 0 && (
                            <span data-testid={`deuda-vendedores-${key}`} style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", background: "#fff7ed", border: "1px solid #fed7aa", padding: "1px 7px", borderRadius: 6 }}>
                              Vendedor: {c.vendedores.join(", ")}
                            </span>
                          )}
                        </span>
                      </span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 14, whiteSpace: "nowrap" }}>
                      <span style={{ textAlign: "right" }}>
                        <span style={{ display: "block", fontSize: 11, color: "#94a3b8" }}>Debe</span>
                        <span style={{ fontWeight: 800, color: "#dc2626", fontSize: 16 }} data-testid={`deuda-saldo-${key}`}>US$ {fmt(c.saldo)}</span>
                        {tasaNum > 0 && <span style={{ display: "block", fontWeight: 700, color: "#a16207", fontSize: 13 }} data-testid={`deuda-saldo-bs-${key}`}>Bs {bs(c.saldo)}</span>}
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: alerta ? "#dc2626" : "#b45309", background: alerta ? "#fee2e2" : "#fef3c7", padding: "3px 8px", borderRadius: 6 }}>
                        {alerta && <AlertTriangle size={12} />}{c.dias_max}d
                      </span>
                    </span>
                  </button>

                  {open && (
                    <div style={{ borderTop: "1px solid #f1f5f9", background: "#fafafa", padding: "10px 14px" }} data-testid={`deuda-detalle-${key}`}>
                      {det?.loading && <div style={{ fontSize: 13, color: "#94a3b8" }}>Cargando ventas…</div>}
                      {det && !det.loading && (det.ventas || []).map((v) => (
                        <div key={`${v._tipo}-${v._id}`} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px dashed #e2e8f0" }} data-testid={`deuda-venta-${v._id}`}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: CANAL_COLOR[v._modulo] || "#475569", background: `${CANAL_COLOR[v._modulo] || "#475569"}18`, padding: "2px 8px", borderRadius: 6 }}>{v._modulo}</span>
                          <span style={{ fontSize: 13, color: "#475569" }}>{(v.fecha || "").slice(0, 10)}</span>
                          {v.vendedor && <span data-testid={`deuda-venta-vendedor-${v._id}`} style={{ fontSize: 12, fontWeight: 700, color: "#c2410c", background: "#fff7ed", border: "1px solid #fed7aa", padding: "1px 8px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}><User size={11} /> {v.vendedor}</span>}
                          <span style={{ fontSize: 13, color: "#64748b" }}>{fmt(v.cantidad_cestas)} cestas</span>
                          <span style={{ fontSize: 13 }}>Total <b>US$ {fmt(v.total)}</b></span>
                          <span style={{ fontSize: 13, color: "#16a34a" }}>Abonado US$ {fmt(v.abono_inicial)}</span>
                          <span style={{ fontSize: 13, color: "#dc2626", fontWeight: 700 }}>Saldo US$ {fmt(v.saldo)}</span>
                          {tasaNum > 0 && <span style={{ fontSize: 13, color: "#a16207", fontWeight: 700 }} data-testid={`deuda-venta-bs-${v._id}`}>· Bs {bs(v.saldo)}</span>}
                          <span style={{ fontSize: 12, color: v.dias >= 15 ? "#dc2626" : "#b45309" }}>{v.dias}d</span>
                          {editable && (
                            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
                              <input type="number" min="0" step="0.01" placeholder="Abono $" value={abonoInput[v._id] || ""}
                                onChange={(e) => setAbonoInput((s) => ({ ...s, [v._id]: e.target.value }))}
                                data-testid={`deuda-abono-input-${v._id}`}
                                style={{ width: 90, padding: "5px 8px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13 }} />
                              <button type="button" onClick={() => abonar(c, v)} data-testid={`deuda-abonar-${v._id}`}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #3b82f6", background: "#fff", color: "#3b82f6", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                <CreditCard size={13} /> Abonar
                              </button>
                              <button type="button" onClick={() => marcarPagado(c, v)} data-testid={`deuda-pagado-${v._id}`}
                                style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "1px solid #16a34a", background: "#16a34a", color: "#fff", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                <CheckCircle2 size={13} /> Pagado
                              </button>
                            </span>
                          )}
                        </div>
                      ))}
                      {det && !det.loading && (det.ventas || []).length === 0 && (
                        <div style={{ fontSize: 13, color: "#94a3b8" }}>Sin ventas pendientes (ya se cobraron).</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
