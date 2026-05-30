import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("erp_token");
    if (!t) {
      setLoading(false);
      return;
    }
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => localStorage.removeItem("erp_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("erp_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("erp_token");
    setUser(null);
  };

  // Permission helpers
  const isAdmin = user?.rol === "administrador";
  const canSee = (modulo) => !modulo || isAdmin || (user?.modulos_asignados || []).includes(modulo);
  const canEdit = (modulo) => {
    if (!user) return false;
    if (isAdmin) return true;
    if (!canSee(modulo)) return false;
    const p = user?.permisos_modulos?.[modulo];
    // Si no se definió permiso explícito, por defecto puede editar
    return p?.editar !== false;
  };
  const canDelete = (modulo) => {
    if (!user) return false;
    if (isAdmin) return true;
    if (!canSee(modulo)) return false;
    const p = user?.permisos_modulos?.[modulo];
    return p?.eliminar !== false;
  };

  return (
    <AuthCtx.Provider value={{ user, setUser, loading, login, logout, isAdmin, canSee, canEdit, canDelete }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
