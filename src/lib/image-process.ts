import "server-only";
import sharp from "sharp";

export const MAX_INPUT_PIXELS = 40_000_000; // refuses decompression bombs (e.g. a tiny PNG that expands to gigabytes)
export const MAX_OUTPUT_EDGE = 2400;

/**
 * Decodes the upload and writes a brand-new WebP. Whatever the file really was (a polyglot, a PNG with trailing
 * script bytes, an image with GPS metadata), the output is only pixels: metadata is dropped, orientation is applied,
 * and the result can never execute as anything but an image. Throws if the bytes are not a decodable image.
 */
export async function reencodeToWebp(input: Buffer, maxPixels = MAX_INPUT_PIXELS): Promise<Buffer> {
  return sharp(input, { limitInputPixels: maxPixels, failOn: "error" })
    .rotate()
    .resize({ width: MAX_OUTPUT_EDGE, height: MAX_OUTPUT_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
}
