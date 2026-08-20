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
  Zap,
  Server,
  ShieldCheck,
  Activity,
  Sparkles,
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
    defaultModel: 'gemini-flash-latest',
    models: [
      { id: 'gemini-flash-latest', label: 'gemini-flash-latest (alias estable)', badge: 'Recomendado' },
      { id: 'gemini-3.7-flash', label: 'gemini-3.7-flash', badge: 'Último' },
      { id: 'gemini-3.6-flash', label: 'gemini-3.6-flash', badge: 'Rápido' },
      { id: 'gemini-2.5-flash', label: 'gemini-2.5-flash', badge: 'Estable' },
      { id: 'gemini-2.5-pro', label: 'gemini-2.5-pro', badge: 'Pro' },
      { id: 'gemini-2.5-flash-lite', label: 'gemini-2.5-flash-lite', badge: 'Económico' },
      { id: 'gemini-flash-lite-latest', label: 'gemini-flash-lite-latest', badge: 'Ligero' },
      { id: 'gemini-pro-latest', label: 'gemini-pro-latest', badge: 'Pro estable' },
      { id: 'gemma-4-26b-a4b-it', label: 'gemma-4-26b-a4b-it', badge: 'Open source' },
      { id: 'gemma-4-31b-it', label: 'gemma-4-31b-it', badge: 'Open source' },
    ],
  },
  openrouter: {
    name: 'OpenRouter',
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'Clave que inicia con "sk-or-". Modelos :free no consumen saldo.',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'google/gemma-3-4b-it:free',
    models: [
      { id: 'google/gemma-3-4b-it:free', label: 'google/gemma-3-4b-it:free', badge: 'Gratis · Vision' },
      { id: 'google/gemma-3-12b-it:free', label: 'google/gemma-3-12b-it:free', badge: 'Gratis · Vision' },
      { id: 'google/gemma-3-27b-it:free', label: 'google/gemma-3-27b-it:free', badge: 'Gratis · Vision' },
      { id: 'qwen/qwen2.5-vl-72b-instruct', label: 'qwen/qwen2.5-vl-72b-instruct', badge: 'Vision' },
      { id: 'meta-llama/llama-4-maverick', label: 'meta-llama/llama-4-maverick', badge: 'Multimodal' },
      { id: 'meta-llama/llama-4-scout', label: 'meta-llama/llama-4-scout', badge: 'Multimodal' },
      { id: 'mistralai/mistral-small-3.1-24b-instruct', label: 'mistralai/mistral-small-3.1-24b-instruct', badge: 'Multimodal' },
      { id: 'amazon/nova-lite-v1', label: 'amazon/nova-lite-v1', badge: 'Vision' },
      { id: 'minimax/minimax-01', label: 'minimax/minimax-01 (Texto + VL-01)', badge: 'Vision' },
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
  const [isFallbackRedirect, setIsFallbackRedirect] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reason') === 'fallback_failed') {
        setIsFallbackRedirect(true);
        setActiveTab('byok');
      }
    }
  }, []);
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
    <main className="w-full max-w-xl mx-auto px-3 sm:px-6 py-4 text-text-primary overflow-x-hidden space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
          Configuración de IA
        </h1>
        <p className="text-xs sm:text-sm text-text-secondary">
          Administra los proveedores de visión para triaje de grietas sísmicas.
        </p>
      </header>

      {/* Banner de redirección cuando fallan los proveedores compartidos */}
      {isFallbackRedirect && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 sm:p-5 text-amber-950 shadow-md">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900 font-bold">
              <Key className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-amber-950">
                Conecta tu propia clave de IA para continuar sin límites
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-amber-900 leading-relaxed">
                Los servidores compartidos alcanzaron su límite de cuota o no respondieron. Ingresa una clave API gratuita (ej. <strong>Google Gemini</strong> o <strong>OpenRouter</strong>) para que tus fotos se analicen directamente desde tu navegador con máxima velocidad.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Selector de modo principal estilo OpenDesign */}
      <div className="flex rounded-xl bg-surface-1 p-1.5 border border-border-default shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('fallback')}
          className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 ${
            activeTab === 'fallback' && !configuredProvider
              ? 'bg-brand-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Servidor / Emergencia
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('byok')}
          className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 ${
            activeTab === 'byok' || configuredProvider
              ? 'bg-brand-accent text-white shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          BYOK (Clave Propia)
        </button>
      </div>

        {/* Estado del servidor y modelos de emergencia (solo cuando NO hay BYOK configurado y se está en modo servidor) */}
        {activeTab === 'fallback' && !configuredProvider && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-text-primary">
                  Modelos de Emergencia del Servidor (Gratuitos &amp; Sin Clave)
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Disponibilidad garantizada y conmutación automática de tres capas
                </p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-status-minor/20 text-status-minor-fg border border-status-minor-border/40 shrink-0">
                Activo
              </span>
            </div>

            {/* Tarjetas de los 3 niveles de emergencia */}
            <div className="grid gap-3">
              {/* 1. NVIDIA NIM (Primario) */}
              <div className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-brand-accent/15 flex items-center justify-center text-brand-accent shrink-0">
                      <Zap className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-text-primary">
                          NVIDIA NIM (MiniMax M3 Vision)
                        </p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-accent/20 text-brand-accent border border-brand-accent/30">
                          Principal
                        </span>
                      </div>
                      <p className="text-xs font-mono text-text-muted mt-0.5">
                        minimaxai/minimax-m3 · Servidor principal ultrarrápido
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Servidor principal ultrarrápido para análisis visual y clasificación de patrones sísmicos. Se utiliza por defecto en todos los análisis mientras haya conexión.
                </p>
              </div>

              {/* 2. OpenRouter (Secundario) */}
              <div className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-brand-accent/10 flex items-center justify-center text-brand-accent shrink-0">
                      <Server className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-text-primary">
                          OpenRouter (Gemma 3 Vision Free)
                        </p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-3 text-text-secondary border border-border-default">
                          Fallback 1
                        </span>
                      </div>
                      <p className="text-xs font-mono text-text-muted mt-0.5">
                        google/gemma-3-4b-it:free · Visión comunitaria
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Fallback secundario sin costo. Se activa automáticamente si el servidor principal experimenta sobrecarga, alta latencia o agotamiento de cuota.
                </p>
              </div>

              {/* 3. Motor Heurístico Offline (NSR-10) */}
              <div className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-red-100 flex items-center justify-center text-red-800 shrink-0">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-text-primary">
                          Motor Heurístico de Emergencia (Offline / NSR-10)
                        </p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-950 border border-red-300">
                          Local Offline
                        </span>
                      </div>
                      <p className="text-xs font-mono text-text-muted mt-0.5">
                        Matriz FEMA 306 / NSR-10 · 100% en dispositivo
                      </p>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Modo de supervivencia local sin conexión. Si se cae la red celular o los servidores fallan, la app ejecuta un triaje pericial determinista inmediato protegiendo la vida del ciudadano.
                </p>
              </div>
            </div>

            {/* Explicación de conmutación */}
            <div className="rounded-xl border border-border-subtle bg-surface-2/60 p-3.5 text-xs text-text-secondary leading-relaxed flex items-start gap-2.5">
              <Sparkles className="h-4 w-4 text-brand-accent shrink-0 mt-0.5" />
              <span>
                <strong>Conmutación inteligente:</strong> Si estás online, el análisis se procesa con NVIDIA NIM. Si falla, pasa a OpenRouter. Si no hay internet o ambos fallan, el motor offline genera el triaje al instante en tu teléfono.
              </span>
            </div>
          </section>
        )}

        {/* SECCIÓN BYOK — Solo visible cuando el usuario está en modo BYOK */}
        {(activeTab === 'byok' || configuredProvider) && (
          <>
            {/* Pastillas de selección de proveedores (Pills) */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-text-muted">
                Selecciona Proveedor
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
                <h2 className="text-base font-semibold text-text-primary">
                  {currentMeta.name}
                </h2>
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
                    className="flex items-start gap-2.5 rounded-xl border border-red-300 bg-red-50 p-3.5 text-xs sm:text-sm text-red-950 font-medium shadow-sm"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-700" />
                    <span className="flex-1">{error}</span>
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
                    className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs sm:text-sm text-emerald-950 font-medium shadow-sm"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-700" />
                    <span className="flex-1">{success}</span>
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
                    className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-status-critical-border bg-surface-2 px-4 py-3 text-sm font-medium text-status-critical-border hover:bg-status-critical/10 active:scale-[0.98] transition-all"
                  >
                    <Trash2 className="h-4 w-4 shrink-0" />
                    <span>Restablecer Servidor</span>
                  </button>
                )}
              </div>
            </form>
          </>
        )}

        {/* Mini tutorial interactivo — siempre visible, aplica a ambos modos */}
        <ApiKeyGuide />
    </main>
  );
}
