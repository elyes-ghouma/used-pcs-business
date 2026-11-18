// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { validatePassword } from "@/lib/password";
import { isUuid } from "@/lib/guards";
import { clientIdFor, clientIp } from "@/lib/client-id";
import { isSameOrigin, readJsonLimited } from "@/lib/ratelimit";

vi.mock("server-only", () => ({}));

describe("image re-encoding neutralises hostile uploads", async () => {
  const { reencodeToWebp } = await import("@/lib/image-process");
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ff8800" } }).png().toBuffer();

  it("produces a WebP and drops a payload appended after the image data (polyglot)", async () => {
    const hostile = Buffer.concat([png, Buffer.from("<script>alert(document.cookie)</script><?php system($_GET['c']); ?>")]);
    const out = await reencodeToWebp(hostile);
    expect(out.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(out.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(out.includes(Buffer.from("<script"))).toBe(false);
    expect(out.includes(Buffer.from("<?php"))).toBe(false);
  });

  it("strips metadata such as EXIF and location data", async () => {
    const withExif = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#00aa55" } })
      .jpeg()
      .withExif({ IFD0: { Copyright: "secret-owner-name", ImageDescription: "GPS 36.80,10.18" } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined(); // the input really had metadata
    const out = await reencodeToWebp(withExif);
    expect((await sharp(out).metadata()).exif).toBeUndefined();
    expect(out.includes(Buffer.from("secret-owner-name"))).toBe(false);
  });

  it("rejects files that are not decodable images, even with a valid-looking header", async () => {
    await expect(reencodeToWebp(Buffer.concat([png.subarray(0, 24), Buffer.from("garbage not an image at all")]))).rejects.toThrow();
    await expect(reencodeToWebp(Buffer.from("<svg onload=alert(1)></svg>"))).rejects.toThrow();
  });

  it("rejects decompression bombs (too many pixels) and caps the output size", async () => {
    await expect(reencodeToWebp(png, 100)).rejects.toThrow(); // 1200 px > limit of 100
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#123456" } }).png().toBuffer();
    const meta = await sharp(await reencodeToWebp(big)).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(2400);
  });
});

describe("password policy", () => {
  it.each([
    ["short1!", "at least 12"],
    ["password1234", "too common"],
    ["aaaaaaaaaaaaaa", "too few different"],
    ["1234567890123456", "simple sequence"],
    ["Short-Pass1", "at least 12"],
  ])("rejects %s", (pw, msg) => expect(validatePassword(pw)).toContain(msg));

  it("rejects a password containing the email name", () => {
    expect(validatePassword("johnsmith-2026-xx", "johnsmith@example.com")).toMatch(/email name/);
  });

  it("accepts long, unguessable passwords, including passphrases", () => {
    expect(validatePassword("correct horse battery staple")).toBeNull();
    expect(validatePassword("Tx9#vQ2!mLp8@rZ4")).toBeNull();
  });
});

describe("request hygiene helpers", () => {
  it("validates UUID shape before ids reach the database", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    for (const bad of ["", "abc", "123e4567-e89b-12d3-a456-42661417400", "'; drop table products;--", null, undefined, 42, {}, ["x"]]) {
      expect(isUuid(bad)).toBe(false);
    }
  });

  it("derives a pseudonymous, salted client id (never the raw IP)", () => {
    const a = clientIdFor("203.0.113.7", "salt-one");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("203");
    expect(clientIdFor("203.0.113.7", "salt-one")).toBe(a);
    expect(clientIdFor("203.0.113.7", "salt-two")).not.toBe(a);
    expect(clientIdFor("203.0.113.8", "salt-one")).not.toBe(a);
  });

  it("prefers the platform-set IP headers over the spoofable X-Forwarded-For chain", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6, 1.1.1.1", "x-real-ip": "9.9.9.9" });
    expect(clientIp(h)).toBe("9.9.9.9");
    expect(clientIp(new Headers({ "x-vercel-forwarded-for": "8.8.8.8", "x-real-ip": "9.9.9.9" }))).toBe("8.8.8.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });

  it("refuses cross-site posts and accepts same-origin ones", () => {
    const req = (origin?: string) => new Request("http://shop.example/api/chat", { method: "POST", headers: { host: "shop.example", ...(origin ? { origin } : {}) } });
    expect(isSameOrigin(req("http://shop.example"))).toBe(true);
    expect(isSameOrigin(req("https://evil.example"))).toBe(false);
    expect(isSameOrigin(req("not a url"))).toBe(false);
    expect(isSameOrigin(req())).toBe(true);
  });

  it("caps request bodies before parsing", async () => {
    const post = (body: string) => new Request("http://x/y", { method: "POST", body });
    expect(await readJsonLimited(post('{"a":1}'))).toEqual({ a: 1 });
    expect(await readJsonLimited(post("x".repeat(9000)))).toBeNull();
    expect(await readJsonLimited(post("{broken"))).toBeNull();
    expect(await readJsonLimited(post(""))).toBeNull();
  });
});
