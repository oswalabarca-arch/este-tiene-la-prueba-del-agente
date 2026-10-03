# RCA — "Estado de Resultados" 2026: annual utilidad ≠ sum of monthly utilidades

**App:** agro-dashboard-14  ·  **DB:** agro-dashboard-14-erp_agricola  ·  Read-only investigation (no writes performed).

## Problem
- Annual (2026) utilidad shown = **1906.80**
- Sum of monthly utilidades shown = jun 1051.96 + jul 1161.80 + ago −93.95 + sep 1019.15 + oct −190.96 = **2948.00**
- Gap = **1041.20** (annual is lower).

The gap is **expected given the data + code** — it comes from THREE things, one of which (vehicle expenses) the background assumed was additive but is NOT.

---

## 1) `estado_resultados` collection — anio 2026 (ALL docs)

| mes | registrado | otros_ingresos | software_erp | salarios_snapshot |
|-----|-----------|----------------|--------------|-------------------|
| 6 (jun) | true | 0 | 200 | 1374 |
| 7 (jul) | true | 0 | 200 | 1059 |
| 8 (ago) | true | 0 | 200 | 1059 |
| 9 (sep) | true | 0 | 200 | 1059 |
| **10 (oct)** | **NOT REGISTERED — doc absent** | – | – | – |
| **null (ANNUAL)** | **NOT REGISTERED — doc absent** | – | – | – |

Key facts:
- **There is no mes=null (annual) doc.** So for the annual, `_build_estado_resultados` reads `otros_ingresos=0`, `software_erp=0`, and (no `salarios_snapshot`) **recomputes salarios LIVE**.
- **Octubre is not registered either.** Its monthly view is computed live (software_erp=0, otros=0, salarios live).
- All `otros_ingresos` = 0 everywhere.

## 2) Additivity of the 4 "additive" components (annual vs Σ months 6–10)

Verified by inspecting every source doc's date prefix:
- **ventas_fresa** — all ventas_finca/ciudad/refrigerar docs dated 2026-06…2026-10 (no 2026-05, no out-of-range). `ventas_congelar` collection does not exist. → **ADDITIVE** (annual = Σ 6..10).
- **fert_agro** — FIFO cost is a fixed `total_costo` per aplicación (`_compute_fifo_costs_per_aplicacion`, global, deterministic); all 114 confirmed aplicaciones dated 2026-06…2026-10-01. → **ADDITIVE**.
- **mano_obra** — all 407 actividades `fecha_actividad` in 2026-06…2026-10-01 (no May). → **ADDITIVE**.
- **gastos_vehiculo** — **NOT ADDITIVE.** `gastos_vehiculos` contains 3 docs dated **2026-05-31** (montos 21 + 76 + 40 = **137.00**). The annual filter is the year prefix `"2026"`, so these May-31 rows ARE counted in the annual, but they fall in NO displayed month tab (Jun–Oct).
  - Σ(months 6..10) gastos = 279.80 + 305.64 + 341.00 + 242.00 + 20.00 = **1188.44**
  - Annual gastos = 1188.44 + 137.00 = **1325.44**  → annual exceeds Σmonths by exactly **137.00**.

## 3) app_config + active trabajadores
- `app_config.inicio_operaciones` = **2026-05-31**.
- trabajadores (salary calc uses salario_diario + `fecha_inactivo`, bounded by inicio_operaciones; it **ignores `createdAt` and `fecha_ingreso`**):
  | nombre | salario_diario | activo | fecha_inactivo | createdAt |
  |--------|---------------|--------|----------------|-----------|
  | Roni Herrera | 19.2 | false | 2026-10-01 | 2026-06-14 |
  | Oswaldo Abarca | 9.2 | true | (none) | 2026-06-14 |
  | Ing. Salas | 6.9 | true | (none) | 2026-06-14 |
  | **Julio** | **16.4** | true | null | **2026-10-02** |

