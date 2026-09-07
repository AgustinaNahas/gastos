import React, { useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

export default function AuthView() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured()) {
    return (
      <section className="panel auth-panel">
        <h2 className="panel-title">Falta configurar Supabase</h2>
        <p className="auth-lead">
          Los gastos ahora se guardan en la nube. Seguí el <strong>README</strong> para crear el proyecto, correr el SQL y
          pegar las claves en <code>.env</code>.
        </p>
        <p className="auth-lead">
          Variables: <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (o{" "}
          <code>VITE_SUPABASE_ANON_KEY</code>).
        </p>
      </section>
    );
  }

  async function submit(ev) {
    ev.preventDefault();
    setMessage("");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (!data.session) {
          setMessage("Cuenta creada. Si pedimos confirmación de email, mirá tu correo y después iniciá sesión.");
        }
      }
    } catch (err) {
      setMessage(err.message || "No se pudo entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel auth-panel">
      <h2 className="panel-title">{mode === "login" ? "Entrar" : "Crear cuenta"}</h2>
      <p className="auth-lead">Tus resúmenes y reglas quedan en Supabase, no en este navegador.</p>
      <form className="auth-form" onSubmit={submit}>
        <label className="filter-group">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label className="filter-group">
          <span>Contraseña</span>
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Esperá…" : mode === "login" ? "Iniciar sesión" : "Registrarme"}
        </button>
      </form>
      <button
        type="button"
        className="btn-ghost"
        onClick={() => {
          setMode((m) => (m === "login" ? "signup" : "login"));
          setMessage("");
        }}
      >
        {mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}
      </button>
      {message && <div className="alert-inline">{message}</div>}
    </section>
  );
}
