/* Accountability layer — weekly training commitments.
   Each user pledges a session target for the week; squad-mates can read each
   other's pledges (RLS-gated). Cloud-first; degrades gracefully before
   migrate_7.sql has run (callers guard with try/catch). */
import { supabase } from "./supabaseClient.js";

// Monday of the given week, as YYYY-MM-DD (schedule weeks start Monday).
export function weekStartISO(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;          // 0 = Monday … 6 = Sunday
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export async function getMyCommitment(userId, weekStart = weekStartISO()) {
  if (!supabase) return null;
  const { data, error } = await supabase.from("commitments")
    .select("*").eq("user_id", userId).eq("week_start", weekStart).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function setCommitment(userId, squadId, target, weekStart = weekStartISO()) {
  if (!supabase) return;
  const { error } = await supabase.from("commitments")
    .upsert({ user_id: userId, squad_id: squadId || null, week_start: weekStart, target },
            { onConflict: "user_id,week_start" });
  if (error) throw error;
}

export async function getSquadCommitments(squadId, weekStart = weekStartISO()) {
  if (!supabase) return [];
  const { data, error } = await supabase.from("commitments")
    .select("user_id,target,week_start").eq("squad_id", squadId).eq("week_start", weekStart);
  if (error) throw error;
  return data || [];
}

// every week's commitment for the squad — used to compute streaks client-side
export async function getSquadCommitmentsAll(squadId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from("commitments")
    .select("user_id,target,week_start").eq("squad_id", squadId);
  if (error) throw error;
  return data || [];
}

// the Monday before the given week-start string (YYYY-MM-DD)
export function prevWeekISO(ws) {
  const d = new Date(ws + "T00:00:00");
  d.setDate(d.getDate() - 7);
  return weekStartISO(d);
}
