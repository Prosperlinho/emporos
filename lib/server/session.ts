// Signed-cookie sessions. No session table: the cookie carries the user id and expiry,
// HMAC-signed with SESSION_SECRET (or, if unset, a key derived from the database URL).
import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db, dbConfigured } from "./db.ts";

const SESSION_COOKIE = "emporos_session";
const NONCE_COOKIE = "emporos_nonce";
const SESSION_DAYS = 30;

function secret(): Buffer {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 32) return Buffer.from(explicit);
  const base = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!base) throw new Error("No database connected.");
  return createHash("sha256").update(`emporos-session:${base}`).digest();
}

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function unsign<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret()).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as T & { exp: number };
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

const cookieOptions = (maxAgeSeconds: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: maxAgeSeconds,
});

export function hashSecret(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export async function startSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sign({ uid: userId, exp: Date.now() + SESSION_DAYS * 86_400_000 }), cookieOptions(SESSION_DAYS * 86_400));
  jar.delete(NONCE_COOKIE);
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** One-time nonce for Sign-In with Ethereum, bound to this browser by a signed cookie. */
export async function issueNonce(): Promise<string> {
  const nonce = randomBytes(12).toString("hex");
  (await cookies()).set(NONCE_COOKIE, sign({ nonce, exp: Date.now() + 10 * 60_000 }), cookieOptions(600));
  return nonce;
}

export async function expectedNonce(): Promise<string | null> {
  return unsign<{ nonce: string }>((await cookies()).get(NONCE_COOKIE)?.value)?.nonce ?? null;
}

export interface SessionUser {
  id: string;
  email?: string;
  wallet?: string;
  isAdmin: boolean;
}

function listEnv(name: string): string[] {
  return (process.env[name] ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
}

export async function currentUser(): Promise<SessionUser | null> {
  if (!dbConfigured) return null;
  const session = unsign<{ uid: string }>((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  const sql = await db();
  const [row] = await sql`select id, email, wallet from users where id = ${session.uid}`;
  if (!row) return null;
  const email = (row.email as string | null) ?? undefined;
  const wallet = (row.wallet as string | null) ?? undefined;
  const isAdmin =
    (wallet !== undefined && listEnv("ADMIN_WALLETS").includes(wallet.toLowerCase())) ||
    (email !== undefined && listEnv("ADMIN_EMAILS").includes(email.toLowerCase()));
  return { id: row.id as string, ...(email ? { email } : {}), ...(wallet ? { wallet } : {}), isAdmin };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  return user;
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
