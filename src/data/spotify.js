/* Spotify Connect — Authorization Code flow with PKCE (no client secret, no
   backend). Lets a user authorize once, then we read their playlists so they
   can pick one to share with the squad. Tokens live in localStorage and
   auto-refresh. Everything no-ops gracefully when VITE_SPOTIFY_CLIENT_ID is
   unset, so the paste-a-link fallback always works. */
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
const REDIRECT  = location.origin + "/";
const SCOPES    = "playlist-read-private playlist-read-collaborative user-read-currently-playing";
const TKEY = "nl.spotify.tokens";
const VKEY = "nl.spotify.verifier";
const SKEY = "nl.spotify.state";

export function spotifyConfigured() { return !!CLIENT_ID; }

function randStr(n) {
  const a = new Uint8Array(n); crypto.getRandomValues(a);
  return Array.from(a, b => ("0" + b.toString(16)).slice(-2)).join("");
}
async function sha256url(s) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(d)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function connectSpotify() {
  if (!CLIENT_ID) throw new Error("no-client-id");
  const verifier = randStr(48);
  sessionStorage.setItem(VKEY, verifier);
  const state = "nls-" + randStr(12);
  sessionStorage.setItem(SKEY, state);
  const challenge = await sha256url(verifier);
  const p = new URLSearchParams({
    client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT,
    code_challenge_method: "S256", code_challenge: challenge, scope: SCOPES, state,
  });
  location.href = "https://accounts.spotify.com/authorize?" + p.toString();
}

// Called early at boot. If we're returning from Spotify, exchange the code for
// tokens and strip the query so the rest of the app boots cleanly.
export async function handleSpotifyRedirect() {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const verifier = sessionStorage.getItem(VKEY);
  const expected = sessionStorage.getItem(SKEY);
  if (!code || !state || state !== expected || !verifier) return false;
  try {
    const body = new URLSearchParams({
      client_id: CLIENT_ID, grant_type: "authorization_code",
      code, redirect_uri: REDIRECT, code_verifier: verifier,
    });
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const j = await r.json();
    if (j.access_token) saveTokens(j);
  } catch (e) { console.warn("[NO LIMIT] Spotify token exchange failed", e); }
  sessionStorage.removeItem(VKEY); sessionStorage.removeItem(SKEY);
  url.searchParams.delete("code"); url.searchParams.delete("state");
  history.replaceState({}, "", url.pathname + url.search + url.hash);
  return true;
}

function saveTokens(j) {
  const t = { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  try { localStorage.setItem(TKEY, JSON.stringify(t)); } catch {}
}
function loadTokens() { try { return JSON.parse(localStorage.getItem(TKEY) || "null"); } catch { return null; } }
export function isSpotifyConnected() { return !!loadTokens(); }
export function disconnectSpotify() { try { localStorage.removeItem(TKEY); } catch {} }

async function freshToken() {
  const t = loadTokens(); if (!t) return null;
  if (Date.now() < t.exp - 60000) return t.access;
  if (!t.refresh) return t.access;
  try {
    const body = new URLSearchParams({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: t.refresh });
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const j = await r.json();
    if (j.access_token) { saveTokens({ ...j, refresh_token: j.refresh_token || t.refresh }); return j.access_token; }
  } catch {}
  return t.access;
}

async function api(path) {
  const tok = await freshToken();
  if (!tok) throw new Error("not-connected");
  const r = await fetch("https://api.spotify.com/v1" + path, { headers: { Authorization: "Bearer " + tok } });
  if (r.status === 401) { disconnectSpotify(); throw new Error("expired"); }
  if (!r.ok) throw new Error("api-" + r.status);
  return r.json();
}

export async function getNowPlaying() {
  try {
    const tok = await freshToken(); if (!tok) return null;
    const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", { headers: { Authorization: "Bearer " + tok } });
    if (r.status === 204 || !r.ok) return null;   // 204 = nothing playing
    const j = await r.json();
    const t = j.item; if (!t) return null;
    return {
      name: t.name,
      artist: (t.artists || []).map(a => a.name).join(", "),
      art: t.album?.images?.[0]?.url || null,
      url: t.external_urls?.spotify || null,
      playing: !!j.is_playing,
      progress_ms: j.progress_ms || 0,
      duration_ms: t.duration_ms || 0,
    };
  } catch { return null; }
}

export async function getSpotifyProfile() { return api("/me"); }
export async function getSpotifyPlaylists() {
  const j = await api("/me/playlists?limit=50");
  return (j.items || []).map(p => ({
    id: p.id, name: p.name, url: p.external_urls?.spotify,
    img: p.images?.[0]?.url || null, tracks: p.tracks?.total ?? null,
  }));
}
