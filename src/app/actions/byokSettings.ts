'use server';

/**
 * Server Actions for BYOK API key persistence in Supabase.
 *
 * Encrypts the API key server-side using AES-256-GCM with a key derived
 * from SUPABASE_SERVICE_ROLE_KEY before storing in user_settings table.
 * The key never leaves the server in plaintext after initial submission.
 */

import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/db/supabase';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Encryption helpers (server-only, uses Node crypto)
// ---------------------------------------------------------------------------

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Derive a 256-bit encryption key from the service role key */
function deriveEncryptionKey(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return crypto.pbkdf2Sync(secret, 'byok-settings-v1', 100_000, 32, 'sha256');
}

/** Encrypt plaintext to base64 string (iv + authTag + ciphertext) */
function encrypt(plaintext: string): string {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: iv (12) + authTag (16) + ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/** Decrypt base64 string back to plaintext */
function decrypt(encoded: string): string {
  const key = deriveEncryptionKey();
  const combined = Buffer.from(encoded, 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ByokConfig {
  apiKey: string;
  provider: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
}

export interface SaveByokResult {
  success: boolean;
  error?: string;
}

export interface LoadByokResult {
  success: boolean;
  config: ByokConfig | null;
  error?: string;
}

export interface DeleteByokResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Save BYOK config to Supabase (encrypted server-side).
 * Upserts — one config per user.
 */
export async function saveByokConfig(config: ByokConfig): Promise<SaveByokResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Autenticación requerida. Inicia sesión.' };
    }

    // Encrypt the full config (apiKey included)
    const encryptedConfig = encrypt(JSON.stringify(config));

    // Use service role client to bypass RLS for upsert
    const serviceClient = createServiceRoleClient();

    const { error: upsertError } = await serviceClient
      .from('user_settings')
      .upsert(
        {
          user_id: user.id,
          encrypted_config: encryptedConfig,
          provider: config.provider,
          model: config.model ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

    if (upsertError) {
      return { success: false, error: 'Error al guardar configuración.' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Error inesperado al guardar.' };
  }
}

/**
 * Load BYOK config from Supabase (decrypted server-side).
 */
export async function loadByokConfig(): Promise<LoadByokResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, config: null, error: 'No autenticado.' };
    }

    const { data, error: fetchError } = await supabase
      .from('user_settings')
      .select('encrypted_config, provider, model')
      .eq('user_id', user.id)
      .single();

    if (fetchError || !data) {
      // No config stored — not an error
      return { success: true, config: null };
    }

    if (!data.encrypted_config) {
      return { success: true, config: null };
    }

    // Decrypt the config
    const decryptedJson = decrypt(data.encrypted_config);
    const config: ByokConfig = JSON.parse(decryptedJson);

    return { success: true, config };
  } catch {
    return { success: false, config: null, error: 'Error al cargar configuración.' };
  }
}

/**
 * Delete BYOK config from Supabase.
 */
export async function deleteByokConfig(): Promise<DeleteByokResult> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'No autenticado.' };
    }

    const { error: deleteError } = await supabase
      .from('user_settings')
      .delete()
      .eq('user_id', user.id);

    if (deleteError) {
      return { success: false, error: 'Error al eliminar configuración.' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Error inesperado al eliminar.' };
  }
}
