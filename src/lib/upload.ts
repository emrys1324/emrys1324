"use client";
import { getSupabase } from "./supabase/client";

const BUCKET = "menu-photos";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Shrinks big phone photos before upload (keeps aspect ratio, JPEG ~85%).
 * Returns the original file when it's already small, animated (GIF), or the
 * browser can't decode it.
 */
export async function resizeImage(file: File, maxDim: number): Promise<Blob> {
  if (file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_000_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // transparent PNGs get a white background in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/**
 * Upload an image to the public "menu-photos" bucket and return its public URL.
 * Large photos are resized first, so phone camera pictures work.
 */
export async function uploadPublicImage(file: File, folder: string, opts: { maxDim?: number; resize?: boolean } = {}): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (JPG, PNG or WebP).");
  const body: Blob = opts.resize === false ? file : await resizeImage(file, opts.maxDim ?? 1400);
  if (body.size > MAX_BYTES) throw new Error("This photo is too large even after shrinking (max 5 MB). Please choose a smaller one.");
  const isJpeg = body.type === "image/jpeg";
  const ext = isJpeg ? "jpg" : (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: body.type || file.type, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Storage path for a URL in our bucket, or null (e.g. bundled /menu/*.svg illustrations). */
export function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
}

/** Deletes an uploaded image (best effort — a leftover file is harmless). */
export async function deletePublicImage(url: string | null | undefined): Promise<void> {
  const path = storagePathFromUrl(url);
  if (!path) return;
  try {
    await getSupabase().storage.from(BUCKET).remove([path]);
  } catch {}
}

export const ICON_SIZES = ["32", "180", "192", "512"] as const;
export type IconSet = Partial<Record<(typeof ICON_SIZES)[number], string>>;

/**
 * Website icon: one square-ish image → 32 (browser tab), 180 (iPhone home screen),
 * 192 and 512 (Android / installed app) PNGs, centre-cropped to a square. Returns their public URLs.
 */
export async function uploadSiteIcons(file: File): Promise<IconSet> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (PNG, JPG or WebP).");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error("That file doesn't look like an image. Please use PNG, JPG or WebP.");
  if (Math.min(bmp.width, bmp.height) < 192) throw new Error("Icon is too small — please use a square image of at least 512 × 512 pixels.");
  const side = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - side) / 2;
  const sy = (bmp.height - side) / 2;
  const supabase = getSupabase();
  const id = crypto.randomUUID();
  const out: IconSet = {};
  for (const size of ICON_SIZES) {
    const n = Number(size);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, sx, sy, side, side, 0, 0, n, n);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("Couldn't prepare the icon. Please try a different image.");
    const path = `branding/icon-${id}-${size}.png`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/png", upsert: false });
    if (error) throw new Error(error.message);
    out[size] = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  return out;
}
