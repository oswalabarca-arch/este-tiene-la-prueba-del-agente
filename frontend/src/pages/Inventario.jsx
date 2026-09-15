import { useEffect, useState, Fragment } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { useAuth } from "../lib/auth";
import { Boxes, Plus, Trash2, Pencil, PackagePlus } from "lucide-react";
import { catBadge } from "../lib/categoryColors";
import { todayLocal } from "../lib/dates";
import { DecimalInput } from "../components/DecimalInput";
import { useFichasTecnicas, VerFichaButton } from "../components/VerFichaTecnica";

const CATEGORIAS = ["fertilizantes", "plaguicidas", "fungicidas", "herbicidas", "tratamiento", "semillas", "otros"];

export default function Inventario() {
  const { canEdit, canDelete } = useAuth();
  const toast = useToast();
  const { getFicha } = useFichasTecnicas();
  const [items, setItems] = useState([]);
  const [entradas, setEntradas] = useState([]);
  const [filterCat, setFilterCat] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingEntrada, setEditingEntrada] = useState(null);

  const load = () => {
    api.get("/inventario").then((r) => setItems(r.data.inventario));
    api.get("/inventario/entradas").then((r) => setEntradas(r.data.entradas));
  };
  useEffect(() => { load(); }, []);

  const removeEntrada = async (e) => {
    if (!window.confirm("¿Eliminar esta entrada manual? Se descontará del inventario.")) return;
    await api.delete(`/inventario/entradas/${e._id}`);
    toast.show("Entrada eliminada");
    load();
  };

  const categorias = Array.from(new Set(items.map((i) => i.categoria))).sort();
  const filtered = items.filter((i) => {
    if (filterCat && i.categoria !== filterCat) return false;
    return true;
  });

  const disponibles = filtered.filter((i) => i.existencia);
  const agotados = filtered.filter((i) => !i.existencia);
  const valorTotal = items.reduce((s, i) => s + Number(i.valor_remanente || 0), 0);

  return (
    <div data-testid="inventario-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
        <div>
          <h1 className="page-title"><Boxes size={24} style={{ verticalAlign: "middle", color: "#16a34a" }} /> Inventario</h1>
          <p className="page-subtitle">Inventario calculado a partir de Compras, entradas manuales y consumos de Aplicaciones.</p>
        </div>
        {canEdit("inventario") && (
          <button className="btn btn-primary" onClick={() => setShowModal(true)} data-testid="inv-entrada-new-btn">
            <Plus size={16} /> Registrar producto
          </button>
        )}
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="card kpi-card"><div className="kpi-label">Productos en inventario</div><div className="kpi-value">{items.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Disponibles</div><div className="kpi-value" style={{ color: "#16a34a" }}>{disponibles.length}</div></div>
        <div className="card kpi-card"><div className="kpi-label">Agotados</div><div className="kpi-value" style={{ color: "#dc2626" }}>{agotados.length}</div></div>
        <div className="card kpi-card" style={{ background: "linear-gradient(135deg,#f0fdf4,#dcfce7)", borderColor: "#86efac" }} data-testid="inv-valor-total-card">
          <div className="kpi-label">Valor total del inventario</div>
          <div className="kpi-value" style={{ color: "#15803d" }} data-testid="inv-valor-total">
            ${valorTotal.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Stock disponible valorado por PEPS</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>Filtrar por categoría:</div>
          <select className="select" value={filterCat} onChange={(e) => setFilterCat(e.target.value)} data-testid="inventario-filter-cat" style={{ minWidth: 220 }}>
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {filterCat && (
            <button type="button" className="btn" onClick={() => setFilterCat("")} data-testid="inventario-limpiar">Limpiar</button>
          )}
        </div>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Categoría</th>
              <th>Producto</th>
              <th>Ficha técnica</th>
              <th>Estado</th>
              <th>Disponible</th>
              <th>Valor stock</th>
              <th>Usado</th>
              <th>Ingresado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((i, idx) => {
              const tieneVariosLotes = (i.lotes_remanentes || []).length > 1;
              return (
                <Fragment key={`${i.categoria}-${i.nombre_producto}` || idx}>
                  <tr data-testid={`inv-row-${idx}`}>
                    <td><span className="badge" style={catBadge(i.categoria)}>{i.categoria}</span></td>
                    <td style={{ fontWeight: 600 }}>{i.nombre_producto}</td>
                    <td data-testid="inv-ingrediente-activo"><VerFichaButton productos={[i.nombre_producto]} getFicha={getFicha} testid={`inv-ver-ficha-${idx}`} /></td>
                    <td>{i.existencia ? <span className="badge badge-primary">Disponible</span> : <span className="badge badge-rose">Agotado</span>}</td>
                    <td style={{ color: "#16a34a", fontWeight: 700 }}>{i.total_disponible}</td>
                    <td style={{ color: "#16a34a", fontWeight: 600 }}>${Number(i.valor_remanente || 0).toFixed(2)}</td>
                    <td style={{ color: "#dc2626" }}>{i.total_enviado}</td>
                    <td>{i.total_comprado}</td>
                  </tr>
                  {tieneVariosLotes && (
                    <tr>
                      <td colSpan="8" style={{ background: "#f8fafc", padding: "8px 14px", fontSize: 12, color: "#475569" }}>
                        <b style={{ color: "#0f172a" }}>Lotes PEPS:</b>{" "}
                        {i.lotes_remanentes.map((l) => (
                          <span key={`${l.fecha_compra || "na"}-${l.precio_unitario}`} style={{ marginRight: 14 }}>
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
        {filtered.length === 0 && <div className="empty-state">Sin productos. Registra compras o una entrada manual para alimentar el inventario.</div>}
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 12 }}>
          Valor del stock calculado por método PEPS: primero entra → primero sale.
        </div>
      </div>

      {/* Registro de entradas manuales (productos que no entran por compras) */}
      <div className="card" style={{ marginTop: 18 }} data-testid="inv-entradas-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <h3 style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <PackagePlus size={18} color="#7c3aed" /> Entradas manuales
          </h3>
          {canEdit("inventario") && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)} data-testid="inv-entrada-new-btn-2">
              <Plus size={15} /> Nueva entrada
            </button>
          )}
        </div>
        <p style={{ color: "#64748b", marginTop: 4, marginBottom: 14, fontSize: 12 }}>
          Productos ingresados al inventario sin pasar por Compras (donaciones, producción propia, ajustes, etc.).
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Categoría</th>
              <th>Producto</th>
              <th style={{ textAlign: "right" }}>Cantidad</th>
              <th style={{ textAlign: "right" }}>Valor</th>
              <th>Descripción</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entradas.map((e) => (
              <tr key={e._id} data-testid="inv-entrada-row">
                <td>{new Date(e.fecha_compra).toLocaleDateString()}</td>
                <td><span className="badge" style={catBadge(e.categoria)}>{e.categoria}</span></td>
                <td style={{ fontWeight: 600 }}>{e.nombre_producto}</td>
                <td style={{ textAlign: "right" }}>{e.cantidad} {e.unidad}</td>
                <td style={{ textAlign: "right", color: "#16a34a", fontWeight: 600 }}>${Number(e.precio || 0).toFixed(2)}</td>
                <td style={{ fontSize: 12, color: "#475569" }}>{e.descripcion || "—"}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {canEdit("inventario") && (
                    <button className="btn-icon" style={{ color: "#f59e0b" }} title="Editar" onClick={() => setEditingEntrada(e)} data-testid={`inv-entrada-edit-${e._id}`}>
                      <Pencil size={16} />
                    </button>
                  )}
                  {canDelete("inventario") && (
                    <button className="btn-icon" style={{ color: "#dc2626" }} title="Eliminar" onClick={() => removeEntrada(e)} data-testid={`inv-entrada-del-${e._id}`}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entradas.length === 0 && <div className="empty-state">Sin entradas manuales registradas.</div>}
      </div>

      {showModal && <EntradaModal productos={items} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
      {editingEntrada && <EntradaModal productos={items} initial={editingEntrada} onClose={() => setEditingEntrada(null)} onSaved={() => { setEditingEntrada(null); load(); }} />}
    </div>
  );
}

function EntradaModal({ productos = [], initial = null, onClose, onSaved }) {
  const toast = useToast();
  const today = todayLocal();
  const isEdit = !!initial;
  const [form, setForm] = useState({
    categoria: initial?.categoria || "semillas",
    nombre_producto: initial?.nombre_producto || "",
    ingrediente_activo: initial?.ingrediente_activo || "",
    cantidad: initial?.cantidad ?? 0,
    precio: initial?.precio ?? 0,
    unidad: initial?.unidad || "Unidades",
    descripcion: initial?.descripcion || "",
    fecha: initial?.fecha_compra ? String(initial.fecha_compra).slice(0, 10) : today,
  });
  const [busy, setBusy] = useState(false);

  const sugerencias = Array.from(new Set(productos.map((p) => p.nombre_producto).filter(Boolean)));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.nombre_producto.trim()) { toast.show("Indica el nombre del producto", "error"); return; }
    if (Number(form.cantidad) <= 0) { toast.show("La cantidad debe ser mayor a 0", "error"); return; }
    setBusy(true);
    try {
      const payload = {
        categoria: form.categoria,
        nombre_producto: form.nombre_producto.trim(),
        ingrediente_activo: (form.ingrediente_activo || "").trim(),
        cantidad: Number(form.cantidad),
        unidad: form.unidad || "Unidades",
        precio: Number(form.precio) || 0,
        descripcion: form.descripcion,
        fecha: form.fecha + "T12:00:00.000Z",
      };
      if (isEdit) {
        await api.put(`/inventario/entradas/${initial._id}`, payload);
        toast.show("Entrada actualizada");
      } else {
        await api.post("/inventario/entradas", payload);
        toast.show("Producto agregado al inventario");
      }
      onSaved();
    } catch {
      toast.show("Error al guardar", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="inv-entrada-modal">
        <h2 className="modal-title"><PackagePlus size={20} style={{ verticalAlign: "middle", color: "#7c3aed" }} /> {isEdit ? "Editar entrada manual" : "Registrar producto en inventario"}</h2>
        <div className="modal-sub">Para productos que NO entran por compras (donaciones, producción propia, ajustes). Suman al stock disponible.</div>
        <div className="form-grid">
          <div className="field">
            <label>Fecha</label>
            <input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required data-testid="inv-entrada-fecha" />
          </div>
          <div className="field">
            <label>Categoría</label>
            <select className="select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} data-testid="inv-entrada-categoria">
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ marginTop: 4 }}>
              <span className="badge" style={catBadge(form.categoria)}>{form.categoria}</span>
            </div>
          </div>
          <div className="field">
            <label>Nombre del producto</label>
            <input className="input" value={form.nombre_producto} list="inv-productos-historial" autoComplete="off"
              onChange={(e) => setForm({ ...form, nombre_producto: e.target.value })} required data-testid="inv-entrada-nombre"
              placeholder="Ej: Semilla donada, abono propio..." />
            <datalist id="inv-productos-historial">
              {sugerencias.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div className="field">
            <label>Ingrediente activo</label>
            <input className="input" value={form.ingrediente_activo || ""}
              onChange={(e) => setForm({ ...form, ingrediente_activo: e.target.value })}
              data-testid="inv-entrada-ingrediente" placeholder="Ej: Glifosato, Clorpirifos..." />
          </div>
          <div className="field">
            <label>Cantidad (Unidades)</label>
            <DecimalInput type="number" step="0.01" className="input"
              value={form.cantidad === 0 || form.cantidad === "" ? "" : form.cantidad}
              onChange={(e) => setForm({ ...form, cantidad: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.cantidad === 0) e.target.select(); }}
              placeholder="0" required data-testid="inv-entrada-cantidad" />
          </div>
          <div className="field">
            <label>Valor/costo total ($) — opcional</label>
            <DecimalInput type="number" step="0.01" className="input"
              value={form.precio === 0 || form.precio === "" ? "" : form.precio}
              onChange={(e) => setForm({ ...form, precio: e.target.value === "" ? 0 : Number(e.target.value) })}
              onFocus={(e) => { if (form.precio === 0) e.target.select(); }}
              placeholder="0 (sin costo)" data-testid="inv-entrada-precio" />
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
          <label>Descripción / motivo</label>
          <textarea className="textarea" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Ej: Donación de proveedor, producción propia del vivero..." />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="inv-entrada-submit">{busy ? "..." : (isEdit ? "Guardar cambios" : "Agregar al inventario")}</button>
        </div>
      </form>
    </div>
  );
}
