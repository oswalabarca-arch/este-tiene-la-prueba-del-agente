import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import {
  LayoutGrid, Users, Sprout, Truck, Activity, Droplets, Send,
  DollarSign, Snowflake, Boxes, ShoppingCart, BarChart3, ChevronDown,
  ChevronUp, Briefcase, LogOut, Car, Cog, Wrench,
  Home, Building2, AlertCircle, Heart, Clock, PlusCircle,
  UserCheck, Wallet, Menu, X, FileText, CalendarCheck,
} from "lucide-react";
import { Strawberry } from "./icons/Strawberry";
import { useState } from "react";
import logo from "../assets/logo.png";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutGrid, module: null },
  { to: "/dashboard/usuarios", label: "Usuarios", icon: Users, module: "usuarios" },
  { to: "/dashboard/control-asistencia", label: "Control de asistencia", icon: CalendarCheck, module: "control_asistencia" },
  {
    label: "Recursos Humanos", icon: Briefcase, module: "recursos_humanos",
    sub: [
      { to: "/dashboard/rrhh/trabajadores", label: "Trabajadores", icon: UserCheck },
      { to: "/dashboard/rrhh/nomina", label: "Nómina", icon: Wallet },
    ],
  },
  { to: "/dashboard/plantaciones", label: "Plantaciones", icon: Sprout, module: "plantaciones" },
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
      { to: "/dashboard/ventas/congelar", label: "Congelar", icon: Snowflake },
      { to: "/dashboard/ventas/descarte", label: "Descarte", icon: AlertCircle },
      { to: "/dashboard/ventas/donaciones", label: "Donaciones", icon: Heart },
    ],
  },
  { to: "/dashboard/inventario", label: "Inventario", icon: Boxes, module: "inventario" },
  { to: "/dashboard/ficha-tecnica", label: "Ficha técnica de productos", icon: FileText, module: "ficha_tecnica" },
  { to: "/dashboard/compras", label: "Compras", icon: ShoppingCart, module: "compras" },
  { to: "/dashboard/analiticas", label: "Analíticas", icon: BarChart3, module: "analiticas" },
];

export default function Layout() {
  const { user, logout, canSee } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState({});
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const toggle = (label) => setOpen((o) => ({ ...o, [label]: !o[label] }));
  const isActive = (to) => loc.pathname === to;
  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="App">
      <header className="topbar" data-testid="mobile-topbar">
        <button
          className="topbar-burger"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menú"
          data-testid="sidebar-open-btn"
        >
          <Menu size={22} />
        </button>
        <div className="topbar-brand">
          <div className="topbar-brand-icon" style={{ background: "transparent", padding: 0, overflow: "hidden" }}><img src={logo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>
          <span className="topbar-brand-text">ERP Agrícola</span>
        </div>
      </header>

      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeMobile}
          data-testid="sidebar-backdrop"
        />
      )}

      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} data-testid="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-icon" style={{ background: "transparent", padding: 0, overflow: "hidden" }}><img src={logo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="sidebar-brand-text">ERP Agrícola</div>
            <div className="sidebar-brand-sub">Sistema Premium</div>
          </div>
          <button
            className="sidebar-close"
            onClick={closeMobile}
            aria-label="Cerrar menú"
            data-testid="sidebar-close-btn"
          >
            <X size={20} />
          </button>
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
                        onClick={closeMobile}
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
                onClick={closeMobile}
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
