'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import {
  storeEncryptedByokConfig,
  retrieveEncryptedByokConfig,
  clearStoredKey,
  hasStoredKey,
} from '@/lib/crypto/byokEncryption';
import type { AIConfig } from '@/lib/ai/types';
import {
  Sparkles,
  Shield,
  Key,
  Eye,
  EyeOff,
  Save,
  Trash2,
  Info,
  CheckCircle2,
  AlertCircle,
  Cpu,
} from 'lucide-react';
import { MotionButton } from '@/components/ui/MotionButton';
import { motion, AnimatePresence } from 'framer-motion';

type AIProvider = 'anthropic' | 'openai' | 'openrouter' | 'gemini' | 'minimax';

interface ModelOption {
  id: string;
  label: string;
  badge?: string;
}

const PROVIDER_MODELS: Record<AIProvider, ModelOption[]> = {
  anthropic: [
    { id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', badge: 'Recomendado' },
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet v2', badge: 'Forense' },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', badge: 'Rápido' },
    { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus', badge: 'Razonamiento' },
  ],
  gemini: [
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', badge: 'Recomendado' },
    { id: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite', badge: 'Económico' },
    { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', badge: 'Contexto Largo' },
    { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', badge: 'Estable' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o Vision', badge: 'Recomendado' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini', badge: 'Económico' },
    { id: 'gpt-4-turbo', label: 'GPT-4 Turbo Vision', badge: 'Forense' },
    { id: 'o1', label: 'OpenAI o1', badge: 'Razonamiento' },
  ],
  minimax: [
    { id: 'MiniMax-VL-01', label: 'MiniMax-VL-01 (Vision)', badge: 'Recomendado' },
    { id: 'abab6.5s-chat', label: 'MiniMax abab6.5s Multimodal', badge: 'Multimodal' },
    { id: 'MiniMax-Text-01', label: 'MiniMax Text-01', badge: 'Básico' },
  ],
  openrouter: [
    { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash (OpenRouter)', badge: 'Recomendado' },
    { id: 'anthropic/claude-3.7-sonnet', label: 'Claude 3.7 Sonnet (OpenRouter)', badge: 'Potente' },
    { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet (OpenRouter)', badge: 'Forense' },
    { id: 'openai/gpt-4o', label: 'GPT-4o (OpenRouter)', badge: 'Multimodal' },
    { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (OpenRouter)', badge: 'Económico' },
    { id: 'qwen/qwen-2.5-vl-72b-instruct:free', label: 'Qwen 2.5 VL 72B (Free)', badge: 'Gratuito' },
    { id: 'custom', label: 'Otro modelo personalizado...', badge: 'Personalizado' },
  ],
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-3-7-sonnet-20250219',
  gemini: 'gemini-2.0-flash',
  openai: 'gpt-4o',
  minimax: 'MiniMax-VL-01',
  openrouter: 'google/gemini-2.0-flash-001',
};

const PROVIDER_META: Record<AIProvider, { name: string; desc: string; placeholder: string; keyHint: string }> = {
  anthropic: {
    name: 'Anthropic Claude',
    desc: 'Visión forense avanzada de alta resolución para daños estructurales',
    placeholder: 'sk-ant-...',
    keyHint: 'Inicia con "sk-ant-". Obtén tu clave en console.anthropic.com',
  },
  gemini: {
    name: 'Google Gemini',
    desc: 'Modelos multimodales de última generación con nivel gratuito disponible',
    placeholder: 'AIza...',
    keyHint: 'Inicia con "AIza". Obtén tu clave gratis en aistudio.google.com',
  },
  openrouter: {
    name: 'OpenRouter (BYOK)',
    desc: 'Usa tus propios créditos de OpenRouter con acceso a cientos de modelos de visión',
    placeholder: 'sk-or-...',
    keyHint: 'Inicia con "sk-or-". Configura tus propios créditos en openrouter.ai',
  },
  minimax: {
    name: 'MiniMax',
    desc: 'Modelo de visión y lenguaje (MiniMax-VL-01) con alta capacidad analítica',
    placeholder: 'minimax-... o token JWT (eyJ...)',
    keyHint: 'Obtén tu API key en platform.minimaxi.com',
  },
  openai: {
    name: 'OpenAI GPT-4o',
    desc: 'Capacidad multimodal estándar en la industria para análisis visual',
    placeholder: 'sk-...',
    keyHint: 'Inicia con "sk-". Obtén tu clave en platform.openai.com',
  },
};

interface FormState {
  provider: AIProvider;
  apiKey: string;
  model: string;
  customModel: string;
}

export default function SettingsPage() {
  const [mode, setMode] = useState<AIConfig['mode']>('fallback');
  const [configuredProvider, setConfiguredProvider] = useState<AIProvider | null>(null);
  const [configuredModel, setConfiguredModel] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({
    provider: 'anthropic',
    apiKey: '',
    model: DEFAULT_MODELS['anthropic'],
    customModel: '',
  });
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);

  const supabase = createBrowserSupabaseClient();

  useEffect(() => {
    async function loadKeyStatus() {
      try {
        const keyExists = hasStoredKey();
        if (keyExists) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const byokConfig = await retrieveEncryptedByokConfig(session.access_token);
            if (byokConfig?.apiKey) {
              setMode('byok');
              const provider = byokConfig.provider;
              const model = byokConfig.model || DEFAULT_MODELS[provider];
              setConfiguredProvider(provider);
              setConfiguredModel(model);
              const isCustom = provider === 'openrouter' && !PROVIDER_MODELS.openrouter.some(m => m.id === model);
              setFormState((prev) => ({
                ...prev,
                provider,
                model: isCustom ? 'custom' : model,
                customModel: isCustom ? model : '',
              }));
            }
          }
        }
      } catch {
        clearStoredKey();
      } finally {
        setInitializing(false);
      }
    }

    loadKeyStatus();
  }, [supabase.auth]);

  const handleProviderChange = (newProvider: AIProvider) => {
    setFormState((prev) => ({
      ...prev,
      provider: newProvider,
      model: DEFAULT_MODELS[newProvider],
      customModel: '',
    }));
    setError(null);
  };

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const { apiKey, provider, model, customModel } = formState;

      if (!apiKey.trim()) {
        setError('Por favor ingresa tu clave API.');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
        setError('Las claves de Anthropic inician con "sk-ant-". Por favor verifica tu clave.');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      if (provider === 'openai' && !apiKey.startsWith('sk-')) {
        setError('Las claves de OpenAI inician con "sk-". Por favor verifica tu clave.');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      if (provider === 'openrouter' && !apiKey.startsWith('sk-or-')) {
        setError('Las claves de OpenRouter inician con "sk-or-". Por favor verifica tu clave.');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      if (provider === 'gemini' && !apiKey.startsWith('AIza')) {
        setError('Las claves de Google Gemini inician con "AIza". Puedes obtenerla gratis en aistudio.google.com');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      const effectiveModel = model === 'custom'
        ? (customModel.trim() || DEFAULT_MODELS[provider])
        : (model || DEFAULT_MODELS[provider]);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('No hay sesión activa. Por favor inicia sesión nuevamente.');
        setLoading(false);
        return;
      }

      await storeEncryptedByokConfig(
        { apiKey: apiKey.trim(), provider, model: effectiveModel },
        session.access_token
      );

      setMode('byok');
      setConfiguredProvider(provider);
      setConfiguredModel(effectiveModel);
      setFormState((prev) => ({ ...prev, apiKey: '' }));
      setSuccess(`Clave de ${PROVIDER_META[provider].name} (${effectiveModel}) guardada exitosamente. Tus análisis usarán tus propios créditos.`);
      saveButtonRef.current?.focus();
    } catch {
      setError('Error al cifrar y almacenar la configuración. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  }, [formState, supabase.auth]);

  const handleClear = useCallback(() => {
    clearStoredKey();
    setMode('fallback');
    setConfiguredProvider(null);
    setConfiguredModel(null);
    setFormState({
      provider: 'anthropic',
      apiKey: '',
      model: DEFAULT_MODELS['anthropic'],
      customModel: '',
    });
    setError(null);
    setSuccess('Clave eliminada. La aplicación ha vuelto al modo Fallback del servidor.');
    apiKeyInputRef.current?.focus();
  }, []);

  if (initializing) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-surface-0 px-4">
        <p className="text-sm font-medium text-text-muted">Cargando configuración de IA...</p>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-surface-0 px-4 py-8 sm:px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] text-text-primary overflow-x-hidden">
      <div className="mx-auto w-full max-w-lg space-y-6">
        <header className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            Configuración de IA
          </h1>
          <p className="text-sm text-text-secondary">
            Personaliza el motor de visión forense y usa tus propios créditos para mantener el servicio autosostenible.
          </p>
        </header>

        {/* Estado actual */}
        <section aria-labelledby="mode-status-title" className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm">
          <h2 id="mode-status-title" className="sr-only">Estado del modo de IA</h2>
          <div className="flex items-center gap-3.5">
            <div
              className={`h-9 w-9 rounded-xl shrink-0 flex items-center justify-center ${
                mode === 'byok' ? 'bg-status-minor-bg/30 text-status-minor-fg' : 'bg-status-moderate-bg/30 text-status-moderate-fg'
              }`}
              aria-hidden="true"
            >
              <Cpu className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <span>{mode === 'byok' ? 'Modo BYOK (Clave Propia)' : 'Modo Servidor (Fallback Gratuito)'}</span>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-md uppercase font-bold tracking-wider ${
                  mode === 'byok' ? 'bg-status-minor/20 text-status-minor-fg' : 'bg-status-moderate/20 text-status-moderate-fg'
                }`}>
                  {mode === 'byok' ? 'Activo' : 'Público'}
                </span>
              </p>
              <p className="text-xs text-text-muted mt-0.5 truncate">
                {mode === 'byok' && configuredProvider
                  ? `Proveedor: ${PROVIDER_META[configuredProvider].name} (${configuredModel || 'Por defecto'})`
                  : 'Usando proveedores compartidos del servidor (sujeto a cuotas públicas)'}
              </p>
            </div>
          </div>
        </section>

        {/* Formulario BYOK */}
        <form onSubmit={handleSave} className="rounded-2xl border border-border-default bg-surface-1 p-5 sm:p-6 shadow-sm space-y-5" noValidate>
          <div className="flex items-center gap-2.5 pb-2 border-b border-border-subtle">
            <Key className="h-5 w-5 text-brand-accent shrink-0" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                Configurar tu propia Clave (BYOK)
              </h2>
              <p className="text-xs text-text-secondary">
                Tus claves se cifran con AES-256-GCM y nunca salen de tu navegador.
              </p>
            </div>
          </div>

          {/* Feedback de error */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                id="settings-error"
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-2.5 rounded-xl border border-status-critical-border bg-status-critical/15 p-3.5 text-xs sm:text-sm text-status-critical-fg"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="flex-1 font-medium">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Feedback de éxito */}
          <AnimatePresence mode="wait">
            {success && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 0 }}
                role="status"
                aria-live="polite"
                className="flex items-start gap-2.5 rounded-xl border border-status-minor-border bg-status-minor/15 p-3.5 text-xs sm:text-sm text-status-minor-fg"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="flex-1 font-medium">{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selector de proveedores */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wider text-text-muted">
              1. Selecciona el Proveedor de IA
            </legend>
            <div className="space-y-2.5">
              {(Object.keys(PROVIDER_META) as AIProvider[]).map((provKey) => {
                const meta = PROVIDER_META[provKey];
                const isSelected = formState.provider === provKey;
                const models = PROVIDER_MODELS[provKey];

                return (
                  <div
                    key={provKey}
                    className={`rounded-xl border p-3.5 transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'border-brand-accent bg-surface-2 shadow-sm'
                        : 'border-border-default bg-surface-2/40 hover:bg-surface-2 hover:border-border-strong'
                    }`}
                    onClick={() => handleProviderChange(provKey)}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        id={`provider-${provKey}`}
                        name="ai-provider"
                        value={provKey}
                        checked={isSelected}
                        onChange={() => handleProviderChange(provKey)}
                        className="mt-0.5 h-4 w-4 text-brand-accent focus:ring-brand-accent shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <label htmlFor={`provider-${provKey}`} className="text-sm font-semibold text-text-primary block cursor-pointer">
                          {meta.name}
                        </label>
                        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
                          {meta.desc}
                        </p>

                        {/* Selector de modelos cuando está seleccionado */}
                        {isSelected && (
                          <div className="mt-3 pt-3 border-t border-border-subtle/60 space-y-2" onClick={(e) => e.stopPropagation()}>
                            <label htmlFor={`model-select-${provKey}`} className="block text-xs font-semibold text-text-secondary">
                              Modelo de Visión:
                            </label>
                            <select
                              id={`model-select-${provKey}`}
                              value={formState.model}
                              onChange={(e) => setFormState((prev) => ({ ...prev, model: e.target.value }))}
                              className="w-full rounded-lg border border-border-default bg-surface-1 px-3 py-2 text-xs font-medium text-text-primary focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
                            >
                              {models.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.label} {m.badge ? `[${m.badge}]` : ''}
                                </option>
                              ))}
                            </select>

                            {provKey === 'openrouter' && formState.model === 'custom' && (
                              <input
                                type="text"
                                placeholder="Ej: mistralai/pixtral-12b"
                                value={formState.customModel}
                                onChange={(e) => setFormState((prev) => ({ ...prev, customModel: e.target.value }))}
                                className="w-full mt-1.5 rounded-lg border border-border-default bg-surface-1 px-3 py-2 text-xs font-mono text-text-primary placeholder:text-text-muted focus:border-brand-accent focus:outline-none"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </fieldset>

          {/* Campo de clave API */}
          <div className="space-y-1.5">
            <label htmlFor="api-key" className="block text-xs font-bold uppercase tracking-wider text-text-muted">
              2. Clave API ({PROVIDER_META[formState.provider].name})
            </label>
            <div className="relative">
              <input
                ref={apiKeyInputRef}
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={formState.apiKey}
                onChange={(e) => setFormState((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder={PROVIDER_META[formState.provider].placeholder}
                autoComplete="off"
                aria-describedby={error ? 'settings-error' : 'api-key-hint'}
                className="block w-full min-h-[48px] rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 pr-24 text-sm font-mono text-text-primary placeholder:text-text-muted focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center gap-1.5 px-3 text-xs font-medium text-text-muted hover:text-text-primary rounded-r-xl focus:outline-none"
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
            <p id="api-key-hint" className="text-xs text-text-muted flex items-center gap-1 mt-1">
              <Shield className="h-3.5 w-3.5 text-brand-accent shrink-0" aria-hidden="true" />
              <span>{PROVIDER_META[formState.provider].keyHint}</span>
            </p>
          </div>

          {/* Botones de acción */}
          <div className="pt-2 flex flex-col gap-3 sm:flex-row">
            <MotionButton
              ref={saveButtonRef}
              type="submit"
              disabled={loading}
              buttonProps={{
                className:
                  'flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl bg-brand-cta px-6 py-3 text-sm font-semibold text-white shadow-md shadow-brand-cta/20 hover:bg-brand-cta/90 active:scale-[0.98] transition-all disabled:opacity-50',
              }}
            >
              <Save className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{loading ? 'Guardando...' : 'Guardar Clave y Modelo'}</span>
            </MotionButton>

            {mode === 'byok' && (
              <button
                type="button"
                onClick={handleClear}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-status-critical-border bg-surface-2 px-4 py-3 text-sm font-medium text-status-critical-fg hover:bg-status-critical/10 active:scale-[0.98] transition-all"
              >
                <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Volver a Fallback</span>
              </button>
            )}
          </div>
        </form>

        {/* Sección informativa */}
        <section aria-labelledby="modes-info-title" className="rounded-2xl border border-border-default bg-surface-1 p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-brand-accent shrink-0" aria-hidden="true" />
            <h2 id="modes-info-title" className="text-sm font-semibold text-text-primary">
              Autosostenibilidad y Privacidad
            </h2>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Al configurar tu clave de OpenRouter, Anthropic, Gemini, OpenAI o MiniMax, las peticiones de análisis se realizan directamente desde tu navegador hacia el proveedor usando tus propios créditos, garantizando que el servicio sea ininterrumpido y 100% autosostenible.
          </p>
        </section>
      </div>
    </main>
  );
}
