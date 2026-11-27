// Browser side of fingerprint / Face ID sign-in.
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

async function post<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}

export const passkeysSupported = () => typeof window !== "undefined" && browserSupportsWebAuthn();

function friendly(error: unknown): Error {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "NotAllowedError" || /not allowed|cancel|abort|timed out/i.test(message)) {
    return new Error("Cancelled. Tap the button to try again.");
  }
  if (name === "InvalidStateError") return new Error("This device is already set up. Use “Sign in” instead.");
  return new Error(message);
}

/** Create an account (or add this device to the signed-in account) secured by fingerprint / Face ID. */
export async function createAccountWithPasskey(name: string): Promise<void> {
  try {
    const { options } = await post<{ options: Parameters<typeof startRegistration>[0]["optionsJSON"] }>("passkey-register-options", { name });
    const response = await startRegistration({ optionsJSON: options });
    await post("passkey-register", { response });
  } catch (error) {
    throw friendly(error);
  }
}

export async function signInWithPasskey(): Promise<void> {
  try {
    const { options } = await post<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"] }>("passkey-login-options");
    const response = await startAuthentication({ optionsJSON: options });
    await post("passkey-login", { response });
  } catch (error) {
    throw friendly(error);
  }
}
