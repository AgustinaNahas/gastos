import React, { useState } from "react";
import { Alert, Button, PasswordInput, Text, TextInput, Title } from "@mantine/core";
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
        <Title order={2} className="panel-title">
          Falta configurar Supabase
        </Title>
        <Text c="dimmed" mb="sm">
          Los gastos ahora se guardan en la nube. Seguí el <strong>README</strong> para crear el proyecto, correr el SQL y
          pegar las claves en <code>.env</code>.
        </Text>
        <Text c="dimmed">
          Variables: <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (o{" "}
          <code>VITE_SUPABASE_ANON_KEY</code>).
        </Text>
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
      <Title order={2} className="panel-title">
        {mode === "login" ? "Entrar" : "Crear cuenta"}
      </Title>
      <Text c="dimmed" mb="md">
        Tus resúmenes y reglas quedan en Supabase, no en este navegador.
      </Text>
      <form className="auth-form" onSubmit={submit}>
        <TextInput
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          required
        />
        <PasswordInput
          label="Contraseña"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          minLength={6}
          required
        />
        <Button type="submit" fullWidth disabled={busy}>
          {busy ? "Esperá…" : mode === "login" ? "Iniciar sesión" : "Registrarme"}
        </Button>
      </form>
      <Button
        variant="default"
        fullWidth
        mt="sm"
        onClick={() => {
          setMode((m) => (m === "login" ? "signup" : "login"));
          setMessage("");
        }}
      >
        {mode === "login" ? "No tengo cuenta" : "Ya tengo cuenta"}
      </Button>
      {message && (
        <Alert mt="md" color="sage">
          {message}
        </Alert>
      )}
    </section>
  );
}
