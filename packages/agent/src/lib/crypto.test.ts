import { describe, expect, it } from "vitest";
import { encrypt, decrypt, SENSITIVE_KEYS } from "./crypto.js";

const TEST_KEY = "a".repeat(64); // 32 bytes as hex

describe("encrypt / decrypt", () => {
  it("round-trips a short string", () => {
    const plaintext = "hello";
    expect(decrypt(encrypt(plaintext, TEST_KEY), TEST_KEY)).toBe(plaintext);
  });

  it("round-trips an empty string", () => {
    expect(decrypt(encrypt("", TEST_KEY), TEST_KEY)).toBe("");
  });

  it("round-trips a long string", () => {
    const long = "x".repeat(10_000);
    expect(decrypt(encrypt(long, TEST_KEY), TEST_KEY)).toBe(long);
  });

  it("round-trips a unicode string", () => {
    const unicode = "日本語テスト 🔑";
    expect(decrypt(encrypt(unicode, TEST_KEY), TEST_KEY)).toBe(unicode);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encrypt("same", TEST_KEY);
    const b = encrypt("same", TEST_KEY);
    expect(a).not.toBe(b);
  });

  it("throws when encrypting with an invalid key length", () => {
    expect(() => encrypt("data", "aabbcc")).toThrow(
      "ENCRYPTION_KEY must be exactly 32 bytes"
    );
  });

  it("throws when decrypting with an invalid key length", () => {
    const encoded = encrypt("data", TEST_KEY);
    expect(() => decrypt(encoded, "aabbcc")).toThrow(
      "ENCRYPTION_KEY must be exactly 32 bytes"
    );
  });

  it("throws when decrypting with the wrong key (GCM auth failure)", () => {
    const encoded = encrypt("secret", TEST_KEY);
    const wrongKey = "b".repeat(64);
    expect(() => decrypt(encoded, wrongKey)).toThrow();
  });

  it("throws when ciphertext is tampered", () => {
    const encoded = encrypt("data", TEST_KEY);
    // Flip a byte in the middle of the base64 payload
    const buf = Buffer.from(encoded, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered, TEST_KEY)).toThrow();
  });
});

describe("SENSITIVE_KEYS", () => {
  it("contains the expected keys", () => {
    expect(SENSITIVE_KEYS.has("OPENAI_API_KEY")).toBe(true);
    expect(SENSITIVE_KEYS.has("ANTHROPIC_API_KEY")).toBe(true);
    expect(SENSITIVE_KEYS.has("GEMINI_API_KEY")).toBe(true);
    expect(SENSITIVE_KEYS.has("GITHUB_TOKEN")).toBe(true);
    expect(SENSITIVE_KEYS.has("LOKI_PASSWORD")).toBe(true);
  });

  it("does not contain non-sensitive keys", () => {
    expect(SENSITIVE_KEYS.has("OPENAI_MODEL")).toBe(false);
    expect(SENSITIVE_KEYS.has("LLM_PROVIDER")).toBe(false);
  });
});
