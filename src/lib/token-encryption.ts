/**
 * Token encryption/decryption using AES-256-GCM
 * Encrypts UP Bank API tokens before storage and decrypts before use
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

function getEncryptionKey(): Buffer {
  const key = process.env.UP_API_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("UP_API_ENCRYPTION_KEY environment variable is not set");
  }
  // Key must be 32 bytes for AES-256
  const keyBuffer = Buffer.from(key, "hex");
  if (keyBuffer.length !== 32) {
    throw new Error(
      "UP_API_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)"
    );
  }
  return keyBuffer;
}

/**
 * Encrypt a plaintext token using AES-256-GCM
 * Returns format: iv:authTag:ciphertext (all hex-encoded)
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a token encrypted with encryptToken()
 * Expects format: iv:authTag:ciphertext (all hex-encoded)
 */
export function decryptToken(encryptedToken: string): string {
  const key = getEncryptionKey();
  const parts = encryptedToken.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format");
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Check if a token string looks like it's already encrypted
 * (has the iv:authTag:ciphertext format)
 */
export function isEncrypted(token: string): boolean {
  const parts = token.split(":");
  if (parts.length !== 3) return false;
  // Check all parts are valid hex
  return parts.every((part) => /^[0-9a-f]+$/i.test(part));
}

/**
 * Get the plaintext token from a stored value.
 * Handles both encrypted tokens (decrypts) and legacy plaintext tokens (returns as-is).
 * If UP_API_ENCRYPTION_KEY is not set, returns the token as-is (graceful degradation).
 */
export function getPlaintextToken(storedToken: string): string {
  if (!process.env.UP_API_ENCRYPTION_KEY) {
    return storedToken;
  }
  if (isEncrypted(storedToken)) {
    return decryptToken(storedToken);
  }
  return storedToken;
}
