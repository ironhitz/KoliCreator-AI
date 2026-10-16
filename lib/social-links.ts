export const socialPlatforms = [
  { key: "instagram", label: "Instagram", domains: ["instagram.com"] },
  { key: "youtube", label: "YouTube", domains: ["youtube.com", "youtu.be"] },
  { key: "tiktok", label: "TikTok", domains: ["tiktok.com"] },
  { key: "x", label: "X", domains: ["x.com", "twitter.com"] },
  { key: "facebook", label: "Facebook", domains: ["facebook.com"] },
  { key: "linkedin", label: "LinkedIn", domains: ["linkedin.com"] },
  { key: "website", label: "Website", domains: [] },
] as const;

export type SocialPlatform = (typeof socialPlatforms)[number]["key"];
export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export function normalizeSocialUrl(platform: SocialPlatform, value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const config = socialPlatforms.find((candidate) => candidate.key === platform);
    if (!config) return null;
    if (config.domains.length && !config.domains.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function sanitizeSocialLinks(value: unknown): SocialLinks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const links: SocialLinks = {};
  for (const platform of socialPlatforms) {
    const candidate = source[platform.key];
    if (typeof candidate !== "string") continue;
    const normalized = normalizeSocialUrl(platform.key, candidate);
    if (normalized) links[platform.key] = normalized;
  }
  return links;
}
