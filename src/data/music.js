/* Training soundtrack — a playlist link + vibe label shared with the squad.
   Local-first (mirrors privacy): the input prefills from a per-user local
   cache; writes go to localStorage instantly and best-effort to the profile
   row (so squad-mates can see it). Degrades gracefully offline / pre-migrate_8. */
import { supabase } from "./supabaseClient.js";

const LKEY = (uid) => "gymtracker.music:" + uid;
let _music = { url: "", label: "" };

export function getMusic() { return _music; }

export function loadMusic(userId) {
  _music = { url: "", label: "" };
  try { const r = localStorage.getItem(LKEY(userId)); if (r) _music = JSON.parse(r); } catch {}
  if (supabase) {
    supabase.from("profiles").select("music_url,music_label").eq("id", userId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          _music = { url: data.music_url || "", label: data.music_label || "" };
          try { localStorage.setItem(LKEY(userId), JSON.stringify(_music)); } catch {}
        }
      }).catch(() => {});
  }
  return _music;
}

export function setMusic(userId, url, label) {
  _music = { url: url || "", label: label || "" };
  try { localStorage.setItem(LKEY(userId), JSON.stringify(_music)); } catch {}
  if (supabase) {
    return supabase.from("profiles")
      .update({ music_url: url || null, music_label: label || null }).eq("id", userId)
      .then(({ error }) => { if (error) throw error; });
  }
  return Promise.resolve();
}

// only allow real web links to render as clickable (and open safely)
export function safeMusicUrl(u) {
  if (!u) return null;
  try { const p = new URL(u); return (p.protocol === "http:" || p.protocol === "https:") ? p.href : null; }
  catch { return null; }
}
