import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import Login from "./pages/Login";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Usuarios from "./pages/Usuarios";
import ControlAsistencia from "./pages/ControlAsistencia";
import Deuda from "./pages/Deuda";
import VentaRapida from "./pages/VentaRapida";
import Plantaciones from "./pages/Plantaciones";
import PlantacionDetail from "./pages/PlantacionDetail";
import Cosecha from "./pages/Cosecha";
import AsignacionDestino from "./pages/AsignacionDestino";
import Compras from "./pages/Compras";
import Inventario from "./pages/Inventario";
import FichaTecnica from "./pages/FichaTecnica";
import Aplicaciones from "./pages/Aplicaciones";
import { ActividadesPendientes, ActividadesRegistrar } from "./pages/Actividades";
import { VentasFinca, VentasCiudad, VentasRefrigerar, VentasCongelar, VentasDescarte, VentasDonaciones } from "./pages/Ventas";
import Equipos from "./pages/Equipos";
import Vehiculos from "./pages/Vehiculos";
import { Trabajadores, Nomina } from "./pages/RRHH";
import Analiticas from "./pages/Analiticas";
import EstadisticaCompradores from "./pages/EstadisticaCompradores";
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
              <Route path="control-asistencia" element={<ControlAsistencia />} />
              <Route path="deuda" element={<Deuda />} />
              <Route path="venta-rapida" element={<VentaRapida />} />
              <Route path="plantaciones" element={<Plantaciones />} />
              <Route path="plantaciones/:id" element={<PlantacionDetail />} />
              <Route path="cosecha" element={<Cosecha />} />
              <Route path="asignacion-destino" element={<AsignacionDestino />} />
              <Route path="compras" element={<Compras />} />
              <Route path="inventario" element={<Inventario />} />
              <Route path="ficha-tecnica" element={<FichaTecnica />} />
              <Route path="aplicaciones" element={<Aplicaciones />} />
              <Route path="actividades" element={<Navigate to="/dashboard/actividades/pendientes" replace />} />
              <Route path="actividades/pendientes" element={<ActividadesPendientes />} />
              <Route path="actividades/registrar" element={<ActividadesRegistrar />} />
              <Route path="ventas/finca" element={<VentasFinca />} />
              <Route path="ventas/ciudad" element={<VentasCiudad />} />
              <Route path="ventas/refrigerar" element={<VentasRefrigerar />} />
              <Route path="ventas/congelar" element={<VentasCongelar />} />
              <Route path="ventas/descarte" element={<VentasDescarte />} />
              <Route path="ventas/donaciones" element={<VentasDonaciones />} />
              <Route path="frio" element={<Navigate to="/dashboard/ventas/congelar" replace />} />
              <Route path="equipos" element={<Equipos />} />
              <Route path="equipos/vehiculos" element={<Vehiculos />} />
              <Route path="equipos/:categoria" element={<Equipos />} />
              <Route path="rrhh/trabajadores" element={<Trabajadores />} />
              <Route path="rrhh/nomina" element={<Nomina />} />
              <Route path="analiticas" element={<Analiticas />} />
              <Route path="estadistica-compradores" element={<EstadisticaCompradores />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;
