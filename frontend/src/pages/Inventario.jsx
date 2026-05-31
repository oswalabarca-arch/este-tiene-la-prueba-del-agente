import { useEffect, useState, Fragment } from "react";
import { api } from "../lib/api";
import { Boxes, Search } from "lucide-react";
import { catBadge } from "../lib/categoryColors";

export default function Inventario() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");

  const load = () => api.get("/inventario").then((r) => setItems(r.data.inventario));
  useEffect(() => { load(); }, []);

  const categorias = Array.from(new Set(items.map((i) => i.categoria)));
  const filtered = items.filter((i) => {
    if (filterCat && i.categoria !== filterCat) return false;
    if (search && !i.nombre_producto.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const disponibles = filtered.filter((i) => i.existencia);
  const agotados = filtered.filter((i) => !i.existencia);

  return (
    <div data-testid="inventario-page">
      <h1 className="page-title"><Boxes size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Inventario</h1>
      <p className="page-subtitle">Inventario calculado a partir de Compras y consumos de Aplicaciones.</p>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Productos en inventario</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Disponibles</div><div className="kpi-value" style={{ color: "#16a34a" }}>{disponibles.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Agotados</div><div className="kpi-value" style={{ color: "#dc2626" }}>{agotados.length}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "#94a3b8" }} />
            <input className="input" style={{ paddingLeft: 36, width: "100%" }} placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="inventario-search" />
          </div>
          <select className="select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)} data-testid="inventario-filter-cat">
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Producto</th>
              <th>Estado</th>
              <th>Disponible</th>
              <th>Valor stock</th>
              <th>Precio prom.</th>
              <th>Usado</th>
              <th>Comprado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i, idx) => {
              const tieneVariosLotes = (i.lotes_remanentes || []).length > 1;
              return (
                <Fragment key={idx}>
                  <tr data-testid={`inv-row-${idx}`}>
                    <td><span className="badge" style={catBadge(i.categoria)}>{i.categoria}</span></td>
                    <td style={{ fontWeight: 600 }}>{i.nombre_producto}</td>
                    <td>{i.existencia ? <span className="badge badge-primary">Disponible</span> : <span className="badge badge-rose">Agotado</span>}</td>
                    <td style={{ color: "#16a34a", fontWeight: 700 }}>{i.total_disponible}</td>
                    <td style={{ color: "#16a34a", fontWeight: 600 }}>${Number(i.valor_remanente || 0).toFixed(2)}</td>
                    <td>${Number(i.precio_unitario_promedio || 0).toFixed(4)}</td>
                    <td style={{ color: "#dc2626" }}>{i.total_enviado}</td>
                    <td>{i.total_comprado}</td>
                  </tr>
                  {tieneVariosLotes && (
                    <tr>
                      <td colSpan="8" style={{ background: "#f8fafc", padding: "8px 14px", fontSize: 12, color: "#475569" }}>
                        <b style={{ color: "#0f172a" }}>Lotes PEPS:</b>{" "}
                        {i.lotes_remanentes.map((l, li) => (
                          <span key={li} style={{ marginRight: 14 }}>
                            {l.cantidad} {i.unidad || "u."} @ <b>${l.precio_unitario.toFixed(4)}</b>
                            {l.fecha_compra && <span style={{ color: "#94a3b8" }}> ({String(l.fecha_compra).slice(0, 10)})</span>}
                          </span>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="empty-state">Sin productos. Registra compras para alimentar el inventario.</div>}
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 12 }}>
          Valor del stock calculado por método PEPS: primero entra → primero sale.
        </div>
      </div>
    </div>
  );
}
