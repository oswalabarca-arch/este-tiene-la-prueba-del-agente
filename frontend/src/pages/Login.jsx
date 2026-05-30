import { useState } from "react";
import { useAuth } from "../lib/auth";
import { Leaf } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      nav("/dashboard");
    } catch (err) {
      setError(err?.response?.data?.detail || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  const createAdmin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/create-admin", { nombre_completo: "Administrador", email, password });
      await login(email, password);
      nav("/dashboard");
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo crear admin");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-brand-icon"><Leaf size={32} /></div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: 32, color: "#15803d" }} data-testid="login-title">ERP Agrícola</h1>
            <div style={{ color: "#64748b" }}>Sistema profesional de gestión agrícola</div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ margin: "0 0 4px" }}>{showCreate ? "Crear administrador" : "Iniciar sesión"}</h2>
          <div style={{ color: "#64748b", marginBottom: 18, fontSize: 14 }}>
            {showCreate ? "Configura el primer usuario administrador" : "Ingresa tus credenciales para acceder al sistema"}
          </div>

          <form onSubmit={showCreate ? createAdmin : submit}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Email</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@erp.com"
                data-testid="login-email-input"
              />
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Contraseña</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="login-password-input"
              />
            </div>

            {error && <div style={{ color: "#dc2626", marginBottom: 12, fontSize: 14 }}>{error}</div>}

            <button type="submit" className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }} disabled={loading} data-testid="login-submit-btn">
              {loading ? "..." : (showCreate ? "Crear y entrar" : "Ingresar")}
            </button>
          </form>

          <div style={{ borderTop: "1px solid #e2e8f0", marginTop: 18, paddingTop: 18 }}>
            <div style={{ textAlign: "center", color: "#64748b", fontSize: 14, marginBottom: 10 }}>
              {showCreate ? "¿Ya tienes cuenta?" : "¿Primera vez? Inicializa el sistema:"}
            </div>
            <button
              type="button"
              className="btn"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => { setShowCreate(!showCreate); setError(""); }}
              data-testid="toggle-create-admin-btn"
            >
              {showCreate ? "Volver a iniciar sesión" : "Crear usuario administrador"}
            </button>
          </div>

          <div style={{ marginTop: 16, background: "#f1f5f9", padding: 14, borderRadius: 8, textAlign: "center", fontSize: 13 }}>
            <b>Credenciales por defecto:</b><br />
            Email: oswaldabarca@gmail.com<br />
            Contraseña: 123456
          </div>
        </div>

        <div style={{ textAlign: "center", color: "#64748b", marginTop: 20, fontSize: 13 }}>
          ERP Agrícola © 2026 — Sistema SaaS Premium
        </div>
      </div>
    </div>
  );
}
