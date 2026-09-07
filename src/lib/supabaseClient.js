import { createClient } from "@supabase/supabase-js";

const url = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const key = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || ""
).trim();

export function isSupabaseConfigured() {
  return Boolean(url && key);
}

export const supabase = isSupabaseConfigured()
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "gastos-auth"
      }
    })
  : null;

export async function getSessionUserId() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

export async function requireUserId() {
  const id = await getSessionUserId();
  if (!id) throw new Error("Tenés que iniciar sesión para guardar en la nube.");
  return id;
}
