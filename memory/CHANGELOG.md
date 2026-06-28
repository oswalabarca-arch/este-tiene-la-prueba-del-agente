# Changelog — ERP Agrícola

## 2026-06 (sesión fork actual)

### Dashboard · Producción general (3 gráficas agregadas) [14/06/2026]
- Se reemplazaron las 4 tarjetas KPI (Usuarios Activos, Plantaciones, Cosechado, Productividad) por la sección **"Producción general"** con 3 donuts que agregan TODOS los lotes de Plantaciones (solo lectura, vía GET /cosechas, /actividades, /aplicaciones; sin endpoint nuevo):
  - **Cosechas por calidad**: suma de primera/segunda/tercera/descarte en kg. Toggle kg/Cestas/%.
  - **Labores de personal por tipo**: suma de actividades por tipo. Toggle Horas/Costo.
  - **Aplicaciones por tipo**: suma de aplicaciones por tipo. Toggle Cantidad/Costo.
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
