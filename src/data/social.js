/* Social layer — activity feed + reactions. All RLS-gated to the squad. */
import { supabase } from "./supabaseClient.js";

// the user's current squad id, cached at boot so workout posts don't need a fetch
let _squadId = null;
export function setCurrentSquad(id) { _squadId = id || null; }
export function getCurrentSquad() { return _squadId; }

export const REACTIONS = ["🔥", "💪", "👏"];

export async function postActivity(userId, squadId, type, data) {
  if (!squadId) return;
  try { await supabase.from("activity_posts").insert({ user_id: userId, squad_id: squadId, type, data }); }
  catch (e) { console.warn("[NO LIMIT] activity post failed", e?.message || e); }
}

export async function getFeed(squadId) {
  const { data, error } = await supabase.from("activity_posts")
    .select("id,user_id,type,data,created_at,profiles(username,name),activity_reactions(emoji,user_id)")
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
