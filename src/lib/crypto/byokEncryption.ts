/**
 * BYOK (Bring Your Own Key) Encryption Module
 *
 * Encrypts and decrypts user-provided API keys using Web Crypto API (AES-GCM).
 * Keys are stored encrypted in sessionStorage and never transmitted to the backend.
 *
 * @see Requirement 5.1 — Securely store user's API key in encrypted form within browser session
 */

/** AES-GCM configuration constants */
const CRYPTO_CONFIG = {
  /** AES-GCM algorithm identifier */
  algorithm: 'AES-GCM',
  /** Key length in bits */
  keyLength: 256,
  /** Initialization vector length in bytes (96 bits recommended for AES-GCM) */
  ivLength: 12,
  /** PBKDF2 iterations for key derivation */
  pbkdf2Iterations: 100_000,
  /** Hash algorithm for PBKDF2 */
  hashAlgorithm: 'SHA-256',
  /** Salt for key derivation (app-specific, not secret) */
  salt: 'safespace-byok-v1',
} as const;

/** sessionStorage key for the encrypted API key */
const STORAGE_KEY = 'safespace_byok_encrypted_key';

/**
 * Derives an AES-256-GCM encryption key from a session token using PBKDF2.
 *
 * The session token acts as the password material; combined with a fixed
 * application salt and high iteration count, it produces a deterministic
 * encryption key unique to that session.
 */
async function deriveKey(sessionToken: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();

  // Import session token as raw key material for PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(sessionToken),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES-GCM key from session token
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode(CRYPTO_CONFIG.salt),
      iterations: CRYPTO_CONFIG.pbkdf2Iterations,
      hash: CRYPTO_CONFIG.hashAlgorithm,
    },
    keyMaterial,
    {
      name: CRYPTO_CONFIG.algorithm,
      length: CRYPTO_CONFIG.keyLength,
    },
    false, // not extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts an API key using AES-GCM with a key derived from the session token.
 *
 * The output is a base64 string containing the IV prepended to the ciphertext,
 * suitable for storage in sessionStorage.
 *
 * @param apiKey - The plaintext API key to encrypt
 * @param sessionToken - The session token used to derive the encryption key
 * @returns Base64-encoded string containing IV + ciphertext
 * @throws Error if encryption fails (e.g., Web Crypto API unavailable)
 *
 * @example
 * ```ts
 * const encrypted = await encryptApiKey('sk-abc123...', session.access_token);
 * ```
 */
export async function encryptApiKey(
  apiKey: string,
  sessionToken: string
): Promise<string> {
  if (!apiKey || !sessionToken) {
    throw new ByokEncryptionError(
      'INVALID_INPUT',
      'Both API key and session token are required for encryption.'
    );
  }

  try {
    const key = await deriveKey(sessionToken);
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(CRYPTO_CONFIG.ivLength));

    const ciphertext = await crypto.subtle.encrypt(
      { name: CRYPTO_CONFIG.algorithm, iv },
      key,
      encoder.encode(apiKey)
    );

    // Combine IV + ciphertext into a single array for storage
    const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // Encode to base64 for sessionStorage compatibility
    return uint8ArrayToBase64(combined);
  } catch (error) {
    if (error instanceof ByokEncryptionError) {
      throw error;
    }
    throw new ByokEncryptionError(
      'ENCRYPTION_FAILED',
      'Failed to encrypt API key. Web Crypto API may not be available.'
    );
  }
}

/**
 * Decrypts an encrypted API key using AES-GCM with a key derived from the session token.
 *
 * @param encryptedKey - Base64-encoded string containing IV + ciphertext
 * @param sessionToken - The session token used to derive the decryption key (must match encryption)
 * @returns The plaintext API key
 * @throws Error if decryption fails (wrong session token, corrupted data, etc.)
 *
 * @example
 * ```ts
 * const apiKey = await decryptApiKey(storedEncrypted, session.access_token);
 * ```
 */
