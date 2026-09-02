import { env } from "../config/env.js";

export function resolveMediaUrl(key: string): string;
export function resolveMediaUrl(key: string | null | undefined): string | null;
export function resolveMediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;

  const base = env.MEDIA_CDN_URL.replace(/\/+$/, "");
  const normalizedKey = key.replace(/^\/+/, "");

  return `${base}/${normalizedKey}`;
}
