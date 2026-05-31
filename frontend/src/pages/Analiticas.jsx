import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { BarChart3, TrendingUp, Wallet, User, Phone, Search } from "lucide-react";

const fmtMoney = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Analiticas() {
  const [resumen, setResumen] = useState(null);
  const [cxc, setCxc] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/analiticas/resumen").then((r) => setResumen(r.data));
    api.get("/analiticas/cuentas-por-cobrar").then((r) => setCxc(r.data));
  }, []);

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
                <th>Total vendido</th><th>Abonado</th><th>Saldo / Deuda</th><th>Días</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c, i) => (
                <tr key={i} data-testid="cxc-row">
                  <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600 }}><User size={14} style={{ color: "#94a3b8" }} /> {c.cliente}</span></td>
                  <td>{c.telefono ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Phone size={13} style={{ color: "#94a3b8" }} /> {c.telefono}</span> : "—"}</td>
                  <td>{c.modulos.map((m) => <span key={m} className="badge" style={{ background: "#ede9fe", color: "#7c3aed", marginRight: 4 }}>{m}</span>)}</td>
                  <td>{c.n_ventas}</td>
                  <td>{fmtMoney(c.total_vendido)}</td>
                  <td style={{ color: "#3b82f6" }}>{fmtMoney(c.total_abonado)}</td>
                  <td style={{ color: "#dc2626", fontWeight: 700 }}>{fmtMoney(c.saldo)}</td>
                  <td><span className="badge" style={{ background: c.dias_max >= 30 ? "#fee2e2" : "#f1f5f9", color: c.dias_max >= 30 ? "#dc2626" : "#475569" }}>{c.dias_max}d</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {cuentas.length === 0 && <div className="empty-state">{search ? "Sin coincidencias" : "No hay deudas pendientes. ¡Todo cobrado!"}</div>}
        </div>
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
