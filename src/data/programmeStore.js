/* Per-user programme persistence — LOCAL-FIRST.
   The programme is a structured JSON document (always read/written whole).
   loadProgramme: cloud → local cache → default (and seeds).
   saveProgramme: writes local instantly, then best-effort cloud sync.
   Everything degrades gracefully (offline, or before programmes.data exists),
   so editing always works; cloud just adds cross-device sync. */
import { supabase } from "./supabaseClient.js";
import { PLAN } from "../data.js";

const LKEY = (uid) => "gymtracker.prog:" + uid;

export function defaultProgrammeData() {
  return JSON.parse(JSON.stringify({ sessions: PLAN.sessions, cycle: PLAN.cycle }));
}

export async function loadProgramme(userId) {
  // 1) cloud (source of truth across devices)
  try {
    const { data: rows, error } = await supabase.from("programmes")
      .select("data").eq("user_id", userId).eq("is_active", true)
      .order("created_at", { ascending: true }).limit(1);
    if (error) throw error;
    if (rows && rows[0] && rows[0].data) {
      try { localStorage.setItem(LKEY(userId), JSON.stringify(rows[0].data)); } catch {}
      return rows[0].data;
    }
  } catch (e) {
    console.warn("[NO LIMIT] programme cloud load failed — trying local.", e?.message || e);
  }
  // 2) local cache
  try { const l = localStorage.getItem(LKEY(userId)); if (l) return JSON.parse(l); } catch {}
  // 3) default (seed local + best-effort cloud)
  const seed = defaultProgrammeData();
  try { localStorage.setItem(LKEY(userId), JSON.stringify(seed)); } catch {}
  saveProgramme(userId, seed).catch(() => {});
  return seed;
}

export async function saveProgramme(userId, data) {
  try { localStorage.setItem(LKEY(userId), JSON.stringify(data)); } catch {}   // instant
  const { data: rows } = await supabase.from("programmes")
    .select("id").eq("user_id", userId).eq("is_active", true).limit(1);
  if (rows && rows[0]) {
    const { error } = await supabase.from("programmes").update({ data }).eq("id", rows[0].id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("programmes")
      .insert({ user_id: userId, name: "My Programme", is_active: true, data });
    if (error) throw error;
  }
}
