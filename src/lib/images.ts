export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGES_PER_PRODUCT = 12;
export const MEDIA_BUCKET = "site-media";

export type ImageKind = "jpg" | "png" | "webp";

/** Detects the real format from the file's first bytes, ignoring the (spoofable) name and MIME type. */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "webp";
  return null;
}

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return "Only JPG, PNG or WebP images are allowed.";
  if (file.size > MAX_IMAGE_BYTES) return "Each image must be 5 MB or smaller.";
  if (file.size === 0) return "This file is empty.";
  return null;
}

export function extensionFor(kind: ImageKind): string {
  return kind;
}

/** Storage paths this app creates; anything else is rejected before touching the database. */
export function isValidMediaPath(path: string, prefix: string): boolean {
  return new RegExp(`^${prefix}/[0-9a-f-]{36}\.(jpg|png|webp)$`).test(path);
}
