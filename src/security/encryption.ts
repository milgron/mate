import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  salt: string;
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Encrypts plaintext using AES-256-GCM with a derived key.
 * Uses random salt and IV for each encryption.
 */
export function encrypt(plaintext: string, masterKey: string): EncryptedData {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(masterKey, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    salt: salt.toString('base64'),
  };
}

/**
 * Decrypts data encrypted with encrypt().
 * Throws if tampering is detected or key is wrong.
 */
export function decrypt(encrypted: EncryptedData, masterKey: string): string {
  const salt = Buffer.from(encrypted.salt, 'base64');
  const key = deriveKey(masterKey, salt);
  const iv = Buffer.from(encrypted.iv, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(encrypted.ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
