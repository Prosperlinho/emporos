// Auth endpoints:
//   GET  me            → { configured, emailLogin, user }
//   POST nonce         → { nonce }  (Sign-In with Ethereum)
//   POST wallet        { message, signature }
//   POST email-start   { email }    sends a 6-digit code (needs RESEND_API_KEY)
//   POST email-verify  { email, code }
//   POST logout
import { randomInt } from "node:crypto";
import { createPublicClient, getAddress, http } from "viem";
import { celo } from "viem/chains";
import { parseSiweMessage } from "viem/siwe";
import { db, dbConfigured } from "@/lib/server/db.ts";
import { handle, readJson } from "@/lib/server/http.ts";
import * as passkeys from "@/lib/server/passkeys.ts";
import { currentUser, endSession, expectedNonce, hashSecret, HttpError, issueNonce, startSession } from "@/lib/server/session.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ action: string }> };
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const emailLogin = () => Boolean(process.env.RESEND_API_KEY);

function requireDb() {
  if (!dbConfigured) throw new HttpError(503, "Accounts aren't enabled yet.");
}

async function userByWallet(wallet: string): Promise<string> {
  const sql = await db();
  const [row] = await sql`
    insert into users (wallet) values (${wallet})
    on conflict (wallet) do update set wallet = excluded.wallet
    returning id`;
  return row!.id as string;
}

async function userByEmail(email: string): Promise<string> {
  const sql = await db();
  const [row] = await sql`
    insert into users (email) values (${email})
    on conflict (email) do update set email = excluded.email
    returning id`;
  return row!.id as string;
}

async function walletLogin(request: Request) {
  requireDb();
  const { message, signature } = (await readJson(request)) as { message?: unknown; signature?: unknown };
  if (typeof message !== "string" || typeof signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    throw new HttpError(400, "Missing signature.");
  }
  const nonce = await expectedNonce();
  if (!nonce) throw new HttpError(400, "Sign-in expired. Try again.");
  const host = new URL(request.url).host;
  const parsed = parseSiweMessage(message);
  if (!parsed.address) throw new HttpError(400, "Invalid sign-in message.");

  const client = createPublicClient({ chain: celo, transport: http(process.env.NEXT_PUBLIC_CELO_RPC_URL || undefined) });
  const valid = await client.verifySiweMessage({
    message,
    signature: signature as `0x${string}`,
    domain: host,
    nonce,
  });
  if (!valid) throw new HttpError(401, "Signature check failed.");

  await startSession(await userByWallet(getAddress(parsed.address)));
  return { user: await currentUser() };
}

async function emailStart(request: Request) {
  requireDb();
  if (!emailLogin()) throw new HttpError(503, "Email sign-in isn't enabled. Use your wallet.");
  const { email: raw } = (await readJson(request)) as { email?: unknown };
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email.");

  const sql = await db();
  const [recent] = await sql`select sent_at from email_codes where email = ${email} and sent_at > now() - interval '60 seconds'`;
  if (recent) throw new HttpError(429, "A code was just sent. Wait a minute before asking again.");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await sql`
    insert into email_codes (email, code_hash, attempts, expires_at, sent_at)
    values (${email}, ${hashSecret(`${email}:${code}`)}, 0, now() + interval '10 minutes', now())
    on conflict (email) do update set code_hash = excluded.code_hash, attempts = 0,
      expires_at = excluded.expires_at, sent_at = excluded.sent_at`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Emporos <onboarding@resend.dev>",
      to: [email],
      subject: `Your Emporos code: ${code}`,
      text: `Your Emporos sign-in code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.error("Resend error", response.status, await response.text().catch(() => ""));
    throw new HttpError(502, "Couldn't send the email. Try again or use your wallet.");
  }
  return { sent: true };
}

async function emailVerify(request: Request) {
  requireDb();
  const { email: raw, code: rawCode } = (await readJson(request)) as { email?: unknown; code?: unknown };
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) throw new HttpError(400, "Enter the 6-digit code.");

  const sql = await db();
  const [row] = await sql`
    update email_codes set attempts = attempts + 1
    where email = ${email} and expires_at > now() and attempts < 5
    returning code_hash`;
  if (!row || row.code_hash !== hashSecret(`${email}:${code}`)) throw new HttpError(401, "That code is wrong or expired.");
  await sql`delete from email_codes where email = ${email}`;

  await startSession(await userByEmail(email));
  return { user: await currentUser() };
}

async function route(action: string, method: string, request: Request) {
  switch (`${method} ${action}`) {
    case "GET me":
      return { configured: dbConfigured, emailLogin: dbConfigured && emailLogin(), user: await currentUser() };
    case "POST nonce":
      requireDb();
      return { nonce: await issueNonce() };
    case "POST wallet":
      return walletLogin(request);
    case "POST email-start":
      return emailStart(request);
    case "POST email-verify":
      return emailVerify(request);
    case "POST passkey-register-options": {
      requireDb();
      const { name } = (await readJson(request)) as { name?: unknown };
      return passkeys.registrationOptions(request, typeof name === "string" ? name : "");
    }
    case "POST passkey-register": {
      requireDb();
      const { response } = (await readJson(request)) as { response?: unknown };
      return passkeys.finishRegistration(request, response);
    }
    case "POST passkey-login-options":
      requireDb();
      return passkeys.authenticationOptions(request);
    case "POST passkey-login": {
      requireDb();
      const { response } = (await readJson(request)) as { response?: unknown };
      return passkeys.finishAuthentication(request, response);
    }
    case "POST logout":
      await endSession();
      return { ok: true };
    default:
      throw new HttpError(404, "Not found.");
  }
}

export const GET = async (request: Request, ctx: Ctx) => handle(async () => route((await ctx.params).action, "GET", request));
export const POST = async (request: Request, ctx: Ctx) => handle(async () => route((await ctx.params).action, "POST", request));
