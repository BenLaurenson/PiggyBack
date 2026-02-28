import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { encryptToken, decryptToken, isEncrypted, getPlaintextToken } from "@/lib/token-encryption";

// A valid 32-byte (64 hex chars) key for testing
const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("token-encryption", () => {
  beforeEach(() => {
    vi.stubEnv("UP_API_ENCRYPTION_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("encryptToken", () => {
    it("should encrypt a plaintext token", () => {
      const token = "up:yeah:test-token-12345";
      const encrypted = encryptToken(token);

      // Should be in iv:authTag:ciphertext format
      expect(encrypted).toContain(":");
      const parts = encrypted.split(":");
      expect(parts).toHaveLength(3);
      // Should not contain the original token
      expect(encrypted).not.toContain(token);
    });

    it("should produce different ciphertexts for the same input (random IV)", () => {
      const token = "up:yeah:same-token";
      const encrypted1 = encryptToken(token);
      const encrypted2 = encryptToken(token);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it("should throw if UP_API_ENCRYPTION_KEY is not set", () => {
      vi.stubEnv("UP_API_ENCRYPTION_KEY", "");
      delete process.env.UP_API_ENCRYPTION_KEY;

      expect(() => encryptToken("test")).toThrow("UP_API_ENCRYPTION_KEY");
    });

    it("should throw if key is wrong length", () => {
      vi.stubEnv("UP_API_ENCRYPTION_KEY", "abcdef");

      expect(() => encryptToken("test")).toThrow("64-character hex string");
    });
  });

  describe("decryptToken", () => {
    it("should round-trip: encrypt then decrypt returns original", () => {
      const token = "up:yeah:my-secret-token-abc123";
      const encrypted = encryptToken(token);
      const decrypted = decryptToken(encrypted);

      expect(decrypted).toBe(token);
    });

    it("should decrypt tokens with special characters", () => {
      const token = "up:yeah:special/chars=+&?#token";
      const encrypted = encryptToken(token);
      const decrypted = decryptToken(encrypted);

      expect(decrypted).toBe(token);
    });

    it("should throw on tampered ciphertext", () => {
      const token = "up:yeah:test";
      const encrypted = encryptToken(token);
      const parts = encrypted.split(":");
      // Tamper with the ciphertext (XOR first byte to guarantee change)
      const cByte = parseInt(parts[2].slice(0, 2), 16);
      parts[2] = ((cByte ^ 0xff) & 0xff).toString(16).padStart(2, "0") + parts[2].slice(2);
      const tampered = parts.join(":");

      expect(() => decryptToken(tampered)).toThrow();
    });

    it("should throw on tampered auth tag", () => {
      const token = "up:yeah:test";
      const encrypted = encryptToken(token);
      const parts = encrypted.split(":");
      // Tamper with the auth tag (XOR first byte to guarantee change)
      const aByte = parseInt(parts[1].slice(0, 2), 16);
      parts[1] = ((aByte ^ 0xff) & 0xff).toString(16).padStart(2, "0") + parts[1].slice(2);
      const tampered = parts.join(":");

      expect(() => decryptToken(tampered)).toThrow();
    });

    it("should throw on invalid format", () => {
      expect(() => decryptToken("not-valid")).toThrow("Invalid encrypted token format");
      expect(() => decryptToken("only:two")).toThrow("Invalid encrypted token format");
    });
  });

  describe("isEncrypted", () => {
    it("should return true for encrypted tokens", () => {
      const encrypted = encryptToken("up:yeah:test-token");
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it("should return false for plaintext tokens", () => {
      expect(isEncrypted("up:yeah:plaintext-token")).toBe(false);
    });

    it("should return false for empty strings", () => {
      expect(isEncrypted("")).toBe(false);
    });

    it("should return false for tokens without colon-separated hex parts", () => {
      expect(isEncrypted("not-hex:values:here!")).toBe(false);
    });
  });

  describe("getPlaintextToken", () => {
    it("should decrypt an encrypted token", () => {
      const original = "up:yeah:my-token-123";
      const encrypted = encryptToken(original);
      const result = getPlaintextToken(encrypted);
      expect(result).toBe(original);
    });

    it("should return plaintext token as-is when not encrypted", () => {
      const plaintext = "up:yeah:plaintext-token";
      const result = getPlaintextToken(plaintext);
      expect(result).toBe(plaintext);
    });

    it("should return token as-is when encryption key is not set", () => {
      vi.stubEnv("UP_API_ENCRYPTION_KEY", "");
      delete process.env.UP_API_ENCRYPTION_KEY;

      const token = "up:yeah:no-key-set";
      const result = getPlaintextToken(token);
      expect(result).toBe(token);
    });
  });
});
