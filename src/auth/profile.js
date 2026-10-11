/* Profile + nutrition-target reads/writes. All RLS-protected (owner only). */
import { supabase } from "../data/supabaseClient.js";

export async function getProfile(userId) {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
}

export async function updateProfileBasics(userId, { name, username }) {
  const patch = {};
  if (name != null) patch.name = name;
  if (username != null) patch.username = username;
  const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}

// A user still needs onboarding until they've set a goal.
export async function needsOnboarding(userId) {
  const p = await getProfile(userId);
  return !p || !p.goal;
}

const TARGETS = {
  lean_gain: { kcal: 2700, protein: 170, carbs: 300, fats: 75 },
  fat_loss:  { kcal: 2200, protein: 180, carbs: 180, fats: 70 },
  strength:  { kcal: 2600, protein: 170, carbs: 270, fats: 80 },
  maintain:  { kcal: 2500, protein: 160, carbs: 250, fats: 75 }
};

export async function saveOnboarding(userId, f) {
  const { error: pErr } = await supabase.from("profiles").update({
    name: f.name, username: f.username, goal: f.goal,
    experience: f.experience, bw_current: f.bw_current,
    bw_target: f.bw_target, training_days: f.training_days
  }).eq("id", userId);
  if (pErr) return { error: pErr };

  const t = TARGETS[f.goal] || TARGETS.maintain;
  const { error: tErr } = await supabase.from("nutrition_targets")
    .upsert({ user_id: userId, ...t });
  return { error: tErr };
}
