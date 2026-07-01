import { useEffect, useState } from "react";
import { api, API } from "../lib/api";
import { FileText, X, ImageOff } from "lucide-react";

const norm = (s) => (s || "").toString().trim().toLowerCase();

const fileUrl = (path) => {
  if (!path) return null;
  const token = localStorage.getItem("erp_token");
  return `${API}/fichas-tecnicas/file/${path}?auth=${token}`;
};

// Hook: carga las fichas una sola vez y permite buscar por nombre de producto (normalizado).
export function useFichasTecnicas() {
  const [map, setMap] = useState({});
  useEffect(() => {
    let alive = true;
    api.get("/fichas-tecnicas").then((r) => {
      if (!alive) return;
      const m = {};
      (r.data.fichas || []).forEach((f) => { m[norm(f.nombre_producto)] = f; });
      setMap(m);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const getFicha = (nombre) => map[norm(nombre)] || null;
  return { getFicha };
}

// Botón que reemplaza al texto de "Ingrediente activo".
// productos: array de nombres de producto de esa fila.
export function VerFichaButton({ productos = [], getFicha, testid }) {
  const [open, setOpen] = useState(false);
  const nombres = [...new Set(productos.filter(Boolean))];
  const fichas = nombres.map((n) => getFicha(n)).filter((f) => f && f.foto_trasera);
  const disponible = fichas.length > 0;

  return (
    <>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => disponible && setOpen(true)}
        disabled={!disponible}
        title={disponible ? "Ver ficha técnica" : "Sin ficha técnica cargada"}
        data-testid={testid}
        style={{ color: disponible ? "#0ea5e9" : "#94a3b8" }}
      >
        <FileText size={14} /> {disponible ? "Ver ficha" : "Sin ficha"}
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} data-testid="ver-ficha-modal">
            <h2 className="modal-title"><FileText size={20} style={{ verticalAlign: "middle", color: "#0ea5e9" }} /> Ficha técnica</h2>
            <button className="btn-icon" onClick={() => setOpen(false)} style={{ position: "absolute", top: 14, right: 14 }}><X size={20} /></button>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {fichas.map((f) => (
                <div key={f._id}>
                  {fichas.length > 1 && <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14, marginBottom: 6 }}>{f.nombre_producto}</div>}
                  <FichaFoto path={f.foto_trasera} nombre={f.nombre_producto} />
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FichaFoto({ path, nombre }) {
  const url = fileUrl(path);
  if (!url) {
    return (
      <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", gap: 6, fontSize: 13 }}>
        <ImageOff size={26} /> Sin foto de ficha técnica
      </div>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={`Ficha técnica ${nombre}`} style={{ width: "100%", borderRadius: 10, border: "1px solid #e2e8f0", objectFit: "contain", background: "#f8fafc", maxHeight: 480 }} />
    </a>
  );
}
