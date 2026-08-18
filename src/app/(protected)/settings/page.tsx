'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import {
  storeEncryptedByokConfig,
  retrieveEncryptedByokConfig,
  clearStoredKey,
  hasStoredKey,
} from '@/lib/crypto/byokEncryption';
import type { AIConfig, AIProvider } from '@/lib/ai/types';
import {
  Shield,
  Key,
  Eye,
  EyeOff,
  Save,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Cpu,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { MotionButton } from '@/components/ui/MotionButton';
import { motion, AnimatePresence } from 'framer-motion';
import { ApiKeyGuide } from '@/components/settings/ApiKeyGuide';

interface ModelOption {
  id: string;
  label: string;
  badge?: string;
}

const PROVIDER_METADATA: Record<
  AIProvider,
  {
    name: string;
    keyUrl: string;
    keyHint: string;
    defaultBaseUrl: string;
    defaultModel: string;
    models: ModelOption[];
  }
> = {
  gemini: {
    name: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    keyHint: 'Clave que inicia con "AIza". Nivel gratuito disponible en Google AI Studio.',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.0-flash',
    models: [
      { id: 'gemini-2.0-flash', label: 'gemini-2.0-flash', badge: 'Recomendado' },
      { id: 'gemini-2.0-flash-lite', label: 'gemini-2.0-flash-lite', badge: 'Económico' },
      { id: 'gemini-1.5-pro', label: 'gemini-1.5-pro', badge: 'Contexto Largo' },
      { id: 'gemini-1.5-flash', label: 'gemini-1.5-flash', badge: 'Estable' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'Clave que inicia con "sk-or-". Modelos :free no consumen saldo.',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'nvidia/nemotron-nano-12b-v2-vl:free',
    models: [
      { id: 'nvidia/nemotron-nano-12b-v2-vl:free', label: 'nvidia/nemotron-nano-12b-v2-vl:free', badge: 'Gratis' },
      { id: 'qwen/qwen-2.5-vl-72b-instruct:free', label: 'qwen/qwen-2.5-vl-72b-instruct:free', badge: 'Gratis' },
      { id: 'google/gemma-4-26b-a4b-it:free', label: 'google/gemma-4-26b-a4b-it:free', badge: 'Gratis' },
      { id: 'meta-llama/llama-3.2-11b-vision-instruct:free', label: 'meta-llama/llama-3.2-11b-vision-instruct:free', badge: 'Gratis' },
      { id: 'meta-llama/llama-3.2-90b-vision-instruct:free', label: 'meta-llama/llama-3.2-90b-vision-instruct:free', badge: 'Gratis' },
      { id: 'mistralai/pixtral-12b:free', label: 'mistralai/pixtral-12b:free', badge: 'Gratis' },
      { id: 'custom', label: 'Otro modelo personalizado...', badge: 'Personalizado' },
    ],
  },
minimax: {
    name: 'MiniMax',
    keyUrl: 'https://platform.minimax.io/',
    keyHint: 'Token Plan Global en platform.minimax.io (modelo: MiniMax-M3 con visión).',
    defaultBaseUrl: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M3',
    models: [
      { id: 'MiniMax-M3', label: 'MiniMax-M3 (Visión + Texto)', badge: 'Único multimodal' },
    ],
  },
  'nvidia-nim': {
    name: 'NVIDIA NIM',
    keyUrl: 'https://build.nvidia.com/',
    keyHint: 'Clave que inicia con "nvapi-". Incluye 1,000 créditos gratis de bienvenida.',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'minimaxai/minimax-m3',
    models: [
      { id: 'minimaxai/minimax-m3', label: 'minimaxai/minimax-m3', badge: 'Default Server' },
      { id: 'meta/llama-3.2-11b-vision-instruct', label: 'meta/llama-3.2-11b-vision-instruct', badge: 'Vision' },
    ],
  },
  anthropic: {
    name: 'Anthropic',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'Clave que inicia con "sk-ant-". Para visión forense detallada.',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-7-sonnet-20250219',
    models: [
      { id: 'claude-3-7-sonnet-20250219', label: 'claude-3-7-sonnet-20250219', badge: 'Recomendado' },
      { id: 'claude-3-5-sonnet-20241022', label: 'claude-3-5-sonnet-20241022', badge: 'Forense' },
      { id: 'claude-3-5-haiku-20241022', label: 'claude-3-5-haiku-20241022', badge: 'Rápido' },
      { id: 'claude-3-opus-20240229', label: 'claude-3-opus-20240229', badge: 'Razonamiento' },
    ],
  },
  openai: {
    name: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'Clave que inicia con "sk-". Requiere saldo prepago en OpenAI Platform.',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', label: 'gpt-4o', badge: 'Recomendado' },
      { id: 'gpt-4o-mini', label: 'gpt-4o-mini', badge: 'Económico' },
      { id: 'gpt-4-turbo', label: 'gpt-4-turbo', badge: 'Forense' },
      { id: 'o1', label: 'o1', badge: 'Razonamiento' },
    ],
  },
  custom: {
    name: 'Proveedor personalizado',
    keyUrl: '',
    keyHint: 'Cualquier endpoint compatible con la API de OpenAI o proxy local.',
    defaultBaseUrl: 'http://localhost:11434/v1',
    defaultModel: 'default-vision',
    models: [
      { id: 'default-vision', label: 'Modelo por defecto', badge: 'Auto' },
      { id: 'custom', label: 'Especificar modelo personalizado...', badge: 'Manual' },
    ],
  },
};

const PROVIDER_ORDER: AIProvider[] = [
  'gemini',
  'openrouter',
  'minimax',
  'nvidia-nim',
  'anthropic',
  'openai',
  'custom',
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'fallback' | 'byok'>('fallback');
  const [configuredProvider, setConfiguredProvider] = useState<AIProvider | null>(null);
  const [configuredModel, setConfiguredModel] = useState<string | null>(null);

  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(PROVIDER_METADATA.gemini.defaultBaseUrl);
  const [model, setModel] = useState(PROVIDER_METADATA.gemini.defaultModel);
  const [customModel, setCustomModel] = useState('');
  const [maxTokens, setMaxTokens] = useState('2048');

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
              setActiveTab('byok');
              const prov = byokConfig.provider as AIProvider;
              const meta = PROVIDER_METADATA[prov] || PROVIDER_METADATA.gemini;
              setConfiguredProvider(prov);
              setConfiguredModel(byokConfig.model || meta.defaultModel);
              setSelectedProvider(prov);
              setBaseUrl(byokConfig.baseUrl || meta.defaultBaseUrl);
              const knownModel = meta.models.some((m) => m.id === byokConfig.model);
              if (knownModel) {
                setModel(byokConfig.model || meta.defaultModel);
                setCustomModel('');
              } else {
                setModel('custom');
                setCustomModel(byokConfig.model || '');
              }
              if (byokConfig.maxTokens) {
                setMaxTokens(String(byokConfig.maxTokens));
              }
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

  const handleSelectProvider = (prov: AIProvider) => {
    setSelectedProvider(prov);
    const meta = PROVIDER_METADATA[prov];
    setBaseUrl(meta.defaultBaseUrl);
    setModel(meta.defaultModel);
    setCustomModel('');
    setError(null);
  };

  const handleResetBaseUrl = () => {
    setBaseUrl(PROVIDER_METADATA[selectedProvider].defaultBaseUrl);
  };

  const handleSave = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (!apiKey.trim()) {
        setError('Por favor ingresa tu clave API.');
        setLoading(false);
        apiKeyInputRef.current?.focus();
        return;
      }

      const effectiveModel = model === 'custom'
        ? (customModel.trim() || PROVIDER_METADATA[selectedProvider].defaultModel)
        : (model || PROVIDER_METADATA[selectedProvider].defaultModel);

      const parsedMaxTokens = parseInt(maxTokens, 10);
      const effectiveMaxTokens = !isNaN(parsedMaxTokens) && parsedMaxTokens > 0 ? parsedMaxTokens : 2048;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('No hay sesión activa. Inicia sesión nuevamente.');
        setLoading(false);
        return;
      }

      await storeEncryptedByokConfig(
        {
          apiKey: apiKey.trim(),
          provider: selectedProvider,
          model: effectiveModel,
          baseUrl: baseUrl.trim() || undefined,
          maxTokens: effectiveMaxTokens,
        },
        session.access_token
      );

      setActiveTab('byok');
      setConfiguredProvider(selectedProvider);
      setConfiguredModel(effectiveModel);
      setApiKey('');
      setSuccess(`Clave de ${PROVIDER_METADATA[selectedProvider].name} guardada correctamente (${effectiveModel}).`);
      saveButtonRef.current?.focus();
    } catch {
      setError('Error al cifrar y guardar la configuración.');
    } finally {
      setLoading(false);
    }
  }, [apiKey, selectedProvider, model, customModel, baseUrl, maxTokens, supabase.auth]);

  const handleClear = useCallback(() => {
    clearStoredKey();
    setActiveTab('fallback');
    setConfiguredProvider(null);
    setConfiguredModel(null);
    setApiKey('');
    setError(null);
    setSuccess('Clave eliminada. Se usará el modelo predeterminado del servidor (NVIDIA MiniMax M3).');
  }, []);

  if (initializing) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-surface-0 px-4">
        <p className="text-sm font-medium text-text-muted">Cargando configuración...</p>
      </main>
    );
  }

  const currentMeta = PROVIDER_METADATA[selectedProvider];

  return (
    <main className="min-h-[100dvh] bg-surface-0 px-4 py-8 sm:px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[calc(5rem+env(safe-area-inset-bottom))] text-text-primary overflow-x-hidden">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            Configuración de IA
          </h1>
          <p className="text-sm text-text-secondary">
            Administra los proveedores de visión para triaje de grietas sísmicas.
          </p>
        </header>

        {/* Selector de modo principal estilo OpenDesign */}
        <div className="flex rounded-xl bg-surface-1 p-1.5 border border-border-default shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('fallback')}
            className={`flex-1 py-2.5 px-4 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 ${
              activeTab === 'fallback' && !configuredProvider
                ? 'bg-surface-3 text-text-primary shadow-sm border border-border-strong'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Servidor (NVIDIA MiniMax M3)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('byok')}
            className={`flex-1 py-2.5 px-4 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 ${
              activeTab === 'byok' || configuredProvider
                ? 'bg-brand-accent text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            BYOK (Clave Propia)
          </button>
        </div>

        {/* Estado del servidor */}
        {activeTab === 'fallback' && !configuredProvider && (
          <section className="rounded-2xl border border-border-default bg-surface-1 p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-brand-accent/10 flex items-center justify-center text-brand-accent shrink-0">
                <Cpu className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary">
                  Motor de IA Predeterminado del Servidor
                </p>
                <p className="text-xs text-text-muted mt-0.5">
                  NVIDIA NIM — Modelo: <span className="font-mono text-text-primary font-semibold">minimaxai/minimax-m3</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-text-secondary leading-relaxed pt-2 border-t border-border-subtle">
              Los análisis usan los recursos y cuotas compartidas del servidor. Para análisis ilimitados y autosostenibilidad, activa el modo BYOK e ingresa tu propia clave de Google Gemini (gratis), OpenRouter, MiniMax, NVIDIA o OpenAI.
            </p>
          </section>
        )}

        {/* Pastillas de selección de proveedores (Pills) */}
        <div className="space-y-2">
          <label className="block text-xs font-bold uppercase tracking-wider text-text-muted">
            Selecciona Gateway / Proveedor
          </label>
          <div className="flex flex-wrap gap-2">
            {PROVIDER_ORDER.map((provKey) => {
              const meta = PROVIDER_METADATA[provKey];
              const isSelected = selectedProvider === provKey;

              return (
                <button
                  key={provKey}
                  type="button"
                  onClick={() => handleSelectProvider(provKey)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-medium border transition-all duration-150 ${
                    isSelected
                      ? 'bg-brand-accent text-white border-brand-accent shadow-sm'
                      : 'bg-surface-1 text-text-secondary border-border-default hover:bg-surface-2 hover:text-text-primary'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isSelected ? 'bg-white' : 'bg-text-muted'
                    }`}
                  />
                  <span>{meta.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tarjeta de configuración del proveedor activo */}
        <form onSubmit={handleSave} className="rounded-2xl border border-border-default bg-surface-1 p-5 sm:p-6 shadow-sm space-y-5" noValidate>
          {/* Header de la tarjeta */}
          <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text-primary">
                {currentMeta.name}
              </h2>
            </div>
            {currentMeta.keyUrl && (
              <a
                href={currentMeta.keyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-accent hover:underline"
              >
                <span>Obtener clave</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          {/* Banner informativo de privacidad */}
          <div className="rounded-xl border border-status-info-border/50 bg-surface-2/60 p-3 text-xs text-text-secondary leading-relaxed">
            Esta configuración se almacena cifrada en este navegador (AES-256-GCM) y se envía directamente al proveedor sin pasar por el servidor.
          </div>

          {/* Feedback alertas */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                role="alert"
                aria-live="assertive"
                className="flex items-start gap-2.5 rounded-xl border border-status-critical-border bg-status-critical/15 p-3.5 text-xs sm:text-sm text-status-critical-fg"
              >
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="flex-1 font-medium">{error}</span>
              </motion.div>
            )}
            {success && (
              <motion.div
                key="success"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                role="status"
                aria-live="polite"
                className="flex items-start gap-2.5 rounded-xl border border-status-minor-border bg-status-minor/15 p-3.5 text-xs sm:text-sm text-status-minor-fg"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="flex-1 font-medium">{success}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Preajuste de gateway */}
          <div className="space-y-1.5">
            <label htmlFor="gateway-preset" className="block text-xs font-semibold text-text-primary">
              Preajuste de gateway
            </label>
            <select
              id="gateway-preset"
              value={selectedProvider}
              onChange={(e) => handleSelectProvider(e.target.value as AIProvider)}
              className="w-full rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            >
              {PROVIDER_ORDER.map((provKey) => (
                <option key={provKey} value={provKey}>
                  {PROVIDER_METADATA[provKey].name}
                </option>
              ))}
            </select>
          </div>

          {/* Clave de API */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="api-key" className="block text-xs font-semibold text-text-primary">
                Clave de API *
              </label>
            </div>
            <div className="relative">
              <input
                ref={apiKeyInputRef}
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={configuredProvider === selectedProvider ? '••••••••••••••••••••••••' : 'Ingresa tu API Key...'}
                autoComplete="off"
                className="block w-full min-h-[46px] rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 pr-20 text-sm font-mono text-text-primary placeholder:text-text-muted focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
              <button
                type="button"
                onClick={() => setShowKey((prev) => !prev)}
                className="absolute inset-y-0 right-0 flex items-center gap-1 px-3 text-xs font-medium text-text-muted hover:text-text-primary rounded-r-xl"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span>{showKey ? 'Ocultar' : 'Mostrar'}</span>
              </button>
            </div>
            <p className="text-[11px] text-text-muted">{currentMeta.keyHint}</p>
          </div>

          {/* URL base */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="base-url" className="block text-xs font-semibold text-text-primary">
                URL base *
              </label>
              {baseUrl !== currentMeta.defaultBaseUrl && (
                <button
                  type="button"
                  onClick={handleResetBaseUrl}
                  className="inline-flex items-center gap-1 text-[11px] text-brand-accent hover:underline"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Restablecer</span>
                </button>
              )}
            </div>
            <input
              id="base-url"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="block w-full min-h-[44px] rounded-xl border border-border-default bg-surface-2 px-3.5 py-2 text-xs sm:text-sm font-mono text-text-primary focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </div>

          {/* Tokens máx. */}
          <div className="space-y-1.5">
            <label htmlFor="max-tokens" className="block text-xs font-semibold text-text-primary">
              Tokens máx. (opcional)
            </label>
            <input
              id="max-tokens"
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              placeholder="2048"
              className="block w-full min-h-[44px] rounded-xl border border-border-default bg-surface-2 px-3.5 py-2 text-xs sm:text-sm font-mono text-text-primary focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            />
          </div>

          {/* Modelo */}
          <div className="space-y-1.5">
            <label htmlFor="model-select" className="block text-xs font-semibold text-text-primary">
              Modelo *
            </label>
            <select
              id="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 text-xs sm:text-sm text-text-primary focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
            >
              {currentMeta.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} {m.badge ? `[${m.badge}]` : ''}
                </option>
              ))}
            </select>

            {model === 'custom' && (
              <input
                type="text"
                placeholder="Ingresa el ID del modelo (ej. mistralai/pixtral-12b)"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                className="w-full mt-2 rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 text-xs font-mono text-text-primary placeholder:text-text-muted focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent"
              />
            )}
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
              <Save className="h-4 w-4 shrink-0" />
              <span>{loading ? 'Guardando...' : 'Guardar Configuración'}</span>
            </MotionButton>

            {configuredProvider && (
              <button
                type="button"
                onClick={handleClear}
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-status-critical-border bg-surface-2 px-4 py-3 text-sm font-medium text-status-critical-fg hover:bg-status-critical/10 active:scale-[0.98] transition-all"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                <span>Restablecer Servidor</span>
              </button>
            )}
          </div>
        </form>

        {/* Mini tutorial interactivo */}
        <ApiKeyGuide />
      </div>
    </main>
  );
}
