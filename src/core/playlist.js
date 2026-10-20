/* Spotify link parsing (pure, unit-tested in tests/playlist.test.js).
   Turns any shareable Spotify link (open.spotify.com, with or without an
   intl-xx/ prefix or ?si= tracking, or a spotify: URI) into its type + id, so
   the app can show the cover and play it in Spotify's embedded player. */

const TYPES = "playlist|album|track|artist|show|episode";
const WEB = new RegExp(`^https?://open\\.spotify\\.com/(?:intl-[a-z-]+/)?(?:embed/)?(${TYPES})/([A-Za-z0-9]{10,})`, "i");
const URI = new RegExp(`^spotify:(${TYPES}):([A-Za-z0-9]{10,})$`, "i");

export function spotifyLink(url) {
  const s = String(url || "").trim();
  const m = s.match(WEB) || s.match(URI);
  if (!m) return null;
  const type = m[1].toLowerCase(), id = m[2];
  return {
    type, id,
    url: `https://open.spotify.com/${type}/${id}`,
    embed: `https://open.spotify.com/embed/${type}/${id}`,
  };
}
