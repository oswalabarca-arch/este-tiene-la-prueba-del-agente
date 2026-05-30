import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Usuarios from "./pages/Usuarios";
import Plantaciones from "./pages/Plantaciones";
import Cosecha from "./pages/Cosecha";
import AsignacionDestino from "./pages/AsignacionDestino";
import Compras from "./pages/Compras";
import Inventario from "./pages/Inventario";
import Aplicaciones from "./pages/Aplicaciones";
import { Actividades, ActividadesPendientes, ActividadesRegistrar } from "./pages/Actividades";
import { VentasFinca, VentasCiudad, VentasRefrigerar, VentasDescarte, VentasDonaciones } from "./pages/Ventas";
import Frio from "./pages/Frio";
import Equipos from "./pages/Equipos";
import GastosVehiculos from "./pages/GastosVehiculos";
import { Trabajadores, Nomina } from "./pages/RRHH";
import Analiticas from "./pages/Analiticas";
import "./App.css";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Cargando...</div>;
  return <Navigate to={user ? "/dashboard" : "/login"} replace />;
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Protected><Layout /></Protected>}>
              <Route index element={<Dashboard />} />
              <Route path="usuarios" element={<Usuarios />} />
              <Route path="plantaciones" element={<Plantaciones />} />
              <Route path="cosecha" element={<Cosecha />} />
              <Route path="asignacion-destino" element={<AsignacionDestino />} />
              <Route path="compras" element={<Compras />} />
              <Route path="inventario" element={<Inventario />} />
              <Route path="aplicaciones" element={<Aplicaciones />} />
              <Route path="actividades" element={<Actividades />} />
              <Route path="actividades/pendientes" element={<ActividadesPendientes />} />
              <Route path="actividades/registrar" element={<ActividadesRegistrar />} />
              <Route path="ventas/finca" element={<VentasFinca />} />
              <Route path="ventas/ciudad" element={<VentasCiudad />} />
              <Route path="ventas/refrigerar" element={<VentasRefrigerar />} />
              <Route path="ventas/descarte" element={<VentasDescarte />} />
              <Route path="ventas/donaciones" element={<VentasDonaciones />} />
              <Route path="frio" element={<Frio />} />
              <Route path="equipos" element={<Equipos />} />
              <Route path="equipos/vehiculos" element={<GastosVehiculos />} />
              <Route path="equipos/:categoria" element={<Equipos />} />
              <Route path="rrhh/trabajadores" element={<Trabajadores />} />
              <Route path="rrhh/nomina" element={<Nomina />} />
              <Route path="analiticas" element={<Analiticas />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
