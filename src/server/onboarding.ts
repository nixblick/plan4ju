import { z } from "zod";
import { APIError } from "better-auth/api";
import { auth, invitationSignUp, MIN_PASSWORD_LENGTH } from "./auth";
import { ConflictError, InvalidInvitationError } from "./errors";
import { acceptInvitation, lookupInvitation } from "./services/invitations";

const registerInput = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(100),
  phrase: z.string().min(MIN_PASSWORD_LENGTH).max(128),
});

/**
 * Creates the account for the invited address (the only way to register), signs it in
 * and joins the family. The e-mail address always comes from the invitation, never from
 * the form. `phrase` is the chosen login credential.
 */
export async function registerWithInvitation(raw: z.input<typeof registerInput>, headers: Headers): Promise<{ familyId: string; userId: string }> {
  const { token, name, phrase } = registerInput.parse(raw);
  const info = await lookupInvitation(token);
  if (info.status !== "valid" || !info.email) throw new InvalidInvitationError();
  if (info.accountExists) throw new ConflictError("Account exists, sign in instead");
  const email = info.email;

  let userId: string;
  try {
    const res = await invitationSignUp.run({ email: email.toLowerCase() }, () =>
      auth.api.signUpEmail({ body: { email, password: phrase, name }, headers }),
    );
    userId = res.user.id;
  } catch (e) {
    if (e instanceof APIError && e.status === "UNPROCESSABLE_ENTITY") throw new ConflictError("Account exists, sign in instead");
    throw e;
  }
  const familyId = await acceptInvitation(userId, token);
  // Session cookie (sign-up with required verification does not open a session itself).
  await auth.api.signInEmail({ body: { email, password: phrase }, headers });
  return { familyId, userId };
}