## 4) Live annual salarios vs sum of monthly snapshots
Computed by running the actual `_dias_mes_salario`/`_worker_dias`/`_salarios_periodo` logic against this exact roster (now ≈ 2026-10-02; verified because octubre live salarios 84.20 reproduces octubre utilidad ≈ −190.96):

- Live per-month recompute = **1551.00** for each of jun–sep (= (19.2+9.2+6.9+16.4) × 30), octubre live = **84.20**.
- **`_salarios_periodo(2026, null)` (annual live) = 6339.90** (1-day May 31 prorate + full Jun–Sep + 2 days Oct).
- **Σ monthly `salarios_snapshot` (registered docs 6–9) = 1374 + 1059 + 1059 + 1059 = 4551.00.**
- Σ monthly salarios AS DISPLAYED = snapshots(4551) + octubre live(84.20) = **4635.20**.
- Annual live − monthly-displayed = 6339.90 − 4635.20 = **1704.70**.

**Why the live annual is so much bigger than the snapshots:** the annual ignores the frozen snapshots and recomputes live, and the salary proration honors only `inicio_operaciones` + `fecha_inactivo`, **not** `createdAt`/`fecha_ingreso`. So worker **Julio** (created 2026-10-02, fecha_ingreso empty) is back-dated to **2026-05-31** and counted across the WHOLE year: 16.4 × (1 May + 120 Jun–Sep + 2 Oct) = 16.4 × 123 ≈ **2017** of salary that was never present in any monthly snapshot. (Each frozen snapshot of 1059 = only Roni+Oswaldo+Salas × 30.)

---

## 5) Exact breakdown of the 1041.20 gap  (gap = Σmonths − annual)

| Component | Direction | Amount |
|-----------|-----------|--------|
| (a) otros_ingresos | all 0 in both | **0.00** |
| (b) software_erp | months carry 200×4 = 800 (oct 0); annual has 0 → cost is in months but not annual, pulling the gap DOWN | **−800.00** |
| (c) salarios | annual live 6339.90 vs monthly-displayed 4635.20 (snapshots 4551 + oct live 84.20); higher annual cost pushes annual utilidad down, widening the gap | **+1704.70** |
| (d) gastos_vehiculo (May-31 = 137, annual-only) | extra cost in annual only, widening the gap | **+137.00** |
| **Total explained** | | **+1041.70** |
| Reported gap | | 1041.20 |
| Residual | per-period cent rounding (`round()` applied independently per period over many fractional costo_total/ventas values) | ~0.50 |

The three economically meaningful drivers are **(c) salarios recomputed live + back-dated worker Julio (+1704.70)**, **(b) software_erp missing from the annual (−800.00)**, and **(d) May-31 vehicle expenses counted only in the annual (+137.00)**. The ~0.50 remainder is rounding noise, not a data error.

---

## Suggested fixes (no changes applied — read-only)
**Code (E1 — `backend/server.py`):**
1. The annual Estado de Resultados should be consistent with the monthly views. Either (a) build the annual by summing the 12 frozen monthly snapshots (salarios + software_erp + otros_ingresos) instead of recomputing salarios live and defaulting software/otros to 0 when no mes=null doc exists; or (b) make the live salary proration honor each worker's start date (`fecha_ingreso`/`createdAt`) — currently `_worker_dias` only bounds by `inicio_operaciones` and `fecha_inactivo`, so any worker added later (Julio) is retroactively charged to 2026-05-31 across the whole year.
2. Align the annual period window with the displayed month tabs so a cost dated 2026-05-31 (inicio_operaciones day) isn't silently included in the annual while absent from every month tab.

**User (data decisions, in-app):**
- Decide the May-31 vehicle expenses (137.00): move them into June, or expose a May period, so annual = Σ visible months.
- Once the code honors a worker start date, set Julio's start (he was created 2026-10-02) so he stops being charged for Jun–Sep.
- Optionally register/refresh the annual (mes=null) record so otros_ingresos/software_erp are carried into the annual.
