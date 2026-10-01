# Changelog — ERP Agrícola

## 2026-06 (sesión fork actual)

### Nuevo módulo · Estadística de compradores [Jun 2026]
- Nuevo módulo en la navegación, justo **debajo de Analíticas**. Solo lectura sobre las ventas (no altera su estructura).
- Lee todas las ventas reales (finca, ciudad, refrigerado, congelado) y muestra:
  - **Ranking de mejores compradores**: cestas, kg, total $, N° de compras, teléfono, última compra y desglose por canal; #1 destacado con corona. Ordenable por cestas / $ / N° compras.
  - **Tarjetas resumen**: compradores únicos, cestas, total vendido, mejor día.
  - **Compras por día de la semana**: gráfico de barras + 7 tarjetas con cestas por día y el **mejor comprador de cada día** (quién y cuánto); se resalta el día de mayor venta.
  - Filtro de período: Todo / Este año / Este mes.
- **Backend:** `GET /api/estadisticas/compradores(desde?, hasta?)`. Módulo `estadistica_compradores` agregado al registro de permisos (backend + Usuarios).
- **Probado:** testing_agent iteración 50 → backend 100% y frontend 100% (nav, página, orden, períodos, tarjetas por día). `/app/test_reports/iteration_50.json`.

### Ventas · Autocompletado de comprador + autollenado de teléfono [Jun 2026]
- En TODOS los módulos de venta, al escribir el nombre del comprador aparece un dropdown de sugerencias (clientes previos); al elegir uno se rellena el nombre y se autocompleta el teléfono si lo tiene.
- **Backend:** nuevo `GET /api/clientes/sugerencias` — clientes distintos (nombre + último teléfono conocido) de ventas_finca/ciudad/refrigerar/congelar/donaciones, excluyendo orígenes de sistema.
- **Frontend:** componente reutilizable `ClienteAutocomplete.jsx` (caché en memoria 60 s, invalidable). Integrado en: Ventas (nuevo ingreso `nv-cliente`, donaciones `nv-beneficiario`, modal edición `venta-form-cliente`) y Venta Rápida (`vr-cliente`). Se invalida la caché al registrar una venta para ver clientes nuevos al instante. Sigue funcionando como texto libre.
- **Probado:** testing_agent iteración 49 → frontend 6/6 escenarios (ciudad, finca, donaciones, venta rápida, modal edición, texto libre). `/app/test_reports/iteration_49.json`.

### Control de Asistencia · HORAS EXTRAS [Jun 2026]
- **Registro diario:** nuevo campo "Horas extra" por trabajador junto a Presente/Medio día (`asis-he-<id>`), se guarda al salir del campo vía `POST /api/asistencia/horas-extra`. Solo editable si el día NO está enviado/bloqueado (si está enviado → 423). Chip naranja con total de horas del día (`asis-diario-total-he`). Límite 0–24 h.
- **Planilla semanal:** badge "+Nh" bajo la P/½ de cada día; nueva columna "Horas extra" (total de la semana) ENTRE "Jornales" y "Salario diario"; fila de totales con total de horas (`asis-total-he`).
- **Cálculo de dinero:** día = 8 h, 1 hora extra = salario_diario / 8. `BCV $ = jornales × salario + horas_extra × (salario/8)`. Ej.: salario 12$ + 2 h extra en un día Presente → 12 + 2×1.5 = **15$**. Incluido también en Resumen mensual (columna + totales).
- **Backend:** `horas_extra` se guarda en `asistencia_registros`. Endpoints afectados: `/asistencia/dia` (devuelve horas_extra por fila), `/asistencia/semana` (`horas_dias`, `horas_extra`, `total_horas_extra`, bcv recalculado), `/asistencia/resumen-mensual` (horas_extra + bcv con extras), nuevo `POST /asistencia/horas-extra`. Desmarcar presencia conserva las horas extra; poner horas en 0 las elimina.
- **Verificado:** testing_agent iteración 48 → backend 6/6 y frontend 100% (todas las pantallas y testids). `/app/test_reports/iteration_48.json`.

