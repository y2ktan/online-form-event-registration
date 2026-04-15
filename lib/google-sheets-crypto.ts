/**
 * Simple symmetric encryption for Google Service Account JSON keys.
 * Uses AES-256-CBC with GOOGLE_SHEETS_ENCRYPTION_KEY env var.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-cbc";

function getEncryptionKey(): Buffer {
  const envKey = process.env.GOOGLE_SHEETS_ENCRYPTION_KEY;
  if (!envKey) {
    throw new Error(
      "GOOGLE_SHEETS_ENCRYPTION_KEY environment variable is required for storing Google credentials securely."
    );
  }
  // Derive a 32-byte key from the env var
  return createHash("sha256").update(envKey).digest();
}

/** Encrypt a plaintext string. Returns "iv:ciphertext" in hex. */
export function encryptKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

/** Decrypt a "iv:ciphertext" hex string back to plaintext. */
export function decryptKey(encrypted: string): string {
  const key = getEncryptionKey();
  const [ivHex, cipherText] = encrypted.split(":");
  if (!ivHex || !cipherText) {
    throw new Error("Invalid encrypted format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(cipherText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
