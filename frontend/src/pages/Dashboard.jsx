import GastosSemana from "../components/GastosSemana";
import StockCanales from "../components/StockCanales";
import DashboardTotales from "../components/DashboardTotales";

export default function Dashboard() {
  return (
    <div data-testid="dashboard-page">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Bienvenido al sistema de gestión agrícola premium</p>

      <DashboardTotales />

      <StockCanales />

      <GastosSemana />

      <div className="card" style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", borderColor: "#bbf7d0" }}>
        <h2 style={{ margin: "0 0 8px" }}>Sistema ERP Agrícola Premium</h2>
        <p style={{ color: "#475569", marginTop: 0 }}>
          Sistema profesional de gestión especializado en producción de frutas. Navega por los módulos disponibles para gestionar tu operación agrícola.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 16 }}>
          <Highlight title="Cosecha" sub="Gestión completa de cosechas" color="#16a34a" tag="Módulo destacado" />
          <Highlight title="Plantaciones" sub="Control total de cultivos y campos" color="#3b82f6" tag="Próximamente más" />
          <Highlight title="Analíticas" sub="Reportes avanzados y métricas" color="#8b5cf6" tag="En desarrollo" />
        </div>
      </div>
    </div>
  );
}

function Highlight({ title, sub, color, tag }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{tag}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{title}</div>
      <div style={{ color: "#64748b", fontSize: 14, marginTop: 2 }}>{sub}</div>
    </div>
  );
}
