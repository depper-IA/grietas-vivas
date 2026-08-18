/**
 * Next.js Middleware — Supabase Auth Session Refresh & Route Protection
 *
 * Responsibilities:
 * 1. Refresh the Supabase auth session on every request (keeps session alive up to 7 days)
 * 2. Redirect unauthenticated users away from protected routes to /login (Req 3.4)
 * 3. Allow public access to auth routes, static assets, and API routes
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Set cookies on the request (for downstream server components)
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Recreate the response so it carries the updated request cookies
        supabaseResponse = NextResponse.next({ request });
        // Set cookies on the response (sent back to the browser)
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session — this updates cookies if the token was refreshed.
  // IMPORTANT: Do NOT call supabase.auth.getSession() without getUser() first.
  // getUser() sends a request to Supabase Auth to revalidate the token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isProtectedRoute = isProtectedPath(pathname);

  // Redirect unauthenticated users from protected routes to login (Req 3.4)
  if (!user && isProtectedRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    // Preserve the original destination for post-login redirect
    loginUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

/**
 * Determines if a path is protected (requires auth).
 * Protected paths: /capture, /reports, /settings, and any path
 * under the (protected) route group.
 */
function isProtectedPath(pathname: string): boolean {
  const protectedPrefixes = ['/capture', '/reports', '/settings'];
  return protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Matcher config — run middleware on all routes EXCEPT:
 * - Static files (_next/static)
 * - Image optimization (_next/image)
 * - Favicon and public assets
 * - Service worker and workbox files
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder assets (icons, sw.js, workbox, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|sw\\.js|workbox-.*\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