export async function decryptApiKey(
  encryptedKey: string,
  sessionToken: string
): Promise<string> {
  if (!encryptedKey || !sessionToken) {
    throw new ByokEncryptionError(
      'INVALID_INPUT',
      'Both encrypted key and session token are required for decryption.'
    );
  }

  try {
    const key = await deriveKey(sessionToken);
    const combined = base64ToUint8Array(encryptedKey);

    if (combined.length <= CRYPTO_CONFIG.ivLength) {
      throw new ByokEncryptionError(
        'INVALID_DATA',
        'Encrypted data is too short to contain valid ciphertext.'
      );
    }

    // Extract IV and ciphertext
    const iv = combined.slice(0, CRYPTO_CONFIG.ivLength);
    const ciphertext = combined.slice(CRYPTO_CONFIG.ivLength);

    const decrypted = await crypto.subtle.decrypt(
      { name: CRYPTO_CONFIG.algorithm, iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    if (error instanceof ByokEncryptionError) {
      throw error;
    }
    throw new ByokEncryptionError(
      'DECRYPTION_FAILED',
      'Failed to decrypt API key. Session token may have changed or data is corrupted.'
    );
  }
}

export interface StoredByokConfig {
  apiKey: string;
  provider: 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'minimax';
  model?: string;
}

/**
 * Encrypts and stores a complete BYOK configuration (API key + provider + selected model) in sessionStorage.
 */
export async function storeEncryptedByokConfig(
  config: StoredByokConfig,
  sessionToken: string
): Promise<void> {
  const payload = JSON.stringify(config);
  await storeEncryptedKey(payload, sessionToken);
}

/**
 * Retrieves and decrypts the stored BYOK configuration from sessionStorage.
 * Supports both modern structured JSON and legacy plain string keys.
 */
export async function retrieveEncryptedByokConfig(
  sessionToken: string
): Promise<StoredByokConfig | null> {
  const decrypted = await retrieveEncryptedKey(sessionToken);
  if (!decrypted) {
    return null;
  }

  try {
    const parsed = JSON.parse(decrypted);
    if (parsed && typeof parsed === 'object' && typeof parsed.apiKey === 'string') {
      return parsed as StoredByokConfig;
    }
  } catch {
    // Legacy format where only apiKey was stored as plain string
  }

  // Fallback detection for raw apiKey string
  let provider: StoredByokConfig['provider'] = 'openai';
  if (decrypted.startsWith('sk-ant-')) {
    provider = 'anthropic';
  } else if (decrypted.startsWith('sk-or-')) {
    provider = 'openrouter';
  } else if (decrypted.startsWith('AIza')) {
    provider = 'gemini';
  } else if (decrypted.startsWith('eyJ') || decrypted.match(/^minimax-/i)) {
    provider = 'minimax';
  }

  return { apiKey: decrypted, provider };
}

/**
 * Encrypts and stores an API key in sessionStorage.
 *
 * The key is encrypted before storage and will be automatically cleared
 * when the browser tab/session is closed.
 *
 * @param apiKey - The plaintext API key to store
 * @param sessionToken - The session token used for encryption
 */
export async function storeEncryptedKey(
  apiKey: string,
  sessionToken: string
): Promise<void> {
  const encrypted = await encryptApiKey(apiKey, sessionToken);

  if (typeof sessionStorage === 'undefined') {
    throw new ByokEncryptionError(
      'STORAGE_UNAVAILABLE',
      'sessionStorage is not available in this environment.'
    );
  }

  sessionStorage.setItem(STORAGE_KEY, encrypted);
}

/**
 * Retrieves and decrypts the stored API key from sessionStorage.
 *
 * @param sessionToken - The session token used for decryption
 * @returns The decrypted API key, or null if no key is stored
 */
export async function retrieveEncryptedKey(
  sessionToken: string
): Promise<string | null> {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  const encrypted = sessionStorage.getItem(STORAGE_KEY);
  if (!encrypted) {
    return null;
  }

  return decryptApiKey(encrypted, sessionToken);
}

/**
 * Removes the stored encrypted key from sessionStorage.
 */
export function clearStoredKey(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

/**
 * Checks if an encrypted key exists in sessionStorage.
 */
export function hasStoredKey(): boolean {
  if (typeof sessionStorage === 'undefined') {
    return false;
  }
  return sessionStorage.getItem(STORAGE_KEY) !== null;
}

// --- Utility functions ---

/**
 * Converts a Uint8Array to a base64 string.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts a base64 string to a Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Custom error class for BYOK encryption/decryption failures.
 */
export class ByokEncryptionError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ByokEncryptionError';
    this.code = code;
  }
}
