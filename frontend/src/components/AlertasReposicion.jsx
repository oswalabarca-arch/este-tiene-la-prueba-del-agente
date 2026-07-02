import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { PackageSearch, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";

const NIVELES = {
  critico: { label: "Crítico", color: "#b91c1c", bg: "#fee2e2", border: "#fecaca", dot: "#dc2626", texto: "¡Reponé ya!" },
  dos_semanas: { label: "2 semanas", color: "#c2410c", bg: "#ffedd5", border: "#fed7aa", dot: "#ea580c", texto: "Reponé pronto" },
  tres_semanas: { label: "3 semanas", color: "#a16207", bg: "#fef9c3", border: "#fde68a", dot: "#ca8a04", texto: "Planificá compra" },
  cuatro_semanas: { label: "4 semanas", color: "#4d7c0f", bg: "#ecfccb", border: "#d9f99d", dot: "#65a30d", texto: "Tené en cuenta" },
  sano: { label: "Stock sano", color: "#15803d", bg: "#dcfce7", border: "#bbf7d0", dot: "#16a34a", texto: "OK" },
  sin_consumo: { label: "Sin consumo", color: "#64748b", bg: "#f1f5f9", border: "#e2e8f0", dot: "#94a3b8", texto: "Sin datos recientes" },
};

const numf = (n) => Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 1 });

function diasTexto(d) {
  if (d === null || d === undefined) return "—";
  if (d <= 0) return "Agotado";
  if (d < 14) return `${numf(d)} días`;
  return `${numf(d)} días (~${numf(d / 7)} sem)`;
}

export default function AlertasReposicion() {
  const [data, setData] = useState(null);
  const [dias, setDias] = useState(30);

  useEffect(() => {
    api.get("/dashboard/alertas-reposicion", { params: { dias } }).then((r) => setData(r.data)).catch(() => setData(null));
  }, [dias]);

  const productos = data?.productos || [];
  const conAlerta = productos.filter((p) => ["critico", "dos_semanas", "tres_semanas", "cuatro_semanas"].includes(p.nivel));
  const resto = productos.filter((p) => !["critico", "dos_semanas", "tres_semanas", "cuatro_semanas"].includes(p.nivel));

  return (
    <div className="card" style={{ marginTop: 18 }} data-testid="alertas-reposicion-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 6 }}>
        <div>
          <h3 style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <PackageSearch size={18} color="#0ea5e9" /> Alertas de reposición · Fertilizantes
          </h3>
          <p style={{ color: "#64748b", marginTop: 4, marginBottom: 0, fontSize: 12 }}>
            Según el consumo de los últimos {data?.dias_periodo || dias} días. Te avisa 4, 3, 2 y 1 semana antes de agotarse.
          </p>
        </div>
        <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3 }} data-testid="alertas-periodo">
          {[[30, "30 días"], [60, "60 días"], [90, "90 días"]].map(([v, l]) => (
            <button key={v} type="button" onClick={() => setDias(v)} data-testid={`alertas-dias-${v}`}
              style={{ padding: "6px 12px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13, background: dias === v ? "#0ea5e9" : "transparent", color: dias === v ? "#fff" : "#475569" }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div style={{ color: "#94a3b8", fontSize: 13, padding: "10px 0" }}>Cargando...</div>
      ) : productos.length === 0 ? (
        <div className="empty-state" data-testid="alertas-empty">No hay fertilizantes en el inventario todavía.</div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "10px 0 16px" }} data-testid="alertas-resumen">
            <Chip icon={AlertTriangle} n={data.resumen.critico} label="Crítico" color="#dc2626" bg="#fee2e2" />
            <Chip icon={AlertTriangle} n={data.resumen.alerta} label="Por reponer" color="#ea580c" bg="#ffedd5" />
            <Chip icon={CheckCircle2} n={data.resumen.sano} label="Sano" color="#16a34a" bg="#dcfce7" />
            <Chip icon={HelpCircle} n={data.resumen.sin_consumo} label="Sin consumo" color="#64748b" bg="#f1f5f9" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[...conAlerta, ...resto].map((p) => (
              <ProductoRow key={p.nombre_producto} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Chip({ icon: Icon, n, label, color, bg }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: bg, color, borderRadius: 10, padding: "6px 12px", fontWeight: 700, fontSize: 13 }}>
      <Icon size={15} /> {n} <span style={{ fontWeight: 500, opacity: 0.85 }}>{label}</span>
    </div>
  );
}

function ProductoRow({ p }) {
  const n = NIVELES[p.nivel] || NIVELES.sin_consumo;
  return (
    <div data-testid={`alerta-row-${p.nombre_producto}`}
      style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: n.bg, border: `1px solid ${n.border}`, borderRadius: 10, padding: "10px 14px" }}>
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: n.dot, flexShrink: 0 }} />
      <div style={{ minWidth: 140, flex: "1 1 140px" }}>
        <div style={{ fontWeight: 700, color: "#0f172a", textTransform: "capitalize" }}>{p.nombre_producto}</div>
        <div style={{ fontSize: 12, color: "#64748b" }}>Stock: <b>{numf(p.stock)}</b> {p.unidad}</div>
      </div>
      <div style={{ textAlign: "center", minWidth: 110 }}>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Tiempo restante</div>
        <div style={{ fontWeight: 800, color: n.color, fontSize: 15 }} data-testid={`alerta-dias-${p.nombre_producto}`}>{diasTexto(p.dias_restantes)}</div>
      </div>
      <div style={{ textAlign: "center", minWidth: 100 }}>
        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Aplicaciones</div>
        <div style={{ fontWeight: 800, color: n.color, fontSize: 15 }} data-testid={`alerta-apps-${p.nombre_producto}`}>
          {p.aplicaciones_restantes === null || p.aplicaciones_restantes === undefined ? "—" : `${numf(p.aplicaciones_restantes)} restantes`}
        </div>
      </div>
      <span className="badge" style={{ background: "#fff", color: n.color, border: `1px solid ${n.border}`, fontWeight: 700, minWidth: 96, textAlign: "center" }} data-testid={`alerta-nivel-${p.nombre_producto}`}>
        {n.texto}
      </span>
    </div>
  );
}