### Analíticas · Conciliación con SALDO INICIAL (arrastre entre meses) — Opción A [Jun 2026]
- **Problema:** en la vista "Mes" la conciliación reiniciaba el saldo de cada canal a CERO al empezar el mes. Si reasignabas/vendías fruta que venía de un mes anterior (ej. 2 cestas a Ciudad y 5 a Refrigerado del 28-sep reasignadas a descarte el 1-oct), el mes lo veía como "vendiste más de lo asignado" → Kg vendible negativo (-98.56) y canales falsamente sobrevendidos. El "Disponible" (acumulado) sí arrastraba el stock, pero el "saldo del canal" mensual no → sin relación aparente.
- **Fix (backend `server.py`):**
  - Nuevo helper `_saldo_inicial_vendible(desde)`: calcula el pool vendible neto arrastrado de períodos ANTERIORES a `desde` (cosecha buena − donaciones − descarte reasig − error − ventas reales, con fecha < desde). Para "Todo" (desde=None) = 0.
  - `/analiticas/costos-kg`: añade `kg_saldo_inicial` y recomputa `kg_ajuste_saldo = (kg_saldo_inicial + kg_disponible) − kg_disponible_fisico`. En el mes actual el ajuste ahora coincide con el fantasma real de la vista "Todo" (ya no muestra ruido por corte de mes).
  - `/analiticas/conciliacion-diagnostico`: el cálculo por canal de "sobrevendido" ahora resta el `saldo_inicial_c` (arrastre de cestas de meses previos, clamp ≥0) → `sobre_c = max(usado − recibido − saldo_inicial_c, 0)`. El desglose día a día arranca del saldo inicial. Se expone `saldo_inicial_cestas` por canal y `kg_saldo_inicial`. (La fórmula interna de `kg_ajuste_saldo` del diagnóstico se dejó como antes para no meter "desfase" espurio en meses vacíos.)
- **Fix (frontend `CostosPorKg.jsx`):** nuevo chip "Saldo inicial (arrastre)" y término en la Conciliación ("Saldo inicial X + Vendible del período Y = Vendidos + Disponible + Ajuste"), con nota explicativa azul. Solo se muestra cuando hay arrastre y gran ≠ Todo.
- **Verificado (curl API externa):** mes oct 2026 → diagnóstico limpio (saldo_ini 224, ajuste 0, sin desfase/sobrevendido falso); la vista "Todo" mantiene el fantasma real preexistente (-126 en preview, no regresión). Frontend compila OK.


### Analíticas · Precio promedio de venta [14/06/2026]
- Nuevo panel **"Precio promedio de venta"** en Analíticas, debajo de "Costos por kilogramo" (solo lectura sobre los canales de Ventas; no toca otros módulos). Promedio ponderado por kg y por cesta de todas las ventas reales (finca + ciudad + refrigerar + congelar), con desglose **por canal**. 1 cesta = 14 kg.
- **Filtro propio Semana/Mes/Año** [14/06/2026]: el panel se movió a su propio componente `components/PrecioPromedioVenta.jsx` con filtro independiente (Todo/Semana/Mes/Año + fecha ancla, semana lunes→domingo). Calcula todo en el frontend con los GET de los 4 canales de ventas (desacoplado del filtro del Estado de Resultados, que NO cambió). Se removió el cálculo `venta_promedio` del backend `_build_estado_resultados`.

### Dashboard · Producción general (3 gráficas agregadas) [14/06/2026]
- Se reemplazaron las 4 tarjetas KPI (Usuarios Activos, Plantaciones, Cosechado, Productividad) por la sección **"Producción general"** con 3 donuts que agregan TODOS los lotes de Plantaciones (solo lectura, vía GET /cosechas, /actividades, /aplicaciones; sin endpoint nuevo):
  - **Cosechas por calidad**: suma de primera/segunda/tercera/descarte en kg. Toggle kg/Cestas/%.
  - **Labores de personal por tipo**: suma de actividades por tipo. Toggle Horas/Costo.
  - **Aplicaciones por tipo**: suma de aplicaciones por tipo. Toggle Cantidad/Costo.
  - **Filtro de período** [14/06/2026]: barra Todo/Semana/Mes/Año + selector de fecha que ancla el período (semana lunes→domingo). Filtra las 3 gráficas por fecha (cosecha/actividad/aplicación). Default "Todo".
  - Componente `components/DashboardTotales.jsx` (reusa colores catColor/actColor/CAL_COLORS y estilo donut de PlantacionDetail). Testing: frontend 100% (iteration_35.json).

### Ventas · Venta por kg y disponible dual en Refrigerar/Congelar [14/06/2026]
- **Disponible dual**: bajo "Disponible acumulado" ahora se muestra la cantidad en cestas Y en kg (`X cestas · Y kg`, 1 cesta = 14 kg).
- **Venta por kg**: en los canales Refrigerar y Congelar el formulario "Registrar nueva venta" tiene un toggle **Vender por: Cestas | Kilogramos**. En modo kg se ingresa Cantidad (kg) y Precio por kg; Total = kg × precio_kg y se descuenta del disponible (cestas = kg/14). El registro muestra "28 kg · $2.50/kg" o "3 cestas · $10.00/cesta" según `unidad_venta`. Finca/Ciudad siguen solo por cesta (regresión OK).
- Backend: `VentaIn` agrega `unidad_venta` (cestas|kg, default cestas, retrocompatible). Abono y edición preservan la unidad. Testing: backend 7/7 (`tests/test_ventas_kg_refrigerar_congelar.py`) + frontend 100% (iteration_34.json).

