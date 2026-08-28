import type { Connection } from "@/db/schema/app";
import { open } from "@/lib/crypto";

export type IntervalsCredential =
  | { kind: "apiKey"; apiKey: string }
  | { kind: "oauth"; accessToken: string };

/**
 * Personal API keys use HTTP basic auth with the literal username "API_KEY",
 * OAuth uses a bearer token. Keeping this in one place means the client and
 * every call site stay agnostic about which credential a user connected with.
 */
export function authHeader(credential: IntervalsCredential): string {
  if (credential.kind === "oauth") {
    return `Bearer ${credential.accessToken}`;
  }

  const basic = Buffer.from(`API_KEY:${credential.apiKey}`, "utf8").toString("base64");
  return `Basic ${basic}`;
}

/**
 * Prefer OAuth when present, since that is the phase-2 path, and fall back to
 * the encrypted personal API key.
 */
export function credentialFromConnection(connection: Connection): IntervalsCredential {
  if (connection.accessToken) {
    return { kind: "oauth", accessToken: connection.accessToken };
  }

  if (connection.apiKeyCipher && connection.apiKeyIv && connection.apiKeyTag) {
    return {
      kind: "apiKey",
      apiKey: open({
        cipher: connection.apiKeyCipher,
        iv: connection.apiKeyIv,
        tag: connection.apiKeyTag,
      }),
    };
  }

  throw new Error("Connection has no usable Intervals.icu credential.");
}
