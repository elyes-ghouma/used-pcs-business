// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ logo_path: null as string | null }));
vi.mock("@/lib/data", () => ({ getSettings: async () => settings }));

import { GET } from "@/app/icon/route";

describe("tab icon route", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    settings.logo_path = null;
  });

  it("serves the default mark when no logo is uploaded, without fetching anything", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET();
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(await res.text()).toContain("<svg");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves the uploaded logo from the project's own storage URL", async () => {
    settings.logo_path = "branding/abc.webp";
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/webp" } }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET();
    expect(fetchMock).toHaveBeenCalledWith("https://proj.supabase.co/storage/v1/object/public/site-media/branding/abc.webp");
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it("falls back to the default mark when the logo cannot be fetched or is not an image", async () => {
    settings.logo_path = "branding/abc.webp";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    expect((await GET()).headers.get("content-type")).toBe("image/svg+xml");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html></html>", { headers: { "content-type": "text/html" } })));
    expect((await GET()).headers.get("content-type")).toBe("image/svg+xml");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect((await GET()).headers.get("content-type")).toBe("image/svg+xml");
  });
});
