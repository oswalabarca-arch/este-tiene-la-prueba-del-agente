import { useState, useEffect } from "react";

/**
 * Input numérico decimal compatible con tablets/teclados en español.
 *
 * Problema que resuelve: `<input type="number">` solo acepta el punto (.) como
 * separador decimal. En tablets con teclado en español el separador es la coma (,),
 * por lo que al escribir "1,5" el valor se perdía o se deformaba ("15").
 *
 * Este componente:
 *  - Usa type="text" + inputMode="decimal" para mostrar el teclado numérico.
 *  - Acepta coma o punto como separador y normaliza siempre a punto hacia el padre.
 *  - Es drop-in: dispara onChange con un evento sintético { target: { value } },
 *    igual que un <input> normal, así no hay que cambiar los handlers existentes.
 */
export function DecimalInput({ value, onChange, type, step, ...rest }) {
  const [display, setDisplay] = useState(value == null ? "" : String(value));

  // Sincroniza el texto mostrado cuando el valor externo cambia de verdad
  // (ej: reset tras guardar, o al editar un registro existente). No interfiere
  // mientras el usuario escribe un decimal en curso (ej: "1," == 1).
  useEffect(() => {
    const ext = value == null ? "" : String(value);
    const norm = display.replace(",", ".");
    const extNum = ext === "" ? NaN : parseFloat(ext);
    const dispNum = norm === "" ? NaN : parseFloat(norm);
    const bothEmpty = ext === "" && norm === "";
    const bothNaN = Number.isNaN(extNum) && Number.isNaN(dispNum);
    if (!bothEmpty && !bothNaN && extNum !== dispNum) {
      setDisplay(ext);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e) => {
    // Permite solo dígitos y un único separador (coma o punto)
    let raw = e.target.value.replace(/[^0-9.,]/g, "");
    const sep = raw.search(/[.,]/);
    if (sep !== -1) {
      raw = raw.slice(0, sep + 1) + raw.slice(sep + 1).replace(/[.,]/g, "");
    }
    setDisplay(raw);
    const normalized = raw.replace(",", ".");
    onChange?.({ target: { value: normalized } });
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
    />
  );
}
