import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { env } from "../config/env.js";
import { resolveMediaUrl } from "./resolveMediaUrl.js";

describe("resolveMediaUrl", () => {
  const originalCdnUrl = env.MEDIA_CDN_URL;

  beforeEach(() => {
    env.MEDIA_CDN_URL = "https://media.bluefootgg.com";
  });

  afterEach(() => {
    env.MEDIA_CDN_URL = originalCdnUrl;
  });

  it("should resolve a key without leading slash", () => {
    const result = resolveMediaUrl("enterprise/abc/products/123/image.webp");
    expect(result).toBe("https://media.bluefootgg.com/enterprise/abc/products/123/image.webp");
  });

  it("should resolve a key with leading slash", () => {
    const result = resolveMediaUrl("/enterprise/abc/products/123/image.webp");
    expect(result).toBe("https://media.bluefootgg.com/enterprise/abc/products/123/image.webp");
  });

  it("should handle MEDIA_CDN_URL with trailing slash", () => {
    env.MEDIA_CDN_URL = "https://media.bluefootgg.com/";
    const result = resolveMediaUrl("enterprise/abc/image.webp");
    expect(result).toBe("https://media.bluefootgg.com/enterprise/abc/image.webp");
  });

  it("should handle both trailing slash in URL and leading slash in key", () => {
    env.MEDIA_CDN_URL = "https://media.bluefootgg.com/";
    const result = resolveMediaUrl("/enterprise/abc/image.webp");
    expect(result).toBe("https://media.bluefootgg.com/enterprise/abc/image.webp");
  });

  it("should preserve multi-tenant key structure", () => {
    const key = "enterprise/ent-123/users/user-456/avatar/1725286650000-photo.png";
    const result = resolveMediaUrl(key);
    expect(result).toBe(`https://media.bluefootgg.com/${key}`);
  });

  it("should return null for null key", () => {
    const result = resolveMediaUrl(null);
    expect(result).toBeNull();
  });

  it("should return null for undefined key", () => {
    const result = resolveMediaUrl(undefined);
    expect(result).toBeNull();
  });

  it("should return null for empty string key", () => {
    const result = resolveMediaUrl("");
    expect(result).toBeNull();
  });
});
