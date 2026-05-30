import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  LayoutGrid, Users, Sprout, Truck, Activity, Droplets, Send,
  DollarSign, Snowflake, Boxes, ShoppingCart, BarChart3, ChevronDown,
  ChevronUp, Briefcase, Leaf, LogOut, Car, Cog, Wrench,
  Home, Building2, AlertCircle, Heart, Clock, PlusCircle, History,
  UserCheck, Wallet,
} from "lucide-react";
import { Strawberry } from "./icons/Strawberry";
import { useState } from "react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid, module: null },
  { to: "/dashboard/usuarios", label: "Usuarios", icon: Users, module: "usuarios" },
  {
    label: "Recursos Humanos", icon: Briefcase, module: "recursos_humanos",
    sub: [
      { to: "/dashboard/rrhh/trabajadores", label: "Trabajadores", icon: UserCheck },
      { to: "/dashboard/rrhh/nomina", label: "Nómina", icon: Wallet },
    ],
  },
  {
    label: "Plantaciones", icon: Sprout, module: "plantaciones",
    sub: [
      { to: "/dashboard/plantaciones", label: "Lotes", icon: Sprout },
      { to: "/dashboard/plantaciones/aplicaciones", label: "Aplicaciones", icon: Droplets },
      { to: "/dashboard/plantaciones/labores", label: "Labores de personal", icon: Users },
      { to: "/dashboard/plantaciones/cosechas", label: "Cosechas", icon: Strawberry },
    ],
  },
  {
    label: "Equipos", icon: Truck, module: "equipos",
    sub: [
      { to: "/dashboard/equipos/vehiculos", label: "Vehículos", icon: Car },
      { to: "/dashboard/equipos/motores", label: "Motores", icon: Cog },
      { to: "/dashboard/equipos/herramientas", label: "Herramientas", icon: Wrench },
    ],
  },
  {
    label: "Actividades", icon: Activity, module: "actividades",
    sub: [
      { to: "/dashboard/actividades/pendientes", label: "Pendientes", icon: Clock },
      { to: "/dashboard/actividades/registrar", label: "Registrar", icon: PlusCircle },
      { to: "/dashboard/actividades", label: "Historial", icon: History },
    ],
  },
  { to: "/dashboard/aplicaciones", label: "Aplicaciones", icon: Droplets, module: "aplicaciones" },
  { to: "/dashboard/cosecha", label: "Cosecha", icon: Strawberry, module: "cosecha" },
  { to: "/dashboard/asignacion-destino", label: "Asignación de destino", icon: Send, module: "cosecha" },
  {
    label: "Ventas", icon: DollarSign, module: "ventas",
    sub: [
      { to: "/dashboard/ventas/finca", label: "Venta en finca", icon: Home },
      { to: "/dashboard/ventas/ciudad", label: "Envío a ciudad", icon: Building2 },
      { to: "/dashboard/ventas/refrigerar", label: "Refrigerar", icon: Snowflake },
      { to: "/dashboard/ventas/descarte", label: "Descarte", icon: AlertCircle },
      { to: "/dashboard/ventas/donaciones", label: "Donaciones", icon: Heart },
    ],
  },
  { to: "/dashboard/frio", label: "Frío", icon: Snowflake, module: "frio" },
  { to: "/dashboard/inventario", label: "Inventario", icon: Boxes, module: "inventario" },
  { to: "/dashboard/compras", label: "Compras", icon: ShoppingCart, module: "compras" },
  { to: "/dashboard/analiticas", label: "Analíticas", icon: BarChart3, module: "analiticas" },
];

export default function Layout() {
  const { user, logout, canSee } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState({});

  if (!user) return null;

  const toggle = (label) => setOpen((o) => ({ ...o, [label]: !o[label] }));
  const isActive = (to) => loc.pathname === to;

  return (
    <div className="App">
      <aside className="sidebar" data-testid="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon"><Leaf size={22} /></div>
          <div>
            <div className="sidebar-brand-text">ERP Agrícola</div>
            <div className="sidebar-brand-sub">Sistema Premium</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.filter((n) => canSee(n.module)).map((n) => {
            const Icon = n.icon;
            if (n.sub) {
              const isOpen = open[n.label] ?? n.sub.some((s) => isActive(s.to));
              return (
                <div key={n.label}>
                  <button
                    className={`sidebar-item ${isOpen ? "active" : ""}`}
                    onClick={() => toggle(n.label)}
                    data-testid={`sidebar-${n.label.toLowerCase().replace(/\s/g, "-")}-toggle`}
                  >
                    <Icon size={18} />
                    <span style={{ flex: 1 }}>{n.label}</span>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {isOpen && n.sub.map((s) => {
                    const SubIcon = s.icon;
                    return (
                      <NavLink
                        key={s.to}
                        to={s.to}
                        end
                        className={({ isActive }) => `sidebar-item sidebar-sub ${isActive ? "active" : ""}`}
                        data-testid={`sidebar-link-${s.label.toLowerCase().replace(/\s/g, "-")}`}
                      >
                        {SubIcon && <SubIcon size={15} />}
                        {s.label}
                      </NavLink>
                    );
                  })}
                </div>
              );
            }
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/dashboard"}
                className={({ isActive }) => `sidebar-item ${isActive ? "active" : ""}`}
                data-testid={`sidebar-link-${n.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                <Icon size={18} />
                {n.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-avatar">{(user.nombre_completo || "?")[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.nombre_completo}</div>
            <div style={{ fontSize: 12, color: "#64748b", textTransform: "capitalize" }}>{user.rol}</div>
          </div>
          <button
            className="btn-icon"
            onClick={async () => { await logout(); nav("/login"); }}
            title="Cerrar sesión"
            data-testid="logout-btn"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
