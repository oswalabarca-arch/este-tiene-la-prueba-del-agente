import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Plus, Pencil, Trash2, Home, Truck, DollarSign, Snowflake, AlertCircle, Heart, TrendingUp, Wallet, AlertTriangle, Filter, Search, X, CreditCard, User, Phone } from "lucide-react";
import { todayLocal } from "../lib/dates";
import { PeriodPicker, currentMonthStr, currentYearStr } from "../components/PeriodPicker";
import { DecimalInput } from "../components/DecimalInput";

const TIPO_META = {
  finca: { label: "Venta en finca", icon: Home, color: "#16a34a" },
  ciudad: { label: "Envío a ciudad", icon: Truck, color: "#3b82f6" },
  refrigerar: { label: "Refrigerar", icon: Snowflake, color: "#0ea5e9" },
  descarte: { label: "Descarte", icon: AlertCircle, color: "#dc2626" },
  donaciones: { label: "Donaciones", icon: Heart, color: "#ec4899" },
};

const fmtMoney = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function VentasFinca() { return <Ventas tipo="finca" />; }
export function VentasCiudad() { return <Ventas tipo="ciudad" />; }
export function VentasRefrigerar() { return <Ventas tipo="refrigerar" />; }
export function VentasDescarte() { return <Ventas tipo="descarte" />; }
export function VentasDonaciones() { return <Ventas tipo="donaciones" />; }

