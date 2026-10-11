/* Avatar uploads — resize/center-crop client-side to a small square JPEG, push
   to the public "avatars" bucket, and save the URL on the profile. Keeps
   storage tiny and loads fast. Needs migrate_9.sql (bucket + policies). */
import { supabase } from "./supabaseClient.js";

// center-crop to square and scale to `size`px, return a JPEG Blob
export function squareJpeg(file, size = 400, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      canvas.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("encode-failed")), "image/jpeg", quality);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("bad-image"));
    img.src = URL.createObjectURL(file);
  });
}

export async function uploadAvatar(userId, file) {
  if (!supabase) throw new Error("offline");
  const blob = await squareJpeg(file);
  const path = `${userId}/avatar.jpg`;
  const { error: upErr } = await supabase.storage.from("avatars")
    .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "3600" });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const url = data.publicUrl + "?v=" + Date.now();          // bust CDN/browser cache on replace
  const { error: pErr } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
  if (pErr) throw pErr;
  return url;
}
