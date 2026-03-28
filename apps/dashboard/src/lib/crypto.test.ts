import { describe, it, expect } from "vitest";
import { encrypt, decrypt, SENSITIVE_KEYS } from "./crypto";

const KEY = "0".repeat(64); // 32 zero bytes as hex

describe("SENSITIVE_KEYS", () => {
  it("includes known sensitive keys", () => {
    expect(SENSITIVE_KEYS.has("OPENAI_API_KEY")).toBe(true);
    expect(SENSITIVE_KEYS.has("ANTHROPIC_API_KEY")).toBe(true);
    expect(SENSITIVE_KEYS.has("GEMINI_API_KEY")).toBe(true);
    expect(SENSITIVE_KEYS.has("GITHUB_TOKEN")).toBe(true);
    expect(SENSITIVE_KEYS.has("LOKI_PASSWORD")).toBe(true);
  });

  it("does not include non-sensitive keys", () => {
    expect(SENSITIVE_KEYS.has("LOKI_URL")).toBe(false);
    expect(SENSITIVE_KEYS.has("GITHUB_OWNER")).toBe(false);
    expect(SENSITIVE_KEYS.has("SOURCE_CONNECTORS")).toBe(false);
  });
});

describe("encrypt / decrypt round-trip", () => {
  it("decrypts to original plaintext", () => {
    const plaintext = "sk-test-12345";
    const ciphertext = encrypt(plaintext, KEY);
    expect(ciphertext).not.toBe(plaintext);
    expect(decrypt(ciphertext, KEY)).toBe(plaintext);
  });

  it("produces different ciphertexts for same plaintext (random IV)", () => {
    const a = encrypt("hello", KEY);
    const b = encrypt("hello", KEY);
    expect(a).not.toBe(b);
  });

  it("roundtrips empty string", () => {
    const enc = encrypt("", KEY);
    expect(decrypt(enc, KEY)).toBe("");
  });

  it("roundtrips unicode string", () => {
    const text = "日本語テスト 🔑";
    expect(decrypt(encrypt(text, KEY), KEY)).toBe(text);
  });

  it("throws on tampered ciphertext", () => {
    const enc = encrypt("secret", KEY);
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff; // corrupt the auth tag
    expect(() => decrypt(buf.toString("base64"), KEY)).toThrow();
  });
});
