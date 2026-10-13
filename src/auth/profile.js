/* Profile + nutrition-target reads/writes. All RLS-protected (owner only). */
import { supabase } from "../data/supabaseClient.js";

/* The owner's full profile. After migrate_11, private columns (email, bodyweight,
   goal, privacy…) are hidden from squad-mates, so the owner reads them through the
   get_my_profile() RPC; before the migration the plain select still works. Throws
   on a real failure so callers can tell "no profile" from "couldn't load". */
export async function getProfile(userId) {
  const rpc = await supabase.rpc("get_my_profile");
  if (!rpc.error) return rpc.data && rpc.data.id ? rpc.data : null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
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
// Only a SUCCESSFUL read showing no goal means onboarding. A network failure used to
// push existing users back through onboarding, overwriting their targets (AUDIT M8).
export async function needsOnboarding(userId) {
  try {
    const p = await getProfile(userId);
    return !p || !p.goal;
  } catch (e) {
    console.warn("[NO LIMIT] profile check failed — skipping onboarding this launch.", e?.message || e);
    return false;
  }
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
