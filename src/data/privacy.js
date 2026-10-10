/* Privacy settings — what the user shares with their squad.
   Gates happen on the user's own device at post time, so local storage is enough
   for now (cloud sync of these can come in polish). */
const LKEY = (uid) => "gymtracker.privacy:" + uid;
const DEFAULTS = { workouts: true, nutrition: false, bodyweight: false, music: true };

let active = { ...DEFAULTS };

export function loadPrivacy(userId) {
  try { const l = localStorage.getItem(LKEY(userId)); active = l ? { ...DEFAULTS, ...JSON.parse(l) } : { ...DEFAULTS }; }
  catch { active = { ...DEFAULTS }; }
  return active;
}
export function getPrivacy() { return active; }
export function setPrivacy(userId, patch) {
  active = { ...active, ...patch };
  try { localStorage.setItem(LKEY(userId), JSON.stringify(active)); } catch {}
  return active;
}
