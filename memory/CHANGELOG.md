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
