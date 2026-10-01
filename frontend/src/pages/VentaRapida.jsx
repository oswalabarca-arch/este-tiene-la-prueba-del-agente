import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { DecimalInput } from "../components/DecimalInput";
import { ClienteAutocomplete, invalidarClientesCache } from "../components/ClienteAutocomplete";
import { Zap, ShoppingCart, AlertCircle, CheckCircle2 } from "lucide-react";

const KG = 14;
const RECIBIDO = ["asignacion_destino", "ajuste_entrada"];
const CANALES = [
  { key: "finca", label: "Venta en finca", color: "#16a34a" },
  { key: "ciudad", label: "Envío a ciudad", color: "#3b82f6" },
  { key: "refrigerar", label: "Refrigerado", color: "#0ea5e9" },
  { key: "congelar", label: "Congelado", color: "#6366f1" },
];

const fmt = (n) => {
  const [e, d] = Number(n || 0).toFixed(2).split(".");
  return e.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + d;
};
const hoyLocal = () => new Date().toLocaleDateString("en-CA");
// Lunes de la semana actual (YYYY-MM-DD) en hora local
const inicioSemana = () => {
  const d = new Date();
  const dia = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dia);
  return d.toLocaleDateString("en-CA");
};

const emptyForm = { fecha: hoyLocal(), cantidad_cestas: "", precio_unitario: "", cliente: "", telefono: "", abono_inicial: "", observaciones: "" };

