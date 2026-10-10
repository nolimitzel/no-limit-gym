/* Per-user nutrition targets (single values: kcal / protein / carbs / fats / water).
   Loaded from nutrition_targets (set at onboarding), editable, local-first. */
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

export async function loadTargets(userId) {
  try {
    const { data, error } = await supabase.from("nutrition_targets")
      .select("kcal,protein,carbs,fats,water").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    if (data) {
      active = norm(data);
      try { localStorage.setItem(LKEY(userId), JSON.stringify(active)); } catch {}
      return active;
    }
  } catch (e) {
    console.warn("[NO LIMIT] targets cloud load failed — trying local.", e?.message || e);
  }
  try { const l = localStorage.getItem(LKEY(userId)); if (l) { active = JSON.parse(l); return active; } } catch {}
  active = { ...DEFAULTS };
  return active;
}

export async function saveTargets(userId, t) {
  active = norm(t);
  try { localStorage.setItem(LKEY(userId), JSON.stringify(active)); } catch {}
  const { error } = await supabase.from("nutrition_targets")
    .upsert({ user_id: userId, ...active }, { onConflict: "user_id" });
  if (error) throw error;
}
