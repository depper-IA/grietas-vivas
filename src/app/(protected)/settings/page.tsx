'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import {
  storeEncryptedKey,
  retrieveEncryptedKey,
  clearStoredKey,
  hasStoredKey,
} from '@/lib/crypto/byokEncryption';
import type { AIConfig } from '@/lib/ai/types';
import { Sparkles, Shield, Key, Eye, EyeOff, Save, Trash2, Info, CheckCircle2, AlertCircle } from 'lucide-react';

type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'gemini';

interface FormState {
  provider: AIProvider;
  apiKey: string;
}

export default function SettingsPage() {
  const [mode, setMode] = useState<AIConfig['mode']>('fallback');
  const [configuredProvider, setConfiguredProvider] = useState<AIProvider | null>(null);
  const [formState, setFormState] = useState<FormState>({
    provider: 'anthropic',
    apiKey: '',
  });
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);

  const supabase = createBrowserSupabaseClient();

  // Load existing key status on mount
  useEffect(() => {
    async function loadKeyStatus() {
      try {
        const keyExists = hasStoredKey();
        if (keyExists) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const decryptedKey = await retrieveEncryptedKey(session.access_token);
            if (decryptedKey) {
              setMode('byok');
              // Detect provider from key prefix
              const provider: AIProvider = decryptedKey.startsWith('sk-ant-')
                ? 'anthropic'
                : decryptedKey.startsWith('sk-or-')
                ? 'openrouter'
                : decryptedKey.startsWith('AIza')
                ? 'gemini'
                : 'openai';
              setConfiguredProvider(provider);
              setFormState((prev) => ({ ...prev, provider }));
            }
          }
        }
      } catch {
        // Key may be corrupted or session changed — fallback mode
        clearStoredKey();
      } finally {
        setInitializing(false);
      }
    }

    loadKeyStatus();
  }, [supabase.auth]);

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { apiKey, provider } = formState;

      if (!apiKey.trim()) {
        setError('Por favor ingresa una clave API.');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      // Basic key format validation
      if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
        setError('Las claves de Anthropic suelen comenzar con "sk-ant-". Por favor verifica tu clave.');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      if (provider === 'openai' && !apiKey.startsWith('sk-')) {
        setError('Las claves de OpenAI suelen comenzar con "sk-". Por favor verifica tu clave.');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      if (provider === 'openrouter' && !apiKey.startsWith('sk-or-')) {
        setError('Las claves de OpenRouter suelen comenzar con "sk-or-". Por favor verifica tu clave.');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      if (provider === 'gemini' && !apiKey.startsWith('AIza')) {
        setError('Las claves de Google Gemini suelen comenzar con "AIza". Puedes obtenerla gratis en aistudio.google.com');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('No hay sesión activa. Por favor inicia sesión de nuevo.');
        setLoading(false);
        return;
      }

      // Encrypt and store in sessionStorage — key NEVER leaves the browser
      await storeEncryptedKey(apiKey, session.access_token);

      setMode('byok');
      setConfiguredProvider(provider);
      setFormState((prev) => ({ ...prev, apiKey: '' }));
      setSuccess('Clave API guardada exitosamente. Usando modo BYOK.');
      saveButtonRef.current?.focus();
    } catch {
      setError('Error al cifrar y almacenar la clave API. Por favor intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [formState, supabase.auth]);

  const handleClear = useCallback(() => {
    clearStoredKey();
    setMode('fallback');
    setConfiguredProvider(null);
    setFormState({ provider: 'anthropic', apiKey: '' });
    setError(null);
    setSuccess('Clave API eliminada. Cambiado a modo Fallback.');
    apiKeyInputRef.current?.focus();
  }, []);

  if (initializing) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-surface-0 px-4">
        <p className="text-sm text-text-muted">Cargando configuración...</p>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-surface-0 px-4 py-8 sm:px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] text-text-primary overflow-x-hidden">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            Configuración de Proveedor IA
          </h1>
          <p className="mt-1.5 text-sm text-text-secondary">
            Configura cómo Grietas Vivas analiza las grietas en edificaciones afectadas por sismos.
          </p>
        </header>

        {/* Current mode status */}
        <section aria-labelledby="mode-status-title" className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm">
          <h2 id="mode-status-title" className="sr-only">Estado del modo actual</h2>
          <div className="flex items-center gap-3.5">
            <div
              className={`h-3.5 w-3.5 rounded-full shrink-0 ${
                mode === 'byok' ? 'bg-status-minor-bg' : 'bg-status-moderate-bg'
              }`}
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {mode === 'byok'
                  ? 'Modo BYOK (tu propia clave API)'
                  : 'Modo Fallback (modelos públicos gratuitos)'}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {mode === 'byok'
                  ? `Usando ${configuredProvider === 'anthropic' ? 'Anthropic Claude' : configuredProvider === 'openrouter' ? 'OpenRouter' : configuredProvider === 'gemini' ? 'Google Gemini' : 'OpenAI GPT-4V'}`
                  : 'Usando NVIDIA NIM / OpenRouter (fallback gratuito)'}
              </p>
            </div>
          </div>
        </section>

        {/* BYOK configuration form */}
        <form
          onSubmit={handleSave}
          className="mt-6 rounded-2xl border border-border-default bg-surface-1 p-5 sm:p-6 shadow-sm"
          noValidate
        >
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-brand-accent shrink-0" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-text-primary">
              Configuración BYOK
            </h2>
          </div>
          <p className="mt-1 text-sm text-text-secondary leading-relaxed">
            Utiliza tu propia clave API para un análisis forense detallado. La clave se cifra en tu navegador con AES-GCM y nunca se transmite a nuestros servidores.
          </p>

          {/* Error message */}
          {error && (
            <div
              id="settings-error"
              role="alert"
              aria-live="polite"
              className="mt-4 flex items-start gap-2 rounded-xl border border-status-critical-border bg-status-critical/20 p-3 text-sm text-status-critical-fg"
            >
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div
              role="status"
              aria-live="polite"
              className="mt-4 flex items-start gap-2 rounded-xl border border-status-minor-border bg-status-minor/20 p-3 text-sm text-status-minor-fg"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{success}</span>
            </div>
          )}

          {/* Provider selector */}
          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-text-primary">
              Proveedor de IA
            </legend>
            <div className="mt-2.5 space-y-2.5">
              <label className={`flex cursor-pointer items-center gap-3.5 min-h-[52px] rounded-xl border p-3.5 transition-all duration-150 ${
                formState.provider === 'anthropic'
                  ? 'border-brand-accent bg-surface-2 shadow-sm'
                  : 'border-border-default bg-surface-2/40 hover:bg-surface-2 hover:border-border-strong'
              }`}>
                <input
                  type="radio"
                  name="ai-provider"
                  value="anthropic"
                  checked={formState.provider === 'anthropic'}
                  onChange={() =>
                    setFormState((prev) => ({ ...prev, provider: 'anthropic' }))
                  }
                  className="h-4 w-4 text-brand-accent focus:ring-2 focus:ring-brand-accent shrink-0"
                />
                <div>
                  <span className="text-sm font-medium text-text-primary block">
                    Anthropic Claude
                  </span>
                  <p className="text-xs text-text-muted">
                    Modelo de visión avanzado para análisis detallado de grietas
                  </p>
                </div>
              </label>

              <label className={`flex cursor-pointer items-center gap-3.5 min-h-[52px] rounded-xl border p-3.5 transition-all duration-150 ${
                formState.provider === 'openai'
                  ? 'border-brand-accent bg-surface-2 shadow-sm'
                  : 'border-border-default bg-surface-2/40 hover:bg-surface-2 hover:border-border-strong'
              }`}>
                <input
                  type="radio"
                  name="ai-provider"
                  value="openai"
                  checked={formState.provider === 'openai'}
                  onChange={() =>
                    setFormState((prev) => ({ ...prev, provider: 'openai' }))
                  }
                  className="h-4 w-4 text-brand-accent focus:ring-2 focus:ring-brand-accent shrink-0"
                />
                <div>
                  <span className="text-sm font-medium text-text-primary block">
                    OpenAI GPT-4V
                  </span>
                  <p className="text-xs text-text-muted">
                    Modelo multimodal con alta capacidad de comprensión visual
                  </p>
                </div>
              </label>

              <label className={`flex cursor-pointer items-center gap-3.5 min-h-[52px] rounded-xl border p-3.5 transition-all duration-150 ${
                formState.provider === 'openrouter'
                  ? 'border-brand-accent bg-surface-2 shadow-sm'
                  : 'border-border-default bg-surface-2/40 hover:bg-surface-2 hover:border-border-strong'
              }`}>
                <input
                  type="radio"
                  name="ai-provider"
                  value="openrouter"
                  checked={formState.provider === 'openrouter'}
                  onChange={() =>
                    setFormState((prev) => ({ ...prev, provider: 'openrouter' }))
                  }
                  className="h-4 w-4 text-brand-accent focus:ring-2 focus:ring-brand-accent shrink-0"
                />
                <div>
                  <span className="text-sm font-medium text-text-primary block">
                    OpenRouter
                  </span>
                  <p className="text-xs text-text-muted">
                    Acceso a múltiples modelos (Claude, GPT-4, Gemini) con una sola clave
                  </p>
                </div>
              </label>

              <label className={`flex cursor-pointer items-center gap-3.5 min-h-[52px] rounded-xl border p-3.5 transition-all duration-150 ${
                formState.provider === 'gemini'
                  ? 'border-brand-accent bg-surface-2 shadow-sm'
                  : 'border-border-default bg-surface-2/40 hover:bg-surface-2 hover:border-border-strong'
              }`}>
                <input
                  type="radio"
                  name="ai-provider"
                  value="gemini"
                  checked={formState.provider === 'gemini'}
                  onChange={() =>
                    setFormState((prev) => ({ ...prev, provider: 'gemini' }))
                  }
                  className="h-4 w-4 text-brand-accent focus:ring-2 focus:ring-brand-accent shrink-0"
                />
                <div>
                  <span className="text-sm font-medium text-text-primary block">
                    Google Gemini
                  </span>
                  <p className="text-xs text-text-muted">
                    Nivel gratuito disponible en aistudio.google.com
                  </p>
                </div>
              </label>
            </div>
          </fieldset>

          {/* API key input */}
          <div className="mt-5">
            <label
              htmlFor="api-key"
              className="block text-sm font-medium text-text-primary mb-1"
            >
              Clave API (API Key)
            </label>
            <div className="relative mt-1">
              <input
                ref={apiKeyInputRef}
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={formState.apiKey}
                onChange={(e) =>
                  setFormState((prev) => ({ ...prev, apiKey: e.target.value }))
                }
                placeholder={
                  formState.provider === 'anthropic'
                    ? 'sk-ant-...'
                    : formState.provider === 'openrouter'
                    ? 'sk-or-...'
                    : formState.provider === 'gemini'
                    ? 'AIza...'
                    : 'sk-...'
                }
                autoComplete="off"
                aria-describedby={error ? 'settings-error' : 'api-key-hint'}
                className="block w-full min-h-[48px] rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 pr-24 text-base sm:text-sm text-text-primary placeholder:text-text-muted focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center gap-1.5 px-3 text-xs font-medium text-text-muted hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-accent rounded-r-xl"
                aria-label={showKey ? 'Ocultar clave API' : 'Mostrar clave API'}
              >
                {showKey ? (
                  <>
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                    <span>Ocultar</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" aria-hidden="true" />
                    <span>Mostrar</span>
                  </>
                )}
              </button>
            </div>
            <p id="api-key-hint" className="mt-1.5 text-xs text-text-muted">
              Tu clave se cifra con AES-256-GCM y se almacena únicamente en esta sesión del navegador.
            </p>
          </div>

          {/* Action buttons */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              ref={saveButtonRef}
              type="submit"
              disabled={loading}
              className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-brand-accent px-4 py-3 text-sm font-semibold text-surface-0 shadow-lg shadow-brand-accent/20 transition-all duration-150 hover:bg-brand-accent/90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-1 disabled:opacity-50"
            >
              <Save className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{loading ? 'Guardando...' : 'Guardar Clave API'}</span>
            </button>
            {mode === 'byok' && (
              <button
                ref={clearButtonRef}
                type="button"
                onClick={handleClear}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-status-critical-border bg-surface-2 px-4 py-3 text-sm font-medium text-status-critical-fg hover:bg-status-critical/10 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-status-critical-border focus:ring-offset-2 focus:ring-offset-surface-1"
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Eliminar Clave</span>
              </button>
            )}
          </div>
        </form>

        {/* Explanatory section */}
        <section aria-labelledby="modes-info-title" className="mt-6 rounded-2xl border border-border-default bg-surface-1 p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-brand-accent shrink-0" aria-hidden="true" />
            <h2 id="modes-info-title" className="text-lg font-semibold text-text-primary">
              Acerca de los Modos de Análisis
            </h2>
          </div>
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-border-subtle bg-surface-2/40 p-3.5">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <Shield className="h-4 w-4 text-brand-accent" aria-hidden="true" />
                Modo BYOK (Trae Tu Propia Clave)
              </h3>
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                Utiliza tu propia clave API para análisis forenses exhaustivos con visión de alta resolución. La clave se encripta localmente y nunca se transmite a nuestros servidores.
              </p>
            </div>
            <div className="rounded-xl border border-border-subtle bg-surface-2/40 p-3.5">
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-status-minor-bg" aria-hidden="true" />
                Modo Fallback (Gratuito)
              </h3>
              <p className="mt-1 text-sm text-text-secondary leading-relaxed">
                Análisis gratuito mediante modelos de IA públicos (OpenRouter, NVIDIA NIM). Adecuado para triaje preliminar rápido sin necesidad de configuración previa.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
