import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useToast } from "../lib/toast";
import { UserPlus, Pencil, Key, Trash2, Search } from "lucide-react";

const MODULOS = [
  "usuarios", "plantaciones", "equipos", "actividades", "aplicaciones",
  "cosecha", "ventas", "frio", "inventario", "compras", "analiticas", "recursos_humanos",
];
const ROLES = ["administrador", "ingeniero", "encargado_campo", "operario"];

export default function Usuarios() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [pwUser, setPwUser] = useState(null);

  const load = () => api.get("/users").then((r) => setUsers(r.data.users));
  useEffect(() => { load(); }, []);

  const remove = async (u) => {
    if (!window.confirm(`Eliminar usuario "${u.nombre_completo}"?`)) return;
    await api.delete(`/users/${u._id}`);
    toast.show("Usuario eliminado");
    load();
  };

  const filtered = users.filter(
    (u) => !search ||
      u.nombre_completo?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div data-testid="usuarios-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <h1 className="page-title">Gestión de Usuarios</h1>
          <p className="page-subtitle">Administra usuarios, roles y permisos del sistema</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})} data-testid="usuarios-new-btn">
          <UserPlus size={16} /> Nuevo Usuario
        </button>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div style={{ position: "relative" }}>
          <Search size={18} style={{ position: "absolute", left: 14, top: 12, color: "#94a3b8" }} />
          <input
            className="input"
            style={{ paddingLeft: 40, width: "100%" }}
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="usuarios-search-input"
          />
        </div>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 4px" }}>Usuarios Registrados</h2>
        <div style={{ color: "#64748b", fontSize: 14, marginBottom: 14 }}>{filtered.length} usuario(s) encontrado(s)</div>
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th><th>Email</th><th>Rol</th><th>Salario</th><th>Módulos Asignados</th><th style={{ textAlign: "right" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u._id} data-testid={`user-row-${u._id}`}>
                <td>{u.nombre_completo}</td>
                <td>{u.email}</td>
                <td>
                  <span className={`badge ${u.rol === "administrador" ? "badge-rose" : u.rol === "ingeniero" ? "badge-purple" : "badge-primary"}`}>
                    {u.rol}
                  </span>
                </td>
                <td>${u.salario || 0}</td>
                <td>
                  {(u.modulos_asignados?.length === MODULOS.length) ? (
                    <span className="badge badge-primary">⚙ Todos</span>
                  ) : (
                    <span style={{ color: "#64748b", fontSize: 13 }}>{u.modulos_asignados?.length || 0} módulo(s)</span>
                  )}
                </td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn-icon" onClick={() => setEditing(u)} data-testid={`user-edit-${u._id}`}><Pencil size={16} /></button>
                  <button className="btn-icon" onClick={() => setPwUser(u)} title="Cambiar contraseña" data-testid={`user-password-${u._id}`} style={{ color: "#f59e0b" }}><Key size={16} /></button>
                  <button className="btn-icon" onClick={() => remove(u)} style={{ color: "#dc2626" }} data-testid={`user-delete-${u._id}`}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <UserModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {pwUser && (
        <PasswordModal user={pwUser} onClose={() => setPwUser(null)} onSaved={() => setPwUser(null)} />
      )}
    </div>
  );
}

function UserModal({ initial, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !initial._id;
  const [form, setForm] = useState({
    nombre_completo: initial.nombre_completo || "",
    email: initial.email || "",
    password: "",
    rol: initial.rol || "operario",
    salario: initial.salario || 0,
    modulos_asignados: initial.modulos_asignados || [],
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (isNew) await api.post("/users", form);
      else {
        const { password, ...payload } = form;
        await api.put(`/users/${initial._id}`, payload);
      }
      toast.show(isNew ? "Usuario creado" : "Usuario actualizado");
      onSaved();
    } catch (err) {
      toast.show(err?.response?.data?.detail || "Error", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleMod = (m) => {
    setForm((f) => ({
      ...f,
      modulos_asignados: f.modulos_asignados.includes(m)
        ? f.modulos_asignados.filter((x) => x !== m)
        : [...f.modulos_asignados, m],
    }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} data-testid="user-modal">
        <h2 className="modal-title">{isNew ? "Nuevo usuario" : "Editar usuario"}</h2>
        <div className="modal-sub">Completa los datos del usuario</div>
        <div className="form-grid">
          <div className="field">
            <label>Nombre completo</label>
            <input className="input" value={form.nombre_completo} onChange={(e) => setForm({ ...form, nombre_completo: e.target.value })} required data-testid="user-form-name" />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required data-testid="user-form-email" />
          </div>
          {isNew && (
            <div className="field">
              <label>Contraseña</label>
              <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required data-testid="user-form-password" />
            </div>
          )}
          <div className="field">
            <label>Rol</label>
            <select className="select" value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })} data-testid="user-form-rol">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Salario</label>
            <input type="number" className="input" value={form.salario} onChange={(e) => setForm({ ...form, salario: Number(e.target.value) })} data-testid="user-form-salario" />
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <label style={{ fontSize: 13, fontWeight: 500, color: "#334155" }}>Módulos asignados</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginTop: 8 }}>
            {MODULOS.map((m) => (
              <label key={m} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={form.modulos_asignados.includes(m)} onChange={() => toggleMod(m)} data-testid={`user-form-modulo-${m}`} />
                {m}
              </label>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="user-form-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}

function PasswordModal({ user, onClose, onSaved }) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put(`/users/${user._id}/password`, { password });
      toast.show("Contraseña actualizada");
      onSaved();
    } catch (err) {
      toast.show("Error al actualizar", "error");
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2 className="modal-title">Cambiar contraseña</h2>
        <div className="modal-sub">{user.nombre_completo} ({user.email})</div>
        <div className="field">
          <label>Nueva contraseña</label>
          <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} data-testid="password-modal-input" />
        </div>
        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy} data-testid="password-modal-submit">{busy ? "..." : "Guardar"}</button>
        </div>
      </form>
    </div>
  );
}
