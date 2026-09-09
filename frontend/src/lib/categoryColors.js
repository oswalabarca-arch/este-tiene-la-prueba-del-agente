// Paleta única para categorías de productos / tipos de aplicación.
// Acepta indistintamente forma singular o plural.

// Paleta para CATEGORÍAS de productos / tipos de aplicación.
// Hues escogidos para NO chocar con los colores de actividades (abonar/cosechar/deshierbar/riego).
// Sigue siendo coherente con la naturaleza del producto.
const CAT_PALETTE = {
  fertilizantes: { bg: "#ccfbf1", color: "#0f766e", border: "#5eead4" }, // teal — nutrición vegetal
  plaguicidas:   { bg: "#fce7f3", color: "#9d174d", border: "#f9a8d4" }, // fucsia — peligro / insecticida
  fungicidas:    { bg: "#ede9fe", color: "#6d28d9", border: "#c4b5fd" }, // violeta — anti-hongo
  herbicidas:    { bg: "#ffedd5", color: "#c2410c", border: "#fdba74" }, // naranja vivo — quema-hierba
  tratamiento:   { bg: "#cffafe", color: "#0e7490", border: "#67e8f9" }, // cian — curativo
  gasolina:      { bg: "#fef9c3", color: "#713f12", border: "#fde047" }, // amarillo ocre — combustible
  semillas:      { bg: "#fef3c7", color: "#a16207", border: "#fcd34d" }, // dorado — granos
  otros:         { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" }, // gris — genérico
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

export const actColor = (tipo) => {
  const a = actNorm(tipo);
  if (ACT_PALETTE[a]) return ACT_PALETTE[a];
  // Labor derivada de una aplicación (fertilizacion, plaguicida, etc.): usar la paleta de categorías
  const c = norm(tipo);
  if (CAT_PALETTE[c]) return CAT_PALETTE[c];
  return ACT_PALETTE.otra;
};

// Agrupación de labores por tipo: los tipos conocidos (abonar/cosechar/deshierbar/
// riego) y los derivados de aplicaciones (fertilizacion/plaguicida/fungicida/
// herbicida/tratamiento) mantienen su bucket; el resto se agrupa en "Otra actividad".
const _LABOR_ACT = ["abonar", "cosechar", "deshierbar", "riego"];
const _LABOR_CAT = ["fertilizantes", "plaguicidas", "fungicidas", "herbicidas", "tratamiento"];
export const laborBucketKey = (tipo) => {
  const a = actNorm(tipo);
  if (_LABOR_ACT.includes(a)) return a;
  const c = norm(tipo);
  if (_LABOR_CAT.includes(c)) return c;
  return "otra";
};
const _LABOR_LABELS = {
  abonar: "Abonar", cosechar: "Cosechar", deshierbar: "Deshierbar", riego: "Riego",
  fertilizantes: "Fertilización", plaguicidas: "Plaguicida", fungicidas: "Fungicida",
  herbicidas: "Herbicida", tratamiento: "Tratamiento", otra: "Otra actividad",
};
export const laborBucketLabel = (key) => _LABOR_LABELS[key] || key;

export const actBadge = (tipo) => {
  // Una actividad puede venir de una aplicación confirmada (tipo = "fertilizacion",
  // "plaguicida", etc.) — en ese caso usamos la paleta de categorías.
  const k = actNorm(tipo);
  const fromAct = ACT_PALETTE[k];
  if (fromAct) return { background: fromAct.bg, color: fromAct.color };
  const normCat = norm(tipo);
  const fromCat = CAT_PALETTE[normCat];
  if (fromCat) return { background: fromCat.bg, color: fromCat.color };
  return { background: ACT_PALETTE.otra.bg, color: ACT_PALETTE.otra.color };
};

// Para tiles del formulario "Registrar"
export const actTile = (tipo, isActive) => {
  const { bg, color, border } = actColor(tipo);
  return isActive
    ? { background: color, color: "#fff", border: `2px solid ${color}` }
    : { background: bg, color, border: `1.5px solid ${border}` };
};
