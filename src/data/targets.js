/* Per-user nutrition targets (single values: kcal / protein / carbs / fats / water).
   Local-first with pending-sync tracking (AUDIT M7): an edit that hasn't reached
   the cloud yet wins on the next launch instead of being overwritten by the stale
   cloud copy. saveTargets() resolves { synced } and never throws. */
import { supabase } from "./supabaseClient.js";

const LKEY = (uid) => "gymtracker.targets:" + uid;
const DEFAULTS = { kcal: 2700, protein: 170, carbs: 300, fats: 75, water: 3000 };

let active = null;

export function setActiveTargets(t) { active = t; }
export function getActiveTargets() { return active || DEFAULTS; }

function norm(d) {
  return {
    kcal: d.kcal ?? DEFAULTS.kcal, protein: d.protein ?? DEFAULTS.protein,
    carbs: d.carbs ?? DEFAULTS.carbs, fats: d.fats ?? DEFAULTS.fats,
    water: d.water ?? DEFAULTS.water
  };
}
function readLocal(uid) {
  try {
    const raw = JSON.parse(localStorage.getItem(LKEY(uid)) || "null");
    if (!raw) return null;
    return raw.v === 2 ? { data: raw.data, pending: !!raw.pending } : { data: raw, pending: false };
  } catch { return null; }
}
function writeLocal(uid, data, pending) {
  try { localStorage.setItem(LKEY(uid), JSON.stringify({ v: 2, data, pending })); } catch {}
}
async function pushCloud(uid, t) {
  const { error } = await supabase.from("nutrition_targets").upsert({ user_id: uid, ...t }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function loadTargets(userId) {
  const local = readLocal(userId);
  if (local && local.pending) {
    active = norm(local.data);
    pushCloud(userId, active).then(() => writeLocal(userId, active, false)).catch(() => {});
    return active;
  }
  try {
    const { data, error } = await supabase.from("nutrition_targets")
      .select("kcal,protein,carbs,fats,water").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (data) { active = norm(data); writeLocal(userId, active, false); return active; }
  } catch (e) {
    console.warn("[NO LIMIT] targets cloud load failed — using this device's copy.", e?.message || e);
  }
  active = local ? norm(local.data) : { ...DEFAULTS };
  return active;
}

export async function saveTargets(userId, t) {
  active = norm(t);
  writeLocal(userId, active, true);
  try { await pushCloud(userId, active); writeLocal(userId, active, false); return { synced: true }; }
  catch (e) { console.warn("[NO LIMIT] targets saved on this device; sync pending.", e?.message || e); return { synced: false }; }
}
