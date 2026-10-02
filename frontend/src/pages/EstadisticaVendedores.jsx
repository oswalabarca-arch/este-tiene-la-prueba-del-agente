import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { HandCoins, DollarSign, CheckCircle2, Clock, UserCircle, Percent } from "lucide-react";

const fmtMoney = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const hoy = () => new Date();
const ymd = (d) => d.toLocaleDateString("en-CA");

function rangoDe(modo, mesSel, anioSel) {
  const n = hoy();
  if (modo === "mes") {
    const a = anioSel || n.getFullYear();
    const m = (mesSel || n.getMonth() + 1) - 1;
    return { desde: ymd(new Date(a, m, 1)), hasta: ymd(new Date(a, m + 1, 0)) };
  }
  if (modo === "anio") {
    const a = anioSel || n.getFullYear();
    return { desde: `${a}-01-01`, hasta: `${a}-12-31` };
  }
  return { desde: null, hasta: null };
}

function Card({ icon: Icon, label, value, color, testid }) {
  return (
    <div data-testid={testid} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 18px", flex: "1 1 170px", minWidth: 170, boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 12.5, fontWeight: 600 }}>
        <Icon size={15} style={{ color: color || "#94a3b8" }} /> {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", marginTop: 6, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

export default function EstadisticaVendedores() {
  const toast = useToast();
  const now = new Date();
  const [mesSel, setMesSel] = useState(now.getMonth() + 1);
  const [anioSel, setAnioSel] = useState(now.getFullYear());
  const [vendedorFiltro, setVendedorFiltro] = useState("todos");
  const [vendedores, setVendedores] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({}); // key -> porcentaje string en edición

  const keyOf = (f) => `${f.vendedor.toLowerCase()}|${f.fecha}`;
  const r2 = (x) => Math.round((x || 0) * 100) / 100;
  const calcTotales = (filas) => {
    const total_comision = filas.reduce((a, f) => a + f.comision, 0);
    const pagado = filas.reduce((a, f) => a + (f.pagada ? f.comision : 0), 0);
    return { total_ventas: r2(filas.reduce((a, f) => a + f.total_ventas, 0)), total_comision: r2(total_comision), pagado: r2(pagado), pendiente: r2(total_comision - pagado), dias_vendedor: filas.length };
  };

  const load = useCallback(() => {
    setLoading(true);
    const { desde, hasta } = rangoDe("mes", mesSel, anioSel);
    api.get("/estadisticas/vendedores", { params: { desde, hasta } })
      .then((r) => { setData(r.data); setEdits({}); })
      .catch(() => toast.show("Error al cargar las comisiones", "error"))
      .finally(() => setLoading(false));
  }, [mesSel, anioSel, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get("/vendedores/sugerencias").then((r) => setVendedores(r.data?.vendedores || [])).catch(() => {});
  }, []);

  const guardarPorcentaje = async (f, valor) => {
    const porc = valor === "" ? 0 : Math.min(Math.max(parseFloat(valor) || 0, 0), 100);
    setData((d) => {
      const filas = d.filas.map((x) => keyOf(x) === keyOf(f) ? { ...x, porcentaje: porc, comision: Math.round(x.total_ventas * porc) / 100 } : x);
      return { ...d, filas, totales: calcTotales(filas) };
    });
    try {
      await api.post("/estadisticas/vendedores/comision", { vendedor: f.vendedor, fecha: f.fecha, porcentaje: porc });
    } catch {
      toast.show("Error al guardar el porcentaje", "error");
      load();
    }
  };

  const togglePagada = async (f) => {
    const nueva = !f.pagada;
    setData((d) => {
      const filas = d.filas.map((x) => keyOf(x) === keyOf(f) ? { ...x, pagada: nueva } : x);
      return { ...d, filas, totales: calcTotales(filas) };
    });
    try {
      await api.post("/estadisticas/vendedores/comision", { vendedor: f.vendedor, fecha: f.fecha, pagada: nueva });
      toast.show(nueva ? "Comisión marcada como pagada" : "Comisión marcada como pendiente");
    } catch {
      toast.show("Error al actualizar el estado", "error");
      load();
    }
  };

  const filasAll = data?.filas || [];
  const filas = vendedorFiltro === "todos" ? filasAll : filasAll.filter((f) => f.vendedor.toLowerCase() === vendedorFiltro);
  const totales = calcTotales(filas);

  return (
    <div data-testid="estadistica-vendedores-page" style={{ padding: "4px 2px" }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <HandCoins size={24} style={{ color: "#16a34a" }} /> Estadísticas de vendedor
        </h1>
        <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
          Ventas diarias por vendedor. Coloca el % de comisión del día, mira cuánto pagar y marca cuando ya pagaste.
        </p>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 5 }}>Vendedor</label>
          <select className="input" value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)} data-testid="ev-filtro-vendedor" style={{ width: "100%", padding: "8px 10px", fontWeight: 600 }}>
            <option value="todos">Todos los vendedores</option>
            {vendedores.map((v) => <option key={v} value={v.toLowerCase()}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 5 }}>Mes</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select className="input" value={mesSel} onChange={(e) => setMesSel(Number(e.target.value))} data-testid="ev-select-mes" style={{ flex: 1, padding: "8px 10px", fontWeight: 600 }}>
              {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select className="input" value={anioSel} onChange={(e) => setAnioSel(Number(e.target.value))} data-testid="ev-select-anio" style={{ width: 100, padding: "8px 10px", fontWeight: 600 }}>
              {Array.from({ length: 7 }, (_, i) => now.getFullYear() - i).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: "#94a3b8" }}>Cargando...</div>
      ) : filas.length === 0 ? (
        <div data-testid="ev-vacio" style={{ padding: 40, textAlign: "center", color: "#94a3b8", background: "#fff", border: "1px dashed #e2e8f0", borderRadius: 14, marginTop: 14 }}>
          {vendedorFiltro === "todos" ? "No hay ventas con vendedor en este mes." : "Este vendedor no tiene ventas en este mes."}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "16px 0" }}>
            <Card icon={DollarSign} label="Ventas totales" value={fmtMoney(totales.total_ventas)} color="#0ea5e9" testid="ev-card-ventas" />
            <Card icon={HandCoins} label="Comisiones" value={fmtMoney(totales.total_comision)} color="#16a34a" testid="ev-card-comision" />
            <Card icon={CheckCircle2} label="Pagado" value={fmtMoney(totales.pagado)} color="#15803d" testid="ev-card-pagado" />
            <Card icon={Clock} label="Pendiente" value={fmtMoney(totales.pendiente)} color="#dc2626" testid="ev-card-pendiente" />
          </div>

          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
            <div style={{ overflowX: "auto" }}>
              <table className="table" style={{ minWidth: 820 }} data-testid="ev-tabla">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Vendedor</th>
                    <th style={{ textAlign: "center" }}>Ventas del día</th>
                    <th style={{ textAlign: "center" }}>Cestas</th>
                    <th style={{ textAlign: "center", width: 120 }}>% comisión</th>
                    <th style={{ textAlign: "center" }}>Comisión a pagar</th>
                    <th style={{ textAlign: "center" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f, i) => {
                    const k = keyOf(f);
                    const porcShown = edits[k] !== undefined ? edits[k] : (f.porcentaje || "");
                    return (
                      <tr key={k} data-testid={`ev-fila-${i}`} style={{ background: f.pagada ? "#f0fdf4" : "transparent" }}>
                        <td style={{ color: "#475569", fontSize: 13, whiteSpace: "nowrap" }}>{f.fecha}</td>
                        <td style={{ fontWeight: 700, color: "#0f172a" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <UserCircle size={14} style={{ color: "#c2410c" }} /> {f.vendedor}
                          </span>
                          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{f.transacciones} venta(s)</div>
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 700, color: "#0369a1" }}>{fmtMoney(f.total_ventas)}</td>
                        <td style={{ textAlign: "center", color: "#475569" }}>{fmtNum(f.cestas)}</td>
                        <td style={{ textAlign: "center" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            <input type="number" step="0.5" min="0" max="100" className="input"
                              style={{ width: 72, textAlign: "center", padding: "6px 6px", borderColor: (f.porcentaje || 0) > 0 ? "#86efac" : undefined }}
                              value={porcShown}
                              onChange={(e) => setEdits((ed) => ({ ...ed, [k]: e.target.value }))}
                              onBlur={(e) => { guardarPorcentaje(f, e.target.value); setEdits((ed) => { const n = { ...ed }; delete n[k]; return n; }); }}
                              placeholder="0" data-testid={`ev-porcentaje-${i}`} />
                            <Percent size={13} style={{ color: "#94a3b8" }} />
                          </div>
                        </td>
                        <td style={{ textAlign: "center", fontWeight: 800, color: f.comision > 0 ? "#16a34a" : "#cbd5e1", fontSize: 15 }} data-testid={`ev-comision-${i}`}>
                          {fmtMoney(f.comision)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button onClick={() => togglePagada(f)} data-testid={`ev-pagar-${i}`}
                            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid", cursor: "pointer", fontWeight: 700, fontSize: 12.5,
                              borderColor: f.pagada ? "#16a34a" : "#e2e8f0", background: f.pagada ? "#dcfce7" : "#fff", color: f.pagada ? "#15803d" : "#64748b",
                              display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {f.pagada ? <><CheckCircle2 size={14} /> Pagada</> : "Marcar pagada"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
