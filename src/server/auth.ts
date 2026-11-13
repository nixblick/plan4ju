import { AsyncLocalStorage } from "node:async_hooks";
import { hash, verify } from "@node-rs/argon2";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { CLIENT_IP_HEADER, withClientIp } from "./client-ip";
import { prisma } from "./db";
import { rotateSecurityStamp } from "./device-cookie";
import { authSecret, baseUrl } from "./env";
import { sendMailInBackground } from "./mail";

/**
 * Registration only works inside an invitation flow: onboarding.ts runs sign-up within
 * this context with the invited e-mail address. Any other sign-up request, including a
 * direct call to the public /api/auth/sign-up/email route, is rejected by the hook.
 */
export const invitationSignUp = new AsyncLocalStorage<{ email: string }>();

// Argon2id with the OWASP minimum profile (19 MiB, 2 iterations, 1 lane).
// @node-rs/argon2 defaults to the Argon2id variant.
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 10;

export const auth = betterAuth({
  appName: "Plan4JU",
  baseURL: baseUrl(),
  secret: authSecret(),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    maxPasswordLength: 128,
    requireEmailVerification: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    // A reset ends every open session (stolen session cookies stop working).
    revokeSessionsOnPasswordReset: true,
    password: {
      hash: (plain) => hash(plain, ARGON),
      verify: ({ hash: stored, password: plain }) => verify(stored, plain),
    },
    sendResetPassword: async ({ user, url }) => {
      sendMailInBackground({
        to: user.email,
        subject: "Plan4JU: Zugang zurücksetzen",
        text: `Hallo ${user.name},\n\nüber diesen Link kannst du ein neues Kennwort setzen (eine Stunde gültig):\n${url}\n\nWenn du das nicht angefordert hast, ignoriere diese Nachricht.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: false,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      sendMailInBackground({
        to: user.email,
        subject: "Plan4JU: E-Mail-Adresse bestätigen",
        text: `Hallo ${user.name},\n\nbitte bestätige deine E-Mail-Adresse:\n${url}`,
      });
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  // HTTP rate limits (the /api/auth route). Server actions have their own limiter.
  rateLimit: {
    enabled: true,
    storage: "memory",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 3 },
    },
  },
  // The client address is resolved once from the proxy headers (client-ip.ts, TRUSTED_PROXY_HOPS)
  // and handed over in our own header, which handleAuthRequest overwrites on every request.
  advanced: { ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] } },
  // "Sign out everywhere" also forgets every known device (issue 8). Password change and reset
  // rotate the stamp in the database (trigger on account.password, migration user_security_stamp).
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/revoke-sessions") return;
      const userId = ctx.context.session?.user.id;
      if (userId) await rotateSecurityStamp(userId);
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const ctx = invitationSignUp.getStore();
          if (!ctx || ctx.email !== user.email.toLowerCase()) {
            throw new APIError("FORBIDDEN", { message: "Registration is by invitation only" });
          }
          // The invitation link was delivered to this address.
          return { data: { ...user, emailVerified: true } };
        },
      },
    },
  },
  plugins: [nextCookies()],
});

/** Entry point for the /api/auth route: sets the trusted client address before Better Auth sees the request. */
export function handleAuthRequest(req: Request): Promise<Response> {
  return auth.handler(new Request(req, { headers: withClientIp(req.headers) }));
}
