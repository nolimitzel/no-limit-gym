/* Per-user custom exercise LIBRARY — exercises a user creates themselves, saved
   permanently, categorised by muscle group, reusable in any session. Kept
   separate from HISTORY (what was actually done). A stable `key` per exercise
   keeps logged history linked forever.
   Local-first; synced to custom_exercises (migrate_10). Local and cloud are
   UNIONED (AUDIT H5) — a cloud read can never delete a local exercise, and
   anything not yet in the cloud is uploaded. A "Cardio" exercise is logged as
   minutes/rounds, not kg × reps (AUDIT M5). */
import { supabase } from "./supabaseClient.js";
import { mergeCustom } from "../core/sync.js";

const LKEY = (uid) => "gymtracker.customex:" + uid;
let _custom = [];      // [{ key, name, group, equipment, sets, reps, custom:true, synced }]
let _uid = null;

const withMeta = (c) => ({ ...c, custom: true, ...(c.group === "Cardio" ? { cardio: true } : {}) });
export function getCustomExercises() { return _custom.map(withMeta); }

function persistLocal() { try { localStorage.setItem(LKEY(_uid), JSON.stringify(_custom)); } catch {} }

async function upload(userId, ex) {
  const { error } = await supabase.from("custom_exercises").upsert(
    { user_id: userId, key: ex.key, name: ex.name, muscle_group: ex.group, equipment: ex.equipment || null },
    { onConflict: "user_id,key" });
  if (error) throw error;
}

export function loadCustomExercises(userId) {
  _uid = userId;
  try { _custom = JSON.parse(localStorage.getItem(LKEY(userId)) || "[]"); } catch { _custom = []; }
  if (supabase) {
    supabase.from("custom_exercises").select("*").eq("user_id", userId)
      .then(({ data, error }) => {
        if (error || !data) return;                        // table missing / offline → keep local
        const cloud = data.map(r => ({ key: r.key, name: r.name, group: r.muscle_group,
          equipment: r.equipment || "Custom", sets: r.sets || 3, reps: r.reps || "10–12" }));
        const { records, pending } = mergeCustom(_custom, cloud);
        _custom = records;
        persistLocal();
        for (const key of pending) {                       // upload what only this device has
          const ex = _custom.find(c => c.key === key);
          upload(userId, ex).then(() => { ex.synced = true; persistLocal(); }).catch(() => {});
        }
      }).catch(() => {});
  }
  return _custom;
}

// Create (or reuse) a custom exercise in a muscle group. Returns the exercise.
export async function addCustomExercise(userId, { name, group, equipment }) {
  const nm = (name || "").trim();
  if (!nm) throw new Error("no-name");
  const existing = _custom.find(c => c.group === group && c.name.toLowerCase() === nm.toLowerCase());
  if (existing) return withMeta(existing);                 // dedupe: same name+group reuses the key
  const key = "cx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  const ex = { key, name: nm, group, equipment: equipment || "Custom", sets: 3, reps: "10–12", synced: false };
  _custom = [..._custom, ex];
  persistLocal();
  if (supabase && userId) {
    upload(userId, ex).then(() => { ex.synced = true; persistLocal(); })
      .catch((e) => console.warn("[NO LIMIT] custom exercise kept on this device; cloud sync pending", e?.message || e));
  }
  return withMeta(ex);
}

// Fix a custom exercise's name or muscle group. The key never changes, so every
// logged set stays linked. Marked unsynced so the edit wins over the old cloud
// copy (core/sync.js) until the upload confirms it.
export async function updateCustomExercise(userId, key, { name, group }, { hasLogs = false } = {}) {
  const ex = _custom.find(c => c.key === key);
  if (!ex) throw new Error("not-found");
  const nm = (name || "").trim();
  if (!nm) throw new Error("no-name");
  const grp = group || ex.group;
  // logged sets are kg × reps or minutes/rounds; the type can't flip under them
  if (hasLogs && (grp === "Cardio") !== (ex.group === "Cardio")) throw new Error("cardio-lock");
  if (_custom.some(c => c.key !== key && c.group === grp && c.name.toLowerCase() === nm.toLowerCase())) throw new Error("duplicate");
  ex.name = nm; ex.group = grp; ex.synced = false;
  persistLocal();
  if (supabase && userId) {
    upload(userId, ex).then(() => { ex.synced = true; persistLocal(); })
      .catch((e) => console.warn("[NO LIMIT] exercise edit kept on this device; cloud sync pending", e?.message || e));
  }
  return withMeta(ex);
}
