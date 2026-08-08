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
