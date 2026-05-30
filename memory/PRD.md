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

## Decisiones
- IDs como UUIDs (string) — coincide con el original.
- Fechas almacenadas como ISO strings.
- KG_POR_CESTA = 14 (convención observada en datos del original).
- Catálogos (tipos_fruta, variedades_fruta) editables desde dentro del modal de Cosecha.
