// Fingerprint / Face ID sign-in (WebAuthn passkeys). No password, no crypto wallet.
import "server-only";
import { randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { db } from "./db.ts";
import { currentUser, HttpError, startSession, storePasskeyChallenge, takePasskeyChallenge } from "./session.ts";

function relyingParty(request: Request) {
  const url = new URL(request.url);
  // Behind Vercel the request URL carries the public host; honour a forwarded host if present.
  const host = request.headers.get("x-forwarded-host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return { rpID: host.split(":")[0]!, origin: `${proto}://${host}` };
}

const toBytes = (value: string) => new Uint8Array(Buffer.from(value, "base64url"));

/** Options for creating a new passkey: a new account, or an extra device for the signed-in user. */
export async function registrationOptions(request: Request, displayName: string) {
  const { rpID } = relyingParty(request);
  const signedIn = await currentUser();
  const userHandle = randomBytes(16);
  const name = displayName.trim().slice(0, 60) || "Emporos shop";
  const options = await generateRegistrationOptions({
    rpName: "Emporos",
    rpID,
    userName: name,
    userDisplayName: name,
    userID: new Uint8Array(userHandle),
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await storePasskeyChallenge({ challenge: options.challenge, kind: "register", userHandle: userHandle.toString("base64url") });
  return { options, signedIn: Boolean(signedIn) };
}

export async function finishRegistration(request: Request, response: unknown) {
  const pending = await takePasskeyChallenge("register");
  if (!pending) throw new HttpError(400, "That took too long. Try again.");
  const { rpID, origin } = relyingParty(request);
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: response as Parameters<typeof verifyRegistrationResponse>[0]["response"],
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch (error) {
    throw new HttpError(400, `Couldn't set up fingerprint sign-in: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  if (!verification.verified) throw new HttpError(400, "Couldn't set up fingerprint sign-in.");

  const { credential } = verification.registrationInfo;
  const sql = await db();
  const existing = await currentUser();
  let userId = existing?.id;
  if (!userId) {
    const [row] = await sql`insert into users default values returning id`;
    userId = row!.id as string;
  }
  await sql`
    insert into passkeys (id, user_id, public_key, counter, transports)
    values (${credential.id}, ${userId}, ${Buffer.from(credential.publicKey).toString("base64url")}, ${credential.counter}, ${credential.transports ?? []})
    on conflict (id) do nothing`;
  await startSession(userId);
  return { user: await currentUser() };
}

export async function authenticationOptions(request: Request) {
  const { rpID } = relyingParty(request);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await storePasskeyChallenge({ challenge: options.challenge, kind: "login" });
  return { options };
}

export async function finishAuthentication(request: Request, response: unknown) {
  const pending = await takePasskeyChallenge("login");
  if (!pending) throw new HttpError(400, "That took too long. Try again.");
  const credentialId = (response as { id?: unknown })?.id;
  if (typeof credentialId !== "string" || credentialId.length > 1024) throw new HttpError(400, "Invalid sign-in.");

  const sql = await db();
  const [key] = await sql`select id, user_id, public_key, counter, transports from passkeys where id = ${credentialId}`;
  if (!key) throw new HttpError(401, "We don't recognise this fingerprint. Create an account first, or use another way to sign in.");

  const { rpID, origin } = relyingParty(request);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: response as Parameters<typeof verifyAuthenticationResponse>[0]["response"],
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: key.id as string,
        publicKey: toBytes(key.public_key as string),
        counter: Number(key.counter),
        transports: (key.transports as string[] | null) ?? [],
      },
    });
  } catch (error) {
    throw new HttpError(401, `Sign-in failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  if (!verification.verified) throw new HttpError(401, "Sign-in failed.");

  await sql`update passkeys set counter = ${verification.authenticationInfo.newCounter}, last_used_at = now() where id = ${credentialId}`;
  await startSession(key.user_id as string);
  return { user: await currentUser() };
}
