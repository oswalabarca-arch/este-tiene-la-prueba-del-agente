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

## Decisiones
- IDs como UUIDs (string) — coincide con el original.
- Fechas almacenadas como ISO strings.
- KG_POR_CESTA = 14 (convención observada en datos del original).
- Catálogos (tipos_fruta, variedades_fruta) editables desde dentro del modal de Cosecha.
