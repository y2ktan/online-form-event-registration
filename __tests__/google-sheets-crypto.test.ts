import { beforeEach, describe, expect, test, vi } from "vitest";
import { decryptKey, encryptKey } from "../lib/google-sheets-crypto";

describe("google-sheets-crypto", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.GOOGLE_SHEETS_ENCRYPTION_KEY = "test-encryption-key";
  });

  test("encrypts and decrypts round-trip", () => {
    const plaintext = JSON.stringify({ client_email: "svc@example.com", private_key: "-----BEGIN PRIVATE KEY-----" });
    const encrypted = encryptKey(plaintext);
    const decrypted = decryptKey(encrypted);

    expect(encrypted).toContain(":");
    expect(decrypted).toBe(plaintext);
  });

  test("produces different ciphertext for same plaintext due to random IV", () => {
    const plaintext = "same-input";
    const a = encryptKey(plaintext);
    const b = encryptKey(plaintext);

    expect(a).not.toBe(b);
    expect(decryptKey(a)).toBe(plaintext);
    expect(decryptKey(b)).toBe(plaintext);
  });

  test("throws when GOOGLE_SHEETS_ENCRYPTION_KEY is missing", () => {
    delete process.env.GOOGLE_SHEETS_ENCRYPTION_KEY;

    expect(() => encryptKey("abc")).toThrow("GOOGLE_SHEETS_ENCRYPTION_KEY");
  });

  test("throws on invalid encrypted format", () => {
    expect(() => decryptKey("invalid-without-colon")).toThrow("Invalid encrypted format");
  });
});
