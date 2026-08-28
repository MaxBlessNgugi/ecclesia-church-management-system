// =============================================================================
// Ecclesia Backend — Cryptographic Utilities
// =============================================================================
//
// PURPOSE
//   Provides AES-256-GCM symmetric encryption and decryption for sensitive fields
//   stored at rest in PostgreSQL (e.g. M-Pesa Consumer Keys & Secrets).
// =============================================================================
import crypto from 'node:crypto';

// Encryption key derived from JWT_SECRET or ENCRYPTION_KEY env var
const SECRET_KEY = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || 'ecclesia-default-encryption-key-32b';

/**
 * Derives a 32-byte key for AES-256 using SHA-256 hashing.
 */
function getDerivedKey(): Buffer {
  return crypto.createHash('sha256').update(SECRET_KEY).digest();
}

/**
 * Encrypts a string using AES-256-GCM.
 * Output format: "iv_hex:auth_tag_hex:encrypted_hex"
 */
export function encryptString(plaintext: string): string {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getDerivedKey(), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string formatted as "iv_hex:auth_tag_hex:encrypted_hex".
 * Returns raw plaintext or original input if not in encrypted format.
 */
export function decryptString(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) return encryptedPayload; // Not in encrypted format

  const [ivHex, authTagHex, encryptedHex] = parts;
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getDerivedKey(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encryptedPayload;
  }
}

/**
 * Masks a sensitive string for safe API responses (e.g. "••••••••1234").
 */
export function maskSecret(value: string, visibleChars = 4): string {
  if (!value) return '';
  if (value.length <= visibleChars) return '••••';
  return '••••••••' + value.slice(-visibleChars);
}
