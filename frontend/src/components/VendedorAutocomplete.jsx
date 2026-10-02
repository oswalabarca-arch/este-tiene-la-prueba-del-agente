import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { UserCircle } from "lucide-react";

// Caché en memoria compartida (60s), invalidable tras guardar una venta.
let _cache = null;
let _cacheAt = 0;

export function invalidarVendedoresCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Input de vendedor con autocompletado. Aprende los nombres de ventas anteriores.
 * Props: value, onChange(nombre), placeholder, testid.
 */
export function VendedorAutocomplete({ value, onChange, placeholder, testid }) {
  const [opciones, setOpciones] = useState([]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const boxRef = useRef(null);

  const cargar = async () => {
    if (_cache && Date.now() - _cacheAt < 60000) {
      setOpciones(_cache);
      return;
    }
    try {
      const r = await api.get("/vendedores/sugerencias");
      _cache = r.data?.vendedores || [];
      _cacheAt = Date.now();
      setOpciones(_cache);
    } catch {
      /* silencioso: el campo sigue funcionando como texto libre */
    }
  };

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = (value || "").trim().toLowerCase();
  const matches = q.length >= 1 ? opciones.filter((o) => o.toLowerCase().includes(q)).slice(0, 8) : [];
  const showList = open && matches.length > 0;

  const elegir = (nombre) => {
    onChange?.(nombre);
    setOpen(false);
    setHi(-1);
  };

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        className="input"
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onFocus={() => {
          cargar();
          setOpen(true);
        }}
        onChange={(e) => {
          onChange?.(e.target.value);
          setOpen(true);
          setHi(-1);
        }}
        onKeyDown={(e) => {
          if (!showList) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && hi >= 0) {
            e.preventDefault();
            elegir(matches[hi]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        data-testid={testid}
      />
      {showList && (
        <div
          data-testid={`${testid}-opciones`}
          style={{
            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#fff",
            border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 4,
            boxShadow: "0 8px 24px rgba(15,23,42,0.14)", maxHeight: 240, overflowY: "auto",
          }}
        >
          {matches.map((nombre, i) => (
            <div
              key={nombre + i}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(nombre);
              }}
              onMouseEnter={() => setHi(i)}
              data-testid={`${testid}-opcion-${i}`}
              style={{
                padding: "8px 12px", cursor: "pointer", background: i === hi ? "#f1f5f9" : "#fff",
                display: "flex", alignItems: "center", gap: 7, fontWeight: 600, color: "#0f172a", fontSize: 14,
                borderBottom: i < matches.length - 1 ? "1px solid #f1f5f9" : "none",
              }}
            >
              <UserCircle size={14} style={{ color: "#94a3b8" }} /> {nombre}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
