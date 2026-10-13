/* Per-user programme persistence — LOCAL-FIRST with pending-sync tracking.
   Root-cause fix for AUDIT C3 ("Train still shows Back Day"): previously a failed
   cloud save left the edit only on the device, and the next launch's cloud read
   overwrote it. Now:
   • every save marks the local copy `pending` until the cloud confirms it
   • load: a pending local edit wins (and is re-pushed); otherwise cloud is truth
   • a failed cloud READ never seeds defaults over the user's real programme
   • save targets the same row load reads, and never INSERTs after a read error
     (which used to create duplicate "active" programmes)
   saveProgramme() never throws; it resolves { synced } so callers can be honest. */
import { supabase } from "./supabaseClient.js";
import { PLAN } from "../data.js";

const LKEY = (uid) => "gymtracker.prog:" + uid;

export function defaultProgrammeData() {
  return JSON.parse(JSON.stringify({ sessions: PLAN.sessions, cycle: PLAN.cycle }));
}

function readLocal(userId) {
  try {
    const raw = JSON.parse(localStorage.getItem(LKEY(userId)) || "null");
    if (!raw) return null;
    if (raw.v === 2) return { data: raw.data, pending: !!raw.pending };
    if (raw.sessions && raw.cycle) return { data: raw, pending: false };   // legacy cache shape
  } catch {}
  return null;
}
function writeLocal(userId, data, pending) {
  try { localStorage.setItem(LKEY(userId), JSON.stringify({ v: 2, data, pending })); } catch {}
}

const activeRow = (userId) => supabase.from("programmes").select("id,data")
  .eq("user_id", userId).eq("is_active", true)
  .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(1);

async function pushCloud(userId, data) {
  const { data: rows, error } = await activeRow(userId);
  if (error) throw error;                                   // never fall through to INSERT
  if (rows && rows[0]) {
    const { data: upd, error: e2 } = await supabase.from("programmes")
      .update({ data }).eq("id", rows[0].id).select("id");
    if (e2) throw e2;
    if (!upd || !upd.length) throw new Error("programme update affected no rows");
  } else {
    const { error: e3 } = await supabase.from("programmes")
      .insert({ user_id: userId, name: "My Programme", is_active: true, data });
    if (e3) throw e3;
  }
}

export async function loadProgramme(userId) {
  const local = readLocal(userId);
  if (local && local.pending) {                             // unsynced edit on this device wins
    pushCloud(userId, local.data).then(() => writeLocal(userId, local.data, false))
      .catch((e) => console.warn("[NO LIMIT] programme still unsynced", e?.message || e));
    return local.data;
  }
  let rows;
  try {
    const res = await activeRow(userId);
    if (res.error) throw res.error;
    rows = res.data;
  } catch (e) {
    console.warn("[NO LIMIT] programme cloud load failed — using this device's copy.", e?.message || e);
    return local ? local.data : defaultProgrammeData();     // offline: do NOT seed over the cloud
  }
  if (rows && rows[0] && rows[0].data) {
    writeLocal(userId, rows[0].data, false);
    return rows[0].data;
  }
  // genuinely no programme in the cloud yet → seed it from this device (or defaults)
  const seed = local ? local.data : defaultProgrammeData();
  writeLocal(userId, seed, true);
  pushCloud(userId, seed).then(() => writeLocal(userId, seed, false)).catch(() => {});
  return seed;
}

export async function saveProgramme(userId, data) {
  writeLocal(userId, data, true);                            // instant + marked pending
  try {
    await pushCloud(userId, data);
    writeLocal(userId, data, false);
    return { synced: true };
  } catch (e) {
    console.warn("[NO LIMIT] programme saved on this device; cloud sync pending.", e?.message || e);
    return { synced: false, error: e };
  }
}
