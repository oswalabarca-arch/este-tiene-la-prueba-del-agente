# PRD — ERP Agrícola

## Problema original
ERP agrícola (React + FastAPI + MongoDB) con trazabilidad profunda entre módulos:
Cosechas, Ventas (Finca, Ciudad, Refrigerar, Congelar, Donaciones, Descarte),
Analíticas, Equipos, Plantaciones, Control de Asistencia, Deuda. Inventario derivado
(PEPS/FIFO), validaciones estrictas, sincronización automática, diseño responsivo.
Idioma: **Español** (todo: UI, variables, respuestas).

## Entorno
- PREVIEW: base local `erp_agricola` (MONGO_URL localhost). Se usa para pruebas.
- PRODUCCIÓN: base separada (deploy). El usuario opera a diario en producción.
- ⚠️ Nunca borrar datos de producción. Confirmar siempre PREVIEW vs PRODUCCIÓN.
- Credenciales admin: ver /app/memory/test_credentials.md (oswaldabarca@gmail.com / 123456).

## Arquitectura
- Backend: `/app/backend/server.py` (>3200 líneas, monolítico). PEPS, ventas, costos, asistencia, deuda.
- Frontend: `/app/frontend/src/pages/*` (Deuda.jsx, VentaRapida.jsx, Ventas.jsx, AsignacionDestino.jsx, Analiticas.jsx).
- Storage: Emergent Object Storage (EMERGENT_LLM_KEY).

## Implementado (histórico + reciente)
- Módulo Deuda consolidada (4 canales pagados), pagos parciales/totales.
- Historial de asignaciones con filtro de rango en AsignacionDestino.
- Reasignar cestas a Descarte desde Donaciones.
- Toggle "Pagado" en Resumen de pago de Asistencia.
- Diagnóstico de ajuste (fantasmas) en Conciliación de kg.
- Fix inventario fantasma al editar aplicaciones confirmadas.
- **Módulo Venta Rápida** (VentaRapida.jsx) — CONFIRMADO por el usuario (le gustó, se mantiene).
- **(2026-06) Venta Rápida**: sección ahora "Ventas de esta semana" — solo muestra ventas desde el lunes de la semana actual, por canal (sin límite de 5).
- **(2026-06) Seguridad P0 RESUELTO**: eliminado el bloque de credenciales por defecto visible en Login.jsx.
- **(2026-06)** Limpieza de movimientos en PREVIEW (14 registros: asignaciones + ventas) para pruebas en cero. Respaldo en /app/memory/backups/preview_movimientos_backup.json.
- **(2026-06)** Revisión de deploy: PASS, sin bloqueadores.
- **(2026-06) Reasignación ampliada**: Donaciones ahora puede reasignar a Descarte + Venta en finca / Envío a ciudad / Refrigerado / Congelado. Descarte ahora también puede devolver fruta a esos 4 canales de venta (para corregir envíos por error). Backend: `POST /api/ventas-descarte/reasignar` (nuevo) + destinos ampliados en `/api/ventas-donaciones/reasignar`. Se excluye `reasignacion_salida` de `kg_descarte_reasignado` en las 4 vistas de costos/conciliación para no inflar el descarte al sacar fruta. Verificado e2e (mover y revertir). Frontend: Ventas.jsx (REASIGNAR_DESTINOS, tarjeta de reasignación en Descarte).
- **(2026-06)** Recordatorio: "Revisar ajustes de saldo" (Analíticas) ya permite eliminar la fruta creada con "Ajustar saldo" (registros ajuste_entrada/salida).
- **(2026-06) Fix precio promedio de venta**: "Salida por error" (origen `salida_error`) se contaba como cestas vendidas con $0, bajando el promedio por cesta a la mitad. Se agregó `salida_error` a `SYSTEM_ORIGENES` en `PrecioPromedioVenta.jsx` para excluirlo. Verificado en preview (15 cestas, excluye las 10 de salida por error). Requiere redeploy.
- **(2026-06) Confirmación en "Asignación por error"**: al asignar fruta al renglón "Asignación por error" (vacío de salida) ahora aparece una confirmación advirtiendo que la fruta sale del sistema, para evitar accidentes (un usuario mandó fruta ahí queriendo "Enviar a ciudad"). Frontend: AsignacionDestino.jsx `agregar`. Remediación de datos existentes: eliminar el registro de asignacion_error (devuelve a sin-asignar) y reasignar a enviar_ciudad.
- **(2026-06) Editar/devolver asignaciones (Asignación de destino)**: Botón **Editar (✏️)** en el Historial y en "Movimientos del día" para cambiar la cantidad de una asignación (inline: cestas/kg). Editar a menos **devuelve cestas a "sin asignar"**; eliminar quita todas. Los cambios sincronizan el registro vinculado del canal de Ventas. Backend: `PUT /api/asignaciones-destino/{id}` con validación de disponibilidad del día y aviso 409 de sobreventa al reducir. No aplica al descarte automático de cosecha. Verificado e2e (editar 7→4 devolvió 3 a sin-asignar y ajustó Finca; rechaza exceder lo cosechado) + UI.
- **(2026-06) Borrado de reasignaciones ANTIGUAS (sin reasignacion_id)**: al eliminar en Descarte (o cualquier canal) una reasignación vieja creada antes del vínculo `reasignacion_id`, ahora se busca la contraparte por coincidencia (fecha + cantidad + etiqueta de origen/destino en observaciones) y se revierte el otro lado, para que la fruta regrese a su canal de origen. Backend: `_find_reasig_counterpart` + fallback en `_delete_v`. Verificado e2e. Se limpió una salida huérfana real en Ciudad (2026-09-09, 3 cestas "a Descarte" cuya entrada ya había sido borrada) devolviendo 3 cestas a Ciudad.
- **(2026-06) "Salida por error" / vacío de salida (sacar fruta del sistema)**: Dos caminos con la misma idea:
  1. Renglón **"Asignación por error"** en Asignación de destino (debajo de Donaciones, key `asignacion_error`): anula fruta cosechada real sacándola del pool "sin asignar"; no alimenta ningún canal. Se resta de `kg_vendible` en las 3 vistas de costos/conciliación para mantener el balance (kg_ajuste_saldo intacto).
  2. Destino **"Salida por error"** (key `error`) en "Reasignar cestas" de todos los canales: crea una salida `origen=salida_error` en el canal (reduce disponible), no crea nada en otro lado; para eliminar fantasma/fruta mal ubicada directamente del canal. Excluido de ventas/analíticas (agregado a VENTA_SYSTEM_ORIGENES). Verificado e2e + UI. Backend: `_reasignar_ventas` branch, vendible calcs. Frontend: AsignacionDestino.jsx y Ventas.jsx.
