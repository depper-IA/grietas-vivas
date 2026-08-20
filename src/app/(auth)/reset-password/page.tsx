'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { MotionButton } from '@/components/ui/MotionButton';

interface FormErrors {
  password?: string;
  confirmPassword?: string;
}

function validateForm(password: string, confirmPassword: string): FormErrors {
  const errors: FormErrors = {};

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

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get('token_hash');

  // Si el enlace trae token_hash, la verificación se difiere a un clic
  // explícito del usuario (ver handleConfirm) para no ser consumida por
  // escáneres de enlaces de clientes de correo que precargan la página.
  const [verified, setVerified] = useState(!tokenHash);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const supabase = createBrowserSupabaseClient();

  async function handleConfirm() {
    if (!tokenHash) return;
    setVerifyError(null);
    setVerifying(true);

    try {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });

      if (error) {
        setVerifyError(
          'Este enlace ya no es válido — puede haber sido usado o expiró. Solicita uno nuevo.'
        );
        return;
      }

      setVerified(true);
    } catch {
      setVerifyError('Ocurrió un error al confirmar el enlace. Intenta de nuevo.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    const formErrors = validateForm(password, confirmPassword);
    setErrors(formErrors);

    if (Object.keys(formErrors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.updateUser({ password });

      if (authError) {
        setServerError(
          'No pudimos actualizar tu contraseña. El enlace puede haber expirado — solicita uno nuevo.'
        );
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch {
      setServerError('No pudimos actualizar tu contraseña. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text-primary">
          Contraseña actualizada
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Redirigiéndote a iniciar sesión...
        </p>
      </div>
    );
  }

  if (!verified) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold text-text-primary">
          Confirma tu enlace de recuperación
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Por seguridad, confirma manualmente antes de continuar.
        </p>

        {verifyError && (
          <div
            role="alert"
            aria-live="polite"
            className="mt-4 rounded-xl border border-status-critical-border bg-status-critical/10 p-3 text-sm text-status-critical-border font-medium"
          >
            <p>{verifyError}</p>
          </div>
        )}

        <MotionButton
          type="button"
          onClick={handleConfirm}
          disabled={verifying}
          buttonProps={{
            className:
              'mt-4 w-full min-h-[48px] rounded-full bg-brand-cta px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-cta/20 hover:bg-brand-cta/90 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-1 disabled:opacity-50',
          }}
        >
          {verifying ? 'Confirmando...' : 'Confirmar y continuar'}
        </MotionButton>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-6 text-center text-lg font-semibold text-text-primary">
        Crea una nueva contraseña
      </h2>

      {serverError && (
        <div
          role="alert"
          aria-live="polite"
          className="mb-4 rounded-xl border border-status-critical-border bg-status-critical/10 p-3 text-sm text-status-critical-border font-medium"
        >
          <p>{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} method="post" action="/reset-password" autoComplete="on" noValidate>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-text-primary mb-1"
            >
              Nueva contraseña
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
              <p id="password-error" className="mt-1 text-xs text-status-critical-border font-medium">
                {errors.password}
              </p>
            )}
            <p className="mt-1 text-xs text-text-muted">Entre 8 y 128 caracteres</p>
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
                className="mt-1 text-xs text-status-critical-border font-medium"
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
            {loading ? 'Actualizando...' : 'Actualizar contraseña'}
          </MotionButton>
        </div>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center text-sm text-text-muted py-8">Cargando...</div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
