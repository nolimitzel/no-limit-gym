/* Supabase auth wrappers + a cached session for synchronous reads in render code. */
import { supabase } from "../data/supabaseClient.js";

import { offlineBootSession } from "../core/boot.js";

let _session = null;
let _offline = false;   // booted from the stored session because the network was down
// Keep the cached session live across sign-in / sign-up / sign-out / token refresh,
// so cachedUser() is correct immediately (not just after a page reload). While
// booted offline, a "no session yet" event must not wipe the user out — that would
// point the app at an empty cache; only a real sign-out or a fresh session counts.
if (supabase) supabase.auth.onAuthStateChange((event, session) => {
  if (!session && _offline && event !== "SIGNED_OUT") return;
  _session = session;
  if (session) _offline = false;
  // a working session again (e.g. signal back after an offline launch) → let the app resync now
  if (session && (event === "TOKEN_REFRESHED" || event === "SIGNED_IN")) window.dispatchEvent(new Event("nl-session-live"));
});

// the signed-in session as the auth client stored it on this device
function storedSession() {
  try {
    const key = supabase.auth.storageKey;
    const s = JSON.parse(localStorage.getItem(key) || "null");
    if (s && !s.user) {                                      // newer clients may keep the user separately
      const u = JSON.parse(localStorage.getItem(key + "-user") || "null");
      if (u) s.user = u.user || u;
    }
    return s;
  } catch { return null; }
}

/* Offline relaunch fix: with no signal and an expired access token, the client
   can't refresh and reports no session. Boot from the stored one instead so the
   user's on-device workouts stay usable; it's refreshed once the network is back
   (core/boot.js has the rules, incl. never resurrecting a revoked session). */
export async function getSession() {
  // With no signal the client retries the token refresh for ~25 s before giving up;
  // don't leave a blank screen that long — after 4 s treat it as a network failure.
  const slow = { name: "AuthRetryableFetchError", status: 0, message: "refresh timed out (offline?)" };
  const res = await Promise.race([
    supabase.auth.getSession(),
    new Promise(r => setTimeout(() => r({ data: { session: null }, error: slow, timedOut: true }), 4000)),
  ]);
  _session = res.data.session;
  if (!_session) {
    const s = offlineBootSession({ session: null, error: res.error, stored: storedSession(), online: navigator.onLine });
    if (s) { _session = s; _offline = true; console.warn("[NO LIMIT] offline — opening with the session saved on this device."); }
  }
  return _session;
}
// a session the server will accept right now (not the offline stand-in, not the anon key)
export async function hasLiveSession() {
  if (_offline) return false;
  try { const { data } = await supabase.auth.getSession(); return !!data.session; } catch { return false; }
}
export const isOfflineSession = () => _offline;
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
  // Offline with an expired token the client refuses to sign out (it can't load the
  // session) and leaves it in storage — which the offline boot would then reopen.
  // Always clear this device's copy so sign-out means signed out.
  try { await supabase.auth.signOut(); } catch {}
  try {
    const key = supabase.auth.storageKey;
    localStorage.removeItem(key); localStorage.removeItem(key + "-user"); localStorage.removeItem(key + "-code-verifier");
  } catch {}
  _session = null; _offline = false;
}
export async function resetPassword(email) {
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
}
export async function updatePassword(password) {
  return supabase.auth.updateUser({ password });
}