function SubCard({ label, value, sub, color }) {
  return (
    <div style={{ background: "#fff", padding: 16, borderRadius: 10, border: "1px solid #bbf7d0" }}>
      <div style={{ color: "#64748b", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 6 }}>{value}</div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

function MoneyCard({ title, icon: Icon, color, value, sub, testid }) {
  return (
    <div className="card" data-testid={testid}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600, color: "#334155" }}>{title}</div>
        <Icon size={18} style={{ color }} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 8 }}>{value}</div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Ventas({ tipo }) {
  const toast = useToast();
  const { canDelete, canEdit } = useAuth();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null); // null=cerrado, {}=nuevo, {...}=editar
  const [unidad, setUnidad] = useState("cestas");
  // Filtros del registro
  const [period, setPeriod] = useState("todo");
  const [mesSel, setMesSel] = useState(currentMonthStr);
  const [anioSel, setAnioSel] = useState(currentYearStr);
  const [search, setSearch] = useState("");
  const [estadoPago, setEstadoPago] = useState("todos");
  const [diasMin, setDiasMin] = useState("");
  const [soloDeudores, setSoloDeudores] = useState(false);
  // Formulario inline + abono
  const emptyNv = { cliente: "", telefono: "", cantidad_cestas: "", precio_unitario: "", abono_inicial: "", fecha: todayLocal(), observaciones: "" };
  const [nv, setNv] = useState(emptyNv);
  const [abonando, setAbonando] = useState(null);
  // Reasignar cestas sobrantes de "Envío a ciudad" a Descarte/Donaciones
  const [reasign, setReasign] = useState({ cantidad: "", destino: "descarte" });
  const [reasignBusy, setReasignBusy] = useState(false);
  // Ajustar saldo disponible (corrige descuadres por ventas históricas sin "recibido")
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteVal, setAjusteVal] = useState("");
  const [ajusteBusy, setAjusteBusy] = useState(false);

  const load = useCallback(() => api.get(`/ventas-${tipo}`).then((r) => setItems(r.data.ventas)), [tipo]);
  useEffect(() => { load(); }, [load]);

  const remove = async (v) => {
    if (!window.confirm("¿Eliminar?")) return;
    await api.delete(`/ventas-${tipo}/${v._id}`);
    toast.show("Eliminada");
    load();
  };

  const meta = TIPO_META[tipo] || TIPO_META.finca;
  const Icon = meta.icon;
  const esIngreso = tipo === "finca" || tipo === "ciudad";  // ventas con $$ (cliente/abono/saldo)
  const esDonacion = tipo === "donaciones";                  // sin dinero (beneficiario/cestas)
  const conPanel = esIngreso || esDonacion;                  // muestran panel + formulario inline + registro
  const persona = esDonacion ? "beneficiario" : "cliente";

  // Separar el stock recibido desde Asignación de destino vs las ventas reales (manuales)
  const realToday = todayLocal();
  const isAsig = (v) => v.origen === "asignacion_destino";
  const esReasig = (v) => v.origen === "reasignacion_salida";       // salida por reasignación
  const esAjusteEntrada = (v) => v.origen === "ajuste_entrada";     // ajuste manual que SUMA
  const esAjusteSalida = (v) => v.origen === "ajuste_salida";       // ajuste manual que RESTA
  const esRecibido = (v) => isAsig(v) || esAjusteEntrada(v);        // entradas de stock
  const esVentaReal = (v) => !esRecibido(v) && !esReasig(v) && !esAjusteSalida(v); // venta/donación real
  const esHoy = (v) => (v.fecha || "").slice(0, 10) === realToday;
  const cestasDe = (v) => v.cantidad_cestas || 0;

  // Total de cestas sobre todos los registros (memoizado para evitar recálculo en cada render)
  const totalCestas = useMemo(() => items.reduce((s, v) => s + (v.cantidad_cestas || 0), 0), [items]);

  // El "Registro" solo debe mostrar ventas/donaciones REALES. Excluye los
  // registros de sistema (asignación, ajustes de saldo y reasignaciones) que
  // no son ventas y descuadraban la suma del registro vs el Disponible acumulado.
  const ventas = items.filter(esVentaReal);    // registro = solo ventas/donaciones reales
  const asignados = items.filter(isAsig);            // solo Asignación de destino (para "Asignado hoy")
  const ventasReales = items.filter(esVentaReal);    // ventas/donaciones reales

  // ACUMULADO (persiste entre días): recibido (asignación + ajustes de entrada)
  // menos vendido/donado/reasignado/ajustes de salida. Es el stock real que arrastra al día siguiente.
  const recibidoTotal = items.filter(esRecibido).reduce((s, v) => s + cestasDe(v), 0);
  const vendidoTotal = ventasReales.reduce((s, v) => s + cestasDe(v), 0);
  const reasignadoTotal = items.filter(esReasig).reduce((s, v) => s + cestasDe(v), 0);
  const ajusteSalidaTotal = items.filter(esAjusteSalida).reduce((s, v) => s + cestasDe(v), 0);
  const disponibleAcum = recibidoTotal - vendidoTotal - reasignadoTotal - ajusteSalidaTotal;

  // Actividad del día (bloque "Acumulado de hoy")
  const asignadoHoy = asignados.filter(esHoy).reduce((s, v) => s + cestasDe(v), 0);
  const movAsignadoHoy = asignados.filter(esHoy).length;
  const ventasHoy = ventas.filter(esHoy);
  const vendidoHoyCestas = ventasReales.filter(esHoy).reduce((s, v) => s + cestasDe(v), 0);
  const ventasHoyReales = ventasReales.filter(esHoy);
  const reasignadoHoy = items.filter((v) => esReasig(v) && esHoy(v)).reduce((s, v) => s + cestasDe(v), 0);
  const disponibleHoy = asignadoHoy - vendidoHoyCestas - reasignadoHoy;

  // El "disponible" que habilita vender/reasignar es el ACUMULADO (para poder
  // sacar las cestas que quedaron de días anteriores).
  const disponible = disponibleAcum;

  // Estado de pago y días endeudado
  const saldoDe = (v) => (v.total || 0) - (v.abono_inicial || 0);
  const estadoDe = (v) => {
    if (saldoDe(v) <= 0.001) return "pagado";
    if ((v.abono_inicial || 0) > 0.001) return "parcial";
    return "sin_abonar";
  };
  const diasEndeudado = (v) => {
    if (saldoDe(v) <= 0.001) return 0;
    const d = Math.floor((new Date() - new Date(v.fecha)) / 86400000);
    return Math.max(0, d);
  };

  // Años disponibles para el selector (derivados de los datos + año actual)
  const yearSet = new Set(items.map((v) => (v.fecha || "").slice(0, 4)).filter(Boolean));
  yearSet.add(currentYearStr());
  const years = [...yearSet].sort((a, b) => b.localeCompare(a));

  // Aplicar filtros del registro
  const ventasFiltradas = ventas.filter((v) => {
    const f = new Date(v.fecha);
    const now = new Date();
    if (period === "hoy" && (v.fecha || "").slice(0, 10) !== realToday) return false;
    if (period === "semana" && (now - f) / 86400000 > 7) return false;
    if (period === "mes" && (v.fecha || "").slice(0, 7) !== mesSel) return false;
    if (period === "año" && (v.fecha || "").slice(0, 4) !== anioSel) return false;
    if (search && !`${v.cliente || ""} ${v.telefono || ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (estadoPago !== "todos" && estadoDe(v) !== estadoPago) return false;
    if (diasMin && diasEndeudado(v) < Number(diasMin)) return false;
    if (soloDeudores && saldoDe(v) <= 0.001) return false;
    return true;
  });

  // Dinero (sobre la vista filtrada; "vendido hoy" siempre es hoy)
  const vendidoHoyDinero = ventasHoy.reduce((s, v) => s + (v.total || 0), 0);
  const totalVendido = ventasFiltradas.reduce((s, v) => s + (v.total || 0), 0);
  const cobrado = ventasFiltradas.reduce((s, v) => s + (v.abono_inicial || 0), 0);
  const deuda = ventasFiltradas.reduce((s, v) => s + Math.max(saldoDe(v), 0), 0);
  const deudores = ventasFiltradas.filter((v) => saldoDe(v) > 0.001).length;
  const pctCobrado = totalVendido > 0 ? (cobrado / totalVendido) * 100 : 0;

  const factor = unidad === "kg" ? 14 : 1;
  const u = unidad === "kg" ? "kg" : "cestas";
  const fc = (cestas) => `${(cestas * factor).toFixed(2)} ${u}`;

  const nvTotal = Number(nv.cantidad_cestas || 0) * Number(nv.precio_unitario || 0);
  const nvSaldo = nvTotal - Number(nv.abono_inicial || 0);
  const numv = (v) => (v === 0 || v === "" || v == null ? "" : v);

  const registrarVenta = async () => {
    if (!nv.cliente.trim()) { toast.show(esDonacion ? "Ingresa el beneficiario" : "Ingresa el nombre del cliente", "error"); return; }
    if (!Number(nv.cantidad_cestas)) { toast.show("La cantidad de cestas es obligatoria", "error"); return; }
    if (esIngreso && !Number(nv.precio_unitario)) { toast.show("El precio por cesta es obligatorio", "error"); return; }
    if (Number(nv.cantidad_cestas) > disponible + 0.001) {
      toast.show(
        disponible <= 0.001
          ? `No hay cestas disponibles. Asigná cestas desde "Asignación de destino" antes de ${esDonacion ? "donar" : "vender"}.`
          : `Solo hay ${disponible.toFixed(2)} cesta(s) disponible(s). No podés ${esDonacion ? "donar" : "vender"} más de lo disponible.`,
        "error"
      );
      return;
    }
    await api.post(`/ventas-${tipo}`, {
      fecha: nv.fecha + "T12:00:00.000Z",
      cantidad_cestas: Number(nv.cantidad_cestas),
      cantidad_kg: Number(nv.cantidad_cestas) * 14,
      precio_unitario: esDonacion ? 0 : Number(nv.precio_unitario),
      total: esDonacion ? 0 : nvTotal,
      cliente: nv.cliente,
      telefono: nv.telefono,
      abono_inicial: esDonacion ? 0 : Number(nv.abono_inicial || 0),
      observaciones: nv.observaciones,
    });
    toast.show(esDonacion ? "Donación registrada" : "Venta registrada");
    setNv(emptyNv);
    load();
  };

  const registrarAbono = async (monto) => {
    const v = abonando;
    const nuevo = Math.min((v.abono_inicial || 0) + Number(monto), v.total || 0);
    await api.put(`/ventas-${tipo}/${v._id}`, {
      fecha: v.fecha, cantidad_cestas: v.cantidad_cestas, cantidad_kg: v.cantidad_kg,
      precio_unitario: v.precio_unitario, total: v.total, cliente: v.cliente,
      telefono: v.telefono, abono_inicial: nuevo, observaciones: v.observaciones,
    });
    toast.show("Abono registrado");
    setAbonando(null);
    load();
  };

  const limpiarFiltros = () => { setPeriod("todo"); setSearch(""); setEstadoPago("todos"); setDiasMin(""); setSoloDeudores(false); };

  const abrirAjuste = () => { setAjusteVal(disponibleAcum > 0 ? String(Number(disponibleAcum.toFixed(2))) : "0"); setAjusteOpen(true); };

  const guardarAjuste = async () => {
    const val = Number(ajusteVal);
    if (ajusteVal === "" || Number.isNaN(val) || val < 0) { toast.show("Ingresa un saldo disponible válido (0 o mayor)", "error"); return; }
    setAjusteBusy(true);
    try {
      const r = await api.post(`/ventas-${tipo}/ajuste-saldo`, { cantidad_cestas: val });
      toast.show(r.data?.sin_cambios ? "El saldo ya era correcto" : `Saldo disponible ajustado a ${val} cestas`);
      setAjusteOpen(false);
      load();
    } catch (err) {
      toast.show(err?.response?.data?.detail || "Error al ajustar el saldo", "error");
    } finally {
      setAjusteBusy(false);
    }
  };

  const reasignarSobrantes = async () => {
    const cant = Number(reasign.cantidad);
    if (!cant || cant <= 0) { toast.show("Ingresa la cantidad de cestas a reasignar", "error"); return; }
    if (cant > disponible + 0.001) { toast.show(`Solo hay ${disponible.toFixed(2)} cesta(s) disponible(s) para reasignar`, "error"); return; }
    setReasignBusy(true);
    try {
      await api.post("/ventas-ciudad/reasignar", { cantidad_cestas: cant, destino: reasign.destino, fecha: realToday });
      toast.show(`${cant} cesta(s) reasignada(s) a ${{ descarte: "Descarte", donaciones: "Donaciones", refrigerar: "Refrigerar" }[reasign.destino]}`);
      setReasign({ cantidad: "", destino: reasign.destino });
      load();
    } catch (err) {
      toast.show(err?.response?.data?.detail || "Error al reasignar", "error");
    } finally {
      setReasignBusy(false);
    }
  };

  const rows = conPanel ? ventasFiltradas : items;

  return (
    <div data-testid={`ventas-${tipo}-page`}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}><Icon size={24} style={{ verticalAlign: "middle", color: meta.color }} /> {meta.label}</h1>
          <p className="page-subtitle" style={{ marginTop: 4 }}>{esIngreso ? "Registro de ventas directas con seguimiento de abonos y saldos pendientes." : esDonacion ? "Registro de donaciones de fruta a beneficiarios." : `Registro de ${meta.label.toLowerCase()} (sin valor de venta).`}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {conPanel && (
            <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {["cestas", "kg"].map((opt) => (
                <button key={opt} type="button"
                  onClick={() => setUnidad(opt)}
                  data-testid={`ventas-toggle-${opt}`}
                  style={{ padding: "8px 16px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                    background: unidad === opt ? meta.color : "#fff", color: unidad === opt ? "#fff" : "#64748b" }}>
                  {opt === "cestas" ? "Cestas" : "kg"}
                </button>
              ))}
            </div>
          )}
          {!conPanel && (
            <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="venta-new-btn"><Plus size={16} /> Nuevo registro</button>
          )}
        </div>
      </div>

      {conPanel && (
        <>
          {/* Acumulado de hoy */}
          <div className="card" style={{ background: "#f0fdf4", borderColor: "#bbf7d0", marginBottom: 16 }} data-testid="ventas-acumulado-hoy">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div className="kpi-icon-box" style={{ background: "#dcfce7", color: "#16a34a", width: 44, height: 44 }}><Icon size={20} /></div>
                <div>
                  <h3 style={{ margin: 0, color: "#15803d" }}>● Acumulado de hoy · {meta.label}</h3>
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 2, maxWidth: 620 }}>
                    {realToday} · Movimientos del día desde "Asignación de destino". El <b>Disponible acumulado</b> conserva las cestas que no {esDonacion ? "donaste" : "vendiste"} y las arrastra al día siguiente hasta que las saques.
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: disponibleAcum < -0.001 ? "#dc2626" : disponibleAcum > 0.001 ? "#15803d" : "#94a3b8" }} data-testid="ventas-disponible-grande">{fc(disponibleAcum)}</div>
                <div style={{ color: "#15803d", fontSize: 12, fontWeight: 600 }}>Disponible acumulado</div>
                <div style={{ color: "#94a3b8", fontSize: 11 }}>arrastra al día siguiente</div>
                {canEdit("ventas") && (
                  <button className="btn" style={{ marginTop: 8, fontSize: 12, padding: "4px 10px" }} onClick={abrirAjuste} data-testid="ajuste-saldo-btn"><Wallet size={13} /> Ajustar saldo</button>
                )}
              </div>
            </div>
            {ajusteOpen && (
              <div style={{ marginTop: 14, padding: 14, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10 }} data-testid="ajuste-saldo-form">
                <div style={{ fontWeight: 700, color: "#92400e", marginBottom: 4 }}>Ajustar saldo disponible</div>
                <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12, maxWidth: 640 }}>
                  Escribí cuántas cestas tenés <b>realmente disponibles</b> en este módulo ahora. El sistema creará un ajuste para que el "Disponible acumulado" quede en ese número. Útil si hay ventas viejas sin un "recibido" que las respalde.
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                  <div className="field" style={{ margin: 0 }}>
                    <label>Disponible real (cestas)</label>
                    <DecimalInput type="number" step="0.01" min="0" className="input" placeholder="0" value={ajusteVal} onChange={(e) => setAjusteVal(e.target.value)} data-testid="ajuste-saldo-input" />
                  </div>
                  <button className="btn btn-primary" style={{ background: "#d97706", borderColor: "#d97706" }} onClick={guardarAjuste} disabled={ajusteBusy} data-testid="ajuste-saldo-guardar">{ajusteBusy ? "..." : "Guardar ajuste"}</button>
                  <button className="btn" onClick={() => setAjusteOpen(false)} data-testid="ajuste-saldo-cancelar">Cancelar</button>
                </div>
              </div>
            )}
            <div className="kpi-grid" style={{ marginTop: 16, gridTemplateColumns: tipo === "ciudad" ? "repeat(4, 1fr)" : "repeat(3, 1fr)" }}>
              <SubCard label="Asignado hoy" value={fc(asignadoHoy)} sub={`${movAsignadoHoy} movimiento(s) desde Asignación de destino`} color="#16a34a" />
              <SubCard label={esDonacion ? "Donado hoy" : "Vendido hoy"} value={fc(vendidoHoyCestas)} sub={`${ventasHoyReales.length} ${esDonacion ? "donación(es)" : "venta(s)"} hoy`} color="#3b82f6" />
              {tipo === "ciudad" && (
                <SubCard label="Reasignado hoy" value={fc(reasignadoHoy)} sub="Enviado a Descarte / Donaciones / Refrigerar" color="#ea580c" />
              )}
              <SubCard label="Disponible hoy" value={fc(disponibleHoy)} sub="De lo asignado hoy" color={disponibleHoy < -0.001 ? "#dc2626" : disponibleHoy > 0.001 ? "#16a34a" : "#94a3b8"} />
            </div>
          </div>

          {/* Barra de dinero (solo ventas) */}
          {esIngreso && (
          <div className="kpi-grid" style={{ marginBottom: 16, gridTemplateColumns: "repeat(4, 1fr)" }}>
            <MoneyCard title="Vendido (hoy)" icon={TrendingUp} color="#16a34a" value={fmtMoney(vendidoHoyDinero)} sub={`${vendidoHoyCestas.toFixed(2)} cestas en ${ventasHoyReales.length} venta(s)`} testid="money-vendido-hoy" />
            <MoneyCard title="Total vendido" icon={DollarSign} color="#0f172a" value={fmtMoney(totalVendido)} sub={`${ventasFiltradas.length} venta(s) en vista`} testid="money-total-vendido" />
            <MoneyCard title="Cobrado" icon={Wallet} color="#3b82f6" value={fmtMoney(cobrado)} sub={`${pctCobrado.toFixed(1)}% del total`} testid="money-cobrado" />
            <MoneyCard title="Saldo / Deuda" icon={AlertTriangle} color="#dc2626" value={fmtMoney(deuda)} sub={`${deudores} deudor(es)`} testid="money-deuda" />
          </div>
          )}
        </>
      )}

      {!conPanel && (
        <div className="kpi-grid" style={{ marginBottom: 18 }}>
          <div className="card kpi-card"><div className="kpi-label">Total registros</div><div className="kpi-value">{items.length}</div></div>
          <div className="card kpi-card"><div className="kpi-label">Cestas</div><div className="kpi-value" style={{ color: meta.color }}>{totalCestas.toFixed(2)}</div></div>
        </div>
      )}

      {esIngreso ? (
        <>
          {/* Registrar nueva venta (inline) */}
          <div className="card" style={{ background: "#f0fdf4", borderColor: "#bbf7d0", marginBottom: 16 }} data-testid="registrar-venta-card">
            <h3 style={{ margin: 0, color: "#15803d", display: "flex", alignItems: "center", gap: 8 }}><Plus size={18} /> Registrar nueva venta</h3>
            <div style={{ color: "#64748b", fontSize: 13, margin: "4px 0 16px" }}>Completá los campos y pulsá "Registrar". La venta se agrega al registro de abajo.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <div className="field"><label>Nombre del cliente *</label><input className="input" placeholder="Ej: Juan Pérez" value={nv.cliente} onChange={(e) => setNv({ ...nv, cliente: e.target.value })} data-testid="nv-cliente" /></div>
              <div className="field"><label>Teléfono</label><input className="input" placeholder="Ej: 0414-1234567" value={nv.telefono} onChange={(e) => setNv({ ...nv, telefono: e.target.value })} data-testid="nv-telefono" /></div>
              <div className="field"><label>Cantidad de cestas *</label><DecimalInput type="number" step="0.01" min="0" className="input" placeholder="0" value={numv(nv.cantidad_cestas)} onChange={(e) => setNv({ ...nv, cantidad_cestas: e.target.value })} data-testid="nv-cestas" /></div>
              <div className="field"><label>Precio por cesta *</label><DecimalInput type="number" step="0.01" min="0" className="input" placeholder="0.00" value={numv(nv.precio_unitario)} onChange={(e) => setNv({ ...nv, precio_unitario: e.target.value })} data-testid="nv-precio" /></div>
              <div className="field"><label>Abono inicial</label><DecimalInput type="number" step="0.01" min="0" className="input" placeholder="0.00" value={numv(nv.abono_inicial)} onChange={(e) => setNv({ ...nv, abono_inicial: e.target.value })} data-testid="nv-abono" /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1.2fr", gap: 12, marginTop: 12, alignItems: "end" }}>
              <div className="field" style={{ margin: 0 }}><label>Fecha</label><input type="date" className="input" value={nv.fecha} onChange={(e) => setNv({ ...nv, fecha: e.target.value })} data-testid="nv-fecha" /></div>
              <div className="field" style={{ margin: 0 }}><label>Observaciones</label><input className="input" placeholder="Notas opcionales..." value={nv.observaciones} onChange={(e) => setNv({ ...nv, observaciones: e.target.value })} data-testid="nv-obs" /></div>
              <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#64748b" }}>Total:</span><b>{fmtMoney(nvTotal)}</b></div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}><span style={{ color: "#64748b" }}>Saldo:</span><b style={{ color: nvSaldo > 0.001 ? "#dc2626" : "#16a34a" }}>{fmtMoney(nvSaldo)}</b></div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn" onClick={() => setNv(emptyNv)} data-testid="nv-limpiar">Limpiar</button>
              <button className="btn btn-primary" onClick={registrarVenta} disabled={disponible <= 0.001} data-testid="nv-registrar"><Plus size={16} /> Registrar</button>
              {disponible <= 0.001 && <span style={{ color: "#dc2626", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}><AlertCircle size={14} /> Sin cestas disponibles. Asigná desde "Asignación de destino".</span>}
            </div>
          </div>

          {/* Reasignar cestas sobrantes (solo Envío a ciudad) */}
          {tipo === "ciudad" && disponible > 0.001 && (
            <div className="card" style={{ background: "#fff7ed", borderColor: "#fed7aa", marginBottom: 16 }} data-testid="reasignar-card">
              <h3 style={{ margin: 0, color: "#c2410c", display: "flex", alignItems: "center", gap: 8 }}><Truck size={18} /> Reasignar cestas sobrantes</h3>
              <div style={{ color: "#64748b", fontSize: 13, margin: "4px 0 16px" }}>
                Quedan <b style={{ color: "#c2410c" }}>{fc(disponible)}</b> sin vender. Podés enviarlas a Descarte, Donaciones o Refrigerar.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, alignItems: "end" }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Cantidad de cestas</label>
                  <DecimalInput type="number" step="0.01" min="0" className="input" placeholder="0" value={reasign.cantidad} onChange={(e) => setReasign({ ...reasign, cantidad: e.target.value })} data-testid="reasign-cantidad" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Destino</label>
                  <select className="select" value={reasign.destino} onChange={(e) => setReasign({ ...reasign, destino: e.target.value })} data-testid="reasign-destino">
                    <option value="descarte">Descarte</option>
                    <option value="donaciones">Donaciones</option>
                    <option value="refrigerar">Refrigerar</option>
                  </select>
                </div>
                <button className="btn btn-primary" style={{ background: "#ea580c", borderColor: "#ea580c" }} onClick={reasignarSobrantes} disabled={reasignBusy} data-testid="reasign-btn">
                  {reasignBusy ? "..." : "Reasignar"}
                </button>
              </div>
            </div>
          )}

          {/* Filtros del registro */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Filter size={16} /> Filtros del registro</h3>
            <div style={{ color: "#64748b", fontSize: 13, margin: "4px 0 14px" }}>Acotá la lista por cliente, estado de pago, deuda o período.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {[["todo", "Todo"], ["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"], ["año", "Este año"]].map(([val, lbl]) => (
                <button key={val} type="button" className="btn btn-sm" onClick={() => setPeriod(val)}
                  data-testid={`filtro-periodo-${val}`}
                  style={{ background: period === val ? "#16a34a" : "#fff", color: period === val ? "#fff" : "#334155", borderColor: period === val ? "#16a34a" : "var(--border)" }}>
                  {lbl}
                </button>
              ))}
              <PeriodPicker isMonth={period === "mes"} isYear={period === "año"} mes={mesSel} setMes={setMesSel} anio={anioSel} setAnio={setAnioSel} years={years} testidPrefix="ventas" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
              <div className="field" style={{ margin: 0 }}><label>Buscar (nombre o teléfono)</label>
                <div style={{ position: "relative" }}>
                  <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
                  <input className="input" style={{ paddingLeft: 32 }} placeholder="Ej: Juan o 0414..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="filtro-buscar" />
                </div>
              </div>
              <div className="field" style={{ margin: 0 }}><label>Estado de pago</label>
                <select className="select" value={estadoPago} onChange={(e) => setEstadoPago(e.target.value)} data-testid="filtro-estado">
                  <option value="todos">Todos</option>
                  <option value="sin_abonar">Sin abonar</option>
                  <option value="parcial">Abono parcial</option>
                  <option value="pagado">Pagado</option>
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}><label>Días endeudado (mínimo)</label><input type="number" min="0" className="input" placeholder="Ej: 30" value={diasMin} onChange={(e) => setDiasMin(e.target.value)} data-testid="filtro-dias" /></div>
              <div className="field" style={{ margin: 0 }}><label>Sólo deudores</label>
                <button type="button" onClick={() => setSoloDeudores((s) => !s)} data-testid="filtro-deudores"
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "#fff", cursor: "pointer", width: "100%" }}>
                  <span style={{ width: 36, height: 20, borderRadius: 999, background: soloDeudores ? "#16a34a" : "#cbd5e1", position: "relative", flexShrink: 0 }}>
                    <span style={{ position: "absolute", top: 2, left: soloDeudores ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
                  </span>
                  <span style={{ color: "#334155" }}>{soloDeudores ? "Activo" : "Inactivo"}</span>
                </button>
              </div>
              <button className="btn" onClick={limpiarFiltros} data-testid="filtro-limpiar"><X size={15} /> Limpiar</button>
            </div>
          </div>

          {/* Registro de Ventas */}
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 2 }}>Registro de Ventas</h3>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>{ventasFiltradas.length} venta(s) · {deudores} con saldo pendiente</div>
            <table className="table">
              <thead><tr><th>Cliente</th><th>Teléfono</th><th>Cestas</th><th>Precio/cesta</th><th>Total</th><th>Abono</th><th>Saldo</th><th>Fecha</th><th>Días</th><th>Estado</th><th style={{ textAlign: "right" }}>Acciones</th></tr></thead>
              <tbody>
                {rows.map((v) => {
                  const saldo = saldoDe(v);
                  const est = estadoDe(v);
                  const estBadge = est === "pagado" ? { t: "Pagado", bg: "#dcfce7", c: "#15803d" } : est === "parcial" ? { t: "Abono parcial", bg: "#fef3c7", c: "#b45309" } : { t: "Sin abonar", bg: "#fee2e2", c: "#dc2626" };
                  return (
                    <tr key={v._id} data-testid="venta-row">
                      <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><User size={14} style={{ color: "#94a3b8" }} /> {v.cliente || "—"}</span></td>
                      <td>{v.telefono ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Phone size={13} style={{ color: "#94a3b8" }} /> {v.telefono}</span> : "—"}</td>
                      <td>{v.cantidad_cestas}</td>
                      <td>{fmtMoney(v.precio_unitario)}</td>
                      <td style={{ fontWeight: 700 }}>{fmtMoney(v.total)}</td>
                      <td style={{ color: "#3b82f6" }}>{fmtMoney(v.abono_inicial || 0)}</td>
                      <td style={{ color: saldo > 0.001 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>{fmtMoney(saldo)}</td>
                      <td>{(v.fecha || "").slice(0, 10)}</td>
                      <td><span className="badge" style={{ background: "#f1f5f9", color: "#475569" }}>{diasEndeudado(v)}d</span></td>
                      <td><span className="badge" style={{ background: estBadge.bg, color: estBadge.c }}>{estBadge.t}</span></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                        {est !== "pagado" && <button className="btn-icon" style={{ color: "#3b82f6" }} title="Registrar abono" onClick={() => setAbonando(v)} data-testid="venta-abonar"><CreditCard size={16} /></button>}
                        {canEdit("ventas") && <button className="btn-icon" style={{ color: "#f59e0b" }} title="Editar" onClick={() => setEditing(v)}><Pencil size={16} /></button>}
                        {canDelete("ventas") && <button className="btn-icon" style={{ color: "#dc2626" }} title="Eliminar" onClick={() => remove(v)}><Trash2 size={16} /></button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <div className="empty-state">Sin ventas en el registro. Registrá una arriba.</div>}
          </div>
        </>
      ) : esDonacion ? (
        <>
          {/* Registrar nueva donación (inline) */}
          <div className="card" style={{ background: "#fdf2f8", borderColor: "#fbcfe8", marginBottom: 16 }} data-testid="registrar-donacion-card">
            <h3 style={{ margin: 0, color: "#be185d", display: "flex", alignItems: "center", gap: 8 }}><Plus size={18} /> Registrar nueva donación</h3>
            <div style={{ color: "#64748b", fontSize: 13, margin: "4px 0 16px" }}>Completá los campos y pulsá "Registrar". La donación se agrega al registro de abajo (sin valor de venta).</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <div className="field"><label>Beneficiario *</label><input className="input" placeholder="Ej: Comedor San José" value={nv.cliente} onChange={(e) => setNv({ ...nv, cliente: e.target.value })} data-testid="nv-beneficiario" /></div>
              <div className="field"><label>Teléfono</label><input className="input" placeholder="Ej: 0414-1234567" value={nv.telefono} onChange={(e) => setNv({ ...nv, telefono: e.target.value })} data-testid="nv-telefono" /></div>
              <div className="field"><label>Cantidad de cestas *</label><DecimalInput type="number" step="0.01" min="0" className="input" placeholder="0" value={numv(nv.cantidad_cestas)} onChange={(e) => setNv({ ...nv, cantidad_cestas: e.target.value })} data-testid="nv-cestas" /></div>
              <div className="field"><label>Fecha</label><input type="date" className="input" value={nv.fecha} onChange={(e) => setNv({ ...nv, fecha: e.target.value })} data-testid="nv-fecha" /></div>
            </div>
            <div className="field" style={{ marginTop: 12 }}><label>Observaciones</label><input className="input" placeholder="Notas opcionales..." value={nv.observaciones} onChange={(e) => setNv({ ...nv, observaciones: e.target.value })} data-testid="nv-obs" /></div>
            <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn" onClick={() => setNv(emptyNv)} data-testid="nv-limpiar">Limpiar</button>
              <button className="btn btn-primary" onClick={registrarVenta} disabled={disponible <= 0.001} data-testid="nv-registrar"><Plus size={16} /> Registrar</button>
              {disponible <= 0.001 && <span style={{ color: "#dc2626", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}><AlertCircle size={14} /> Sin cestas disponibles. Asigná desde "Asignación de destino".</span>}
            </div>
          </div>

          {/* Filtros del registro */}
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}><Filter size={16} /> Filtros del registro</h3>
            <div style={{ color: "#64748b", fontSize: 13, margin: "4px 0 14px" }}>Acotá la lista por beneficiario o período.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {[["todo", "Todo"], ["hoy", "Hoy"], ["semana", "Esta semana"], ["mes", "Este mes"], ["año", "Este año"]].map(([val, lbl]) => (
                <button key={val} type="button" className="btn btn-sm" onClick={() => setPeriod(val)}
                  data-testid={`filtro-periodo-${val}`}
                  style={{ background: period === val ? "#16a34a" : "#fff", color: period === val ? "#fff" : "#334155", borderColor: period === val ? "#16a34a" : "var(--border)" }}>
                  {lbl}
                </button>
              ))}
              <PeriodPicker isMonth={period === "mes"} isYear={period === "año"} mes={mesSel} setMes={setMesSel} anio={anioSel} setAnio={setAnioSel} years={years} testidPrefix="ventas" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
              <div className="field" style={{ margin: 0 }}><label>Buscar (beneficiario o teléfono)</label>
                <div style={{ position: "relative" }}>
                  <Search size={15} style={{ position: "absolute", left: 10, top: 11, color: "#94a3b8" }} />
                  <input className="input" style={{ paddingLeft: 32 }} placeholder="Ej: Comedor o 0414..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="filtro-buscar" />
                </div>
              </div>
              <button className="btn" onClick={limpiarFiltros} data-testid="filtro-limpiar"><X size={15} /> Limpiar</button>
            </div>
          </div>

          {/* Registro de Donaciones */}
          <div className="card">
            <h3 style={{ marginTop: 0, marginBottom: 2 }}>Registro de Donaciones</h3>
            <div style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>{ventasFiltradas.length} donación(es)</div>
            <table className="table">
              <thead><tr><th>Beneficiario</th><th>Teléfono</th><th>Cestas</th><th>kg</th><th>Fecha</th><th>Observaciones</th><th style={{ textAlign: "right" }}>Acciones</th></tr></thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v._id} data-testid="donacion-row">
                    <td><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><User size={14} style={{ color: "#94a3b8" }} /> {v.cliente || "—"}</span></td>
                    <td>{v.telefono ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Phone size={13} style={{ color: "#94a3b8" }} /> {v.telefono}</span> : "—"}</td>
                    <td>{v.cantidad_cestas}</td>
                    <td>{v.cantidad_kg}</td>
                    <td>{(v.fecha || "").slice(0, 10)}</td>
                    <td>{v.observaciones || "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {canEdit("ventas") && <button className="btn-icon" style={{ color: "#f59e0b" }} title="Editar" onClick={() => setEditing(v)}><Pencil size={16} /></button>}
                      {canDelete("ventas") && <button className="btn-icon" style={{ color: "#dc2626" }} title="Eliminar" onClick={() => remove(v)}><Trash2 size={16} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="empty-state">Sin donaciones en el registro. Registrá una arriba.</div>}
          </div>
        </>
      ) : (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Registros</h3>
          <table className="table">
            <thead><tr><th>Fecha</th><th>Cestas</th><th>kg</th><th>Origen</th><th>Observaciones</th><th>Acciones</th></tr></thead>
            <tbody>
              {items.map((v) => (
                <tr key={v._id}>
                  <td>{new Date(v.fecha).toLocaleDateString()}</td>
                  <td>{v.cantidad_cestas}</td>
                  <td>{v.cantidad_kg}</td>
                  <td>{v.origen === "asignacion_destino" ? <span className="badge" style={{ background: "#dcfce7", color: "#15803d" }}>Asignación</span> : <span style={{ color: "#94a3b8", fontSize: 12 }}>Manual</span>}</td>
                  <td>{v.observaciones || "—"}</td>
                  <td>{canDelete("ventas") && <button className="btn-icon" style={{ color: "#dc2626" }} onClick={() => remove(v)}><Trash2 size={16} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div className="empty-state">Sin registros</div>}
        </div>
      )}

      {editing && <VentaForm tipo={tipo} initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {abonando && <AbonoModal venta={abonando} onClose={() => setAbonando(null)} onConfirm={registrarAbono} />}
    </div>
  );
}

function AbonoModal({ venta, onClose, onConfirm }) {
  const saldo = (venta.total || 0) - (venta.abono_inicial || 0);
  const [monto, setMonto] = useState("");
  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); if (Number(monto) > 0) onConfirm(monto); }} data-testid="abono-modal">
        <h2 className="modal-title">Registrar abono · {venta.cliente || "Cliente"}</h2>
        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 14 }}>
          Total: <b>{fmtMoney(venta.total)}</b> · Abonado: <b style={{ color: "#3b82f6" }}>{fmtMoney(venta.abono_inicial || 0)}</b> · Saldo: <b style={{ color: "#dc2626" }}>{fmtMoney(saldo)}</b>
        </div>
        <div className="field"><label>Monto del abono ($)</label><DecimalInput type="number" step="0.01" min="0" className="input" placeholder="0.00" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus data-testid="abono-monto" /></div>
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-sm" onClick={() => setMonto(String(saldo.toFixed(2)))}>Pagar todo ({fmtMoney(saldo)})</button>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" data-testid="abono-confirmar">Registrar abono</button>
        </div>
      </form>
    </div>
  );
}

function VentaForm({ tipo, initial = {}, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = !!initial._id;
  const esDon = tipo === "donaciones";
  const [form, setForm] = useState({
    fecha: (initial.fecha || todayLocal()).slice(0, 10),
    cantidad_cestas: initial.cantidad_cestas ?? 0,
    cantidad_kg: initial.cantidad_kg ?? 0,
    precio_unitario: initial.precio_unitario ?? 0,
    total: initial.total ?? 0,
    cliente: initial.cliente || "",
    telefono: initial.telefono || "",
    abono_inicial: initial.abono_inicial ?? 0,
    observaciones: initial.observaciones || "",
  });
  const [busy, setBusy] = useState(false);

  const num = (v) => (v === 0 || v === "" || v == null ? "" : v);
  const saldo = Number(form.total || 0) - Number(form.abono_inicial || 0);

  const onCestasChange = (v) => {
    setForm((f) => ({ ...f, cantidad_cestas: v, cantidad_kg: Number(v) * 14, total: Number(v) * Number(f.precio_unitario) }));
  };
  const onPrecioChange = (v) => {
    setForm((f) => ({ ...f, precio_unitario: v, total: Number(f.cantidad_cestas) * Number(v) }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...form,
        fecha: form.fecha + "T12:00:00.000Z",
        cantidad_cestas: Number(form.cantidad_cestas),
        cantidad_kg: Number(form.cantidad_kg),
        precio_unitario: esDon ? 0 : Number(form.precio_unitario),
        total: esDon ? 0 : Number(form.total),
        abono_inicial: esDon ? 0 : Number(form.abono_inicial),
      };
      if (isEdit) await api.put(`/ventas-${tipo}/${initial._id}`, payload);
      else await api.post(`/ventas-${tipo}`, payload);
      toast.show(isEdit ? "Registro actualizado" : "Registro creado");
      onSaved();
    } catch { toast.show("Error", "error"); }
    finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="venta-modal">
        <h2 className="modal-title">{isEdit ? (esDon ? "Editar donación" : "Editar registro de venta") : (esDon ? "Nueva donación" : "Nuevo registro de venta")}</h2>
        <div className="form-grid">
          <div className="field"><label>{esDon ? "Beneficiario" : "Nombre del cliente"}</label><input className="input" value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} data-testid="venta-form-cliente" /></div>
          <div className="field"><label>Teléfono</label><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="Ej: 0414-1234567" data-testid="venta-form-telefono" /></div>
          <div className="field"><label>Cantidad de cestas</label><DecimalInput type="number" step="0.01" min="0" className="input" value={num(form.cantidad_cestas)} placeholder="0" onChange={(e) => onCestasChange(e.target.value)} required data-testid="venta-form-cestas" /></div>
          {!esDon && <div className="field"><label>Precio por cesta ($)</label><DecimalInput type="number" step="0.01" min="0" className="input" value={num(form.precio_unitario)} placeholder="0" onChange={(e) => onPrecioChange(e.target.value)} required data-testid="venta-form-precio" /></div>}
          <div className="field"><label>kg (auto)</label><input className="input" value={form.cantidad_kg} readOnly /></div>
          {!esDon && <div className="field"><label>Total (auto)</label><input className="input" value={`$${form.total}`} readOnly data-testid="venta-form-total" /></div>}
          {!esDon && <div className="field"><label>Abono inicial ($)</label><DecimalInput type="number" step="0.01" min="0" className="input" value={num(form.abono_inicial)} placeholder="0" onChange={(e) => setForm({ ...form, abono_inicial: e.target.value })} data-testid="venta-form-abono" /></div>}
          {!esDon && <div className="field"><label>Saldo pendiente (auto)</label><input className="input" value={`$${saldo.toFixed(2)}`} readOnly style={{ color: saldo > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }} data-testid="venta-form-saldo" /></div>}
          <div className="field"><label>Fecha</label><input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required data-testid="venta-form-fecha" /></div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Observaciones</label>
          <textarea className="textarea" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} data-testid="venta-form-observaciones" />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="venta-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

export default Ventas;