- **(2026-06) Filtro del Historial de asignaciones (Asignación de destino)**: se aplicó el mismo filtro mejorado que en Ventas: Hoy=cualquier día, Esta semana=mes + 1 de 4 semanas, Este mes=cualquier mes, + Rango personalizado. Solo frontend: `AsignacionDestino.jsx` (estados histDia/histSemana/histMes + PeriodPicker + cómputo de histDesde/histHasta). Verificado por screenshot.
- **(2026-06) Filtros del registro (Ventas) ampliados**: "Hoy" ahora permite elegir **cualquier día** (selector de fecha); "Esta semana" permite elegir **mes + cualquiera de las 4 semanas** (días 1–7, 8–14, 15–21, 22–fin); "Este mes" permite elegir cualquier mes (ya existía). Solo frontend: `PeriodPicker.jsx` (props isDay/isWeek + helpers currentDayStr/currentWeekStr/weekOfMonth) y `Ventas.jsx` (estados diaSel/semanaSel + lógica de filtro). Verificado por screenshot.
- **(2026-06) Devolver a "Asignación de destino"**: En "Reasignar cestas" de cada canal de ventas (Finca, Envío a ciudad, Refrigerado, Congelado, Donaciones) se agregó el destino **"Asignación de destino (deshacer)"**, que deshace la asignación: reduce/elimina la entrada del canal y su `asignaciones_destino` vinculada (nunca la auto-descarte), devolviendo la cosecha al pool "sin asignar". Solo aplica a fruta que llegó desde Asignación y sigue sin venderse. También se creó `POST /api/ventas-finca/reasignar` (Finca no tenía reasignación) y se ampliaron los destinos de todos los canales para moverse libremente entre sí. Backend: helper `_devolver_a_asignacion`. Verificado e2e (asignar 6→Finca, devolver 4→Asignación: Finca 2 / sin asignar 8) + UI. Frontend: Ventas.jsx (REASIGNAR_DESTINOS).

## Backlog priorizado
- P1: Separar permisos de Control de Asistencia (marcar vs desbloquear/editar). BLOQUEADO: pendiente decisión del usuario.
- P1: Exportar/Imprimir Planilla Semanal a PDF en ControlAsistencia.jsx.
- P1: Alertas "Tipo B" de inventario para productos de rotación (fungicidas/pesticidas).
- P2: Auth token de localStorage a cookie httpOnly.
- P2: WhatsApp (Twilio/Meta) para alertas de reposición y recordatorios de deuda.
- P2: Alerta de saldo pendiente en Dashboard antes de añadir cosecha.
- P2: Buscador por nombre/teléfono en módulo Deuda.
- P2: Historial de pagos (fechas/montos) en Deuda.
- P3: Paginación / "Ver más" en tabla de Registro de cosecha.
- P4: Refactor de server.py (solo con consentimiento explícito).

## Notas
- No "arreglar" warnings de linter (EB001 ObjectId, hooks deps) — riesgo de romper lógica.
- Fantasmas: recomendar "Ajustar saldo -> 0" en producción, no borrar registros fuente.
