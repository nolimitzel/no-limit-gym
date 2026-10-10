/* Cloud persistence (Supabase) ↔ the app's in-memory DB shape.
   The app keeps using its sync localStorage DB as an offline cache; these calls
   push/pull the normalized cloud copy. Not yet wired into app.js — slice 1c wires
   it at boot + the 3 save points, then runs the migration + two-user test.

   Mapping:
     DB.logs[]  <->  workout_sessions (+ workout_sets, snapshotting name/key)
     DB.body[]  <->  bodyweight_logs
     DB.macros[] <-> nutrition_logs
   Exercise/session SLUGS (e.g. 'barbell-row', 'push') are stored in
   exercise_key / session_key so the round-trip is lossless; the display name is
   snapshotted so history survives a future rename. */
import { supabase } from "./supabaseClient.js";
import { exName, isCardioKey, sessionName } from "./programme.js";

/* ---- WRITE one workout: idempotent per (date, session_key) ---- */
export async function pushWorkout(userId, log) {
  await supabase.from("workout_sessions").delete()
    .match({ user_id: userId, date: log.date, session_key: log.session });

  const { data: sess, error } = await supabase.from("workout_sessions")
    .insert({
      user_id: userId, date: log.date, session_key: log.session,
      label_snapshot: sessionName(log.session), completed_at: new Date().toISOString()
    })
    .select("id").single();
  if (error) throw error;

  const rows = [];
  for (const [key, sets] of Object.entries(log.entries)) {
    const cardio = isCardioKey(key);
    sets.forEach((s, i) => rows.push({
      user_id: userId, session_id: sess.id, exercise_key: key,
      exercise_name_snapshot: exName(key), set_index: i + 1,
      weight: s.w, reps: s.r, is_cardio: cardio,
      minutes: cardio ? s.w : null, rounds: cardio ? s.r : null
    }));
  }
  if (rows.length) {
    const { error: e2 } = await supabase.from("workout_sets").insert(rows);
    if (e2) throw e2;
  }
}

export async function pushBodyweight(userId, entry) {
  const { error } = await supabase.from("bodyweight_logs")
    .upsert({ user_id: userId, date: entry.date, weight: entry.weight }, { onConflict: "user_id,date" });
  if (error) throw error;
}

export async function pushMacros(userId, entry) {
  const { error } = await supabase.from("nutrition_logs")
    .upsert({
      user_id: userId, date: entry.date,
      kcal: entry.kcal ?? null, protein: entry.protein ?? null,
      carbs: entry.carbs ?? null, fats: entry.fats ?? null
    }, { onConflict: "user_id,date" });
  if (error) throw error;
}

/* ---- READ: rebuild the app's DB shape from the cloud ---- */
export async function loadAll(userId) {
  const [sessionsRes, setsRes, bodyRes, macrosRes] = await Promise.all([
    supabase.from("workout_sessions").select("id,date,session_key").eq("user_id", userId),
    supabase.from("workout_sets").select("session_id,exercise_key,weight,reps,set_index").eq("user_id", userId),
    supabase.from("bodyweight_logs").select("date,weight").eq("user_id", userId).order("date"),
    supabase.from("nutrition_logs").select("date,kcal,protein,carbs,fats").eq("user_id", userId).order("date")
  ]);
  const byId = {};
  (sessionsRes.data || []).forEach((s) => {
    byId[s.id] = { date: s.date, session: s.session_key, entries: {}, ts: Date.parse(s.date) || 0 };
  });
  (setsRes.data || []).sort((a, b) => (a.set_index || 0) - (b.set_index || 0)).forEach((st) => {
    const log = byId[st.session_id]; if (!log) return;
    (log.entries[st.exercise_key] ||= []).push({ w: Number(st.weight), r: Number(st.reps) });
  });
  return {
    logs: Object.values(byId).sort((a, b) => (a.date < b.date ? -1 : 1)),
    body: (bodyRes.data || []).map((b) => ({ date: b.date, weight: Number(b.weight) })),
    macros: (macrosRes.data || []).map((m) => ({
      date: m.date, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fats: m.fats
    })),
    settings: {}
  };
}

/* ---- MIGRATION: upload a local DB blob, then verify counts ---- */
export async function migrateLocal(userId, localDB) {
  for (const log of localDB.logs || [])
    if (log.entries && Object.keys(log.entries).length) await pushWorkout(userId, log);
  for (const b of localDB.body || [])
    if (b.weight != null) await pushBodyweight(userId, b);
  for (const m of localDB.macros || [])
    if (m.kcal || m.protein) await pushMacros(userId, m);

  const cloud = await loadAll(userId);
  return {
    ok: cloud.logs.length >= (localDB.logs || []).length,
    workouts: { local: (localDB.logs || []).length, cloud: cloud.logs.length },
    body: { local: (localDB.body || []).length, cloud: cloud.body.length },
    macros: { local: (localDB.macros || []).length, cloud: cloud.macros.length }
  };
}
