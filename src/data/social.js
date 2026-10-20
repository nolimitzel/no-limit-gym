/* Social layer — activity feed + reactions. All RLS-gated to the squad. */
import { supabase } from "./supabaseClient.js";

// the user's current squad id, cached at boot so workout posts don't need a fetch
let _squadId = null;
export function setCurrentSquad(id) { _squadId = id || null; }
export function getCurrentSquad() { return _squadId; }

export const REACTIONS = ["🔥", "💪", "👏"];

// resolves true only when the server confirmed the insert (supabase-js returns
// errors rather than throwing, so the old try/catch never saw a failed post)
export async function postActivity(userId, squadId, type, data, createdAt) {
  if (!squadId) return false;
  try {
    const row = { user_id: userId, squad_id: squadId, type, data, ...(createdAt ? { created_at: createdAt } : {}) };
    const { error } = await supabase.from("activity_posts").insert(row);
    if (error && error.code === "23505") return true;     // already posted (one-per-workout rule, migrate_14)
    if (error) { console.warn("[NO LIMIT] activity post failed", error.message); return false; }
    return true;
  } catch (e) { console.warn("[NO LIMIT] activity post failed", e?.message || e); return false; }
}

// this user's own workout posts in a squad since a time (to find what's missing)
export async function getMyWorkoutPosts(squadId, userId, sinceIso) {
  const { data, error } = await supabase.from("activity_posts")
    .select("created_at,data").eq("squad_id", squadId).eq("user_id", userId).eq("type", "workout")
    .gte("created_at", sinceIso);
  if (error) throw error;
  return data || [];
}

export async function getFeed(squadId) {
  const { data, error } = await supabase.from("activity_posts")
    .select("id,user_id,type,data,created_at,profiles(username,name,avatar_url),activity_reactions(emoji,user_id)")
    .eq("squad_id", squadId).order("created_at", { ascending: false }).limit(30);
  if (error) throw error;
  return data || [];
}

// workout activity in a window — used to rank squad members by consistency
export async function getWorkoutPosts(squadId, sinceIso) {
  let q = supabase.from("activity_posts")
    .select("user_id,created_at,profiles(username,name)")
    .eq("squad_id", squadId).eq("type", "workout");
  if (sinceIso) q = q.gte("created_at", sinceIso);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/* ---- challenges (squad-combined goals) ---- */
export async function getChallenges(squadId) {
  const { data, error } = await supabase.from("challenges")
    .select("*").eq("squad_id", squadId).order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export async function createChallenge(squadId, userId, title, target, days) {
  const ends = new Date(Date.now() + days * 86400000).toISOString();
  const { error } = await supabase.from("challenges")
    .insert({ squad_id: squadId, title, target, metric: "workouts", ends_on: ends, created_by: userId });
  if (error) throw error;
}
export async function deleteChallenge(id) {
  const { error } = await supabase.from("challenges").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleReaction(postId, userId, emoji) {
  const { data } = await supabase.from("activity_reactions")
    .select("id").match({ post_id: postId, user_id: userId, emoji });
  if (data && data[0]) await supabase.from("activity_reactions").delete().eq("id", data[0].id);
  else await supabase.from("activity_reactions").insert({ post_id: postId, user_id: userId, emoji });
}
