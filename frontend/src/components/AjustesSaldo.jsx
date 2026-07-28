import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../lib/toast";
import { SlidersHorizontal, Trash2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";

const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtFecha = (f) => {
  if (!f) return "—";
  const d = new Date(String(f).slice(0, 10) + "T00:00:00");
  return `${d.getDate()} ${MESES_C[d.getMonth()]} ${d.getFullYear()}`;
};
const fmtKg = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " kg";

export default function AjustesSaldo() {
  const { canDelete } = useAuth();
  const toast = useToast();
  const [ajustes, setAjustes] = useState([]);

  const load = useCallback(() => {
    api.get("/analiticas/ajustes-saldo").then((r) => setAjustes(r.data.ajustes || [])).catch(() => setAjustes([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  const eliminar = async (a) => {
    if (!window.confirm(`¿Eliminar este ajuste de ${a.tipo} de ${fmtKg(a.cantidad_kg)} en "${a.canal_label}"? Si el canal queda en negativo, revisa las ventas registradas sobre esa fruta.`)) return;
    try {
      await api.delete(`/ventas-${a.canal}/${a.id}`);
      toast.show("Ajuste eliminado");
      load();
    } catch (err) {
      toast.show(err?.response?.data?.detail || "No se pudo eliminar", "error");
    }
  };

  return (
    <div className="card" style={{ marginTop: 18 }} data-testid="ajustes-saldo-card">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
        <div className="kpi-icon-box" style={{ background: "#fef2f2", color: "#dc2626", width: 40, height: 40 }}><SlidersHorizontal size={19} /></div>
        <div>
          <h2 style={{ margin: 0, color: "#0f172a" }}>Revisar ajustes de saldo</h2>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
            Ajustes manuales que hiciste con "Ajustar saldo disponible". Si un canal tiene fantasmas, elimina el ajuste incorrecto aquí.
          </div>
        </div>
      </div>

      {ajustes.length === 0 ? (
        <div className="empty-state" data-testid="ajustes-saldo-empty">No hay ajustes de saldo registrados. 👍</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", marginTop: 8 }} data-testid="ajustes-saldo-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Canal</th>
                <th>Tipo</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th>Nota</th>
                {canDelete("ventas") && <th style={{ textAlign: "center" }}>Acción</th>}
              </tr>
            </thead>
            <tbody>
              {ajustes.map((a) => (
                <tr key={a.id} data-testid={`ajuste-row-${a.id}`}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtFecha(a.fecha)}</td>
                  <td><b>{a.canal_label}</b></td>
                  <td>
                    {a.tipo === "entrada" ? (
                      <span style={{ color: "#dc2626", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}><ArrowUpCircle size={14} /> Entrada (+)</span>
                    ) : (
                      <span style={{ color: "#0891b2", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}><ArrowDownCircle size={14} /> Salida (−)</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{a.cantidad_cestas} cestas · {fmtKg(a.cantidad_kg)}</td>
                  <td style={{ fontSize: 12.5, color: "#64748b" }}>{a.observaciones || "—"}</td>
                  {canDelete("ventas") && (
                    <td style={{ textAlign: "center" }}>
                      <button className="btn-icon" style={{ color: "#dc2626" }} title="Eliminar ajuste" onClick={() => eliminar(a)} data-testid={`ajuste-delete-${a.id}`}><Trash2 size={15} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 8 }}>
            💡 Los ajustes de <b>Entrada (+)</b> son los que suelen crear fantasmas (agregan cestas que no vienen de una cosecha). Elimina los que registraste por error.
          </div>
        </div>
      )}
    </div>
  );
}
