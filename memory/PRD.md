# ERP Agrícola — PRD

## Problema original
El usuario (Oswald) tenía una app desplegada en Emergent (https://harvest-dashboard-14.emergent.host) que era un ERP Agrícola completo. Pidió recrearla en este nuevo proyecto a partir de lo que se ve en la app desplegada, ya que no tenía acceso al código original.

Stack original detectado: Next.js + MongoDB + cookies de sesión.  
Stack de recreación: **React + FastAPI + MongoDB** (default de Emergent).

## Flujo de negocio (del propio usuario)
```
Cosecha → Asignación de destino → Ventas (finca/ciudad), Frío, Descarte
Compras → Inventario + Equipos (es_equipo=true)
Aplicaciones → Actividades (pendientes/confirmadas), usa Inventario
Actividades → Inventario + Recursos Humanos
Aplicaciones usa recetas (plantillas de insumos)
```

## Roles y permisos
- `administrador` — acceso a todo
- `ingeniero` — campo y aplicaciones
- `encargado_campo` — registro de actividades y cosechas
- `operario` — limitado
- Cada usuario tiene `modulos_asignados[]` que controlan visibilidad

## Cambio: Ventas muestra "Acumulado de hoy" + "Disponible acumulado" (02/06/2026)
- Pedido refinado del usuario (con captura de producción): MANTENER el bloque "Acumulado de hoy" (movimientos del día) y AGREGAR un "Disponible acumulado" que conserve las cestas no vendidas/donadas y las arrastre al día siguiente.
- Implementación (`Ventas.jsx`, solo módulo Ventas):
  - Bloque "Acumulado de hoy" con tarjetas diarias: Asignado hoy / Vendido hoy / Reasignado hoy / **Disponible hoy** (= asignadoHoy − vendidoHoy − reasignadoHoy).
  - Número grande nuevo: **Disponible acumulado** (= asignadoTotal − vendidoTotal − reasignadoTotal, sobre TODOS los días). Es el stock real que se puede vender/reasignar y arrastra al día siguiente.
  - Las validaciones de vender y reasignar usan el disponible ACUMULADO (para poder sacar cestas de días anteriores).
- Backend `/ventas-ciudad/reasignar`: valida contra disponible acumulado (todos los registros).
- Verificado E2E: asignar 6 ayer + 4 hoy → "Asignado hoy 4", "Disponible hoy 4", "Disponible acumulado 10". Tests `test_reasignar_y_cascada.py` 2/2 PASAN.
- ⚠️ Datos históricos: si un módulo tiene ventas viejas registradas sin pasar por "Asignación de destino", el Disponible acumulado puede dar negativo. En producción está la versión vieja ("Acumulado de hoy" sin acumulado); falta DESPLEGAR esta versión.


- Nuevo bloque "Reasignar cestas sobrantes" (visible cuando hay Disponible > 0 hoy en tipo=ciudad): cantidad + destino (Descarte/Donaciones) + botón.
- Backend `POST /api/ventas-ciudad/reasignar`: valida cantidad ≤ disponible del día y destino válido; crea registro de salida en `ventas_ciudad` (origen `reasignacion_salida`, reduce disponible) y registro de entrada en el destino (`ventas_descarte` con origen `reasignacion_ciudad`; `ventas_donaciones` con origen `asignacion_destino` = queda "disponible para donar").
- Panel de Ventas ciudad ahora muestra 4 métricas: Asignado / Vendido / **Reasignado hoy** / Disponible. Las reasignaciones ya NO se cuentan como "Vendido".
- Test: `tests/test_reasignar_y_cascada.py` (autocontenido, siembra cosecha y limpia).

### Fix: gastos huérfanos / "Total gastos operativos" $485 (Vehículos)
- Causa: al eliminar un vehículo, sus gastos NO se borraban → quedaban huérfanos e imposibles de eliminar (solo se borran entrando al vehículo).
- Fix backend: `DELETE /api/vehiculos/{id}` ahora borra en cascada sus `gastos_vehiculos` (evita nuevos huérfanos).
- Fix frontend: nueva sección "Gastos sin vehículo asignado" en Vehículos, con borrado individual y "Eliminar todos" para limpiar los huérfanos existentes. Confirmación de borrado de vehículo ahora avisa que se eliminarán N gastos.
- Test: `tests/test_reasignar_y_cascada.py::test_eliminar_vehiculo_borra_gastos_en_cascada`.


- **Keys de índice → IDs estables** (16 instancias): Aplicaciones, Actividades, PlantacionDetail (consolidado/rendimiento), Compras (sugerencias), Inventario (lotes PEPS/datalist). Filas editables del formulario de Aplicaciones ahora usan `_rid` estable (`nextRid()`) en alta, init y reset por cambio de Tipo. Verificado: 0 warnings de React keys; alta/baja de filas no mezcla valores.
- **Hooks**: el reporte estaba desactualizado; al correr `react-hooks/exhaustive-deps` solo quedaba 1 advertencia real → `AsignacionDestino.jsx` `load` envuelto en `useCallback`. Verificado: sin loop infinito, recarga al cambiar fecha.
- **useMemo**: total de cestas en `Ventas.jsx` memoizado (`totalCestas`). Las computaciones pesadas reales viven en `PlantacionDetail` (se abordarán en el refactor de CosechasTab, Fase B). Las de arrays diminutos (NAV ~15, CAL_DEFS 4, Vehiculos 3 elementos) se dejaron sin memo intencionalmente (sin beneficio real).
- **`is` vs `==` (Python)**: falsos positivos — `server.py` líneas 214/258 son `is not None` (forma correcta). Los `is True` en tests comparan singletons (correcto); cambiarlos a `==` generaría warning E712. Sin cambios.
- Fase B (división de componentes grandes) y Fase C (Auth httpOnly + refactor PEPS backend) quedan pendientes de confirmación por riesgo en producción.


- Bug reportado: en tablet, al asignar cestas la cantidad "se quedaba en 1"/se deformaba. Causa raíz: `<input type="number">` solo acepta punto (.) como separador decimal; el teclado en español de tablets usa coma (,), por lo que "1,5" se guardaba como "15".
- Solución: nuevo componente reutilizable `frontend/src/components/DecimalInput.jsx` (type="text" + inputMode="decimal", acepta coma o punto y normaliza a punto; emite onChange con evento sintético para ser drop-in).
- Aplicado a ~30 campos decimales en 13 páginas (cantidades, kg, cestas, precios, montos, salarios, horas). Se respetaron los campos enteros (año, kilometraje, # trabajadores, días) que siguen como `<input type="number">`.
- Cosecha usa su propio componente `Field`, también actualizado para usar DecimalInput en type="number".
- Verificado E2E: registrar compra con "12,75" y "99,5" persiste como 12.75 / 99.5. Coma y punto funcionan en escritorio y tablet.


## Implementado (Fase 1 — 30/01/2026)
- Auth con JWT Bearer (+ cookie httpOnly como fallback), bcrypt, seed admin automático
- Layout con sidebar y submenús colapsables, control por permisos
- Dashboard con KPIs agregados
- **Usuarios** — CRUD + cambio de contraseña + matriz de módulos
- **Plantaciones** — CRUD por tarjetas
- **Tipos de fruta + Variedades** — catálogos inline desde Cosecha
- **Cosecha** — CRUD con calidades (1ª/2ª/3ª/descarte), filtros por periodo, lote, tipo, variedad. Toggle Cestas/kg. Sección "Cosecha del día".
- **Asignación de destino** — recibe cosecha del día; destinos: venta_finca, enviar_ciudad, frio, descarte; conversión automática KG_POR_CESTA=14.
- **Compras** — CRUD; si `es_equipo=true` crea entrada en /api/equipos automáticamente.
- **Inventario** — calculado en tiempo real de compras (total_comprado) menos aplicaciones (total_enviado).
- **Aplicaciones** — CRUD con insumos seleccionables del inventario + recetas reutilizables + confirmación que pasa a Actividades.
- **Actividades** — historial, pendientes (desde aplicaciones), registrar manual; auto-cálculo horas_hombre.
- **Ventas finca/ciudad** — CRUD básico con cálculo de totales.
- **Frío** — registro de ingresos a cámara fría.
- **Equipos** — CRUD.
- **RRHH** — Trabajadores + Nómina (resumen).
- **Analíticas** — métricas globales.

## Estado de testing
Backend: **21/21 tests pasaron** — auth, users, plantaciones, tipos/variedades, cosechas, asignaciones (conversión cestas↔kg), compras (es_equipo crea equipo), aplicaciones, inventario aggregation, actividades (horas_hombre), ventas, frío, trabajadores, analíticas.

## Implementado (Fase 2 — 30/05/2026)
- **Aplicaciones** reorganizado con pestañas **Aplicaciones** | **Recetas**
- **Nueva Receta** como modal completo accesible desde la pestaña Recetas: nombre, agua total (L), lista dinámica de productos (con `+` para agregar y `X` para remover), observaciones
- Unidades soportadas en recetas y aplicaciones: **Gramos, CC, ml, Kg, Lt** (antes solo Gramos/CC)
- Listado de recetas en formato tarjeta con detalle expandible (modal "Ver receta") y eliminar
- Validado end-to-end con backend `/api/recetas` (CRUD)

## Backlog / Próximas sesiones
- **P0** Validación visual con el usuario contra screenshots del original
- **P1** Subida de imágenes a plantaciones, equipos
- **P1** Filtros por periodo en Aplicaciones (Hoy/Semana/Mes/Año)
- **P1** Permisos detallados por módulo (editar/eliminar)
- **P2** Gráficos en Analíticas (recharts ya está instalado)
- **P2** Asignación de destino vinculada explícitamente a una cosecha de origen (trazabilidad)
- **P2** Cálculo de nómina por horas-hombre × salario_diario
- **P2** Generación de equipos automáticos en compras: validar UI muestra inmediatamente el equipo creado
- **P2** Endpoint de validación de stock antes de crear aplicación

## Implementado (Mejora Cosecha — 31/05/2026)
- En "Nueva cosecha", los campos **Tipo de Fruta** y **Variedad** ahora son inputs de texto con autocompletado (`datalist`).
- Las sugerencias provienen de los **cultivos** y **variedades** registrados en el módulo Plantaciones. Si se selecciona un lote, se filtran a los de esa plantación; si no, se muestran todos.
- Backend `CosechaIn`: ahora guarda `tipo_fruta`/`variedad` como strings (campos `tipo_fruta_id`/`variedad_id` quedan opcionales por compatibilidad). Display y filtros con fallback a registros legacy.

## Implementado (Asignación de destino · trazabilidad — 31/05/2026)
- **Rediseño de "Asignación de destino"** según modelo del usuario: tarjeta "Fruta total cosechada (hoy)" con desglose de calidades en cestas (sin %), número grande "Disponible" (Cosecha − Asignado), y tabla "Distribución del día" con 7 destinos (Venta en finca, Enviar a ciudad, Enviar a otra ciudad, Refrigerar, Congelar, Descarte, Donaciones), cada uno con cantidad + unidad + botón Agregar y columna "Acumulado hoy".
- **Trazabilidad automática**: al asignar cestas a un destino, el backend crea un registro vinculado en el módulo correspondiente:
  - Refrigerar/Congelar → módulo **Frío** (`frio_registros`, con `tipo_conservacion` refrigerado/congelado).
  - Venta en finca → `ventas_finca`; Enviar a ciudad / Enviar a otra ciudad → `ventas_ciudad`; Descarte → `ventas_descarte`; Donaciones → `ventas_donaciones`.
  - Cada registro vinculado lleva `origen="asignacion_destino"` y `asignacion_id`.
- **Cascade delete**: al eliminar una asignación se borra su registro vinculado (`delete_many` por `asignacion_id`).
- **Ventas editable**: nuevo `PUT /api/ventas-{tipo}/{id}` (preserva `origen`/`asignacion_id`). Las ventas recibidas llegan con precio $0 y se pueden editar (botón lápiz) para fijar precio; total se recalcula. Badge "Asignación" vs "Manual" en Ventas y Frío.
- Validación UX: confirma si se intenta asignar más cestas que las disponibles del día.
- Testing: 11/11 pytest backend + flujos UI verdes (`/app/backend/tests/test_asignacion_destino.py`).

## Implementado (Asignación de destino · registro diario + reset medianoche — 31/05/2026)
- **Reset automático a medianoche**: la "Asignación de destino" es un módulo diario. Un temporizador detecta el cambio de día (11:59pm → 12:00am) y, si estabas viendo "hoy", reinicia automáticamente la vista en 0 para la nueva cosecha.
- **Registro diario consultable**: selector de fecha en el encabezado. Cada día queda guardado (cosechas + asignaciones con su fecha). Se puede consultar cualquier día pasado en **solo lectura** (banner amarillo, inputs y botón "Agregar" deshabilitados; solo el día de hoy es editable).
- **Cestas sin asignar**: el panel superior muestra "Sin asignar" (Cosecha − Asignado) y "Movimientos del día" muestra "Cestas sin asignar"; lo que queda sin asignar permanece en el registro del día.
- Estilo global: botones `:disabled` ahora se ven grises (opacity 0.5).

## Implementado (Ventas en finca · datos de cliente — 31/05/2026)
- Formulario de venta ampliado: Nombre del cliente, Teléfono, Cantidad de cestas, Precio por cesta (calcula kg y Total), Abono inicial (calcula Saldo pendiente), Fecha y Observaciones. Tabla con columnas Teléfono, Abono y Saldo. Backend `VentaIn` con `telefono` y `abono_inicial`.

## Implementado (Plantaciones · pestaña Cosechas — 31/05/2026)
- La pestaña "Cosechas" del detalle de Plantaciones ahora muestra los registros reales del módulo Cosecha filtrados por el lote (Fecha, Tipo, Variedad, 1ª/2ª/3ª/Descarte, Total, Unidad) — antes usaba campos inexistentes.

## Implementado (Ventas en finca/ciudad · panel completo — 31/05/2026)
- **Panel superior**: tarjeta verde "Acumulado de hoy" (Asignado hoy / Vendido hoy / Disponible) + toggle Cestas/kg + barra de dinero (Vendido hoy, Total vendido, Cobrado %, Saldo/Deuda con deudores). "Asignado" = cestas recibidas desde Asignación de destino (origen=asignacion_destino); "Vendido" = ventas manuales; Disponible = Asignado − Vendido (rojo si negativo).
- **Registrar nueva venta (inline)**: cliente, teléfono, cestas, precio, abono inicial, fecha, observaciones, con Total/Saldo en vivo y botones Limpiar/Registrar.
- **Filtros del registro**: período (Todo/Hoy/Semana/Mes/Año), buscar (nombre/teléfono), estado de pago, días endeudado mínimo, sólo deudores, limpiar.
- **Registro de Ventas**: tabla con Cliente, Teléfono, Cestas, Precio/cesta, Total, Abono, Saldo, Fecha, **Días endeudado**, **Estado** (Sin abonar/Abono parcial/Pagado) y acciones: **abonar** (modal, usa PUT sobre abono_inicial), editar, eliminar.
- Las money cards reflejan la vista filtrada ("X venta(s) en vista"). Sin cambios de backend (todo se calcula de ventas_finca existentes).
- Testing: backend 100% (5/5) + frontend 100% (`/app/backend/tests/test_ventas_descarte_auto.py`).

## Implementado (Analíticas · Cuentas por cobrar — 31/05/2026)
- Nueva sección **"Cuentas por cobrar"** dentro del módulo **Analíticas** (solo se ve ahí).
- Backend `GET /api/analiticas/cuentas-por-cobrar`: agrupa la deuda **por cliente** sumando ventas de **finca + ciudad** con saldo pendiente (total − abono_inicial > 0). Devuelve por cliente: total vendido, abonado, saldo, n_ventas, días máx. de mora y módulos de origen; más totales (deuda total, vendido, cobrado, n_deudores). Excluye clientes pagados.
- Frontend Analíticas: KPIs (Deuda total, Total vendido, Total cobrado, Deudores) + tabla "Deuda por cliente" con badges de origen, búsqueda y badge de días (rojo si ≥30). Verificado: Maria Perez agrupada correctamente entre finca+ciudad; clientes pagados excluidos.

## Implementado (Donaciones · panel completo sin dinero — 31/05/2026)
- El submenú **Donaciones** (`/dashboard/ventas/donaciones`) ahora replica el layout de "Venta en finca / Envío a ciudad" PERO **sin ningún campo de dinero**.
- **Panel "Acumulado de hoy"**: 3 cards (Asignado hoy / Donado hoy / Disponible para donar). No muestra barra de dinero.
- **Registrar nueva donación (inline)**: Beneficiario, Teléfono, Cantidad de cestas, Fecha, Observaciones (sin precio/abono/total/saldo).
- **Filtros**: período (Todo/Hoy/Semana/Mes/Año) + buscar por beneficiario/teléfono. Sin filtros de estado de pago ni deudores.
- **Registro de Donaciones**: tabla con Beneficiario, Teléfono, Cestas, kg, Fecha, Observaciones, Acciones (editar/eliminar; sin abonar). Modal de edición "Editar donación" oculta campos de dinero.
- **Backend defensivo**: `_ventas_router("donaciones")` fuerza `precio_unitario=total=abono_inicial=0` en POST/PUT (verificado vía curl: envío 99/198/50 → guarda 0/0/0).
- Reutiliza el componente compartido `Ventas.jsx` (branch `esDonacion`). Sin cambios de esquema.
- Testing: backend 100% (5/5, `/app/backend/tests/test_ventas_donaciones.py`) + frontend 100% (iteration_4.json).

## Implementado (Ventas/Donaciones · disponibilidad obligatoria — 31/05/2026)
- En los 3 submenús de Ventas (Venta en finca, Envío a ciudad, Donaciones) ahora es **obligatorio** tener cestas en "Disponible" para poder vender/donar.
- `registrarVenta` bloquea si `cantidad_cestas > disponible` (toast: "Solo hay X cesta(s) disponible(s) hoy...") y no crea el registro.
- El botón "Registrar" (nv-registrar) se **deshabilita** cuando `disponible <= 0` y se muestra aviso rojo: "Sin cestas disponibles hoy. Asigná desde Asignación de destino." `disponible = asignadoHoy − vendidoHoyCestas`.
- Testing frontend 100% (iteration_5.json): camino negativo (Disponible 0 → bloqueado), exceso (bloqueado), monto exacto (permitido, Disponible→0).
- Pendiente de endurecimiento (futuro): la validación es solo frontend; un guard de backend debe excluir los POST con `origen=asignacion_destino` (que crean el stock) para no romper la trazabilidad.

## Implementado (Equipos · Vehículos · historial de gastos operativos CRUD — 31/05/2026)
- En el detalle de cada vehículo (módulo Equipos → Vehículos, ruta /dashboard/equipos/vehiculos), la sección "Historial de gastos operativos" ahora permite **Registrar, Ver, Editar y Eliminar** gastos directamente (antes era solo lectura; se cargaban únicamente desde Compras).
- Botón "Registrar gasto" (`gasto-new-btn`) abre `GastoModal` (Categoría: gasolina/repuestos/mano_obra, Monto, Fecha, Descripción). Validación: monto > 0 obligatorio.
- Cada fila (`gasto-row`) tiene acciones **Ver** (`gasto-ver` → `GastoViewModal` solo lectura), **Editar** (`gasto-editar` → reusa GastoModal) y **Eliminar** (`gasto-eliminar` → confirm + DELETE). Los KPIs (Gasolina/Repuestos/Mano de Obra/Total) se actualizan reactivamente.
- Backend ya tenía CRUD completo en `/api/gastos-vehiculos` (GET/POST/PUT/DELETE) — verificado por curl. Cambio 100% frontend en `Vehiculos.jsx`.
- Testing frontend 100% (iteration_6.json): registrar/ver/editar/eliminar + validación monto=0/vacío.

## Implementado (Equipos · Motores/Herramientas · acción "Ver" — 31/05/2026)
- En los submódulos **Motores** (/dashboard/equipos/motores) y **Herramientas** (/dashboard/equipos/herramientas), cada fila del inventario ahora tiene una acción **Ver** (`equipo-ver-<id>`) que abre `EquipoViewModal` (solo lectura) con todos los datos del equipo: nombre, categoría, estado, marca, modelo, año, cantidad, precio unitario, valor total, fecha de adquisición, responsable, ubicación y observaciones.
- Cambio 100% frontend en `Equipos.jsx`; sin backend. Lint OK. (Comparte patrón con GastoViewModal, ya validado.)

## Implementado (Filtros de período · selector de Mes/Año — 31/05/2026)
- En los filtros de período de **todos los módulos** (Ventas finca/ciudad/donaciones, Cosecha, Aplicaciones, RRHH→Nómina), al elegir el pill **"Mes"** aparece un selector `<input type="month">` y al elegir **"Año"** aparece un `<select>` de años, para ver el mes/año específico que el usuario quiera (antes solo mostraban el actual).
- Componente compartido nuevo `/app/frontend/src/components/PeriodPicker.jsx` (+ helpers `currentMonthStr`/`currentYearStr`). El `<select>` de año ofrece rango (actual-5 … actual+1) + años presentes en los datos.
- Por defecto el selector arranca en el mes/año actual (comportamiento retrocompatible). Cambiar el valor re-filtra la lista y los KPIs del módulo.
- Cambio 100% frontend. Testing frontend 100% en los 4 módulos (iteration_7.json).
- Pendiente menor (backlog): unificar testids de pills entre módulos ('año' vs 'ano', 'todo' vs 'todos').

## Implementado (Actividades · filtros del historial — 31/05/2026)
- En el módulo **Actividades** (página "Registrar Actividad"), la tabla **"Historial de actividades"** ahora tiene una barra de filtros: **Período** (Hoy / Semana / Mes / Año / Todo) con el selector de mes/año (`PeriodPicker`, testidPrefix `actividades`) y **filtro por Tipo** (`actividades-filtro-tipo`).
- Filtra por `fecha_actividad` y por `tipo_personalizado || tipo`; combinables. Muestra "X de Y actividad(es)" y estado vacío "Sin actividades para los filtros aplicados".
- Cambio 100% frontend en `Actividades.jsx`. Testing frontend 100% (iteration_8.json): visibilidad de pickers, filtrado por período/tipo, combinación y estado vacío.

## Implementado (Plantaciones · plantas por variedad + total — 31/05/2026)
- En el formulario **Nueva/Editar Plantación**, cada variedad agregada ahora tiene un campo numérico **"Plantas"** para indicar la cantidad de plantas de esa variedad (`plant-form-variedad-cantidad-<nombre>`).
- Cuando hay **2 o más variedades** se muestra un bloque **"Total de plantas de la plantación"** (`plant-form-total-plantas`) con la suma en vivo y el número de variedades. (Con 1 sola variedad no se muestra, ya que el conteo es el total.)
- Backend: `PlantacionIn` ahora tiene `plantas_por_variedad: Dict[str,float]` y `total_plantas: float`. El form también setea `inventario_plantas = total` (con fallback al valor previo si el total es 0). POST/PUT `/api/plantaciones`.
- Testing 100% backend (persistencia) + frontend (iteration_9.json): total condicional, actualización en vivo, quitar variedad, y persistencia al reabrir en Editar.

## Implementado (Plantación · detalle muestra plantas por variedad — 31/05/2026)
- En la ficha **Plantación – Detalles**, pestaña **General**, sección "OTRA INFORMACIÓN", el campo **"Inventario (plantas)"** ahora muestra al lado el desglose de **cuántas plantas se registraron de cada variedad** (badges "Variedad: cantidad"), tomado de `plantas_por_variedad`.
- Solo lectura, sin backend. Reutiliza el campo persistido en POST/PUT plantaciones (testids `plant-detail-inventario-plantas`, `plant-detail-plantas-<variedad>`).

## Implementado (Plantaciones · total de plantas en la tarjeta — 31/05/2026)
- En el **listado de Plantaciones**, cada tarjeta ahora muestra el **total de plantas** del lote (badge verde con ícono, ej. "2.000 plantas") cuando hay un total registrado. Lee `total_plantas || inventario_plantas`. Testid `plantacion-total-plantas-<id>`. Solo lectura, sin backend.

## Implementado (Plantación · pestaña Cosechas con toggle Cestas/kg — 31/05/2026)
- En la pestaña **Cosechas** del detalle de plantación, se agregaron dos botones (pills) **Cestas / kg** arriba a la derecha (como el módulo Cosecha). Al cambiar, todas las cantidades (1ª, 2ª, 3ª, Descarte, Total por fila y Total general) se convierten (1 cesta = 14 kg) según la unidad en que se guardó cada cosecha. Encabezados de columna muestran la unidad activa. Se eliminó la columna "Unidad" por fila.
- Cambio 100% frontend (`PlantacionDetail.jsx` → `CosechasTab`). Testing frontend 100% (iteration_10.json): Total 52 cestas ↔ 728 kg (×14), filas convertidas correctamente. Testids `plant-cosecha-unidad-cestas/kg`, `plant-cosecha-total`.

## Implementado (Plantación · tabla "Rendimiento por planta" — 31/05/2026)
- En la pestaña **Cosechas** del detalle de plantación, se agregó la tarjeta **"Rendimiento por planta"** (`plant-rendimiento-card`) con tabla de columnas **Tipo de fruta | Variedad | Rendimiento por planta**.
- Rendimiento = **kg totales cosechados de esa variedad ÷ plantas registradas de esa variedad** (kg = total en cestas × 14). Agrupa por tipo+variedad; muestra subtexto "X kg ÷ Y plantas". Si la variedad no tiene plantas registradas → "Sin plantas registradas (X kg)". No depende del toggle Cestas/kg.
- El cruce variedad↔plantas se normaliza (trim + minúsculas) para tolerar diferencias de mayúsculas/espacios.
- Testing frontend 100% (iteration_11.json): caso positivo (168/500=0.34, 560/600=0.93), negativo, independencia del toggle, agrupación y reversión de datos.

## Implementado (Plantación · columna "Cantidad de plantas" en Rendimiento — 31/05/2026)
- En la tabla **"Rendimiento por planta"** (pestaña Cosechas del detalle de plantación) se agregó la columna **"Cantidad de plantas"** entre Variedad y Rendimiento, mostrando las plantas registradas de esa variedad (`f.plantas`). Testid `plant-rendimiento-plantas`. Solo frontend, lint OK.

## Implementado (Plantación · gráficos de calidades en Cosechas — 31/05/2026)
- En la pestaña **Cosechas** del detalle de plantación:
  - La ficha **"Rendimiento por planta"** se redujo a ~mitad de ancho (`maxWidth: 560`).
  - **Gráfico principal "Calidades del lote"** (`plant-calidades-chart`): donut con las 4 calidades (1ª verde, 2ª azul, 3ª ámbar, descarte rojo) en porcentaje, con el **rendimiento total en kg** en el centro y leyenda con % + kg por calidad.
  - **Gráficos secundarios "Calidades por variedad"** (`plant-calidades-variedad-chart`): un pie pequeño por cada variedad (`plant-variedad-chart-<variedad>`) con el % de cada calidad y total en kg, más una leyenda compartida.
- Implementado con **recharts** (primer uso en el proyecto, ya instalado). Cálculos en kg (cestas × 14). Cambio 100% frontend (`PlantacionDetail.jsx`).
- Testing frontend 100% (iteration_12.json). Nota: recharts emite un warning benigno de ResponsiveContainer en el primer render (no es error; los gráficos renderizan bien).

## Ajustes (Plantación · Cosechas · 31/05/2026 — v2)
- Ficha **"Rendimiento por planta"** aún más compacta (`maxWidth: 440`), confirmada como última tarjeta (debajo de "Calidades por variedad").
- Gráficos **"Calidades por variedad"**: los porcentajes ahora se muestran **dentro de cada porción** (texto blanco, `renderPctLabel`), contenedor más grande (180px, outerRadius 72) — ya no se cortan por el recuadro.
- Bug corregido (por testing agent): el instrumentador del visual-editor envolvía la expresión JSX en un `<span>` dentro del `<text>` SVG (los `<span>` HTML no renderizan dentro de SVG), mostrando solo "%". Fix: usar un único template literal `{\`${...}%\`}` en el `<text>`. (Regla: dentro de `<text>` SVG NO mezclar `{expr}` + texto literal; usar template literal o `<tspan>`.)
- Testing frontend 100% (iteration_13.json), con screenshots de verificación.

## Ajustes (Plantación · Cosechas · 31/05/2026 — v3 layout)
- "Calidades del lote" (donut reducido 190px) y "Rendimiento por planta" ahora van **lado a lado** en una fila flex, cada uno ~mitad del ancho (`flex: 1 1 320px`). Las gráficas "Calidades por variedad" quedan debajo a todo el ancho.
- Testing frontend 100% (iteration_14.json): medido a 1920px → calidades-chart (x=590, w=479) y rendimiento-card (x=1087, w=479) en la misma fila (top=355); variedad-chart full-width debajo (top=659). Donut 728 kg, leyendas y tabla de rendimiento correctas. Warning cosmético de recharts (no afecta UX).

## Implementado (Plantación · filtros en pestaña Cosechas — 31/05/2026)
- En la pestaña **Cosechas** del detalle de plantación se agregó una barra de filtros: **Período** (Hoy/Semana/Mes/Año/Todo con selector de mes/año específico, `cosecha-filtro-periodo-*` + `cosecha-filtro-picker-mes/anio`) y **Variedad** (`cosecha-filtro-variedad`), más botón **"Limpiar filtros"**.
- Los filtros aplican a `itemsF` y afectan coherentemente la **tabla** (filas `cosecha-row`, encabezado "X de Y"), los **totales**, el **gráfico "Calidades del lote"**, los **"Calidades por variedad"** y la tabla **"Rendimiento por planta"**. Estado vacío "Sin cosechas para los filtros aplicados" (oculta gráficos cuando no hay datos). Compatible con el toggle Cestas/kg.
- Cambio 100% frontend (`PlantacionDetail.jsx`, reutiliza `PeriodPicker`). Testing frontend 100% (iteration_15.json).

## Implementado (Plantación · Cosechas · totales consolidados por variedad — 31/05/2026)
- En la pestaña **Cosechas** se agregó la tarjeta **"Totales por variedad (todas las fechas)"** (`plant-cosecha-consolidado`) que suma TODAS las cosechas de cada variedad sin importar la fecha (ej. 5 cestas albion enero + 5 albion marzo = 10). Columnas: Tipo de fruta, Variedad, 1ª, 2ª, 3ª, Descarte, Total + fila "Total general".
- **Independiente de los filtros** de período/variedad (usa `items` completos), pero **respeta el toggle Cestas/kg** (multDe).
- Testing frontend 100% (iteration_16.json): totales (albion 40, san andreas 12, total 52 cestas), independencia de filtros, conversión kg (×14), y **suma entre fechas** verificada (albion 40→47 al agregar cosecha en otra fecha, luego restaurado).
- Adicional: se eliminó el warning recurrente de recharts en "Calidades del lote" usando `<PieChart width={190} height={190}>` fijo (su contenedor ya era de tamaño fijo).

## Ajuste (Plantación · Cosechas · orden — 31/05/2026)
- Se movió la tarjeta **"Registro de cosecha"** (con sus filtros período/variedad, toggle Cestas/kg y tabla) al **final** de la pestaña, debajo de "Calidades por variedad". Nuevo orden: Totales por variedad → [Calidades del lote | Rendimiento por planta] → Calidades por variedad → Registro de cosecha.
- Reordenamiento puro (sin cambio de lógica). Lint OK, sin testids duplicados, orden verificado.

## Fix + Rediseño (Plantación · Cosechas · "Producción en el tiempo" — 01/02/2026)
- **BUG resuelto:** la pestaña **Cosechas** del detalle de Plantación no abría (quedaba en blanco). Causa raíz: el gráfico usaba `<BarChart>/<Bar>` de recharts que ya **no estaban importados** (cambio previo a mitad de tarea) → crash al renderizar `CosechasTab`.
- **Rediseño del gráfico** (según mockup `grafico de cestas y tiempo por modulo.png`): se reemplazó el gráfico de barras por **"Producción en el tiempo"**, un **AreaChart apilado por calidad** en **kg** (eje Y = Producción (kg)):
  - Áreas apiladas con gradiente: **1ª verde, 2ª azul, 3ª ámbar, Descarte rojo** (`grad-<key>`).
  - **Selector de Año** (`cosecha-serie-anio`) — por defecto el año actual; opciones = años presentes en datos.
  - Toggle **Por semana (52)** (`cosecha-serie-semana`) / **Por mes (12)** (`cosecha-serie-mes`).
  - **Filtro de variedad** (`cosecha-serie-variedad`) y **toggles de calidad** (`cosecha-serie-cal-<key>`) para mostrar/ocultar capas.
  - **4 tarjetas resumen** (`cosecha-serie-resumen`): **PICO MÁXIMO**, **MÍNIMO (CON DATOS)**, **PROMEDIO (PERÍODOS CON DATOS)**, **TOTAL {año}** (componente `ResumenCard`).
  - Estado vacío `cosecha-serie-empty` cuando el año/variedad no tiene datos.
- Cambio 100% frontend (`PlantacionDetail.jsx`). Lint OK. Testing frontend **100%** (iteration_18.json): no-crash, render del area chart, selector de año (vacío en 2024), toggles semana/mes, filtro variedad, toggles de calidad, 4 tarjetas (l1: PICO Abr·560, MIN May·168, PROM 364, TOTAL 728 kg) y regresiones (cestas/kg, tabla, consolidado, calidades del lote, rendimiento por planta).
- Nota: datos de cosecha sólo existen para **2026**. `PlantacionDetail.jsx` ya tiene ~877 líneas → candidato a refactor (dividir tabs en archivos).

## Implementado (Plantación · Aplicaciones · gráfica circular por tipo — 01/02/2026)
- En el detalle de Plantación, pestaña **Aplicaciones**, se agregó una **gráfica de dona (donut) moderna** "Aplicaciones por tipo" (`plant-aplicaciones-tipo-chart`) **arriba de la tabla**.
- Agrupa las aplicaciones del lote por su campo `tipo`; donut recharts coloreado con la paleta existente `catColor(tipo).color` (coherente con los badges de la tabla). Centro del donut = total de aplicaciones.
- Diseño moderno: header con gradiente suave (azul→verde) e ícono, donut con `cornerRadius`/`paddingAngle`, y **leyenda con barras de progreso animadas**, conteo y % por tipo (`plant-aplicaciones-tipo-row-<tipo>`).
- Regresión OK: la tabla de aplicaciones y el "Costo total (PEPS)" se mantienen debajo; estado vacío sin crash.
- Cambio 100% frontend (`PlantacionDetail.jsx` → `AplicacionesTab`). Lint OK. Testing frontend **100%** (iteration_19.json): ana/L2 (fertilizacion 67% + herbicida 33%, 2 segmentos), oswald/L1 y tafy/L3 (1 segmento), tabla intacta, y regresión de Cosechas OK.

## Ajuste visual (Plantación · Cosechas · gráficos circulares modernos sin % — 01/02/2026)
- Se rediseñaron **solo visualmente** los dos gráficos circulares de la pestaña **Cosechas** para igualarlos al estilo del donut de "Aplicaciones por tipo": **header con gradiente azul→verde + ícono**, **donut** con `cornerRadius`/`paddingAngle`/borde blanco y **total en kg al centro**.
  - **"Calidades del lote"** (`plant-calidades-chart`): leyenda moderna con **barras de progreso** mostrando el valor en **kg** por calidad (`plant-calidad-legend-<key>`). Se **quitaron los porcentajes**.
  - **"Calidades por variedad"** (`plant-calidades-variedad-chart`): cada variedad es un **mini-donut** (`plant-variedad-chart-<variedad>`) con su total en kg al centro; se **eliminaron las etiquetas de % dentro de las porciones** (función `renderPctLabel` removida) y los % del tooltip/subtítulo.
- Nuevo componente reutilizable `ChartHeader` (header con gradiente + ícono). Cambio 100% frontend y **solo visual** (sin cambios de lógica/datos). Lint OK.
- Testing frontend **100%** (iteration_20.json): ambos gráficos con estilo moderno, **sin ningún '%'**, y regresiones OK (toggle Cestas/kg, tabla, consolidado, rendimiento por planta, gráfico de áreas).

## Ajuste (Plantación · Cosechas · "Calidades por variedad" muestra kg fuera del gráfico — 01/02/2026)
- En **"Calidades por variedad"**, cada tarjeta de variedad (`plant-variedad-chart-<variedad>`) ahora muestra **debajo del mini-donut** el desglose de **kg por calidad** (punto de color + nombre + kg + barra de progreso), igual que en "Calidades del lote". Filas con testid `plant-variedad-legend-<variedad>-<key>`.
- Se eliminó la **leyenda compartida inferior** (ahora redundante). Cambio 100% frontend y solo visual.
- Testing frontend **100%** (iteration_21.json): kg coherentes (Albion 2380, Alturas 924 → lote 3304 kg), **sin porcentajes**, sin regresiones.

## Implementado (Plantación · Cosechas · unidades kg/cestas/% en gráficos — 01/02/2026)
- **Gráficos circulares** ("Calidades del lote" y "Calidades por variedad"): nuevo **selector de unidad** (`plant-calidades-unidad` → `kg` / `cestas` / `pct`) en el header de ambos (estado compartido). Afecta centro del donut, leyendas/desglose por calidad y tooltips. Conversión 1 cesta = 14 kg; en `%` muestra el porcentaje de cada calidad (centro mantiene el total en kg como referencia).
- **"Producción en el tiempo"** (áreas): nuevo **toggle kg / cestas** (`plant-serie-unidad`) junto a Año/granularidad. Afecta el área apilada, el eje Y (`Producción (kg|cestas)`), el tooltip y las 4 tarjetas resumen (pico/mínimo/promedio/total).
- `ChartHeader` ahora acepta prop `right` para alojar controles. Cambio 100% frontend. Lint OK.
- Testing frontend **100%** (iteration_22.json) en tafy/L3 (3304 kg): lote kg (2170/644/252/238), cestas (155/46/18/17), % (65.7/19.5/7.6/7.2=100); variedad albion coherente; serie en kg (total 3304) y cestas (total 236); regresión de la tabla (toggle independiente) OK.

## Implementado (Plantación · Aplicaciones · costo en $/% + filtros de tabla — 01/02/2026)
- **Gráfica circular "Aplicaciones por tipo"**: nuevo **toggle de métrica** (`plant-aplicaciones-metric`) con **Cantidad / Costo $ / Costo %**. En "Costo $" el donut se pondera por `costo_insumos` y la leyenda/centro muestran montos en $; en "Costo %" la leyenda muestra el % del costo por tipo (centro mantiene el costo total $ como referencia). La gráfica usa TODAS las aplicaciones del lote.
- **Filtros en los registros (tabla)**: barra con **Período** (`aplic-filtro-periodo` → Semana/Mes/Año/Todo + `PeriodPicker` testidPrefix `aplic-filtro`) y **Tipo** (`aplic-filtro-tipo`) + **Limpiar** (`aplic-filtro-limpiar`). Filtran SOLO la tabla (`aplic-row`); el encabezado muestra "Aplicaciones · X de Y" y el "Costo total (PEPS)" del subconjunto filtrado. Estado vacío incluido.
- `AplicacionesTab` reescrito (hooks antes del early-return). Cambio 100% frontend. Lint OK.
- Testing frontend **100%** (iteration_23.json, 11/11): donut Cantidad (3), Costo $ (fert $44.59 + herb $8.00 = $52.59), Costo % (85%/15%); filtros período/tipo y Limpiar OK; donut no se filtra; sin regresiones.

## Implementado (Plantación · Labores de personal · totales por tipo — 01/02/2026)
- En la pestaña **"Labores de personal"** se agregó la tarjeta **"Totales por tipo"** (`plant-labores-totales-tipo`) **arriba de la tabla de registros** (entre los KPIs y el detalle).
- Agrupa por tipo de labor (`tipo_personalizado || tipo`) con columnas **Tipo · Labores (conteo) · Horas-hombre · Costo** (filas `plant-labores-tipo-row`) + fila **Total general**. Usa `actBadge` para el color del tipo.
- Cambio 100% frontend, aditivo. Lint OK. Testing frontend **100%** (iteration_24.json): 6 tipos agrupados, Total general (7 / 29.33 / $101.67) coincide con los KPIs, ubicación y regresión OK.

## Ajuste (Plantación · Labores · totales a media columna + gráfica circular — 01/02/2026)
- En **"Totales por tipo"** (Labores de personal): se **quitó la columna "Labores"** (quedan Tipo · Horas-hombre · Costo + Total general), el cuadro se **redujo a media columna** y al lado, en la misma fila, se agregó una **gráfica circular** "Distribución por tipo" (`plant-labores-tipo-chart`).
- La gráfica tiene un **toggle de métrica** (`plant-labores-metric` → `horas` / `costo` / `pct`): en Horas-H pondera por horas-hombre (centro = total horas), en Costo $ por costo (centro = costo total $), en % muestra el porcentaje del costo por tipo. Leyenda con barras de progreso (`plant-labores-legend-<tipo>`), colores por `actColor`.
- Cambio 100% frontend. Lint OK. Testing frontend **100%** (iteration_25.json): tabla 3 columnas, layout media columna + gráfica en la misma fila, 3 modos coherentes (29.33 h / $101.67 / % suma 100), sin regresiones.

## Ajuste (Plantación · Aplicaciones · totales 2-col + gráfica a media columna — 01/02/2026)
- En la pestaña **Aplicaciones**: la **gráfica circular** se redujo a **media columna** (donut 180px, flex 1 1 320px) y quedó a la **derecha**, conservando su **filtro de métrica** (`plant-aplicaciones-metric`: Cantidad / Costo $ / Costo %) que permite verla "por tipo" y "por costo real".
- A la **izquierda** se agregó una tabla **"Totales por tipo"** (`plant-aplicaciones-totales-tipo`) con **solo 2 columnas: Tipo y Costo real** (filas `plant-aplicaciones-totales-row`) + fila Total general. No se filtra.
- Cambio 100% frontend. Lint OK. Testing frontend **100%** (iteration_26.json): totales izquierda (x=590) / gráfica derecha (x=1077), Total general $52.59 = centro del donut en Costo $, sin regresiones en la tabla de registros inferior.

## Implementado (Inventario · entradas manuales — 01/02/2026)
- Nuevo **registro de entradas manuales** en el módulo **Inventario** para productos que NO entran por compras (donaciones, producción propia, ajustes).
- **Backend** (`server.py`): modelo `EntradaInventarioIn` (cantidad>0, precio>=0) + endpoints `GET/POST/DELETE /api/inventario/entradas`. Se guardan en `db.compras` con `origen="ajuste"`, `es_equipo=False` → fluyen automáticamente a inventario, PEPS, costeo y validación de stock. `GET /api/compras` ahora excluye `origen="ajuste"` (no aparecen en el módulo Compras). El DELETE solo borra docs con `origen="ajuste"` (no puede borrar compras reales).
- **Frontend** (`Inventario.jsx`): botón **"Registrar producto"** + `EntradaModal` (fecha, categoría, nombre con autocompletado, cantidad, valor opcional, descripción) + tarjeta **"Entradas manuales"** (lista con eliminar). Columna de la tabla principal renombrada "Comprado"→"Ingresado".
- Lint OK (backend y frontend). Testing **100%**: backend 7/7 pytest (`test_inventario_entradas.py`), frontend 100% (iteration_27.json) end-to-end; validaciones 422 y seguridad del DELETE verificadas por curl. Un producto solo ingresado manualmente queda disponible para aplicaciones.

## Fix (Inventario · entradas manuales · PEPS + inversión — 01/02/2026)
- **Bug PEPS:** una entrada manual con **fecha pasada** perdía su valor porque aplicaciones más recientes "se la comían" (FIFO). Fix (decisión del usuario): las entradas manuales (`origen="ajuste"`) **quedan FUERA de la línea de tiempo cronológica** y se aplican en una **segunda pasada**: cubren el sobreconsumo/"sin cobertura" de las compras reales y el resto queda como **stock disponible hoy**. Implementado en `_compute_peps_remaining_per_product` y `_compute_fifo_costs_per_aplicacion` (server.py). Resultado verificado: hierro disponible 835, valor_remanente **$835** (antes $29), lote @ $1.
- **Inversión/gasto:** `GET /api/analiticas/resumen` ahora devuelve `inversion_compras`, `inversion_entradas_manuales` e `inversion_insumos_total`. El frontend `Analiticas.jsx` muestra la sección **"Inversión en insumos"** (`analiticas-inversion`) con 3 KPIs. La entrada manual cuenta como inversión.
- Tests: `test_peps_manual_entry.py` (2/2) + `test_peps_regression.py` (5/5, creado por testing agent) + `test_inventario_entradas.py` (7/7) = **14/14**. Testing **backend 100% + frontend 100%** (iteration_28.json), sin regresiones. Lint OK.
- Nota: `test_asignacion_destino.py` falla por falta de stock de cosecha (cestas=0) — flujo cosecha→ventas ajeno a este cambio (preexistente/ambiental).

## Implementado (Aplicaciones · filtro de productos por tipo — 01/02/2026)
- En "Nueva Aplicación", el selector de **Productos** ahora muestra **solo los productos del inventario cuya categoría coincide con el Tipo de Aplicación** elegido (mapeo `TIPO_TO_CAT`: fertilizacion→fertilizantes, plaguicida→plaguicidas, fungicida→fungicidas, herbicida→herbicidas, tratamiento→tratamiento).
- Al cambiar de tipo se **resetean** los productos seleccionados. El label muestra "solo de categoría <cat>" y hay aviso (`aplic-productos-vacio`) cuando no hay productos de esa categoría. Selects con `aplic-producto-{i}`.
- Cambio 100% frontend (`Aplicaciones.jsx` → `AplicacionForm`). Lint OK. Testing frontend **100% (8/8)** (iteration_29.json): plaguicida→spiral, herbicida→gramonson, fertilización→magnesio/hierro, fungicida→vacío, reset al cambiar tipo, y creación (POST) OK.

## Implementado (Responsive móvil/tablet · sidebar colapsable — 31/05/2026)
- **App adaptada a teléfonos y tablets.** El sidebar dejó de ser fijo en pantallas ≤1024px: ahora es un **drawer off-canvas** que se abre/cierra sin ocupar espacio fijo, aprovechando toda la pantalla.
- **Barra superior móvil (`topbar`)** con botón hamburguesa (`sidebar-open-btn`) + marca "ERP Agrícola"; visible solo en ≤1024px (sticky).
- **Sidebar drawer**: `transform: translateX(-100%)` por defecto en móvil/tablet, se desliza con `.sidebar-open`; incluye botón de cierre **X** (`sidebar-close-btn`) y **backdrop** (`sidebar-backdrop`, cierra al tocar). Se **cierra automáticamente al navegar** (onClick en NavLinks). En ≤640px ancho 84vw (máx 320px) y tipografía/padding reducidos.
- En **desktop (>1024px)** el sidebar fijo de 256px se mantiene **sin cambios** (sin topbar/hamburguesa). Cambio 100% frontend (`Layout.jsx` + `index.css`). Lint OK.
- Verificado en vivo: móvil 390px, tablet 768px (hamburguesa + backdrop cierran) y desktop 1920px (sin regresión).

## Fix (Modales · footer sticky en tablet/móvil — 31/05/2026)
- **BUG (reportado por Oswald):** en tablet no se podían guardar cambios en "Editar usuario". Causa raíz: el modal de usuario es muy alto (tabla de 12 módulos + permisos) y el botón **Guardar** quedaba al final; con la barra del navegador (alto medido en `vh`) el `.modal-footer` quedaba **tapado/inalcanzable** al tocar.
- **Fix (CSS global, `index.css`):** `.modal-footer` ahora es **`position: sticky; bottom: 0`** (fondo blanco + borde) → Cancelar/Guardar **siempre visibles** sin scrollear, en TODOS los modales. Además `.modal` usa `max-height: 90dvh` (vía `@supports`) para respetar la barra del navegador móvil; en ≤640px se reduce padding del modal, `form-grid` pasa a 1 columna y se ajustan los márgenes del footer.
- Verificado en vivo (tablet 820×700, alto corto): Guardar visible sin scroll y PUT `/api/users` → **200**, modal cierra. Cambio 100% frontend, lint OK. Nota: para verlo en producción hay que **re-desplegar**.

## Code Review · fixes seguros aplicados (31/05/2026)
- **Linter backend:** eliminado import sin usar `Query` (server.py) y 2 sentencias con `;` (test_ventas_descarte_auto.py). `ruff` limpio salvo E402 intencional (patrón `load_dotenv()` antes de imports — necesario, no se toca).
- **Secrets en tests:** las credenciales admin (`ADMIN_EMAIL`/`ADMIN_PASSWORD`) ahora se leen de `os.environ.get(...)` con fallback, en los 6 archivos de test (ya no hardcodeadas).
- **React keys:** las 2 filas de tabla de nivel superior con `key={index}` pasaron a clave estable (`Analiticas` cxc-row → `c.cliente`; `Inventario` inv-row → `categoria-nombre`).
- **Verificado:** `ruff` + `eslint` OK; pytest backend **28/30** (los 2 fallos son el problema ambiental preexistente de stock de cosecha en asignaciones, no regresión; PEPS y auth verdes).
- **DIFERIDO (alto riesgo en app ya desplegada, requiere esfuerzo dedicado + redeploy):** (1) Auth localStorage→httpOnly — requiere playbook de auth y verificación cookie-only; riesgo de bloquear el login en producción. (2) 28 deps faltantes en useEffect/useMemo — fixes ingenuos causan loops infinitos (ej. agregar `load` sin `useCallback`); requiere análisis caso por caso. (3) Refactor de `_compute_peps_remaining_per_product`/`_compute_fifo_costs_per_aplicacion` (lógica frágil y testeada) y de componentes grandes (Aplicaciones/Actividades/Ventas/PlantacionDetail) — P3. (4) Las `key={index}` restantes son filas de formulario append-only sin id estable (índice es apropiado). Los hallazgos de "operador `is` incorrecto" en server.py:214/258 eran **falsos positivos** (`v is not None` es el idioma correcto).

## Fix visual (Plantación · Cosechas · "Producción en el tiempo" relleno de áreas — 31/05/2026)
- **Reporte (Oswald):** en el área apilada, la **1ª calidad** (ej. mayo 1540 kg) se veía "por debajo/escondida" pese a ser la mayor. Causa: el degradado de relleno se desvanecía a casi transparente abajo (`stopOpacity 0.7→0.08`), pensado para gráficos de UNA área, no apilados → la banda verde grande quedaba casi vacía y las bandas finas de arriba lucían más sólidas.
- **Fix:** relleno más sólido y uniforme (`stopOpacity 0.85→0.55`) para los 4 gradientes (`grad-<key>`). Ahora cada banda apilada (1ª base verde → 2ª → 3ª → descarte) se ve proporcional a su valor real. Apilado correcto sin cambios de orden/lógica. Cambio 100% frontend (`PlantacionDetail.jsx`), lint OK, verificado en vivo (tafy/L3, pico mayo 2226 kg). Requiere re-deploy para producción.

## Fix (Plantación · Cosechas · "Producción en el tiempo" · des-apilado — 31/05/2026)
- **Reporte real (Oswald):** el gráfico estaba **apilado** (`stackId="1"`), por lo que cada calidad se dibujaba a la altura de la **suma acumulada** (ej. Descarte=168 kg aparecía graficado a ~2200 kg, en vez de a 168). El usuario espera leer cada calidad con su **valor real desde 0** en el eje.
- **Fix:** se **quitó el apilado** → áreas **superpuestas** (cada `<Area>` se mide desde 0 a su valor). Rellenos semitransparentes (gradiente `0.30→0.04`) + stroke `2.5` para que todas las calidades se distingan; `activeDot` al hover. Eje Y ahora auto-escala al máximo individual (ej. ~1600 con pico 1ª=1540). Subtítulo actualizado: "Producción (kg) por calidad… cada calidad se mide desde 0 con su valor real" (antes decía "acumulada").
- Verificado en vivo (tafy/L3, mayo): 1ª≈1540, 2ª≈350, 3ª≈168, Descarte≈168 — cada uno a su altura real, coincidiendo con el tooltip. Las tarjetas resumen (pico/total) siguen mostrando el total de producción del período. Cambio 100% frontend, lint OK. Requiere re-deploy para producción.

## Code Review v2 · hook-deps corregidos con useCallback (31/05/2026)
- **Critical (hooks):** se corrigieron las 7 dependencias de `useEffect` prioritarias envolviendo el loader en **`useCallback`** (patrón seguro que evita loops infinitos): `Ventas.jsx` (load, dep [tipo]), `Vehiculos.jsx`, `Dashboard.jsx` (loadStats), `Cosecha.jsx` (loadAll), `PlantacionDetail.jsx` (load, dep [id]), `Plantaciones.jsx`, `RRHH.jsx`. Imports de `useCallback` agregados. Lint OK en los 7.
- **Verificado en vivo** (smoke test con conteo de requests): Dashboard/Ventas/Cosecha cargan datos correctamente y **el nº de llamadas API se mantiene estable tras idle** (Ventas 7→7, Cosecha 17→17) → sin loops de re-render ni closures obsoletos.
- **DIFERIDO conscientemente (riesgo en app PRODUCCIÓN, requieren esfuerzo dedicado + redeploy):**
  - 🔴 **Auth localStorage→httpOnly** (`auth.jsx`/`api.js`): es cambio de AUTENTICACIÓN en app desplegada. Requiere consultar el playbook de auth, verificar cookies cookie-only (SameSite/Secure) y testeo completo; hacerlo mal **bloquea el login en producción**. No se toca sin go-ahead explícito.
  - 🟠 Refactor de `_compute_peps_remaining_per_product` / `_compute_fifo_costs_per_aplicacion` (complejidad 42) y de componentes grandes (Aplicaciones/Actividades) — lógica frágil/testeada; P3, esfuerzo dedicado con regresión.
  - 🟡 `key={index}` en filas de formulario y `useMemo` de cómputos en JSX — impacto real bajo en listas de solo lectura/append-only; polish opcional.

## Verificado (Ventas · "Ajustar saldo" · 03/06/2026)
- La herramienta **"Ajustar saldo"** (botón junto a "Disponible acumulado" en Venta en finca / Envío a ciudad / Donaciones) quedó **probada E2E**. Backend `POST /api/ventas-{tipo}/ajuste-saldo`: calcula `recibido − usado`, y crea un registro `ajuste_entrada` (suma) o `ajuste_salida` (resta) para que el "Disponible acumulado" quede en el número real que escribe el usuario. Casos verificados por curl: fijar a 5 (delta +5), a 2 (delta −3), re-fijar a 2 (sin_cambios), negativo→HTTP 400, a 0. Frontend: Disponible 10→9 al ajustar a 9. Sirve para corregir descuadres por ventas históricas sin "recibido".

## Implementado (Analíticas · Cuentas por cobrar clickeable + abonos · 03/06/2026)
- Las filas de **"Deuda por cliente"** (Analíticas → Cuentas por cobrar) ahora son **clickeables** (`cxc-row`, cursor pointer + chevron) y abren el modal **`CxcDetalleModal`** (`cxc-detalle-modal`).
- El modal muestra el **saldo total pendiente** (`cxc-detalle-saldo-total`) y la lista de **ventas individuales pendientes** del cliente (Fecha, Origen finca/ciudad, Total, Abonado, Saldo, Días) con un botón **Abonar** por venta (`cxc-abonar-btn`).
- Al abonar, una fila inline (`cxc-abono-monto` + `cxc-abono-confirmar`) registra el pago vía `PUT /api/ventas-{_tipo}/{id}` (suma al `abono_inicial`, tope = total). Refresca el detalle y la tabla principal de cuentas por cobrar.
- Backend nuevo: `GET /api/analiticas/cuentas-por-cobrar/detalle?cliente=X&telefono=Y` → devuelve las ventas pendientes (saldo>0) de finca+ciudad, cada una con `_tipo` para poder hacer el PUT. Verificado E2E: cliente con saldo 25 → abono 10 → saldo 15 (modal y tabla actualizados). Lint OK (backend + frontend).

## Fix (Ventas/Donaciones · el "Registro" no cuadraba con "Disponible acumulado" · 03/06/2026)
- **Reporte (Oswald):** en Donaciones, la suma del "Registro de donaciones" no coincidía con el "Disponible acumulado".
- **Causa raíz:** el registro usaba `ventas = items.filter(!isAsig)`, que solo excluía los registros de Asignación de destino pero **seguía mostrando los registros de sistema**: los ajustes de saldo (`ajuste_entrada`/`ajuste_salida`, creados por la herramienta "Ajustar saldo") y las reasignaciones (`reasignacion_salida`). Esos aparecían como filas fantasma (beneficiario "—") y descuadraban la suma del registro vs el disponible.
- **Fix:** el registro ahora usa `items.filter(esVentaReal)` → muestra **solo ventas/donaciones reales**. Los ajustes y reasignaciones siguen afectando el "Disponible acumulado" (que usa sus propios filtros) pero ya **no contaminan el Registro**. Aplica a finca, ciudad y donaciones.
- Verificado E2E: donar 3 (recibido 8) + Ajustar saldo a 2 → Disponible acumulado = 2 y el Registro muestra **solo** la donación real de 3 cestas (antes mostraba además una fila fantasma de 3 del ajuste). Cambio 100% frontend (`Ventas.jsx`), lint OK. Requiere re-deploy para producción.

## Implementado (Dashboard · Gastos de la semana · 03/06/2026)
- Nuevo panel **"Gastos de la semana"** en el Dashboard principal (solo lectura; **no afecta otros módulos**, solo recopila información).
- **Ventana semanal:** lunes 5:00 a.m. → domingo 6:00 p.m. (hora de Venezuela, UTC-4). Navegación de semanas (◀ anterior / ▶ siguiente / "Esta semana"); no permite ir a semanas futuras.
- **Recopila 5 fuentes** dentro de la ventana: (1) **Compras (insumos)** = `compras.precio` por `fecha_compra` (excluye equipos `es_equipo` y entradas manuales `origen=ajuste`); (2) **Gastos de vehículo** = `gastos_vehiculos.monto` por `fecha`; (3) **Pago de trabajadores** = `actividades.costo_total` por `fecha_actividad`; (4) **Herramientas (nuevas)** = `equipos` con `categoria=herramienta`, valor `costo_adquisicion × cantidad` por `fecha_adquisicion`; (5) **Motores (nuevos)** = `equipos` con `categoria=motor`, igual cálculo. Evita doble conteo: las compras de equipos se cuentan como equipo, no como compra.
- **Backend:** `GET /api/dashboard/gastos-semana?offset=N` → devuelve `inicio`, `fin`, `total` y `categorias[]` (cada una con total, count e items detalle). Helpers `_parse_dt_ve` (fechas date-only ancladas a mediodía) y `_week_window_ve`.
- **Frontend:** `components/GastosSemana.jsx` montado en `Dashboard.jsx`. Total grande + 5 tarjetas por categoría (icono/color), expandibles para ver el detalle (fecha · concepto · monto). Testids `gastos-semana-total`, `gastos-cat-{key}`, etc.
- Verificado E2E: sembrando 1 registro de cada fuente (100+50+80+50+200) → Total **US$ 480,00** y cada categoría correcta; detalle expandible OK; datos de prueba limpiados. Lint backend + frontend OK.

## Decisiones
- IDs como UUIDs (string) — coincide con el original.
- Fechas almacenadas como ISO strings.
- KG_POR_CESTA = 14 (convención observada en datos del original).
- Catálogos (tipos_fruta, variedades_fruta) editables desde dentro del modal de Cosecha.