### Dashboard · Stock por canal [14/06/2026]
- Nuevo panel **"Stock por canal"** (solo lectura) en el Dashboard: muestra cuántas cestas/kg hay disponibles AHORA en cada canal (Envío a ciudad, Refrigerar, Congelar) y la **antigüedad (días)** del lote más viejo que sigue disponible (FIFO). Toggle Cestas/kg y badge de días con color (verde <2, ámbar 2-4, rojo ≥5).
- Backend `GET /api/dashboard/stock-canales`: disponible = recibido − usado por canal; antigüedad calculada consumiendo lo usado de los recibidos más antiguos (solo lectura). Componente `components/StockCanales.jsx`.

### Ventas · Refrigerar y Congelar como canales de venta completos [14/06/2026]
- **Refrigerar** y **Congelar** ahora son canales de venta completos (idénticos a "Envío a ciudad"): panel "Acumulado de hoy" con Disponible acumulado, barra de dinero, "Registrar nueva venta" inline, filtros, registro de ventas y stock en cestas/kg.
- **Renombre Frío → Congelar**: el viejo módulo "Frío" desaparece del menú; "Congelar" vive bajo el menú **Ventas** (`/dashboard/ventas/congelar`). La ruta vieja `/dashboard/frio` redirige a Congelar. (El usuario confirmó que no tenía datos en Frío.)
- **Reasignación de sobrantes encadenada** (helper backend `_reasignar_ventas`):
  - Envío a ciudad → Descarte / Donaciones / **Refrigerar**
  - Refrigerar → **Congelar** / Donaciones / Descarte
  - Congelar → Donaciones / Descarte
  - Endpoints: `POST /api/ventas-{ciudad|refrigerar|congelar}/reasignar`. La entrada al destino (salvo descarte) llega como stock disponible (origen `asignacion_destino`).
- **Asignación de destino**: "Refrigerar" → `ventas_refrigerar` y "Congelar" → `ventas_congelar` (antes iban a `frio_registros`). El stock asignado queda disponible para vender en cada canal.
- Testing: backend 5/5 + frontend 100% (iteration_33.json), `tests/test_canales_refrigerar_congelar.py` + regresión `test_reasignar_y_cascada.py`.

### Aplicaciones
- **Ingrediente activo**: nuevo campo en Compras y Entradas manuales de Inventario; se muestra en el inventario y en el form/tabla de Aplicaciones. (backend: `CompraIn`, `EntradaInventarioIn`, `InsumoItem`)
- **Dosis como texto libre**: en "Nueva aplicación" se eliminó "Cantidad de agua"; "Dosis" pasó a texto (ej: `2cc/L`). Producto + dosis son informativos. La dosis se muestra en su columna en "Aplicaciones registradas".
- **Columnas nuevas** en "Aplicaciones registradas": Producto (renombrada desde Insumos), Ingrediente activo, Dosis, Comentarios.
- **Consumo real en Pendientes**: la ficha de Aplicaciones es informativa; el operario registra agua y unidades REALES usadas (+ trabajadores/horas/precio). Al "Marcar como aplicada", esos valores reales descuentan inventario (PEPS) y van a Plantaciones/Nómina. Validación: agua y unidades > 0.
- **Productos de categoría "otros"** (pega/adherente, regulador de pH): ahora seleccionables en cualquier tipo de aplicación, además de la categoría del tipo. Límite de productos por aplicación subido de 3 a **5**.
- **Editar recetas**: botón "Editar" en cada tarjeta de receta (PUT /recetas/{id}), abre el form precargado.

### Dashboard
- **Gastos de la semana** (solo lectura): panel que totaliza lun 5am→dom 6pm (VE/UTC-4) los gastos de Compras (insumos), Vehículos, Pago de trabajadores (actividades), Herramientas y Motores nuevos. Navegación de semanas. Backend `GET /api/dashboard/gastos-semana`.