export default function VentaRapida() {
  const toast = useToast();
  const { canEdit } = useAuth();
  const editable = canEdit("venta_rapida");
  const [dispon, setDispon] = useState({}); // key -> disponible
  const [ultimas, setUltimas] = useState({}); // key -> [ventas]
  const [canal, setCanal] = useState("finca");
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const calc = (docs) => {
    let rec = 0, usa = 0;
    for (const d of docs) {
      const c = d.cantidad_cestas || 0;
      if (RECIBIDO.includes(d.origen)) rec += c; else usa += c;
    }
    return rec - usa;
  };
  const esVentaReal = (v) => !v.origen && (v.total > 0 || v.cliente);

  const load = useCallback(() => {
    Promise.all(CANALES.map((c) => api.get(`/ventas-${c.key}`).then((r) => [c.key, r.data.ventas || []])))
      .then((pairs) => {
        const dsp = {}, ult = {};
        const desde = inicioSemana();
        for (const [k, docs] of pairs) {
          dsp[k] = calc(docs);
          ult[k] = docs.filter(esVentaReal).filter((v) => (v.fecha || "").slice(0, 10) >= desde).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
        }
        setDispon(dsp); setUltimas(ult);
      }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const disponible = dispon[canal] ?? 0;
  const canalCfg = CANALES.find((c) => c.key === canal);
  const cestas = Number(form.cantidad_cestas || 0);
  const precio = Number(form.precio_unitario || 0);
  const total = useMemo(() => +(cestas * precio).toFixed(2), [cestas, precio]);
  const abono = Number(form.abono_inicial || 0);

  const registrar = async () => {
    if (!(cestas > 0)) { toast.show("Escribe la cantidad de cestas", "error"); return; }
    if (cestas > disponible + 0.001) {
      toast.show(disponible <= 0 ? `No hay cestas disponibles en ${canalCfg.label}. Asígnalas desde "Asignación de destino".` : `Solo hay ${fmt(disponible)} cesta(s) disponibles en ${canalCfg.label}.`, "error");
      return;
    }
    if (abono > total) { toast.show("El abono no puede ser mayor al total", "error"); return; }
    setBusy(true);
    try {
      await api.post(`/ventas-${canal}`, {
        fecha: form.fecha + "T12:00:00.000Z",
        cantidad_cestas: cestas,
        cantidad_kg: cestas * KG,
        precio_unitario: precio,
        total,
        unidad_venta: "cestas",
        cliente: form.cliente,
        telefono: form.telefono,
        abono_inicial: abono,
        observaciones: form.observaciones,
      });
      toast.show(`Venta registrada en ${canalCfg.label}`);
      setForm({ ...emptyForm, fecha: form.fecha });
      invalidarClientesCache();
      load();
    } catch (err) {
      toast.show(err?.response?.data?.detail || "Error al registrar la venta", "error");
    }
    setBusy(false);
  };

  return (
    <div data-testid="venta-rapida-page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Zap size={26} style={{ verticalAlign: "-4px", marginRight: 8, color: "#ea580c" }} />Venta rápida</h1>
          <p className="page-subtitle">Vende las cestas que ya tienes disponibles en cada canal, desde un solo lugar. La cosecha se sigue asignando en "Asignación de destino".</p>
        </div>
      </div>

      {/* Selector de canal con disponibles */}
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 16 }}>
        {CANALES.map((c) => {
          const d = dispon[c.key] ?? 0;
          const activo = canal === c.key;
          return (
            <button key={c.key} type="button" onClick={() => setCanal(c.key)} data-testid={`vr-canal-${c.key}`}
              style={{ textAlign: "left", cursor: "pointer", padding: "14px 16px", borderRadius: 12,
                border: activo ? `2px solid ${c.color}` : "1px solid #e2e8f0",
                background: activo ? `${c.color}12` : "#fff", transition: "all .15s" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>{fmt(d)}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>cestas disponibles</div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
        {/* Formulario de venta */}
        <div className="card">
          <h3 style={{ margin: "0 0 4px", display: "flex", alignItems: "center", gap: 8 }}><ShoppingCart size={18} style={{ color: canalCfg?.color }} /> Registrar venta — <span style={{ color: canalCfg?.color }}>{canalCfg?.label}</span></h3>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 14 }}>Disponible en este canal: <b style={{ color: canalCfg?.color }}>{fmt(disponible)} cestas</b> ({fmt(disponible * KG)} kg)</div>

          {!editable && <div style={{ color: "#dc2626", fontSize: 13 }}>No tienes permiso para registrar ventas.</div>}
          {editable && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field" style={{ margin: 0 }}>
                  <label>Fecha</label>
                  <input type="date" className="input" value={form.fecha} max={hoyLocal()} onChange={(e) => setForm({ ...form, fecha: e.target.value })} data-testid="vr-fecha" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Cantidad de cestas</label>
                  <DecimalInput type="number" step="0.01" min="0" className="input" placeholder="0" value={form.cantidad_cestas} onChange={(e) => setForm({ ...form, cantidad_cestas: e.target.value })} data-testid="vr-cestas" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Precio por cesta (US$)</label>
                  <DecimalInput type="number" step="0.01" min="0" className="input" placeholder="0" value={form.precio_unitario} onChange={(e) => setForm({ ...form, precio_unitario: e.target.value })} data-testid="vr-precio" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Total</label>
                  <input className="input" value={`US$ ${fmt(total)}`} readOnly style={{ background: "#f8fafc", fontWeight: 700 }} data-testid="vr-total" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Cliente</label>
                  <ClienteAutocomplete placeholder="Nombre" value={form.cliente} onChange={(val) => setForm({ ...form, cliente: val })} onSelect={(o) => setForm((prev) => ({ ...prev, cliente: o.cliente, telefono: o.telefono || prev.telefono }))} testid="vr-cliente" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Teléfono</label>
                  <input className="input" placeholder="Opcional" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} data-testid="vr-telefono" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Abono inicial (US$)</label>
                  <DecimalInput type="number" step="0.01" min="0" className="input" placeholder="0" value={form.abono_inicial} onChange={(e) => setForm({ ...form, abono_inicial: e.target.value })} data-testid="vr-abono" />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <label>Saldo pendiente</label>
                  <input className="input" value={`US$ ${fmt(Math.max(total - abono, 0))}`} readOnly style={{ background: "#f8fafc", color: total - abono > 0 ? "#dc2626" : "#16a34a", fontWeight: 700 }} data-testid="vr-saldo" />
                </div>
              </div>
              <div className="field" style={{ margin: "12px 0 0" }}>
                <label>Observaciones</label>
                <input className="input" placeholder="Opcional" value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} data-testid="vr-obs" />
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center", flexWrap: "wrap" }}>
                <button className="btn" onClick={() => setForm({ ...emptyForm, fecha: form.fecha })} data-testid="vr-limpiar">Limpiar</button>
                <button className="btn btn-primary" style={{ background: canalCfg?.color, borderColor: canalCfg?.color }} onClick={registrar} disabled={busy || disponible <= 0.001} data-testid="vr-registrar">
                  <ShoppingCart size={16} /> {busy ? "Registrando..." : "Registrar venta"}
                </button>
                {disponible <= 0.001 && <span style={{ color: "#dc2626", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 6 }}><AlertCircle size={14} /> Sin cestas. Asígnalas en "Asignación de destino".</span>}
              </div>
            </>
          )}
        </div>

        {/* Últimas ventas del canal */}
        <div className="card">
          <h3 style={{ margin: "0 0 12px" }}>Ventas de esta semana — {canalCfg?.label}</h3>
          {(ultimas[canal] || []).length === 0 ? (
            <div className="empty-state" data-testid="vr-sin-ventas"><CheckCircle2 size={26} style={{ color: "#94a3b8", marginBottom: 6 }} /><div>No hay ventas registradas esta semana en este canal.</div><div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>Las ventas anteriores están en el módulo del canal.</div></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(ultimas[canal] || []).map((v) => (
                <div key={v._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 10px", background: "#f8fafc", borderRadius: 8 }} data-testid={`vr-ultima-${v._id}`}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: "#0f172a" }}>{v.cliente || "Sin nombre"}</span>
                    <span style={{ display: "block", fontSize: 12, color: "#94a3b8" }}>{(v.fecha || "").slice(0, 10)} · {fmt(v.cantidad_cestas)} cestas</span>
                  </span>
                  <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <span style={{ display: "block", fontWeight: 700, color: "#0f172a" }}>US$ {fmt(v.total)}</span>
                    {(v.total - (v.abono_inicial || 0)) > 0.001 && <span style={{ fontSize: 11, color: "#dc2626" }}>Debe US$ {fmt(v.total - (v.abono_inicial || 0))}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
