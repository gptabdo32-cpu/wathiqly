import crypto from "crypto";

/**
 * Encryption utility for sensitive data (payment details, personal information)
 * Uses AES-256-GCM for authenticated encryption
 */

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY) {
  throw new Error("ENCRYPTION_KEY environment variable is not set. Please set a strong, persistent key for production.");
}
const ALGORITHM = "aes-256-gcm";

/**
 * Encrypt sensitive data
 * @param data - The data to encrypt
 * @returns Encrypted data with IV and auth tag
 */
export function encryptData(data: string): string {
  try {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(ENCRYPTION_KEY, "hex");
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  } catch (error) {
    console.error("Encryption error:", error);
    throw new Error("Failed to encrypt data");
  }
}

/**
 * Decrypt sensitive data
 * @param encryptedData - The encrypted data string
 * @returns Decrypted data
 */
export function decryptData(encryptedData: string): string {
  try {
    const [ivHex, authTagHex, encrypted] = encryptedData.split(":");

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = Buffer.from(ENCRYPTION_KEY, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error("Failed to decrypt data");
  }
}

/**
 * Hash sensitive data (one-way)
 * @param data - The data to hash
 * @returns SHA-256 hash
 */
export function hashData(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Verify hashed data
 * @param data - The original data
 * @param hash - The hash to verify against
 * @returns True if hash matches
 */
export function verifyHash(data: string, hash: string): boolean {
  return hashData(data) === hash;
}
