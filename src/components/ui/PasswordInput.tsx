'use client';

import { useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  hasError?: boolean;
}

/**
 * Campo de contraseña con botón de mostrar/ocultar (ojito).
 * Reutilizado en login, registro y restablecimiento de contraseña.
 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ hasError = false, className, id, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    const toggleId = id ? `${id}-toggle-visibility` : undefined;

    return (
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={visible ? 'text' : 'password'}
          className={
            className ??
            `block w-full min-h-[48px] rounded-xl border pl-3.5 pr-11 py-2.5 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 ${
              hasError
                ? 'border-status-critical-border bg-surface-2 focus:border-status-critical-border focus:ring-status-critical-border'
                : 'border-border-default bg-surface-2 focus:border-brand-accent focus:ring-brand-accent'
            }`
          }
          {...props}
        />
        <button
          type="button"
          id={toggleId}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
          tabIndex={-1}
          className="absolute inset-y-0 right-0 z-10 flex w-11 items-center justify-center text-text-muted hover:text-text-primary focus:outline-none focus:ring-1 focus:ring-brand-accent rounded-r-xl"
        >
          {visible ? (
            <EyeOff className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Eye className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  }
);
