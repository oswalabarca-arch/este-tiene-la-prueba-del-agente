// Selector que aparece junto a los pills de período.
// Cuando el período activo es "mes" muestra un selector de mes (YYYY-MM);
// cuando es "año" muestra un desplegable con los años disponibles.
export function PeriodPicker({ isMonth, isYear, mes, setMes, anio, setAnio, years, testidPrefix = "period" }) {
  if (!isMonth && !isYear) return null;
  const ctrlStyle = { height: 36, padding: "4px 10px" };
  // Siempre ofrecer un rango razonable de años (actual-5 .. actual+1) + los que existan en los datos
  const cy = new Date().getFullYear();
  const range = [];
  for (let y = cy + 1; y >= cy - 5; y--) range.push(String(y));
  const allYears = [...new Set([...(years || []), ...range])].sort((a, b) => b.localeCompare(a));
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }} data-testid={`${testidPrefix}-picker`}>
      {isMonth && (
        <input
          type="month"
          className="input"
          style={{ ...ctrlStyle, width: 168 }}
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          data-testid={`${testidPrefix}-picker-mes`}
        />
      )}
      {isYear && (
        <select
          className="select"
          style={{ ...ctrlStyle, width: 118 }}
          value={anio}
          onChange={(e) => setAnio(e.target.value)}
          data-testid={`${testidPrefix}-picker-anio`}
        >
          {allYears.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// Mes actual en formato YYYY-MM (hora local)
export const currentMonthStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
};

// Año actual como string
export const currentYearStr = () => String(new Date().getFullYear());
