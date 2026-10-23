import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Profile pictures live in the PRIVATE Supabase Storage bucket "avatars",
// inside a folder named after the user's id (see supabase/04_profiles_and_avatars.sql).
export const AVATAR_BUCKET = "avatars";
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB: the bucket enforces this too
const MAX_PICKED_BYTES = 10 * 1024 * 1024; // we accept big photos, then shrink them
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const OUTPUT_SIZE = 512; // pixels (square)

export interface PreparedAvatar {
  blob: Blob;
  previewUrl: string; // shows exactly what will be saved
}

// Checks the file type/size, then crops it to a centred square and shrinks it to 512px.
export async function prepareAvatar(file: File): Promise<PreparedAvatar> {
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Please choose a JPG, PNG or WebP picture.");
  if (file.size > MAX_PICKED_BYTES) throw new Error("That picture is too big. Please choose one under 10 MB.");

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That file could not be read as a picture.");
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(OUTPUT_SIZE, side);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not process the picture.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Your browser could not process the picture.");
  if (blob.size > MAX_AVATAR_BYTES) throw new Error("That picture is still too big after shrinking. Try another one.");
  return { blob, previewUrl: URL.createObjectURL(blob) };
}

// Uploads under a NEW unique name so the old picture can be removed afterwards.
export async function uploadAvatar(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeAvatarFile(path: string): Promise<void> {
  await supabase.storage.from(AVATAR_BUCKET).remove([path]);
}

// ---- Showing a private picture: ask Supabase for a short-lived link, and remember it ----
const cache = new Map<string, { url: string; expires: number }>();
const LINK_SECONDS = 60 * 60;

export async function getAvatarUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && hit.expires - Date.now() > 5 * 60 * 1000) return hit.url;
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, LINK_SECONDS);
  if (error || !data) throw new Error(error?.message ?? "Could not load picture");
  cache.set(path, { url: data.signedUrl, expires: Date.now() + LINK_SECONDS * 1000 });
  return data.signedUrl;
}

export function useAvatarUrl(path?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!path) {
      setUrl(null);
      return;
    }
    getAvatarUrl(path)
      .then((u) => active && setUrl(u))
      .catch(() => active && setUrl(null));
    return () => {
      active = false;
    };
  }, [path]);
  return url;
}
