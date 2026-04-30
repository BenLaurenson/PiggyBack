/**
 * Encrypted vault for hosted-platform OAuth tokens.
 *
 * Distinct from src/lib/token-encryption.ts (which handles per-tenant Up PATs)
 * — this one uses PROVISIONER_ENCRYPTION_KEY, lives on the orchestrator side,
 * and stores Supabase + Vercel OAuth refresh tokens.
 *
 * AES-256-GCM, 12-byte IV, 16-byte auth tag, hex-encoded as iv:tag:ciphertext.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

function getKey(): Buffer {
  const hex = process.env.PROVISIONER_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      "PROVISIONER_ENCRYPTION_KEY is not set. Provisioner cannot encrypt OAuth tokens."
    );
  }
  if (hex.length !== 64) {
    throw new Error(
      `PROVISIONER_ENCRYPTION_KEY must be 64 hex chars (32 bytes). Got ${hex.length}.`
    );
  }
  return Buffer.from(hex, "hex");
}

export function encryptVaultToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptVaultToken(encrypted: string): string {
  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Vault token format is invalid");
  }
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ct = Buffer.from(ctHex, "hex");

  if (iv.length !== IV_LEN || tag.length !== AUTH_TAG_LEN) {
    throw new Error("Vault token format has wrong IV or tag length");
  }

  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString("utf8");
}
