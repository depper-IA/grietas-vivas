import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Auth callback handler for Supabase magic links and email confirmations.
 * Exchanges the auth code for a session and redirects appropriately.
 * Handles expired links by redirecting to /login with error params (Req 3.6).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirectTo') ?? '/capture';
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle error from Supabase (e.g., expired link)
  if (errorParam) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', errorParam);
    if (errorDescription) {
      loginUrl.searchParams.set('error_description', errorDescription);
    }
    loginUrl.searchParams.set('redirectTo', redirectTo);
    return NextResponse.redirect(loginUrl);
  }

  // If no code provided, redirect to login
  if (!code) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'missing_code');
    loginUrl.searchParams.set('redirectTo', redirectTo);
    return NextResponse.redirect(loginUrl);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
            // Server Component context — middleware handles refresh
          }
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', 'otp_expired');
    loginUrl.searchParams.set('redirectTo', redirectTo);
    return NextResponse.redirect(loginUrl);
  }

  // Successful auth — redirect to the intended destination
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
