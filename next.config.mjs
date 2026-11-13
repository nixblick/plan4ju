// The Content Security Policy is set per request in src/proxy.ts (it depends on runtime env).
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const dev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

/** @type {import('next').NextConfig} */
const config = {
  output: "standalone",
  outputFileTracingRoot: import.meta.dirname,
  turbopack: { root: import.meta.dirname },
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  // Feedback may carry a screenshot of up to 5 MB (multipart, plus form fields).
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  serverExternalPackages: ["@node-rs/argon2", "nodemailer"],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default config;
