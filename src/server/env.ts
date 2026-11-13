export function baseUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function isSecureDeployment(): boolean {
  return baseUrl().startsWith("https://");
}

export function authSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("BETTER_AUTH_SECRET must be set (at least 32 characters)");
  return s;
}
