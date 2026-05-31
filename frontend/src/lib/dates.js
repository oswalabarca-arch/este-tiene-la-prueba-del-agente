// Utilidades de fecha en zona horaria LOCAL del usuario.
// `new Date().toISOString()` devuelve UTC, lo que provoca que en zonas como UTC-5
// los inputs <input type="date"> aparezcan con un día de adelanto durante la noche.
// Usar siempre estas funciones para inputs locales.

export const todayLocal = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Convierte una fecha (Date o ISO string) a "YYYY-MM-DD" en zona local.
export const toLocalDateStr = (val) => {
  if (!val) return "";
  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
