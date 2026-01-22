/**
 * Encryption utilities for storing sensitive data like API keys
 * Uses Web Crypto API (AES-GCM) with PBKDF2-derived key from browser fingerprint
 */

const ALGORITHM = 'AES-GCM';
const KEY_ALGORITHM = 'PBKDF2';
const ITERATIONS = 100000;
const TAG_LENGTH = 128;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Get browser fingerprint for consistent key derivation
 * Uses user agent and screen dimensions as a simple fingerprint
 */
function getBrowserFingerprint(): string {
  const ua = navigator.userAgent;
  const screen = `${window.screen.width}x${window.screen.height}`;
  const lang = navigator.language;
  return `${ua}|${screen}|${lang}`;
}

/**
 * Derive a crypto key from browser fingerprint using PBKDF2
 */
async function deriveMasterKey(): Promise<CryptoKey> {
  const fingerprint = getBrowserFingerprint();
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);

  // Create a stable salt for this browser (based on fingerprint hash)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const salt = new Uint8Array(hashBuffer).slice(0, SALT_LENGTH);

  // Derive the master key
  const baseKey = await crypto.subtle.importKey(
    'raw',
    data,
    KEY_ALGORITHM,
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: KEY_ALGORITHM,
      salt: salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a string value
 */
export async function encryptValue(value: string): Promise<string> {
  try {
    const key = await deriveMasterKey();
    const encoder = new TextEncoder();
    const plaintext = encoder.encode(value);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encrypt the data
    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      plaintext
    );

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode.apply(null, Array.from(combined)));
  } catch (error) {
    console.error('Encryption failed:', error);
    throw error;
  }
}

/**
 * Decrypt an encrypted string value
 */
export async function decryptValue(encrypted: string): Promise<string> {
  try {
    const key = await deriveMasterKey();
    const decoder = new TextDecoder();

    // Decode from base64
    const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

    // Extract IV and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    // Decrypt the data
    const plaintext = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    );

    return decoder.decode(plaintext);
  } catch (error) {
    console.error('Decryption failed:', error);
    throw error;
  }
}

/**
 * Test if a value can be decrypted (for validation)
 */
export async function canDecrypt(encrypted: string): Promise<boolean> {
  try {
    await decryptValue(encrypted);
    return true;
  } catch {
    return false;
  }
}
