/* Supabase auth wrappers + a cached session for synchronous reads in render code. */
import { supabase } from "../data/supabaseClient.js";

let _session = null;

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  _session = data.session;
  return _session;
}
export function cachedUser() { return _session?.user || null; }

export async function signUp({ email, password, name, username }) {
  return supabase.auth.signUp({
    email, password,
    options: { data: { name, username } }
  });
}
export async function signIn({ email, password }) {
  return supabase.auth.signInWithPassword({ email, password });
}
export async function signOut() {
  await supabase.auth.signOut();
  _session = null;
}
export async function resetPassword(email) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
}
export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((_event, session) => { _session = session; cb(session); });
}
