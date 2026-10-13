/* Cloud persistence (Supabase) ↔ the app's DB shape.
     DB.logs[]   <->  workout_sessions (+ workout_sets, snapshotting name/key)
     DB.body[]   <->  bodyweight_logs
     DB.macros[] <->  nutrition_logs (+ meals jsonb once migrate_11 has run)
   Exercise/session slugs live in exercise_key / session_key so the round-trip is
   lossless; the display name is snapshotted so history survives a rename/delete.

   Reliability rules (see AUDIT_REPORT.md C1, C5, M11):
   • reads paginate past PostgREST's 1,000-row cap and THROW on any error, so the
     boot merge is never fed partial data
   • a workout write inserts the new copy before removing the old one, so a
     failure part-way can never leave the cloud with no copy at all */
import { supabase } from "./supabaseClient.js";
import { exName, isCardioKey, sessionName } from "./programme.js";

const PAGE = 1000;
const isMissingColumn = (e) => !!e && (e.code === "42703" || e.code === "PGRST204" ||
  /column .* does not exist|could not find the .* column/i.test(e.message || ""));

// fetch every row of a query, page by page (build = (from, to) => query)
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

/* ---- WRITE one workout: idempotent per (date, session_key) ---- */
export async function pushWorkout(userId, log) {
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
    if (e2) {                                   // don't leave a half-written session behind
      await supabase.from("workout_sessions").delete().eq("id", sess.id);
      throw e2;
    }
  }
  // the new copy is safely stored — now remove older copies of this (date, session)
  const { error: e3 } = await supabase.from("workout_sessions").delete()
    .match({ user_id: userId, date: log.date, session_key: log.session }).neq("id", sess.id);
  if (e3) console.warn("[NO LIMIT] old workout copy not cleaned (deduped on load)", e3.message);
}

export async function pushBodyweight(userId, entry) {
  const { error } = await supabase.from("bodyweight_logs")
    .upsert({ user_id: userId, date: entry.date, weight: entry.weight }, { onConflict: "user_id,date" });
  if (error) throw error;
}

export async function pushMacros(userId, entry) {
  const row = {
    user_id: userId, date: entry.date,
    kcal: entry.kcal ?? null, protein: entry.protein ?? null,
    carbs: entry.carbs ?? null, fats: entry.fats ?? null
  };
  let { error } = await supabase.from("nutrition_logs")
    .upsert({ ...row, meals: entry.meals ?? null }, { onConflict: "user_id,date" });
  if (isMissingColumn(error)) {                  // before migrate_11: sync totals, keep meals on-device
    ({ error } = await supabase.from("nutrition_logs").upsert(row, { onConflict: "user_id,date" }));
  }
  if (error) throw error;
}

/* ---- READ: rebuild the app's DB shape from the cloud (complete or throws) ---- */
export async function loadAll(userId) {
  const macrosQuery = (cols) => fetchAll((a, b) => supabase.from("nutrition_logs")
    .select(cols).eq("user_id", userId).order("date").range(a, b));
  const [sessions, sets, body, macros] = await Promise.all([
    fetchAll((a, b) => supabase.from("workout_sessions").select("id,date,session_key,label_snapshot,completed_at")
      .eq("user_id", userId).order("id").range(a, b)),
    fetchAll((a, b) => supabase.from("workout_sets")
      .select("session_id,exercise_key,exercise_name_snapshot,weight,reps,set_index")
      .eq("user_id", userId).order("id").range(a, b)),
    fetchAll((a, b) => supabase.from("bodyweight_logs").select("date,weight")
      .eq("user_id", userId).order("date").range(a, b)),
    macrosQuery("date,kcal,protein,carbs,fats,meals")
      .catch((e) => { if (isMissingColumn(e)) return macrosQuery("date,kcal,protein,carbs,fats"); throw e; }),
  ]);

  // a (date, session) can briefly have two copies if a cleanup failed — keep the newest
  const keep = {};
  for (const s of sessions) {
    const k = s.date + "|" + s.session_key;
    if (!keep[k] || (s.completed_at || "") > (keep[k].completed_at || "")) keep[k] = s;
  }
  const byId = {};
  for (const s of Object.values(keep)) {
    byId[s.id] = { date: s.date, session: s.session_key, entries: {}, ts: Date.parse(s.completed_at || s.date) || 0 };
  }
  const names = {};
  // session names too ("@key"), so history from a since-deleted programme day keeps its label
  for (const s of Object.values(keep)) if (s.label_snapshot && s.label_snapshot !== s.session_key) names["@" + s.session_key] = s.label_snapshot;
  sets.sort((a, b) => (a.set_index || 0) - (b.set_index || 0)).forEach((st) => {
    const log = byId[st.session_id]; if (!log) return;
    (log.entries[st.exercise_key] ||= []).push({ w: Number(st.weight), r: Number(st.reps) });
    if (st.exercise_name_snapshot && st.exercise_name_snapshot !== st.exercise_key) names[st.exercise_key] = st.exercise_name_snapshot;
  });
  return {
    logs: Object.values(byId).sort((a, b) => (a.date < b.date ? -1 : 1)),
    body: body.map((b) => ({ date: b.date, weight: Number(b.weight) })),
    macros: macros.map((m) => {
      const r = { date: m.date, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fats: m.fats };
      if (Array.isArray(m.meals)) r.meals = m.meals;
      return r;
    }),
    names,
    settings: {}
  };
}

/* ---- ERASE: the user's own workout/body/nutrition history (RLS-scoped) ---- */
export async function deleteAllHistory(userId) {
  for (const t of ["workout_sessions", "bodyweight_logs", "nutrition_logs"]) {   // sets cascade
    const { error } = await supabase.from(t).delete().eq("user_id", userId);
    if (error) throw error;
  }
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
