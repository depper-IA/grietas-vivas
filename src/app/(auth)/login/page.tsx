'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';

type AuthMode = 'password' | 'magic-link';

/** Mapea códigos de error de Supabase a mensajes amigables en español */
function getUserFriendlyError(error: { message?: string; code?: string }): string {
  const msg = error.message?.toLowerCase() ?? '';
  const code = error.code ?? '';

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.';
  }
  if (code === 'otp_expired' || msg.includes('otp') || msg.includes('expired')) {
    return 'Este enlace ha expirado. ¿Deseas que te enviemos uno nuevo?';
  }
  if (msg.includes('email not confirmed')) {
    return 'Por favor confirma tu correo electrónico antes de iniciar sesión.';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Demasiados intentos. Por favor intenta de nuevo más tarde.';
  }
  return 'Ocurrió un error. Por favor intenta de nuevo.';
}

function LoginContent() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirectTo') ?? '/capture';
  const errorFromUrl = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  const [mode, setMode] = useState<AuthMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(() => {
    if (errorFromUrl === 'otp_expired' || errorDescription?.includes('expired')) {
      return 'Este enlace ha expirado. ¿Deseas que te enviemos uno nuevo?';
    }
    if (errorFromUrl) {
      return 'Ocurrió un error. Por favor intenta de nuevo.';
    }
    return null;
  });
  const [showResend, setShowResend] = useState(
    () => errorFromUrl === 'otp_expired' || errorDescription?.includes('expired')
  );
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const supabase = createBrowserSupabaseClient();

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShowResend(false);
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(getUserFriendlyError(authError));
        return;
      }

      window.location.href = redirectTo;
    } catch {
      setError('Ocurrió un error. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setShowResend(false);
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/confirm?redirectTo=${encodeURIComponent(redirectTo)}`,
        },
      });

      if (authError) {
        setError(getUserFriendlyError(authError));
        return;
      }

      setMagicLinkSent(true);
    } catch {
      setError('Ocurrió un error. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResendMagicLink() {
    setError(null);
    setShowResend(false);
    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/confirm?redirectTo=${encodeURIComponent(redirectTo)}`,
        },
      });

      if (authError) {
        setError(getUserFriendlyError(authError));
        return;
      }

      setMagicLinkSent(true);
    } catch {
      setError('Ocurrió un error. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (magicLinkSent) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text-primary">Revisa tu correo</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Enviamos un enlace de acceso a <strong>{email}</strong>. El enlace expira en
          60 minutos.
        </p>
        <button
          type="button"
          onClick={() => setMagicLinkSent(false)}
          className="mt-4 min-h-[44px] inline-flex items-center text-sm font-medium text-brand-accent hover:underline"
        >
          Volver a iniciar sesión
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-center text-lg font-semibold text-text-primary">
        Inicia sesión en tu cuenta
      </h2>

      {/* Mode toggle */}
      <div className="mb-6 flex rounded-xl border border-border-default bg-surface-2/60 p-1">
        <button
          type="button"
          onClick={() => setMode('password')}
          className={`flex-1 min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
            mode === 'password'
              ? 'bg-surface-3 text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          Contraseña
        </button>
        <button
          type="button"
          onClick={() => setMode('magic-link')}
          className={`flex-1 min-h-[44px] rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
            mode === 'magic-link'
              ? 'bg-surface-3 text-text-primary shadow-sm'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          Enlace Mágico
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-4 rounded-xl border border-status-critical-border bg-status-critical/20 p-3 text-sm text-status-critical-fg"
        >
          <p>{error}</p>
          {showResend && email && (
            <button
              type="button"
              onClick={handleResendMagicLink}
              disabled={loading}
              className="mt-2 min-h-[44px] inline-flex items-center font-medium underline hover:opacity-80 disabled:opacity-50"
            >
              Reenviar enlace
            </button>
          )}
        </div>
      )}

      {mode === 'password' ? (
        <form onSubmit={handlePasswordLogin} noValidate>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-text-primary mb-1"
              >
                Correo Electrónico
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full min-h-[48px] rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
                placeholder="tu@correo.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-text-primary mb-1"
              >
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full min-h-[48px] rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-brand-accent px-4 py-3 text-sm font-semibold text-surface-0 shadow-lg shadow-brand-accent/20 transition-all duration-150 hover:bg-brand-accent/90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-1 disabled:opacity-50"
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleMagicLink} noValidate>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="magic-email"
                className="block text-sm font-medium text-text-primary mb-1"
              >
                Correo Electrónico
              </label>
              <input
                id="magic-email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full min-h-[48px] rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
                placeholder="tu@correo.com"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[48px] rounded-xl bg-brand-accent px-4 py-3 text-sm font-semibold text-surface-0 shadow-lg shadow-brand-accent/20 transition-all duration-150 hover:bg-brand-accent/90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-1 disabled:opacity-50"
            >
              {loading ? 'Enviando enlace...' : 'Enviar Enlace Mágico'}
            </button>
          </div>
        </form>
      )}

      <div className="relative my-6 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle" />
        </div>
        <span className="relative bg-surface-1 px-3 text-xs uppercase text-text-muted">
          O acceso directo
        </span>
      </div>

      <Link
        href="/capture"
        className="flex w-full min-h-[48px] items-center justify-center rounded-xl border border-border-default bg-surface-2 px-4 py-2.5 text-sm font-medium text-text-primary transition-all duration-150 hover:bg-surface-3 active:scale-[0.98]"
      >
        Continuar en Modo Demo / Explorar
      </Link>

      <p className="mt-6 text-center text-sm text-text-secondary">
        ¿No tienes una cuenta?{' '}
        <Link
          href="/register"
          className="font-medium text-brand-accent hover:underline min-h-[44px] inline-flex items-center"
        >
          Registrarse
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center text-sm text-text-muted py-8">Cargando...</div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
