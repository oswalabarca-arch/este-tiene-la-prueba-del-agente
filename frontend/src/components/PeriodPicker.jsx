// Selector que aparece junto a los pills de período.
// - período "hoy":    muestra un selector de día (YYYY-MM-DD) para ver cualquier día.
// - período "semana": muestra un selector de mes + una de las 4 semanas del mes.
// - período "mes":    muestra un selector de mes (YYYY-MM).
// - período "año":    muestra un desplegable con los años disponibles.
export function PeriodPicker({ isDay, isWeek, isMonth, isYear, dia, setDia, semana, setSemana, mes, setMes, anio, setAnio, years, testidPrefix = "period" }) {
  if (!isDay && !isWeek && !isMonth && !isYear) return null;
  const ctrlStyle = { height: 36, padding: "4px 10px" };
  const cy = new Date().getFullYear();
  const range = [];
  for (let y = cy + 1; y >= cy - 5; y--) range.push(String(y));
  const allYears = [...new Set([...(years || []), ...range])].sort((a, b) => b.localeCompare(a));
  const semanas = [
    { n: "1", label: "Semana 1 · días 1–7" },
    { n: "2", label: "Semana 2 · días 8–14" },
    { n: "3", label: "Semana 3 · días 15–21" },
    { n: "4", label: "Semana 4 · días 22–fin" },
  ];
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }} data-testid={`${testidPrefix}-picker`}>
      {isDay && (
        <input
          type="date"
          className="input"
          style={{ ...ctrlStyle, width: 168 }}
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          data-testid={`${testidPrefix}-picker-dia`}
        />
      )}
      {isWeek && (
        <>
          <input
            type="month"
            className="input"
            style={{ ...ctrlStyle, width: 156 }}
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            data-testid={`${testidPrefix}-picker-semana-mes`}
          />
          <select
            className="select"
            style={{ ...ctrlStyle, width: 186 }}
            value={semana}
            onChange={(e) => setSemana(e.target.value)}
            data-testid={`${testidPrefix}-picker-semana`}
          >
            {semanas.map((s) => (
              <option key={s.n} value={s.n}>{s.label}</option>
            ))}
          </select>
        </>
      )}
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

// Día actual en formato YYYY-MM-DD (hora local)
export const currentDayStr = () => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
};

// Número de semana (1–4) según el día del mes: 1–7, 8–14, 15–21, 22–fin
export const weekOfMonth = (day) => (day <= 7 ? "1" : day <= 14 ? "2" : day <= 21 ? "3" : "4");

// Semana actual (1–4)
export const currentWeekStr = () => weekOfMonth(new Date().getDate());