### Analíticas
- **Tendencia de costos por kg (gráfico)** [14/06/2026]: bajo el Estado de Resultados se agregó un LineChart (recharts) con la evolución mes a mes (12 meses) de las 4 métricas de costo por kg para el año seleccionado, con leyendas-toggle para mostrar/ocultar cada línea y estado vacío cuando el año no tiene cosecha. Backend `GET /api/analiticas/costos-kg-tendencia?anio=YYYY` (calcula fifo/aplicaciones/actividades/gastos/cosechas una sola vez y agrega por mes; solo lectura). Testing: backend 7/7 + frontend 100% (iteration_32.json), `tests/test_costos_kg_tendencia.py`.
- **Costos por kilogramo (panel lateral)** [14/06/2026]: al lado del Estado de Resultados se agregó el panel "COSTOS POR KILOGRAMO" con kg cosechados / descarte / vendible del período y 4 métricas: (1) COSTO POR KG = costo total de ventas ÷ kg cosechados; (2) COSTO TOTAL POR KG = (costo de ventas + gastos operativos) ÷ kg cosechados; (3) COSTO REAL VENDIBLE = costo de ventas ÷ (kg cosechados − descarte); (4) COSTO TOTAL REAL VENDIBLE = (costo de ventas + gastos operativos) ÷ (kg cosechados − descarte). Backend `_build_estado_resultados` ahora devuelve bloque `cosecha` (kg_cosechados/kg_descarte/kg_vendible, conversión cestas×14) leyendo `cosechas` del período (solo lectura). Frontend calcula las 4 métricas en vivo (reaccionan a Software ERP). testids `er-costos-kg-card`, `er-costo-por-kg`, etc.
- **Estado de Resultados (solo lectura)** [14/06/2026]: el módulo Analíticas se reescribió como un Estado de Resultados que AGREGA (no modifica) datos de otros módulos. Ingreso por ventas (ventas reales finca/ciudad/donaciones/descarte), Costo de ventas (fertilizantes/agroquímicos vía PEPS de aplicaciones confirmadas + mano de obra de actividades), Gastos operativos (Salarios = salario_diario×30, Gastos del vehículo, + manuales Otros ingresos y Software ERP). Filtros Mensual/Anual (anual = mensual×12 para salarios). "Registrar período" guarda manuales y CONGELA snapshot de salarios. Backend `GET/POST /api/analiticas/estado-resultados` (colección nueva `estado_resultados`; solo escribe en su propia colección). Testing: backend 4/4 + frontend 8/8 (iteration_31.json), `tests/test_estado_resultados.py`. Confirmado solo-lectura sobre ventas_*/aplicaciones/actividades/gastos_vehiculos/trabajadores.
- **Cuentas por cobrar clickeable**: filas abren modal con ventas pendientes por cliente (finca+ciudad) y permiten registrar abonos. Backend `GET /api/analiticas/cuentas-por-cobrar/detalle`.

### Inventario
- **Editar/eliminar entradas manuales**: botones en la tabla de entradas manuales (PUT/DELETE /inventario/entradas/{id}).
- Columna "Ingrediente activo" agregada; "Precio prom." removida.

### Ventas
- **Ajustar saldo**: herramienta para corregir el "Disponible acumulado" (POST /api/ventas-{tipo}/ajuste-saldo).
- **Fix Donaciones**: el "Registro" ahora muestra solo ventas/donaciones reales (excluye ajustes y reasignaciones que descuadraban la suma vs Disponible acumulado).

### Notas técnicas
- Semana de gastos: hora de Venezuela fija (UTC-4); fechas date-only ancladas a mediodía.
- PEPS verificado E2E (13/14 tests pasan; el que falla es por dato "hierro" inexistente en preview, no lógica).
- Lint: queda 1 falso positivo `react-hooks/set-state-in-effect` en Aplicaciones.jsx L59 (patrón estándar `useEffect(()=>{load()},[])` usado en toda la app; no afecta el build).

## 2026-09-09
- Diagnóstico de sobreventa: ahora muestra la FECHA del descuadre por canal (backend: conciliacion_diagnostico -> sobrevendido_detalle; frontend: CostosPorKg.jsx er-diag-fechas-{canal}). Verificado por testing_agent (iteration_46, 100%).
- Aviso al eliminar asignación: DELETE /asignaciones-destino/{aid} responde 409 {tipo:sobreventa,avisos} si dejaría el canal en sobreventa; con ?confirmar=true procede. Frontend pide confirmación (eliminarConAviso). Verificado por curl (409 sin confirmar, 200 con confirmar).
- Reasignaciones (descarte/otros): al eliminar se revierten ambos lados (reasignacion_id) devolviendo fruta al origen.
- Eliminar aplicación borra en cascada las labores vinculadas (aplicacion_id).
- Permiso "puede_ajustar_saldos" (solo admin por defecto) para el botón Ajustar saldo.
- Asignación de destino: quitado reset de medianoche; editable en fechas pasadas; alerta de cestas sin asignar al abrir Nueva Cosecha (endpoint /asignaciones-destino/pendientes).
