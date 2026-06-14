# Changelog — ERP Agrícola

## 2026-06 (sesión fork actual)

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
