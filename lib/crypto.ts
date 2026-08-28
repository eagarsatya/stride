import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // 96-bit nonce, the size GCM is specified for.

export type SealedSecret = {
  cipher: string;
  iv: string;
  tag: string;
};

/**
 * Third-party credentials are stored encrypted so that a leaked database dump
 * is not also a leak of every user's Intervals.icu account. AES-256-GCM is
 * authenticated, so a tampered ciphertext fails to decrypt rather than
 * returning garbage.
 */
// Keyed by the raw env value so that rotating the key takes effect immediately
// instead of serving a stale buffer.
let cached: { raw: string; key: Buffer } | undefined;

/**
 * Read directly from the environment rather than through `serverEnv()`, so that
 * encryption works (and stays unit-testable) without a database or auth config.
 */
function encryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("ENCRYPTION_KEY is not set. Generate one with: openssl rand -base64 32");
  }

  if (cached?.raw === raw) return cached.key;

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must be ${KEY_BYTES} bytes base64-encoded (got ${key.length}). Generate one with: openssl rand -base64 32`,
    );
  }

  cached = { raw, key };
  return key;
}

export function seal(plaintext: string): SealedSecret {
  if (plaintext.length === 0) {
    throw new Error("Refusing to encrypt an empty value.");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    cipher: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function open(sealed: SealedSecret): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    encryptionKey(),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));

  // `final()` throws if the auth tag does not match, which is the tamper check.
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.cipher, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Constant-time comparison, for shared secrets like CRON_SECRET. */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Last four characters of a credential, for showing the user which key is
 * stored without ever sending the key back to the browser.
 */
export function maskSecret(value: string): string {
  const tail = value.slice(-4);
  return `••••${tail}`;
}
