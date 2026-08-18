'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import { MotionButton } from '@/components/ui/MotionButton';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const supabase = createBrowserSupabaseClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Por favor ingresa un correo electrónico válido.');
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (authError) {
        setError('No pudimos enviar el enlace. Por favor intenta de nuevo.');
        return;
      }

      setSent(true);
    } catch {
      setError('No pudimos enviar el enlace. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text-primary">Revisa tu correo</h2>
        <p className="mt-2 text-sm text-text-secondary">
          Si existe una cuenta con <strong>{email}</strong>, enviamos un enlace para
          restablecer tu contraseña. El enlace expira en 60 minutos.
        </p>
        <Link
          href="/login"
          className="mt-4 min-h-[44px] inline-flex items-center text-sm font-medium text-brand-accent hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-2 text-center text-lg font-semibold text-text-primary">
        Restablecer contraseña
      </h2>
      <p className="mb-6 text-center text-sm text-text-secondary">
        Ingresa tu correo y te enviaremos un enlace para crear una nueva contraseña.
      </p>

      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-4 rounded-xl border border-status-critical-border bg-status-critical/10 p-3 text-sm text-status-critical"
        >
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} method="post" action="/forgot-password" autoComplete="on" noValidate>
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

        <MotionButton
          type="submit"
          disabled={loading}
          buttonProps={{
            className:
              'mt-4 w-full min-h-[48px] rounded-full bg-brand-cta px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-cta/20 hover:bg-brand-cta/90 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-1 disabled:opacity-50',
          }}
        >
          {loading ? 'Enviando...' : 'Enviar enlace de restablecimiento'}
        </MotionButton>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        <Link
          href="/login"
          className="font-medium text-brand-accent hover:underline min-h-[44px] inline-flex items-center"
        >
          Volver a iniciar sesión
        </Link>
      </p>
    </div>
  );
}
