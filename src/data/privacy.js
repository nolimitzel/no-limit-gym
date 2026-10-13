/* Privacy settings — what the user shares with their squad.
   Local-first, synced to the owner-only `profiles.privacy` column (migrate_11) so
   a choice like "don't share my workouts" follows the user to every device
   (AUDIT M1: it used to silently reset to "share" on a new device). An unsynced
   local change wins over the cloud copy until it has been pushed. */
import { supabase } from "./supabaseClient.js";

const LKEY = (uid) => "gymtracker.privacy:" + uid;
const DEFAULTS = { workouts: true, nutrition: false, bodyweight: false, music: true };

let active = { ...DEFAULTS };
let pending = false;
let _uid = null;

function writeLocal() {
  try { localStorage.setItem(LKEY(_uid), JSON.stringify({ v: 2, data: active, pending })); } catch {}
}
function push() {
  if (!supabase || !_uid) return;
  supabase.from("profiles").update({ privacy: active }).eq("id", _uid)
    .then(({ error }) => { if (!error) { pending = false; writeLocal(); } })   // missing column → stays pending
    .catch(() => {});
}

export function loadPrivacy(userId) {
  _uid = userId;
  try {
    const raw = JSON.parse(localStorage.getItem(LKEY(userId)) || "null");
    if (raw && raw.v === 2) { active = { ...DEFAULTS, ...raw.data }; pending = !!raw.pending; }
    else { active = { ...DEFAULTS, ...(raw || {}) }; pending = !!raw; }   // legacy local choice → upload once
  } catch { active = { ...DEFAULTS }; pending = false; }
  if (pending) push();
  return active;
}
// called once the owner's profile has loaded
export function applyCloudPrivacy(cloud) {
  if (pending || !cloud || typeof cloud !== "object") return;
  active = { ...DEFAULTS, ...cloud };
  writeLocal();
}
export function getPrivacy() { return active; }
export function setPrivacy(userId, patch) {
  _uid = userId;
  active = { ...active, ...patch };
  pending = true;
  writeLocal();
  push();
  return active;
}
