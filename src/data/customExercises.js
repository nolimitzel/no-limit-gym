/* Per-user custom exercise library — the exercises a user creates themselves,
   saved permanently and categorised by muscle group so they can be reused in
   any session. Local-first (instant), synced to the custom_exercises table.
   Stable `key` per exercise keeps workout history linked across sessions.
   This is the LIBRARY (what's available), kept separate from HISTORY (what was
   actually done). Needs migrate_10.sql; degrades gracefully before it's run. */
import { supabase } from "./supabaseClient.js";

const LKEY = (uid) => "gymtracker.customex:" + uid;
let _custom = [];      // [{ key, name, group, equipment, sets, reps, custom:true }]
let _uid = null;

export function getCustomExercises() { return _custom; }

function persistLocal() { try { localStorage.setItem(LKEY(_uid), JSON.stringify(_custom)); } catch {} }

export function loadCustomExercises(userId) {
  _uid = userId;
  try { _custom = JSON.parse(localStorage.getItem(LKEY(userId)) || "[]"); } catch { _custom = []; }
  if (supabase) {
    supabase.from("custom_exercises").select("*").eq("user_id", userId)
      .then(({ data, error }) => {
        if (error || !data) return;
        _custom = data.map(r => ({
          key: r.key, name: r.name, group: r.muscle_group,
          equipment: r.equipment || "Custom", sets: r.sets || 3, reps: r.reps || "10–12", custom: true,
        }));
        persistLocal();
      }).catch(() => {});
  }
  return _custom;
}

// Create (or reuse) a custom exercise in a muscle group. Returns the exercise.
export async function addCustomExercise(userId, { name, group, equipment }) {
  const nm = (name || "").trim();
  if (!nm) throw new Error("no-name");
  const existing = _custom.find(c => c.group === group && c.name.toLowerCase() === nm.toLowerCase());
  if (existing) return existing;                       // dedupe: same name+group reuses the key
  const key = "cx-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
  const ex = { key, name: nm, group, equipment: equipment || "Custom", sets: 3, reps: "10–12", custom: true };
  _custom = [..._custom, ex];
  persistLocal();
  if (supabase) {
    supabase.from("custom_exercises")
      .insert({ user_id: userId, key, name: nm, muscle_group: group, equipment: equipment || null })
      .then(({ error }) => { if (error) console.warn("[NO LIMIT] custom exercise cloud-save failed", error.message); })
      .catch(() => {});
  }
  return ex;
}

export async function deleteCustomExercise(userId, key) {
  _custom = _custom.filter(c => c.key !== key);
  persistLocal();
  if (supabase) supabase.from("custom_exercises").delete().match({ user_id: userId, key }).then(() => {}).catch(() => {});
}
