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

## Decisiones
- IDs como UUIDs (string) — coincide con el original.
- Fechas almacenadas como ISO strings.
- KG_POR_CESTA = 14 (convención observada en datos del original).
- Catálogos (tipos_fruta, variedades_fruta) editables desde dentro del modal de Cosecha.
