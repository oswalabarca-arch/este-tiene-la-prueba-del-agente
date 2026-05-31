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

// ============================================================
// Paleta para tipos de ACTIVIDAD (Registrar)
// abonar → marrón tierra / cosechar → granate fruta / deshierbar → verde planta
// riego → azul agua / otra → gris neutro
// ============================================================
const ACT_PALETTE = {
  abonar:     { bg: "#fef3c7", color: "#92400e", border: "#fcd34d" }, // marrón tierra
  cosechar:   { bg: "#fee2e2", color: "#b91c1c", border: "#fca5a5" }, // granate fruta
  deshierbar: { bg: "#dcfce7", color: "#15803d", border: "#86efac" }, // verde planta
  riego:      { bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" }, // azul agua
  otra:       { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" }, // gris
};

const ACT_ALIASES = {
  abono:        "abonar",
  fertilizar:   "abonar",
  cosecha:      "cosechar",
  cosechando:   "cosechar",
  deshierbe:    "deshierbar",
  desyerbar:    "deshierbar",
  riegos:       "riego",
  regar:        "riego",
  otro:         "otra",
  otros:        "otra",
};

const actNorm = (raw) => {
  const k = String(raw || "").toLowerCase().trim();
  return ACT_ALIASES[k] || k;
};

export const actColor = (tipo) => ACT_PALETTE[actNorm(tipo)] || ACT_PALETTE.otra;

export const actBadge = (tipo) => {
  const { bg, color } = actColor(tipo);
  return { background: bg, color };
};

// Para tiles del formulario "Registrar"
export const actTile = (tipo, isActive) => {
  const { bg, color, border } = actColor(tipo);
  return isActive
    ? { background: color, color: "#fff", border: `2px solid ${color}` }
    : { background: bg, color, border: `1.5px solid ${border}` };
};
