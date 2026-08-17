/**
 * Unit tests for BYOK encryption module.
 *
 * Validates: Requirement 5.1 — Securely store user's API key in encrypted form
 * within the browser session (never transmitted to the application backend).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  encryptApiKey,
  decryptApiKey,
  storeEncryptedKey,
  retrieveEncryptedKey,
  clearStoredKey,
  hasStoredKey,
  ByokEncryptionError,
} from './byokEncryption';

// Mock sessionStorage for testing
const mockSessionStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string): string | null => store[key] ?? null,
    setItem: (key: string, value: string): void => {
      store[key] = value;
    },
    removeItem: (key: string): void => {
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
    get length(): number {
      return Object.keys(store).length;
    },
    key: (index: number): string | null => Object.keys(store)[index] ?? null,
  };
})();

// In jsdom, sessionStorage is already available but let's ensure a clean state
beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe('encryptApiKey / decryptApiKey', () => {
  const testApiKey = 'sk-ant-api03-testkey123456789abcdef';
  const testSessionToken = 'eyJhbGciOiJIUzI1NiJ9.session-token-value';

  it('should encrypt and decrypt an API key round-trip', async () => {
    const encrypted = await encryptApiKey(testApiKey, testSessionToken);

    // Encrypted output should be a non-empty base64 string
    expect(encrypted).toBeTruthy();
    expect(typeof encrypted).toBe('string');
    // Should not contain the plaintext key
    expect(encrypted).not.toContain(testApiKey);

    const decrypted = await decryptApiKey(encrypted, testSessionToken);
    expect(decrypted).toBe(testApiKey);
  });

  it('should produce different ciphertext each time (random IV)', async () => {
    const encrypted1 = await encryptApiKey(testApiKey, testSessionToken);
    const encrypted2 = await encryptApiKey(testApiKey, testSessionToken);

    // Due to random IV, same plaintext should produce different ciphertext
    expect(encrypted1).not.toBe(encrypted2);

    // Both should decrypt correctly
    expect(await decryptApiKey(encrypted1, testSessionToken)).toBe(testApiKey);
    expect(await decryptApiKey(encrypted2, testSessionToken)).toBe(testApiKey);
  });

  it('should fail decryption with a different session token', async () => {
    const encrypted = await encryptApiKey(testApiKey, testSessionToken);

    await expect(
      decryptApiKey(encrypted, 'different-session-token')
    ).rejects.toThrow(ByokEncryptionError);
  });

  it('should throw on empty API key', async () => {
    await expect(encryptApiKey('', testSessionToken)).rejects.toThrow(
      ByokEncryptionError
    );
    await expect(encryptApiKey('', testSessionToken)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('should throw on empty session token', async () => {
    await expect(encryptApiKey(testApiKey, '')).rejects.toThrow(
      ByokEncryptionError
    );
    await expect(encryptApiKey(testApiKey, '')).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('should throw on invalid encrypted data for decryption', async () => {
    await expect(
      decryptApiKey('not-valid-base64!!!', testSessionToken)
    ).rejects.toThrow(ByokEncryptionError);
  });

  it('should throw on too-short encrypted data', async () => {
    // Base64 of just a few bytes (shorter than IV length)
    const tooShort = btoa('short');
    await expect(decryptApiKey(tooShort, testSessionToken)).rejects.toThrow(
      ByokEncryptionError
    );
  });

  it('should handle various API key formats', async () => {
    const keys = [
      'sk-proj-abc123', // OpenAI format
      'sk-ant-api03-verylong-key-with-dashes-and-numbers-1234567890', // Anthropic
      'a'.repeat(200), // Long key
    ];

    for (const key of keys) {
      const encrypted = await encryptApiKey(key, testSessionToken);
      const decrypted = await decryptApiKey(encrypted, testSessionToken);
      expect(decrypted).toBe(key);
    }
  });
});

describe('storeEncryptedKey / retrieveEncryptedKey', () => {
  const testApiKey = 'sk-test-storage-key';
  const testSessionToken = 'session-token-for-storage-test';

  it('should store and retrieve an encrypted key from sessionStorage', async () => {
    await storeEncryptedKey(testApiKey, testSessionToken);

    // Something should be stored
    expect(hasStoredKey()).toBe(true);

    // The stored value should NOT be the plaintext
    const rawStored = sessionStorage.getItem('safespace_byok_encrypted_key');
    expect(rawStored).not.toBe(testApiKey);
    expect(rawStored).toBeTruthy();

    // Should retrieve correctly
    const retrieved = await retrieveEncryptedKey(testSessionToken);
    expect(retrieved).toBe(testApiKey);
  });

  it('should return null when no key is stored', async () => {
    const result = await retrieveEncryptedKey(testSessionToken);
    expect(result).toBeNull();
  });

  it('should clear stored key', async () => {
    await storeEncryptedKey(testApiKey, testSessionToken);
    expect(hasStoredKey()).toBe(true);

    clearStoredKey();
    expect(hasStoredKey()).toBe(false);

    const result = await retrieveEncryptedKey(testSessionToken);
    expect(result).toBeNull();
  });
});

describe('hasStoredKey', () => {
  it('should return false when no key exists', () => {
    expect(hasStoredKey()).toBe(false);
  });

  it('should return true after storing a key', async () => {
    await storeEncryptedKey('sk-test', 'session-token');
    expect(hasStoredKey()).toBe(true);
  });
});
