/* Single shared Supabase client.
   URL + anon key come from .env (VITE_ vars, injected at build time).
   The anon key is public by design; Row-Level Security protects all data. */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// captured BEFORE createClient consumes the URL: did we arrive from a password-reset email?
export const isRecoveryLink = typeof location !== "undefined" &&
  /(^|[#&?])type=recovery(&|$)/.test(location.hash + "&" + location.search);

export const supabase = url && anon
  ? createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    })
  : null;

if (!supabase) {
  console.warn("[NO LIMIT] Supabase env vars missing — running in local-only mode.");
}
