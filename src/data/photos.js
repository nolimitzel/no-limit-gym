/* Progress / flex photo gallery — 4-week lifespan. Needs migrate_12.sql.
   Files go to the PRIVATE "photos" bucket under <uid>/ and are shown through
   short-lived signed URLs. Rows in progress_photos carry visibility (private |
   squad) and a server-set expires_at; RLS decides who can see what. */
import { supabase } from "./supabaseClient.js";

export const PHOTO_DAYS = 28;
const BUCKET = "photos";

// scale so the long side is ≤ max px, re-encode as JPEG (also strips EXIF/location)
export function fitJpeg(file, max = 1440, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode-failed"))), "image/jpeg", quality);
    };
    img.onerror = () => reject(new Error("bad-image"));
    img.src = URL.createObjectURL(file);
  });
}

export function daysLeft(row) {
  return Math.max(0, Math.ceil((Date.parse(row.expires_at) - Date.now()) / 86400000));
}

async function withUrls(rows) {
  if (!rows.length) return rows;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), 3600);
  if (error) throw error;
  const byPath = Object.fromEntries((data || []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, url: byPath[r.path] || null })).filter((r) => r.url);
}

export async function uploadPhoto(userId, file, { kind = "progress", visibility = "private", caption = "" } = {}) {
  if (!supabase) throw new Error("offline");
  const blob = await fitJpeg(file);
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "3600" });
  if (upErr) throw upErr;
  const { data, error } = await supabase.from("progress_photos")
    .insert({ user_id: userId, path, kind, visibility, caption: caption.trim().slice(0, 140) || null })
    .select("*").single();
  if (error) {                                   // never leave an orphaned file behind
    await supabase.storage.from(BUCKET).remove([path]);
    throw error;
  }
  return data;
}

export async function listMyPhotos(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from("progress_photos").select("*")
    .eq("user_id", userId).gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw error;
  return withUrls(data || []);
}

// photos squad-mates chose to share (RLS returns only people who share a squad with you)
export async function listSquadPhotos(userId) {
  if (!supabase) return [];
  const { data, error } = await supabase.from("progress_photos").select("*")
    .eq("visibility", "squad").neq("user_id", userId).gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(60);
  if (error) throw error;
  const rows = await withUrls(data || []);
  const ids = [...new Set(rows.map((r) => r.user_id))];
  if (ids.length) {
    const { data: ps } = await supabase.from("profiles").select("id,name,username,avatar_url").in("id", ids);
    const byId = Object.fromEntries((ps || []).map((p) => [p.id, p]));
    rows.forEach((r) => { r.who = byId[r.user_id] || null; });
  }
  return rows;
}

export async function setPhotoVisibility(id, visibility) {
  const { error } = await supabase.from("progress_photos").update({ visibility }).eq("id", id);
  if (error) throw error;
}

export async function deletePhoto(row) {
  const { error } = await supabase.storage.from(BUCKET).remove([row.path]);
  if (error) throw error;
  const { error: e2 } = await supabase.from("progress_photos").delete().eq("id", row.id);
  if (e2) throw e2;
}

/* Owner-side purge, run quietly at launch: delete the files + rows of this user's
   expired photos, plus any stray file in their folder older than the lifespan. */
export async function purgeExpiredPhotos(userId) {
  if (!supabase || !userId) return 0;
  let removed = 0;
  try {
    const { data: rows } = await supabase.from("progress_photos").select("id,path")
      .eq("user_id", userId).lte("expires_at", new Date().toISOString());
    const cutoff = Date.now() - PHOTO_DAYS * 86400000;
    const { data: files } = await supabase.storage.from(BUCKET).list(userId, { limit: 1000 });
    const stray = (files || []).filter((f) => f.created_at && Date.parse(f.created_at) < cutoff).map((f) => `${userId}/${f.name}`);
    const paths = [...new Set([...(rows || []).map((r) => r.path), ...stray])];
    if (paths.length) { await supabase.storage.from(BUCKET).remove(paths); removed = paths.length; }
    if (rows && rows.length) await supabase.from("progress_photos").delete().in("id", rows.map((r) => r.id));
  } catch (e) {
    console.warn("[NO LIMIT] photo cleanup skipped:", e?.message || e);
  }
  return removed;
}
