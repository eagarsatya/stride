import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { maskSecret, open, seal, secretsMatch } from "./crypto";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

const API_KEY = "6dzmsans11bsyifjxchr87oum";

describe("seal/open", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = KEY_A;
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = original;
  });

  it("round-trips a credential", () => {
    const sealed = seal(API_KEY);
    expect(open(sealed)).toBe(API_KEY);
  });

  it("does not leak the plaintext into the ciphertext", () => {
    const sealed = seal(API_KEY);
    expect(sealed.cipher).not.toContain(API_KEY);
    expect(Buffer.from(sealed.cipher, "base64").toString("utf8")).not.toBe(API_KEY);
  });

  it("produces a distinct ciphertext each time", () => {
    const first = seal(API_KEY);
    const second = seal(API_KEY);

    // A fresh IV per call means identical plaintext must not encrypt alike.
    expect(first.iv).not.toBe(second.iv);
    expect(first.cipher).not.toBe(second.cipher);
    expect(open(first)).toBe(open(second));
  });

  it("round-trips unicode and long values", () => {
    const value = `möbius-${"x".repeat(5000)}-🏃`;
    expect(open(seal(value))).toBe(value);
  });

  it("rejects an empty plaintext", () => {
    expect(() => seal("")).toThrow(/empty/i);
  });

  it("rejects a tampered ciphertext", () => {
    const sealed = seal(API_KEY);
    const bytes = Buffer.from(sealed.cipher, "base64");
    bytes[0] ^= 0xff;

    expect(() => open({ ...sealed, cipher: bytes.toString("base64") })).toThrow();
  });

  it("rejects a tampered auth tag", () => {
    const sealed = seal(API_KEY);
    const tag = Buffer.from(sealed.tag, "base64");
    tag[0] ^= 0xff;

    expect(() => open({ ...sealed, tag: tag.toString("base64") })).toThrow();
  });

  it("rejects a swapped IV", () => {
    const sealed = seal(API_KEY);
    const other = seal(API_KEY);

    expect(() => open({ ...sealed, iv: other.iv })).toThrow();
  });

  it("cannot be decrypted with a different key", () => {
    const sealed = seal(API_KEY);
    process.env.ENCRYPTION_KEY = KEY_B;

    expect(() => open(sealed)).toThrow();
  });

  it("picks up a rotated key without a restart", () => {
    process.env.ENCRYPTION_KEY = KEY_B;
    const sealed = seal(API_KEY);
    expect(open(sealed)).toBe(API_KEY);
  });

  it("rejects a key that is not 32 bytes", () => {
    process.env.ENCRYPTION_KEY = randomBytes(16).toString("base64");
    expect(() => seal(API_KEY)).toThrow(/32 bytes/);
  });

  it("rejects a missing key", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => seal(API_KEY)).toThrow(/ENCRYPTION_KEY is not set/);
  });
});

describe("secretsMatch", () => {
  it("accepts identical secrets", () => {
    expect(secretsMatch("abc123", "abc123")).toBe(true);
  });

  it("rejects different secrets of equal length", () => {
    expect(secretsMatch("abc123", "abc124")).toBe(false);
  });

  it("rejects secrets of differing length without throwing", () => {
    expect(secretsMatch("short", "much-longer-secret")).toBe(false);
  });
});

describe("maskSecret", () => {
  it("keeps only the last four characters", () => {
    expect(maskSecret(API_KEY)).toBe("••••7oum");
  });
});
