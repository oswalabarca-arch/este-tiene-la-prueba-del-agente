import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { Users, ShoppingBasket, DollarSign, CalendarDays, Trophy, Phone, Crown, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const fmtMoney = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const CANAL_LABEL = { finca: "Finca", ciudad: "Ciudad", refrigerar: "Refrigerado", congelar: "Congelado" };

const hoy = () => new Date();
const ymd = (d) => d.toLocaleDateString("en-CA");

function rangoDe(modo) {
  const n = hoy();
  if (modo === "mes") {
    const desde = ymd(new Date(n.getFullYear(), n.getMonth(), 1));
    const hasta = ymd(new Date(n.getFullYear(), n.getMonth() + 1, 0));
    return { desde, hasta };
  }
  if (modo === "anio") {
    return { desde: `${n.getFullYear()}-01-01`, hasta: `${n.getFullYear()}-12-31` };
  }
  return { desde: null, hasta: null };
}

const COLORES_DIA = ["#16a34a", "#0ea5e9", "#6366f1", "#f59e0b", "#ec4899", "#14b8a6", "#ef4444"];

function Card({ icon: Icon, label, value, sub, color, testid }) {
  return (
    <div data-testid={testid} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 18px", flex: "1 1 180px", minWidth: 180, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 12.5, fontWeight: 600 }}>
        <Icon size={15} style={{ color: color || "#94a3b8" }} /> {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{sub}</div> : null}
    </div>
  );
}

export default function EstadisticaCompradores() {
  const toast = useToast();
  const [modo, setModo] = useState("todo");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orden, setOrden] = useState("cestas");

  const load = useCallback(() => {
    setLoading(true);
    const { desde, hasta } = rangoDe(modo);
    const params = {};
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    api.get("/estadisticas/compradores", { params })
      .then((r) => setData(r.data))
      .catch(() => toast.show("Error al cargar las estadísticas", "error"))
      .finally(() => setLoading(false));
  }, [modo, toast]);

  useEffect(() => { load(); }, [load]);

  const compradores = (data?.compradores || []).slice().sort((a, b) =>
    orden === "monto" ? b.monto - a.monto : orden === "transacciones" ? b.transacciones - a.transacciones : b.cestas - a.cestas
  );
  const totales = data?.totales || { cestas: 0, kg: 0, monto: 0, transacciones: 0, compradores_unicos: 0 };
  const porDia = data?.por_dia_semana || [];
  const mejorDia = data?.mejor_dia;
  const maxDiaCestas = Math.max(1, ...porDia.map((d) => d.cestas));
  const chartData = porDia.map((d) => ({ label: d.label.slice(0, 3), cestas: d.cestas, dia: d.dia }));
  const topGlobal = compradores[0];

  return (
    <div data-testid="estadistica-compradores-page" style={{ padding: "4px 2px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <Trophy size={24} style={{ color: "#f59e0b" }} /> Estadística de compradores
          </h1>
          <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
            Resumen de quién te compra más, cuántas cestas y qué día de la semana se vende más. Lee todas las ventas (finca, ciudad, refrigerado y congelado).
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
          {[{ k: "todo", l: "Todo" }, { k: "anio", l: "Este año" }, { k: "mes", l: "Este mes" }].map((o) => (
            <button key={o.k} onClick={() => setModo(o.k)} data-testid={`ec-periodo-${o.k}`}
              style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
                background: modo === o.k ? "#0f172a" : "transparent", color: modo === o.k ? "#fff" : "#64748b" }}>
              {o.l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: "#94a3b8" }}>Cargando...</div>
      ) : totales.transacciones === 0 ? (
        <div data-testid="ec-vacio" style={{ padding: 40, textAlign: "center", color: "#94a3b8", background: "#fff", border: "1px dashed #e2e8f0", borderRadius: 14, marginTop: 14 }}>
          No hay ventas registradas en este período.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "16px 0" }}>
            <Card icon={Users} label="Compradores únicos" value={fmtNum(totales.compradores_unicos)} color="#6366f1" testid="ec-card-compradores" />
            <Card icon={ShoppingBasket} label="Cestas vendidas" value={fmtNum(totales.cestas)} sub={`${fmtNum(totales.kg)} kg`} color="#16a34a" testid="ec-card-cestas" />
            <Card icon={DollarSign} label="Total vendido" value={fmtMoney(totales.monto)} sub={`${fmtNum(totales.transacciones)} ventas`} color="#0ea5e9" testid="ec-card-monto" />
            <Card icon={CalendarDays} label="Mejor día" value={mejorDia ? mejorDia.label : "—"} sub={mejorDia ? `${fmtNum(mejorDia.cestas)} cestas` : ""} color="#f59e0b" testid="ec-card-mejor-dia" />
          </div>

          {topGlobal && (
            <div data-testid="ec-top-comprador" style={{ display: "flex", alignItems: "center", gap: 14, background: "linear-gradient(90deg,#fffbeb,#fff)", border: "1px solid #fde68a", borderRadius: 14, padding: "14px 18px", marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Crown size={22} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: "#b45309", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>Mejor comprador</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#0f172a" }}>{topGlobal.cliente}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#16a34a" }}>{fmtNum(topGlobal.cestas)} cestas</div>
                <div style={{ fontSize: 13, color: "#64748b" }}>{fmtMoney(topGlobal.monto)} · {topGlobal.transacciones} compras</div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            {/* Compras por día de la semana */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 2px", display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={18} style={{ color: "#0ea5e9" }} /> Compras por día de la semana
              </h2>
              <p style={{ color: "#64748b", fontSize: 12.5, margin: "0 0 14px" }}>Cestas vendidas por día y el mejor comprador de cada uno.</p>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} allowDecimals={false} />
                    <Tooltip formatter={(v) => [`${fmtNum(v)} cestas`, "Cestas"]} cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="cestas" radius={[6, 6, 0, 0]}>
                      {chartData.map((e) => <Cell key={e.dia} fill={COLORES_DIA[e.dia]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {porDia.map((d) => (
                  <div key={d.dia} data-testid={`ec-dia-${d.dia}`} style={{ flex: "1 1 120px", minWidth: 120, border: "1px solid #f1f5f9", borderRadius: 10, padding: "9px 11px", background: mejorDia && mejorDia.dia === d.dia ? "#f0fdf4" : "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#0f172a" }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: COLORES_DIA[d.dia] }} /> {d.label}
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: d.cestas > 0 ? "#16a34a" : "#cbd5e1", margin: "2px 0" }}>{fmtNum(d.cestas)} <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>cestas</span></div>
                    {d.top_comprador ? (
                      <div style={{ fontSize: 11.5, color: "#64748b" }} title={`${d.top_comprador.cliente}: ${fmtNum(d.top_comprador.cestas)} cestas`}>
                        <Crown size={11} style={{ color: "#f59e0b", verticalAlign: "-1px" }} /> {d.top_comprador.cliente} ({fmtNum(d.top_comprador.cestas)})
                      </div>
                    ) : <div style={{ fontSize: 11.5, color: "#cbd5e1" }}>Sin ventas</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Ranking de compradores */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
                  <Trophy size={18} style={{ color: "#f59e0b" }} /> Mejores compradores
                </h2>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Ordenar por:</span>
                  {[{ k: "cestas", l: "Cestas" }, { k: "monto", l: "$" }, { k: "transacciones", l: "N° compras" }].map((o) => (
                    <button key={o.k} onClick={() => setOrden(o.k)} data-testid={`ec-orden-${o.k}`}
                      style={{ padding: "5px 11px", borderRadius: 7, border: "1px solid", cursor: "pointer", fontWeight: 700, fontSize: 12,
                        borderColor: orden === o.k ? "#0ea5e9" : "#e2e8f0", background: orden === o.k ? "#eff6ff" : "#fff", color: orden === o.k ? "#0369a1" : "#64748b" }}>
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ minWidth: 760 }} data-testid="ec-tabla-compradores">
                  <thead>
                    <tr>
                      <th style={{ width: 44, textAlign: "center" }}>#</th>
                      <th>Comprador</th>
                      <th>Teléfono</th>
                      <th style={{ textAlign: "center" }}>Cestas</th>
                      <th style={{ textAlign: "center" }}>kg</th>
                      <th style={{ textAlign: "center" }}>Total $</th>
                      <th style={{ textAlign: "center" }}>N° compras</th>
                      <th style={{ textAlign: "center" }}>Última compra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compradores.map((c, i) => (
                      <tr key={c.cliente + i} data-testid={`ec-fila-${i}`} style={{ background: i === 0 ? "#fffbeb" : "transparent" }}>
                        <td style={{ textAlign: "center", fontWeight: 800, color: i === 0 ? "#f59e0b" : i < 3 ? "#0f172a" : "#94a3b8" }}>
                          {i === 0 ? <Crown size={15} style={{ color: "#f59e0b" }} /> : i + 1}
                        </td>
                        <td style={{ fontWeight: 700, color: "#0f172a" }}>
                          {c.cliente}
                          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>
                            {Object.entries(c.canales).filter(([, v]) => v > 0).map(([k, v]) => `${CANAL_LABEL[k]}: ${fmtNum(v)}`).join(" · ")}
                          </div>
                        </td>
                        <td style={{ color: "#64748b", fontSize: 13 }}>{c.telefono ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Phone size={12} style={{ color: "#cbd5e1" }} /> {c.telefono}</span> : "—"}</td>
                        <td style={{ textAlign: "center", fontWeight: 800, color: "#16a34a", fontSize: 15 }}>{fmtNum(c.cestas)}</td>
                        <td style={{ textAlign: "center", color: "#475569" }}>{fmtNum(c.kg)}</td>
                        <td style={{ textAlign: "center", fontWeight: 700, color: "#0369a1" }}>{fmtMoney(c.monto)}</td>
                        <td style={{ textAlign: "center", color: "#475569" }}>{c.transacciones}</td>
                        <td style={{ textAlign: "center", color: "#64748b", fontSize: 13 }}>{c.ultima_compra || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
