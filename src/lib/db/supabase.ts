/**
 * Supabase Client Factory — Browser, Server, and Service Role clients.
 *
 * Uses @supabase/ssr for cookie-based auth in Next.js App Router.
 * - createBrowserSupabaseClient(): Client components (singleton)
 * - createServerSupabaseClient(): Server Components / Server Actions (per-request)
 * - createServiceRoleClient(): Admin operations (bypasses RLS)
 */

import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment variable access
// ---------------------------------------------------------------------------

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }
  return url;
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return key;
}

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }
  return key;
}

// ---------------------------------------------------------------------------
// Browser Client (Client Components)
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase client for use in browser/client components.
 * Uses a singleton pattern — safe to call multiple times.
 * Cookie handling is automatic via @supabase/ssr.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}

// ---------------------------------------------------------------------------
// Server Client (Server Components / Server Actions / Route Handlers)
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase client for use in Server Components, Server Actions,
 * and Route Handlers. Must be called per-request since it reads cookies.
 *
 * Uses next/headers for cookie access (read-only in Server Components,
 * read-write in Server Actions and Route Handlers).
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // setAll is called from Server Components where cookies cannot be set.
          // This is expected — the middleware handles session refresh.
        }
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Service Role Client (Admin / Edge Functions)
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase client with the service role key.
 * This client bypasses Row Level Security — use only for admin operations
 * that run server-side (Server Actions, API routes, Edge Functions).
 *
 * NEVER expose this client or the service role key to the browser.
 */
export function createServiceRoleClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
