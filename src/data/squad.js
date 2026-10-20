/* Squad data layer. All reads are RLS-gated: a user only ever sees squads they
   belong to and the members/profiles of those squads. Create/join go through
   SECURITY DEFINER RPCs. */
import { supabase } from "./supabaseClient.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genCode = () =>
  Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

export async function getMySquad(userId) {
  const { data: mem, error } = await supabase.from("squad_members")
    .select("squad_id,role,joined_at").eq("user_id", userId).limit(1);
  if (error) throw error;
  if (!mem || !mem[0]) return null;
  const { data: sq } = await supabase.from("squads").select("*").eq("id", mem[0].squad_id).maybeSingle();
  return sq ? { ...sq, myRole: mem[0].role, myJoinedAt: mem[0].joined_at || null } : null;
}

export async function getMembers(squadId) {
  // music_* columns exist only after migrate_8; fall back if they're missing.
  const withMusic = "user_id,role,joined_at,profiles(username,name,avatar_url,music_url,music_label)";
  const base = "user_id,role,joined_at,profiles(username,name,avatar_url)";
  let { data, error } = await supabase.from("squad_members")
    .select(withMusic).eq("squad_id", squadId).order("joined_at", { ascending: true });
  if (error) {
    ({ data, error } = await supabase.from("squad_members")
      .select(base).eq("squad_id", squadId).order("joined_at", { ascending: true }));
    if (error) throw error;
  }
  return data || [];
}

export async function createSquad(name) {
  const { data, error } = await supabase.rpc("create_squad", { squad_name: name, code: genCode() });
  if (error) throw error;
  return data; // squad id
}

export async function joinSquad(code) {
  const { data, error } = await supabase.rpc("join_squad", { code: (code || "").trim() });
  if (error) throw error;
  return data; // squad id
}

export async function leaveSquad(squadId, userId) {
  const { error } = await supabase.from("squad_members").delete().match({ squad_id: squadId, user_id: userId });
  if (error) throw error;
}
