"use client";
import { getSupabase } from "./supabase/client";

/** Upload an image to the public "menu-photos" bucket and return its public URL. */
export async function uploadPublicImage(file: File, folder: string): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image is too large (max 5 MB).");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const supabase = getSupabase();
  const { error } = await supabase.storage.from("menu-photos").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from("menu-photos").getPublicUrl(path).data.publicUrl;
}
