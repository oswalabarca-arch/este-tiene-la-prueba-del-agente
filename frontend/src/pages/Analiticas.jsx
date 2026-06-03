import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { BarChart3, Wallet, User, Phone, Search, ChevronRight, CreditCard, X, Calendar } from "lucide-react";

const fmtMoney = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s) => { try { return new Date(s).toLocaleDateString("es-ES"); } catch { return s || "—"; } };

export default function Analiticas() {
  const [resumen, setResumen] = useState(null);
  const [cxc, setCxc] = useState(null);
  const [search, setSearch] = useState("");
  const [detalleCliente, setDetalleCliente] = useState(null); // {cliente, telefono}

  const loadCxc = useCallback(() => {
    api.get("/analiticas/cuentas-por-cobrar").then((r) => setCxc(r.data));
  }, []);

  useEffect(() => {
    api.get("/analiticas/resumen").then((r) => setResumen(r.data));
    loadCxc();
  }, [loadCxc]);

  if (!resumen) return <div className="page-subtitle">Cargando...</div>;

  const cuentas = (cxc?.cuentas || []).filter((c) =>
    !search || `${c.cliente} ${c.telefono}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div data-testid="analiticas-page">
      <h1 className="page-title"><BarChart3 size={24} style={{ verticalAlign: "middle", color: "#8b5cf6" }} /> Analíticas</h1>
      <p className="page-subtitle">Métricas globales del sistema agrícola.</p>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Box label="Cosechado total (kg)" value={resumen.total_kg_cosechado} color="#16a34a" />
        <Box label="Primera calidad (kg)" value={resumen.total_primera_calidad_kg} color="#3b82f6" />
        <Box label="Descarte (kg)" value={resumen.total_descarte_kg} color="#dc2626" />
        <Box label="% Primera calidad" value={resumen.total_kg_cosechado ? ((resumen.total_primera_calidad_kg / resumen.total_kg_cosechado) * 100).toFixed(1) + "%" : "0%"} color="#16a34a" />
      </div>

      <div className="kpi-grid">
        <Box label="Plantaciones" value={resumen.n_plantaciones} color="#16a34a" />
        <Box label="Usuarios" value={resumen.n_usuarios} color="#3b82f6" />
        <Box label="Aplicaciones registradas" value={resumen.n_aplicaciones} color="#8b5cf6" />
        <Box label="Actividades registradas" value={resumen.n_actividades} color="#f59e0b" />
      </div>

      {/* Inversión en insumos */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 4px" }}>
          <Wallet size={22} style={{ color: "#16a34a" }} /> Inversión en insumos
        </h2>
        <p className="page-subtitle" style={{ marginTop: 0 }}>Gasto en insumos: compras + entradas manuales de inventario.</p>
        <div className="kpi-grid" data-testid="analiticas-inversion">
          <Box label="Inversión total en insumos" value={fmtMoney(resumen.inversion_insumos_total)} color="#16a34a" />
          <Box label="Compras de insumos" value={fmtMoney(resumen.inversion_compras)} color="#3b82f6" />
          <Box label="Entradas manuales" value={fmtMoney(resumen.inversion_entradas_manuales)} color="#7c3aed" />
        </div>
      </div>

      {/* Cuentas por cobrar */}
      <div style={{ marginTop: 28 }}>
        <h2 style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 4px" }}>
          <Wallet size={22} style={{ color: "#dc2626" }} /> Cuentas por cobrar
        </h2>
        <p className="page-subtitle" style={{ marginTop: 0 }}>Deuda agrupada por cliente (Venta en finca + Envío a ciudad).</p>

        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          <Box label="Deuda total" value={fmtMoney(cxc?.total_deuda)} color="#dc2626" />
          <Box label="Total vendido (con deuda)" value={fmtMoney(cxc?.total_vendido)} color="#0f172a" />
          <Box label="Total cobrado" value={fmtMoney(cxc?.total_cobrado)} color="#3b82f6" />
          <Box label="Deudores" value={cxc?.n_deudores ?? 0} color="#f59e0b" />
        </div>

        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <h3 style={{ margin: 0 }}>Deuda por cliente</h3>
            <div style={{ position: "relative", width: 280, maxWidth: "100%" }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
              <input className="input" style={{ paddingLeft: 32 }} placeholder="Buscar cliente o teléfono..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="cxc-buscar" />
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th><th>Teléfono</th><th>Origen</th><th>Ventas</th>
                <th>Total vendido</th><th>Abonado</th><th>Saldo / Deuda</th><th>Días</th><th></th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c, i) => (
                <tr key={c.cliente || i} data-testid="cxc-row" onClick={() => setDetalleCliente({ cliente: c.cliente, telefono: c.telefono })} style={{ cursor: "pointer" }} title="Ver ventas pendientes y registrar abonos">
                  <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}><User size={14} style={{ color: "#94a3b8" }} /> {c.cliente}</span></td>
                  <td>{c.telefono ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Phone size={13} style={{ color: "#94a3b8" }} /> {c.telefono}</span> : "—"}</td>
                  <td>{c.modulos.map((m) => <span key={m} className="badge" style={{ background: "#ede9fe", color: "#7c3aed", marginRight: 4 }}>{m}</span>)}</td>
                  <td>{c.n_ventas}</td>
                  <td>{fmtMoney(c.total_vendido)}</td>
                  <td style={{ color: "#3b82f6" }}>{fmtMoney(c.total_abonado)}</td>
                  <td style={{ color: "#dc2626", fontWeight: 700 }}>{fmtMoney(c.saldo)}</td>
                  <td><span className="badge" style={{ background: c.dias_max >= 30 ? "#fee2e2" : "#f1f5f9", color: c.dias_max >= 30 ? "#dc2626" : "#475569" }}>{c.dias_max}d</span></td>
                  <td style={{ textAlign: "right" }}><ChevronRight size={16} style={{ color: "#94a3b8" }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {cuentas.length === 0 && <div className="empty-state">{search ? "Sin coincidencias" : "No hay deudas pendientes. ¡Todo cobrado!"}</div>}
        </div>
      </div>

      {detalleCliente && (
        <CxcDetalleModal
          cliente={detalleCliente.cliente}
          telefono={detalleCliente.telefono}
          onClose={() => setDetalleCliente(null)}
          onAbonoRegistrado={loadCxc}
        />
      )}
    </div>
  );
}

function CxcDetalleModal({ cliente, telefono, onClose, onAbonoRegistrado }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [abonando, setAbonando] = useState(null); // venta seleccionada
  const [monto, setMonto] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/analiticas/cuentas-por-cobrar/detalle", { params: { cliente, telefono } })
      .then((r) => setData(r.data));
  }, [cliente, telefono]);

  useEffect(() => { load(); }, [load]);

  const registrarAbono = async (v) => {
    const m = Number(monto);
    if (!m || m <= 0) { toast.show("Ingresa un monto de abono válido", "error"); return; }
    const nuevo = Math.min((v.abono_inicial || 0) + m, v.total || 0);
    setBusy(true);
    try {
      await api.put(`/ventas-${v._tipo}/${v._id}`, {
        fecha: v.fecha, cantidad_cestas: v.cantidad_cestas, cantidad_kg: v.cantidad_kg,
        precio_unitario: v.precio_unitario, total: v.total, cliente,
        telefono, abono_inicial: nuevo, observaciones: v.observaciones,
      });
      toast.show("Abono registrado");
      setAbonando(null); setMonto("");
      load();
      onAbonoRegistrado && onAbonoRegistrado();
    } catch (e) {
      toast.show(e?.response?.data?.detail || "Error al registrar abono", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} data-testid="cxc-detalle-modal">
      <div className="modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div>
            <h2 className="modal-title" style={{ marginBottom: 2 }}><User size={18} style={{ verticalAlign: "middle", color: "#94a3b8" }} /> {cliente}</h2>
            <div className="page-subtitle" style={{ margin: 0 }}>{telefono ? `Tel: ${telefono} · ` : ""}Ventas pendientes de cobro</div>
          </div>
          <button className="btn-icon" onClick={onClose} data-testid="cxc-detalle-cerrar"><X size={18} /></button>
        </div>

        {!data ? <div className="page-subtitle">Cargando...</div> : (
          <>
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#991b1b", fontWeight: 600 }}>Saldo total pendiente</span>
              <span style={{ color: "#dc2626", fontWeight: 800, fontSize: 18 }} data-testid="cxc-detalle-saldo-total">{fmtMoney(data.saldo_total)}</span>
            </div>
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              <table className="table">
                <thead>
                  <tr><th>Fecha</th><th>Origen</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Días</th><th style={{ textAlign: "right" }}>Acción</th></tr>
                </thead>
                <tbody>
                  {data.ventas.map((v) => (
                    abonando && abonando._id === v._id ? (
                      <tr key={v._id} data-testid="cxc-venta-row">
                        <td colSpan={7} style={{ background: "#f8fafc" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "4px 0" }}>
                            <span style={{ fontSize: 13 }}>Abonar a venta del <b>{fmtDate(v.fecha)}</b> · Saldo <b style={{ color: "#dc2626" }}>{fmtMoney(v.saldo)}</b></span>
                            <input className="input" style={{ width: 140 }} type="number" min="0" step="0.01" placeholder="Monto $" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus data-testid="cxc-abono-monto" />
                            <button className="btn btn-primary" onClick={() => registrarAbono(v)} disabled={busy} data-testid="cxc-abono-confirmar">{busy ? "..." : "Registrar abono"}</button>
                            <button className="btn" onClick={() => { setAbonando(null); setMonto(""); }} data-testid="cxc-abono-cancelar">Cancelar</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={v._id} data-testid="cxc-venta-row">
                        <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Calendar size={13} style={{ color: "#94a3b8" }} /> {fmtDate(v.fecha)}</span></td>
                        <td><span className="badge" style={{ background: "#ede9fe", color: "#7c3aed" }}>{v._modulo}</span></td>
                        <td>{fmtMoney(v.total)}</td>
                        <td style={{ color: "#3b82f6" }}>{fmtMoney(v.abono_inicial)}</td>
                        <td style={{ color: "#dc2626", fontWeight: 700 }}>{fmtMoney(v.saldo)}</td>
                        <td><span className="badge" style={{ background: v.dias >= 30 ? "#fee2e2" : "#f1f5f9", color: v.dias >= 30 ? "#dc2626" : "#475569" }}>{v.dias}d</span></td>
                        <td style={{ textAlign: "right" }}>
                          <button className="btn-icon" style={{ color: "#3b82f6" }} title="Registrar abono" onClick={() => { setAbonando(v); setMonto(""); }} data-testid="cxc-abonar-btn"><CreditCard size={16} /></button>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
              {data.ventas.length === 0 && <div className="empty-state" data-testid="cxc-detalle-vacio">Este cliente ya no tiene ventas pendientes.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Box({ label, value, color }) {
  return (
    <div className="card kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color }}>{value}</div>
    </div>
  );
}
