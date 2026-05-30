// Paleta única para categorías de productos / tipos de aplicación.
// Acepta indistintamente forma singular o plural.

const CAT_PALETTE = {
  fertilizantes: { bg: "#dcfce7", color: "#15803d", border: "#86efac" }, // verde
  plaguicidas:   { bg: "#fee2e2", color: "#b91c1c", border: "#fca5a5" }, // rojo
  fungicidas:    { bg: "#ede9fe", color: "#6d28d9", border: "#c4b5fd" }, // morado
  herbicidas:    { bg: "#fef3c7", color: "#b45309", border: "#fcd34d" }, // ámbar
  tratamiento:   { bg: "#e0f2fe", color: "#0369a1", border: "#7dd3fc" }, // azul
  gasolina:      { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" }, // marrón
  semillas:      { bg: "#fef9c3", color: "#854d0e", border: "#fde047" }, // amarillo
  otros:         { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" }, // gris
};

// Mapa de alias singular ↔ plural y variantes
const CAT_ALIASES = {
  fertilizacion: "fertilizantes",
  fertilizante:  "fertilizantes",
  plaguicida:    "plaguicidas",
  fungicida:     "fungicidas",
  herbicida:     "herbicidas",
  tratamientos:  "tratamiento",
};

const norm = (raw) => {
  const k = String(raw || "").toLowerCase().trim();
  return CAT_ALIASES[k] || k;
};

export const catColor = (categoria) => CAT_PALETTE[norm(categoria)] || CAT_PALETTE.otros;

// Estilo listo para usar en <span className="badge" style={catBadge(c)}>
export const catBadge = (categoria) => {
  const { bg, color } = catColor(categoria);
  return { background: bg, color };
};

// Estilo para pills (con borde activo cuando isActive=true)
export const catPill = (categoria, isActive) => {
  const { bg, color, border } = catColor(categoria);
  return isActive
    ? { background: color, color: "#fff", border: `1px solid ${color}` }
    : { background: bg, color, border: `1px solid ${border}` };
};
