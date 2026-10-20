/* Playlist cover + name from Spotify's public oEmbed endpoint — no login, so it
   works for every squad-mate's link. Cached per link for a week (localStorage)
   and per session (memory); any failure (offline, removed playlist) resolves to
   null and the caller keeps its plain music icon. */
import { spotifyLink } from "../core/playlist.js";

const CK = "nl.plmeta:";
const TTL = 7 * 86400000;
const mem = new Map();

const safeImg = (u) => { try { const p = new URL(u); return p.protocol === "https:" ? p.href : null; } catch { return null; } };

export function playlistMeta(url) {
  const sp = spotifyLink(url);
  if (!sp) return Promise.resolve(null);
  if (mem.has(sp.url)) return mem.get(sp.url);
  let hit = null;
  try { hit = JSON.parse(localStorage.getItem(CK + sp.url) || "null"); } catch {}
  if (hit && Date.now() - hit.at < TTL) { const p = Promise.resolve(hit.meta); mem.set(sp.url, p); return p; }
  const p = fetch("https://open.spotify.com/oembed?url=" + encodeURIComponent(sp.url))
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      if (!j) return null;
      const meta = { title: String(j.title || "").slice(0, 120), image: safeImg(j.thumbnail_url) };
      try { localStorage.setItem(CK + sp.url, JSON.stringify({ at: Date.now(), meta })); } catch {}
      return meta;
    })
    .catch(() => { mem.delete(sp.url); return hit ? hit.meta : null; });   // offline: stale beats nothing, retry next time
  mem.set(sp.url, p);
  return p;
}
