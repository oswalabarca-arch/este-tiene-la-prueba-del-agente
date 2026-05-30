import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { BarChart3, TrendingUp } from "lucide-react";

export default function Analiticas() {
  const [resumen, setResumen] = useState(null);

  useEffect(() => {
    api.get("/analiticas/resumen").then((r) => setResumen(r.data));
  }, []);

  if (!resumen) return <div className="page-subtitle">Cargando...</div>;

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

      <div className="card" style={{ marginTop: 24, padding: 36, textAlign: "center", borderStyle: "dashed" }}>
        <TrendingUp size={32} color="#8b5cf6" />
        <h3 style={{ marginTop: 12 }}>Más analíticas próximamente</h3>
        <p style={{ color: "#64748b" }}>Gráficos de tendencias, comparativas por lote/variedad, costos vs ingresos.</p>
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
