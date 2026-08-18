'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { MotionButton } from '@/components/ui/MotionButton';

interface FormErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
}

/** Mapea códigos de error de Supabase a mensajes amigables en español */
function getUserFriendlyError(error: { message?: string; code?: string }): string {
  const msg = error.message?.toLowerCase() ?? '';
  const code = error.code ?? '';

  if (
    code === 'user_already_exists' ||
    msg.includes('user already registered') ||
    msg.includes('already been registered')
  ) {
    return 'Ya existe una cuenta registrada con este correo.';
  }
  if (msg.includes('password') && msg.includes('weak')) {
    return 'La contraseña no cumple con los requisitos mínimos de seguridad.';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Demasiados intentos. Por favor intenta de nuevo más tarde.';
  }
  if (msg.includes('invalid') && msg.includes('email')) {
    return 'Por favor ingresa un correo electrónico válido.';
  }
  return 'El registro falló. Por favor intenta de nuevo.';
}

function validateForm(
  email: string,
  password: string,
  confirmPassword: string
): FormErrors {
  const errors: FormErrors = {};

  if (!email.trim()) {
    errors.email = 'El correo electrónico es obligatorio.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Por favor ingresa un correo electrónico válido.';
  }

  if (!password) {
    errors.password = 'La contraseña es obligatoria.';
  } else if (password.length < 8) {
    errors.password = 'La contraseña debe tener al menos 8 caracteres.';
  } else if (password.length > 128) {
    errors.password = 'La contraseña no puede exceder 128 caracteres.';
  }

  if (!confirmPassword) {
    errors.confirmPassword = 'Por favor confirma tu contraseña.';
  } else if (password !== confirmPassword) {
    errors.confirmPassword = 'Las contraseñas no coinciden.';
  }

  return errors;
}

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const supabase = createBrowserSupabaseClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    const formErrors = validateForm(email, password, confirmPassword);
    setErrors(formErrors);

    if (Object.keys(formErrors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/confirm`,
        },
      });

      if (authError) {
        setServerError(getUserFriendlyError(authError));
        return;
      }

      setSuccess(true);
    } catch {
      setServerError('El registro falló. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text-primary">
          Revisa tu correo
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Enviamos un enlace de verificación a <strong>{email}</strong>. Por favor revisa
          tu bandeja de entrada y confirma tu correo para completar el registro.
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
      <h2 className="mb-6 text-center text-lg font-semibold text-text-primary">
        Crea tu cuenta
      </h2>

      {/* Server error display */}
      {serverError && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-4 rounded-xl border border-status-critical-border bg-status-critical/10 p-3 text-sm text-status-critical"
        >
          <p>{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} method="post" action="/register" autoComplete="on" noValidate>
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
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className={`block w-full min-h-[48px] rounded-xl border px-3.5 py-2.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 ${
                errors.email
                  ? 'border-status-critical-border bg-surface-2 focus:border-status-critical-border focus:ring-status-critical-border'
                  : 'border-border-default bg-surface-2 focus:border-brand-accent focus:ring-brand-accent'
              }`}
              placeholder="tu@correo.com"
            />
            {errors.email && (
              <p id="email-error" className="mt-1 text-xs text-status-critical-fg">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-text-primary mb-1"
            >
              Contraseña
            </label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              hasError={!!errors.password}
              placeholder="••••••••"
            />
            {errors.password && (
              <p id="password-error" className="mt-1 text-xs text-status-critical-fg">
                {errors.password}
              </p>
            )}
            <p className="mt-1 text-xs text-text-muted">
              Entre 8 y 128 caracteres
            </p>
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium text-text-primary mb-1"
            >
              Confirmar contraseña
            </label>
            <PasswordInput
              id="confirm-password"
              name="confirmPassword"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={
                errors.confirmPassword ? 'confirm-password-error' : undefined
              }
              hasError={!!errors.confirmPassword}
              placeholder="••••••••"
            />
            {errors.confirmPassword && (
              <p
                id="confirm-password-error"
                className="mt-1 text-xs text-status-critical-fg"
              >
                {errors.confirmPassword}
              </p>
            )}
          </div>

<MotionButton
              type="submit"
              disabled={loading}
              buttonProps={{
                className:
                  'w-full min-h-[48px] rounded-full bg-brand-cta px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-cta/20 hover:bg-brand-cta/90 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-1 disabled:opacity-50',
              }}
            >
              {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
            </MotionButton>
        </div>
      </form>

      <p className="mt-6 text-center text-sm text-text-secondary">
        ¿Ya tienes una cuenta?{' '}
        <Link
          href="/login"
          className="font-medium text-brand-accent hover:underline min-h-[44px] inline-flex items-center"
        >
          Iniciar sesión
        </Link>
      </p>
    </div>
  );
}
