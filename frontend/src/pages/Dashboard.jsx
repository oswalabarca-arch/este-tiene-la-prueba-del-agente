import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { Users, Sprout, Boxes, TrendingUp } from "lucide-react";
import GastosSemana from "../components/GastosSemana";

export default function Dashboard() {
  const [stats, setStats] = useState({ n_usuarios: 0, n_plantaciones: 0, total_kg_cosechado: 0, n_aplicaciones: 0 });

  const loadStats = useCallback(() => {
    api.get("/analiticas/resumen").then((r) => setStats(r.data)).catch(() => {});
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);

  return (
    <div data-testid="dashboard-page">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Bienvenido al sistema de gestión agrícola premium</p>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <KpiCard label="Usuarios Activos" value={stats.n_usuarios} icon={Users} color="#3b82f6" bg="#dbeafe" trend="+12% desde el mes pasado" />
        <KpiCard label="Plantaciones" value={stats.n_plantaciones} icon={Sprout} color="#16a34a" bg="#d1fae5" trend="+8% desde el mes pasado" />
        <KpiCard label="Cosechado (kg)" value={Math.round(stats.total_kg_cosechado)} icon={Boxes} color="#8b5cf6" bg="#ede9fe" trend="+23% desde el mes pasado" />
        <KpiCard label="Productividad" value="94%" icon={TrendingUp} color="#f59e0b" bg="#fef3c7" trend="+5% desde el mes pasado" />
      </div>

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

function KpiCard({ label, value, icon: Icon, color, bg, trend }) {
  return (
    <div className="card kpi-card" data-testid={`kpi-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <div className="kpi-head">
        <div className="kpi-label">{label}</div>
        <div className="kpi-icon-box" style={{ background: bg, color }}><Icon size={18} /></div>
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-trend">{trend}</div>
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
