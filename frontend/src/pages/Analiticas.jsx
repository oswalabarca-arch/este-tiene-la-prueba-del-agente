import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { FileBarChart, Save, Lock, TrendingUp, TrendingDown, LineChart as LineChartIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import PrecioPromedioVenta from "../components/PrecioPromedioVenta";
import CostosPorKg from "../components/CostosPorKg";
import GananciaRealPorKg from "../components/GananciaRealPorKg";
import AjustesSaldo from "../components/AjustesSaldo";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const fmt = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SERIES = [
  { key: "costo_por_kg", label: "Costo por kg", color: "#16a34a" },
  { key: "costo_total_por_kg", label: "Costo total por kg", color: "#7c3aed" },
  { key: "costo_real_vendible", label: "Costo real vendible", color: "#0ea5e9" },
  { key: "costo_total_real_vendible", label: "Costo total real vendible", color: "#dc2626" },
];

export default function Analiticas() {
  const toast = useToast();
  const now = new Date();
  const [modo, setModo] = useState("mensual");
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [otrosIngresos, setOtrosIngresos] = useState("");
  const [softwareErp, setSoftwareErp] = useState("");
  const [saving, setSaving] = useState(false);
  const [tendencia, setTendencia] = useState([]);
  const [visibles, setVisibles] = useState(SERIES.map((s) => s.key));
  const [inicioOp, setInicioOp] = useState("");

  const load = useCallback(() => {
    const params = { anio };
    if (modo === "mensual") params.mes = mes;
    api.get("/analiticas/estado-resultados", { params }).then((r) => {
      setData(r.data);
      setOtrosIngresos(r.data.ingresos.otros_ingresos || 0);
      setSoftwareErp(r.data.gastos_operativos.software_erp || 0);
    });
  }, [modo, anio, mes]);

  useEffect(() => { load(); }, [load]);

  const loadTendencia = useCallback(() => {
    api.get("/analiticas/costos-kg-tendencia", { params: { anio } }).then((r) => {
      setTendencia((r.data.meses || []).map((m) => ({ ...m, mesNombre: MESES_CORTO[m.mes - 1] })));
    });
  }, [anio]);

  useEffect(() => { loadTendencia(); }, [loadTendencia]);

  useEffect(() => {
    api.get("/config/inicio-operaciones").then((r) => setInicioOp(r.data.inicio_operaciones || "")).catch(() => {});
  }, []);

  const guardarInicioOp = async (valor) => {
    try {
      await api.post("/config/inicio-operaciones", { inicio_operaciones: valor || null });
      setInicioOp(valor);
      toast.show(valor ? "Inicio de operaciones actualizado" : "Inicio de operaciones eliminado");
      load();
      loadTendencia();
    } catch { toast.show("Error al guardar la fecha", "error"); }
  };

  const limpiarDatosPrueba = async () => {
    try {
      const prev = await api.post("/limpiar-datos-anteriores?dry_run=1");
      const d = prev.data || {};
      if (!d.total_registros) { toast.show("No hay datos anteriores al inicio de operaciones"); return; }
      const resumen = (d.detalle || []).map((x) => `• ${x.coleccion}: ${x.registros} reg. (${x.kg} kg)`).join("\n");
      if (!window.confirm(`Se eliminarán ${d.total_registros} registros de PRUEBA anteriores al ${d.corte} (cosechas, asignaciones y ventas):\n\n${resumen}\n\nEsto NO toca nada del ${d.corte} en adelante. ¿Confirmás?`)) return;
      const r = await api.post("/limpiar-datos-anteriores?dry_run=0");
      toast.show(`Listo: ${r.data.total_registros} registros de prueba eliminados`);
      load();
      loadTendencia();
    } catch (e) { toast.show(e?.response?.data?.detail || "Error al limpiar", "error"); }
  };

  const toggleSerie = (key) => setVisibles((v) => (v.includes(key) ? v.filter((k) => k !== key) : [...v, key]));

  const guardar = async () => {
    setSaving(true);
    try {
      const r = await api.post("/analiticas/estado-resultados", {
        anio: Number(anio),
        mes: modo === "mensual" ? Number(mes) : null,
        otros_ingresos: Number(otrosIngresos) || 0,
        software_erp: Number(softwareErp) || 0,
      });
      setData(r.data);
      toast.show("Período registrado · salarios congelados");
      loadTendencia();
    } catch { toast.show("Error al guardar", "error"); }
    finally { setSaving(false); }
  };

  if (!data) return <div className="page-subtitle">Cargando...</div>;

  const years = [];
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 5; y--) years.push(y);

  // Totales en vivo (reflejan los campos manuales mientras se escriben, antes de guardar)
  const oi = Number(otrosIngresos) || 0;
  const se = Number(softwareErp) || 0;
  const totalIngresos = data.ingresos.ventas_fresa + oi;
  const totalCosto = data.costo_ventas.total;
  const totalGastosOp = data.gastos_operativos.salarios + data.gastos_operativos.gastos_vehiculo + se;
  const utilidadBruta = totalIngresos - totalCosto;
  const utilidadOperativa = utilidadBruta - totalGastosOp;
  const periodoLabel = modo === "mensual" ? `${MESES[mes - 1]} ${anio}` : `Año ${anio}`;

  return (
    <div data-testid="analiticas-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 className="page-title"><FileBarChart size={26} style={{ verticalAlign: "middle", color: "#7c3aed" }} /> Estado de Resultados</h1>
          <p className="page-subtitle">Recopilación de datos de otros módulos · {periodoLabel}</p>
        </div>
        <button className="btn btn-primary" onClick={guardar} disabled={saving} data-testid="er-guardar">
          <Save size={16} /> {saving ? "Guardando..." : "Registrar período"}
        </button>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
          {["mensual", "anual"].map((m) => (
            <button key={m} onClick={() => setModo(m)} data-testid={`er-modo-${m}`}
              style={{ padding: "7px 18px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14,
                background: modo === m ? "#7c3aed" : "transparent", color: modo === m ? "#fff" : "#475569" }}>
              {m === "mensual" ? "Mensual" : "Anual"}
            </button>
          ))}
        </div>
        {modo === "mensual" && (
          <select className="select" style={{ width: 150 }} value={mes} onChange={(e) => setMes(Number(e.target.value))} data-testid="er-mes">
            {MESES.map((nm, i) => <option key={nm} value={i + 1}>{nm}</option>)}
          </select>
        )}
        <select className="select" style={{ width: 120 }} value={anio} onChange={(e) => setAnio(Number(e.target.value))} data-testid="er-anio">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="badge" style={{ background: data.registrado ? "#dcfce7" : "#fef3c7", color: data.registrado ? "#15803d" : "#b45309" }} data-testid="er-estado">
          {data.registrado ? "Registrado" : "No registrado"}
        </span>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <label style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Inicio de operaciones</label>
          <input type="date" className="input" style={{ width: 160 }} value={inicioOp}
            onChange={(e) => setInicioOp(e.target.value)} onBlur={(e) => guardarInicioOp(e.target.value)}
            data-testid="er-inicio-operaciones" />
        </div>
      </div>
      <p style={{ color: "#94a3b8", fontSize: 12, marginTop: -6, marginBottom: 12 }}>
        Los salarios se cuentan a partir del <b>inicio de operaciones</b>. Los meses anteriores no suman salarios.
        <button onClick={limpiarDatosPrueba} data-testid="er-limpiar-prueba"
          style={{ marginLeft: 10, border: "1px solid #fca5a5", background: "#fff", color: "#b91c1c", borderRadius: 6, padding: "2px 8px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
          Limpiar datos de prueba anteriores
        </button>
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-start" }}>
      {/* Estado de resultados */}
      <div className="card" style={{ flex: "1 1 460px", maxWidth: 720 }}>
        <Section title="INGRESO POR VENTAS" color="#16a34a">
          <Row label="Ventas de fresa fresca" value={data.ingresos.ventas_fresa} sub="finca + ciudad + refrigerar + congelar" testid="er-ventas-fresa" />
          <RowInput label="Otros ingresos" value={otrosIngresos} onChange={setOtrosIngresos} testid="er-otros-ingresos" />
          <RowTotal label="Total ingresos" value={totalIngresos} testid="er-total-ingresos" />
        </Section>

        <Section title="COSTO DE VENTAS" color="#dc2626">
          <Row label="Fertilizantes y agroquímicos" value={data.costo_ventas.fertilizantes_agroquimicos} sub="costo real (PEPS)" testid="er-fert" />
          <Row label="Costo mano de obra" value={data.costo_ventas.mano_obra} sub="actividades" testid="er-mano-obra" />
          <RowTotal label="Total costo de ventas" value={totalCosto} testid="er-total-costo" />
        </Section>

        <Section title="GASTOS OPERATIVOS" color="#dc2626">
          <Row label="Salarios" value={data.gastos_operativos.salarios} sub={data.registrado ? "congelado al registrar" : (data.gastos_operativos.salarios_dias != null ? `prorrateado · ${data.gastos_operativos.salarios_dias} de 30 días` : "actual (se congela al registrar)")} icon={data.registrado ? Lock : null} testid="er-salarios" />
          <Row label="Gastos del vehículo" value={data.gastos_operativos.gastos_vehiculo} sub="gasolina + repuestos + mano de obra" testid="er-vehiculo" />
          <RowInput label="Software ERP" value={softwareErp} onChange={setSoftwareErp} testid="er-software" />
          <RowTotal label="Total gastos operativos" value={totalGastosOp} testid="er-total-gastos" />
        </Section>

        {/* Utilidades */}
        <div style={{ marginTop: 18, borderTop: "2px solid #e2e8f0", paddingTop: 14 }}>
          <UtilidadRow label="UTILIDAD BRUTA" hint="Ingresos − Costo de ventas" value={utilidadBruta} testid="er-utilidad-bruta" />
          <UtilidadRow label="UTILIDAD OPERATIVA" hint="Ingresos − Costo de ventas − Gastos operativos" value={utilidadOperativa} strong testid="er-utilidad-operativa" />
        </div>
      </div>

      {/* Columna derecha: Costos por kg + Precio promedio (apilados, mismo ancho) */}
      <div style={{ flex: "1 1 360px", maxWidth: 480, minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Costos por kg (filtro propio: Todo/Semana/Mes/Año) */}
      <CostosPorKg />

      {/* Ganancia real por kg (filtro propio) */}
      <GananciaRealPorKg />

      {/* Precio promedio de venta (mismo ancho, debajo de Costos por kilogramo) */}
      <PrecioPromedioVenta />
      </div>
      </div>

      {/* Tendencia mensual de costos por kg */}
      <div className="card" style={{ marginTop: 18 }} data-testid="er-tendencia-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: "#7c3aed" }}>
              <LineChartIcon size={15} style={{ verticalAlign: "middle", marginRight: 5 }} />TENDENCIA DE COSTOS POR KG · {anio}
            </div>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Evolución mes a mes (US$/kg). Tocá las leyendas para mostrar u ocultar líneas.</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SERIES.map((s) => {
              const on = visibles.includes(s.key);
              return (
                <button key={s.key} onClick={() => toggleSerie(s.key)} data-testid={`er-tend-toggle-${s.key}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                    border: `1px solid ${on ? s.color : "#e2e8f0"}`, background: on ? `${s.color}14` : "#f8fafc", color: on ? s.color : "#94a3b8", fontSize: 12, fontWeight: 600 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: on ? s.color : "#cbd5e1" }} />{s.label}
                </button>
              );
            })}
          </div>
        </div>
        {tendencia.some((m) => m.kg_cosechados > 0) ? (
          <div style={{ width: "100%", height: 340 }} data-testid="er-tendencia-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tendencia} margin={{ top: 16, right: 20, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="mesNombre" tick={{ fontSize: 12, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 12, fill: "#64748b" }} tickFormatter={(v) => `$${v}`} width={56} />
                <Tooltip formatter={(v, name) => [fmt(v) + "/kg", name]} labelFormatter={(l) => `Mes: ${l}`}
                  contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {SERIES.filter((s) => visibles.includes(s.key)).map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p style={{ color: "#b45309", background: "#fef3c7", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginTop: 8 }} data-testid="er-tendencia-vacio">
            No hay cosecha registrada en {anio}. El gráfico de tendencia se muestra cuando hay producción en el año.
          </p>
        )}
      </div>

      <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 12, maxWidth: 720 }}>
        Salario mensual = salario diario × {30} (RRHH › Trabajadores activos), contado a partir del <b>inicio de operaciones</b>. En el período en curso se muestran <b>prorrateados</b> según los días transcurridos (para que la utilidad del inicio de mes no salga toda en rojo); al registrar el período se congela el valor mostrado.
      </p>

      {/* Panel para revisar/eliminar ajustes de saldo (fantasmas) */}
      <AjustesSaldo />
    </div>
  );
}

function Section({ title, color, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value, sub, icon: Icon, testid }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0 7px 16px", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ color: "#475569", fontSize: 14 }}>
        {label}{sub && <span style={{ color: "#94a3b8", fontSize: 12 }}> · {sub}</span>}{Icon && <Icon size={12} style={{ marginLeft: 5, verticalAlign: "middle", color: "#94a3b8" }} />}
      </span>
      <span style={{ fontWeight: 600, color: "#0f172a" }} data-testid={testid}>{fmt(value)}</span>
    </div>
  );
}

function RowInput({ label, value, onChange, testid }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0 7px 16px", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ color: "#475569", fontSize: 14 }}>{label} <span style={{ color: "#7c3aed", fontSize: 11, fontWeight: 600 }}>(manual)</span></span>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }}>$</span>
        <input type="number" step="0.01" min="0" className="input" style={{ width: 140, textAlign: "right", paddingLeft: 18, height: 34 }}
          value={value} onChange={(e) => onChange(e.target.value)} data-testid={testid} />
      </div>
    </div>
  );
}

function RowTotal({ label, value, testid }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid #e2e8f0", marginTop: 2 }}>
      <span style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>{label}</span>
      <span style={{ fontWeight: 800, color: "#0f172a" }} data-testid={testid}>{fmt(value)}</span>
    </div>
  );
}

function UtilidadRow({ label, hint, value, strong, testid }) {
  const positive = value >= 0;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", marginBottom: 8, borderRadius: 10,
      background: strong ? (positive ? "#ecfdf5" : "#fef2f2") : "#f8fafc", border: `1px solid ${strong ? (positive ? "#a7f3d0" : "#fecaca") : "#e2e8f0"}` }}>
      <div>
        <div style={{ fontWeight: 800, color: "#0f172a", fontSize: strong ? 16 : 15 }}>{label}</div>
        <div style={{ color: "#94a3b8", fontSize: 12 }}>{hint}</div>
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: strong ? 22 : 18, color: positive ? "#15803d" : "#dc2626" }} data-testid={testid}>
        {positive ? <TrendingUp size={strong ? 20 : 16} /> : <TrendingDown size={strong ? 20 : 16} />} {fmt(value)}
      </span>
    </div>
  );
}
