import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtKg = (n) => Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kg";
const fmtCostoKg = (n) => "US$ " + Number(n || 0).toLocaleString("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function rangeLabel(d) {
  if (!d || !d.desde) return "Todos los registros";
  const s = new Date(d.desde + "T00:00:00"), e = new Date(d.hasta + "T00:00:00");
  if (d.gran === "anio") return `Año ${s.getFullYear()}`;
  if (d.gran === "mes") return `${MESES[s.getMonth()]} ${s.getFullYear()}`;
  return `Semana del ${s.getDate()} ${MESES_C[s.getMonth()]} al ${e.getDate()} ${MESES_C[e.getMonth()]} ${e.getFullYear()}`;
}

// Ancla del período ANTERIOR (semana pasada / mes pasado / año pasado)
function prevAnchor(gran, anchor) {
  const d = new Date(anchor + "T00:00:00");
  if (gran === "semana") { const p = new Date(d); p.setDate(d.getDate() - 7); return p.toISOString().slice(0, 10); }
  if (gran === "mes") return new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().slice(0, 10);
  if (gran === "anio") return new Date(d.getFullYear() - 1, 0, 1).toISOString().slice(0, 10);
  return null;
}

// % de variación: en costos, subir es desfavorable (rojo ↑), bajar favorable (verde ↓)
function deltaPct(cur, prev) {
  if (!prev || prev <= 0 || !cur || cur <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

function Trend({ pct, testid }) {
  if (pct === null || pct === undefined) return null;
  const up = pct > 0.05, down = pct < -0.05;
  const color = up ? "#dc2626" : down ? "#15803d" : "#64748b"; // costo: ↑ rojo (peor), ↓ verde (mejor)
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, fontWeight: 700, color }} data-testid={testid}>
      <Icon size={12} />{Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export default function CostosPorKg() {
  const [gran, setGran] = useState("mes");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [prev, setPrev] = useState(null);
  const [diag, setDiag] = useState(null);
  const [showDiag, setShowDiag] = useState(false);
  const [loadingDiag, setLoadingDiag] = useState(false);

  const load = useCallback(() => {
    const params = { gran };
    if (gran !== "todo") params.anchor = anchor;
    api.get("/analiticas/costos-kg", { params }).then((r) => setData(r.data)).catch(() => setData(null));
    // Período anterior para la tendencia (solo si no es "Todo")
    const pa = gran !== "todo" ? prevAnchor(gran, anchor) : null;
    if (pa) api.get("/analiticas/costos-kg", { params: { gran, anchor: pa } }).then((r) => setPrev(r.data)).catch(() => setPrev(null));
    else setPrev(null);
    setShowDiag(false);
    setDiag(null);
  }, [gran, anchor]);
  useEffect(() => { load(); }, [load]);

  const abrirDiagnostico = async () => {
    if (showDiag) { setShowDiag(false); return; }
    setShowDiag(true);
    setLoadingDiag(true);
    try {
      const params = { gran };
      if (gran !== "todo") params.anchor = anchor;
      const r = await api.get("/analiticas/conciliacion-diagnostico", { params });
      setDiag(r.data);
    } catch { setDiag(null); }
    setLoadingDiag(false);
  };

  const periodoLabel = useMemo(() => rangeLabel(data), [data]);

  const kgCos = data?.cosecha?.kg_cosechados || 0;
  const kgDesc = data?.cosecha?.kg_descarte || 0;
  const kgDon = data?.cosecha?.kg_donaciones || 0;
  const kgDescRe = data?.cosecha?.kg_descarte_reasignado || 0;
  const kgVend = data?.cosecha?.kg_vendible || 0;
  const kgVendidos = data?.cosecha?.kg_vendidos;
  const kgDispFisico = data?.cosecha?.kg_disponible_fisico;
  const kgAjuste = data?.cosecha?.kg_ajuste_saldo || 0;
  const kgSinAsignar = data?.cosecha?.kg_sin_asignar || 0;
  const kgSaldoInicial = data?.cosecha?.kg_saldo_inicial || 0;
  const tieneSaldoIni = Math.abs(kgSaldoInicial) > 0.01;

  return (
    <div className="card" style={{ width: "100%", margin: 0 }} data-testid="er-costos-kg-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5, color: "#7c3aed" }}>COSTOS POR KILOGRAMO</div>
          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>
            {periodoLabel}{data?.dias ? ` · salarios prorrateados (${data.dias} día${data.dias === 1 ? "" : "s"})` : ""}{gran !== "todo" ? " · tendencia vs período anterior" : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} data-testid="ck-filtro">
          <div style={{ display: "inline-flex", background: "#f1f5f9", borderRadius: 10, padding: 3 }}>
            {[["todo", "Todo"], ["semana", "Semana"], ["mes", "Mes"], ["anio", "Año"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setGran(k)} data-testid={`ck-gran-${k}`}
                style={{ padding: "6px 13px", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13,
                  background: gran === k ? "#7c3aed" : "transparent", color: gran === k ? "#fff" : "#475569" }}>
                {l}
              </button>
            ))}
          </div>
          {gran !== "todo" && (
            <input type="date" className="input" style={{ width: 160 }} value={anchor} onChange={(e) => setAnchor(e.target.value)} data-testid="ck-fecha" />
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <KgChip label="Kg cosechados" value={kgCos} testid="er-kg-cosechados" />
        <KgChip label="Kg descarte" value={kgDesc} testid="er-kg-descarte" />
        <KgChip label="Kg descarte reasig." value={kgDescRe} testid="er-kg-descarte-reasig" />
        <KgChip label="Kg donaciones" value={kgDon} testid="er-kg-donaciones" />
        {tieneSaldoIni && <KgChip label="Saldo inicial (arrastre)" value={kgSaldoInicial} testid="er-kg-saldo-inicial" />}
        <KgChip label="Kg vendible" value={kgVend} testid="er-kg-vendible" />
      </div>

      {kgVendidos !== undefined && kgVendidos !== null && (
        <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }} data-testid="er-conciliacion-kg">
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", marginBottom: 6 }}>Conciliación de kg del período</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "#475569" }}>
            {tieneSaldoIni && (
              <span data-testid="er-kg-saldo-inicial-conc">Saldo inicial: <b style={{ color: "#0369a1" }}>{fmtKg(kgSaldoInicial)}</b> +</span>
            )}
            <span>Vendible{tieneSaldoIni ? " del período" : ""}: <b style={{ color: "#0f172a" }}>{fmtKg(kgVend)}</b></span>
            <span>= Vendidos: <b style={{ color: "#15803d" }}>{fmtKg(kgVendidos)}</b></span>
            <span>+ Disponible sin colocar: <b style={{ color: kgDispFisico > 0.01 ? "#b45309" : "#0f172a" }} data-testid="er-kg-disponible">{fmtKg(kgDispFisico)}</b></span>
            {Math.abs(kgAjuste) > 0.01 && (
              <span>+ Ajustes de saldo: <b style={{ color: "#dc2626" }} data-testid="er-kg-ajuste">{fmtKg(kgAjuste)}</b></span>
            )}
          </div>
          {tieneSaldoIni && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: "#0369a1", background: "#f0f9ff", borderRadius: 6, padding: "6px 8px" }} data-testid="er-saldo-inicial-nota">
              ℹ️ "Saldo inicial" ({fmtKg(kgSaldoInicial)}) es la fruta vendible que venía de meses anteriores (arrastre). Por eso, aunque este mes no haya cosecha, la fruta reasignada o vendida que venía de antes ya no aparece como fantasma.
            </div>
          )}
          {kgDispFisico > 0.01 && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #ddd6fe" }} data-testid="er-disponible-desglose">
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7c3aed", marginBottom: 6 }}>¿Dónde están esos kg sin colocar?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {(data?.cosecha?.disponible_canales || []).map((c) => (
                  <div key={c.canal} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#475569" }} data-testid={`er-disp-canal-${c.canal}`}>
                    <span>📦 En <b>{c.label}</b> (asignado, sin vender)</span>
                    <b style={{ color: "#b45309" }}>{fmtKg(c.kg)}</b>
                  </div>
                ))}
                {kgSinAsignar > 0.01 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#475569" }} data-testid="er-disp-sin-asignar">
                    <span>🌾 Cosechado <b>sin asignar</b> a ningún destino</span>
                    <b style={{ color: "#b45309" }}>{fmtKg(kgSinAsignar)}</b>
                  </div>
                )}
              </div>
            </div>
          )}
          {Math.abs(kgAjuste) > 0.01 && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: "#dc2626", background: "#fef2f2", borderRadius: 6, padding: "6px 8px" }} data-testid="er-ajuste-nota">
              ⚠️ "Ajustes de saldo" ({fmtKg(kgAjuste)}) NO es fruta física: proviene de "Ajustar saldo disponible" o de haber vendido/reasignado más cestas de las asignadas en algún canal. No corresponde a cosecha real.
              <div style={{ marginTop: 6 }}>
                <button type="button" onClick={abrirDiagnostico} data-testid="er-ajuste-diag-btn"
                  style={{ border: "1px solid #dc2626", background: showDiag ? "#dc2626" : "#fff", color: showDiag ? "#fff" : "#dc2626", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  {showDiag ? "Ocultar diagnóstico" : "🔎 Ver de dónde sale este ajuste"}
                </button>
              </div>
            </div>
          )}
          {showDiag && (
            <div style={{ marginTop: 8, background: "#fff", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 12px" }} data-testid="er-ajuste-diag-panel">
              {loadingDiag && <div style={{ fontSize: 12, color: "#94a3b8" }}>Calculando…</div>}
              {!loadingDiag && diag && (() => {
                const canalesSobre = (diag.canales || []).filter((c) => c.sobrevendido_kg > 0.01);
                const salidasError = diag.salidas_error || [];
                const huerfanas = diag.huerfanas || [];
                const desfasePos = diag.desfase_positivo || 0;
                const nada = canalesSobre.length === 0 && (diag.ajustes_manuales || []).length === 0
                  && (diag.diferencia_periodo || 0) <= 0.01 && salidasError.length === 0
                  && huerfanas.length === 0 && desfasePos <= 0.01;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12.5, color: "#334155" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#7c3aed" }}>Diagnóstico del ajuste de saldo ({fmtKg(kgAjuste)})</div>

                    {/* 1. Canales sobrevendidos */}
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: "#dc2626" }}>1. Canales donde vendiste MÁS de lo asignado</div>
                      {canalesSobre.length === 0 ? (
                        <div style={{ color: "#16a34a", fontSize: 12 }}>✓ Ningún canal está sobrevendido en este período.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {canalesSobre.map((c) => (
                            <div key={c.canal} style={{ background: "#fef2f2", borderRadius: 6, padding: "5px 8px" }} data-testid={`er-diag-canal-${c.canal}`}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <span><b>{c.label}</b>: asignaste {c.recibido_cestas} cestas, usaste {c.usado_cestas} → <b style={{ color: "#dc2626" }}>{c.sobrevendido_cestas} cestas de más</b></span>
                                <b style={{ color: "#dc2626", whiteSpace: "nowrap" }}>{fmtKg(-c.sobrevendido_kg)}</b>
                              </div>
                              {(c.sobrevendido_detalle || []).length > 0 && (
                                <div style={{ marginTop: 4, paddingLeft: 8, borderLeft: "2px solid #fecaca" }} data-testid={`er-diag-fechas-${c.canal}`}>
                                  <span style={{ fontSize: 11, color: "#991b1b", fontWeight: 600 }}>Ocurrió el:</span>
                                  {c.sobrevendido_detalle.map((d) => (
                                    <div key={d.fecha} style={{ fontSize: 11.5, color: "#b91c1c" }}>• {d.fecha}: {d.cestas_de_mas} cesta(s) de más ({fmtKg(-d.kg_de_mas)})</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                          <div style={{ fontSize: 11.5, color: "#64748b" }}>Corrige registrando la asignación de destino que falta a ese canal, o eliminando ventas duplicadas.</div>
                        </div>
                      )}
                    </div>

                    {/* 2. Ajustes manuales */}
                    <div>
                      <div style={{ fontWeight: 700, marginBottom: 4, color: "#b45309" }}>2. Ajustes de saldo manuales en este período</div>
                      {(diag.ajustes_manuales || []).length === 0 ? (
                        <div style={{ color: "#16a34a", fontSize: 12 }}>✓ No hay ajustes manuales en este período.</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {(diag.ajustes_manuales || []).map((a) => (
                            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, background: "#fffbeb", borderRadius: 6, padding: "5px 8px" }} data-testid={`er-diag-ajuste-${a.id}`}>
                              <span>{a.fecha ? String(a.fecha).slice(0, 10) : ""} · <b>{a.canal_label}</b> · {a.tipo === "entrada" ? "entrada (+)" : "salida (−)"}{a.observaciones ? ` · ${a.observaciones}` : ""}</span>
                              <b style={{ color: a.tipo === "entrada" ? "#b45309" : "#dc2626", whiteSpace: "nowrap" }}>{a.tipo === "entrada" ? "+" : "−"}{fmtKg(a.cantidad_kg).replace("-", "")}</b>
                            </div>
                          ))}
                          <div style={{ fontSize: 11.5, color: "#64748b" }}>Puedes eliminarlos en Analíticas → “Revisar ajustes de saldo”.</div>
                        </div>
                      )}
                    </div>

                    {/* 3. Salidas por error */}
                    {salidasError.length > 0 && (
                      <div data-testid="er-diag-salida-error">
                        <div style={{ fontWeight: 700, marginBottom: 4, color: "#dc2626" }}>3. Salidas por error en este período: {fmtKg(diag.kg_salida_error)}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {salidasError.map((s, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, background: "#fef2f2", borderRadius: 6, padding: "5px 8px" }}>
                              <span>{s.fecha} · <b>{s.canal_label}</b>{s.observaciones ? ` · ${s.observaciones}` : ""}</span>
                              <b style={{ color: "#dc2626", whiteSpace: "nowrap" }}>{fmtKg(s.cantidad_kg)}</b>
                            </div>
                          ))}
                          <div style={{ fontSize: 11.5, color: "#64748b" }}>Fruta que sacaste del sistema como “salida por error”: no es venta ni descarte, por eso queda como ajuste.</div>
                        </div>
                      </div>
                    )}

                    {/* 4. Reasignaciones huérfanas */}
                    {huerfanas.length > 0 && (
                      <div data-testid="er-diag-huerfanas">
                        <div style={{ fontWeight: 700, marginBottom: 4, color: "#b45309" }}>4. Reasignaciones huérfanas: {fmtKg(diag.kg_huerfanas)}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {huerfanas.map((h) => (
                            <div key={h.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, background: "#fffbeb", borderRadius: 6, padding: "5px 8px" }}>
                              <span>{h.fecha} · <b>{h.canal_label}</b>{h.observaciones ? ` · ${h.observaciones}` : ""}</span>
                              <b style={{ color: "#b45309", whiteSpace: "nowrap" }}>{fmtKg(h.cantidad_kg)}</b>
                            </div>
                          ))}
                          <div style={{ fontSize: 11.5, color: "#64748b" }}>Fruta que salió de un canal pero cuya entrada al destino nunca se registró (bug viejo). Al desplegar, el sistema completa la entrada faltante automáticamente y este ajuste baja.</div>
                        </div>
                      </div>
                    )}

                    {/* 5. Desfase de fechas (residual positivo) */}
                    {desfasePos > 0.01 && (
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "6px 8px", color: "#1d4ed8" }} data-testid="er-diag-desfase">
                        <b>5. Desfase de fechas: {fmtKg(desfasePos)}</b>
                        <div style={{ fontSize: 11.5, color: "#3b82f6", marginTop: 2 }}>
                          Fruta cosechada en este período pero <b>reasignada o vendida en otro</b> (o al revés). El vendible se calcula por la fecha de COSECHA y la venta/reasignación por la fecha en que la hiciste. Pon el filtro en <b>“Todo”</b> para verlo sin recorte de fecha.
                        </div>
                      </div>
                    )}

                    {/* Diferencia por período (lado negativo / sobreventa) */}
                    {diag.diferencia_periodo > 0.01 && (
                      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "6px 8px", color: "#1d4ed8" }} data-testid="er-diag-periodo">
                        <b>Diferencia por el filtro de fecha: {fmtKg(diag.diferencia_periodo)}</b>
                        <div style={{ fontSize: 11.5, color: "#3b82f6", marginTop: 2 }}>
                          Vendiste fruta que fue cosechada FUERA de este período. No es un fantasma real. Pon el filtro en <b>“Todo”</b> para verlo sin recorte de fecha.
                        </div>
                      </div>
                    )}

                    {nada && (
                      <div style={{ color: "#64748b", fontSize: 12 }}>No se detectó una causa clara; prueba a cambiar el filtro a “Todo”.</div>
                    )}
                  </div>
                );
              })()}
              {!loadingDiag && !diag && <div style={{ fontSize: 12, color: "#dc2626" }}>No se pudo cargar el diagnóstico.</div>}
            </div>
          )}
        </div>
      )}
      {kgCos <= 0 && (
        <p style={{ color: "#b45309", background: "#fef3c7", borderRadius: 8, padding: "8px 12px", fontSize: 13 }} data-testid="er-costos-kg-vacio">
          No hay cosecha registrada en este período. Registrá cosechas para ver los costos por kg.
        </p>
      )}
      <CostoKgRow num={1} label="COSTO POR KG" hint="Costo total de ventas ÷ kg cosechados" value={data?.costo_por_kg} trend={deltaPct(data?.costo_por_kg, prev?.costo_por_kg)} testid="er-costo-por-kg" />
      <CostoKgRow num={2} label="COSTO TOTAL POR KG" hint="(Costo de ventas + gastos operativos) ÷ kg cosechados" value={data?.costo_total_por_kg} trend={deltaPct(data?.costo_total_por_kg, prev?.costo_total_por_kg)} testid="er-costo-total-por-kg" />
      <CostoKgRow num={3} label="COSTO REAL VENDIBLE" hint="Costo total de ventas ÷ (cosechados − descarte − reasignado a descarte − donaciones)" value={data?.costo_real_vendible} trend={deltaPct(data?.costo_real_vendible, prev?.costo_real_vendible)} testid="er-costo-real-vendible" />
      <CostoKgRow num={4} label="COSTO TOTAL REAL VENDIBLE" hint="(Costo de ventas + gastos operativos) ÷ (cosechados − descarte − reasignado a descarte − donaciones)" value={data?.costo_total_real_vendible} trend={deltaPct(data?.costo_total_real_vendible, prev?.costo_total_real_vendible)} testid="er-costo-total-real-vendible" />
    </div>
  );
}

function KgChip({ label, value, testid }) {
  return (
    <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", flex: "1 1 auto", minWidth: 100 }}>
      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>{label}</div>
      <div style={{ color: "#0f172a", fontWeight: 700, fontSize: 14 }} data-testid={testid}>{fmtKg(value)}</div>
    </div>
  );
}

function CostoKgRow({ num, label, hint, value, trend, testid }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "11px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, background: "#ede9fe", color: "#7c3aed", fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{num}</span>
        <div>
          <div style={{ fontWeight: 700, color: "#0f172a", fontSize: 13.5 }}>{label}</div>
          <div style={{ color: "#94a3b8", fontSize: 11.5 }}>{hint}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <span style={{ fontWeight: 800, color: "#7c3aed", fontSize: 15, whiteSpace: "nowrap" }} data-testid={testid}>{fmtCostoKg(value)}<span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>/kg</span></span>
        <Trend pct={trend} testid={`${testid}-trend`} />
      </div>
    </div>
  );
}
