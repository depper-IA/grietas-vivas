'use client';

/**
 * ByokConfigForm — Formulario completo de configuración BYOK.
 *
 * Encapsula:
 *   - Selector de proveedor (pills + dropdown espejo)
 *   - Inputs de API key (con show/hide), base URL, max tokens, modelo
 *   - Selector de modelo custom
 *   - Botones Guardar / Restablecer (clear)
 *   - Alertas de feedback (error / success)
 *
 * Estado interno: el formulario gestiona su propio state. El padre solo
 * recibe `onConfigured(provider, model)` cuando el guardado tiene exito,
 * y un boton "Restablecer Servidor" aparece cuando `configuredProvider`
 * esta definido.
 *
 * Extraido de `settings/page.tsx` (sdd/improve-project 2.2).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  storeEncryptedByokConfig,
  clearStoredKey,
} from '@/lib/crypto/byokEncryption';
import { createBrowserSupabaseClient } from '@/lib/db/supabase';
import { PROVIDER_METADATA, PROVIDER_ORDER } from '@/lib/ai/providers/config';
import type { AIProvider } from '@/lib/ai/types';
import { MotionButton } from '@/components/ui/MotionButton';
import {
  Eye,
  EyeOff,
  Save,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ByokConfigFormProps {
  /** Provider actualmente configurado (para mostrar el placeholder y el boton de clear). */
  configuredProvider: AIProvider | null;
  /** Modelo actualmente configurado (para re-sincronizar el state). */
  configuredModel: string | null;
  /** Callback cuando el usuario guarda exitosamente. */
  onConfigured: (provider: AIProvider, model: string) => void;
  /** Callback cuando el usuario borra la clave configurada. */
  onClear: () => void;
  /** Provider inicial (util cuando se carga de una clave existente). */
  initialProvider?: AIProvider | null;
  /** Base URL inicial (util cuando se carga de una clave existente). */
  initialBaseUrl?: string | null;
  /** Max tokens inicial. */
  initialMaxTokens?: number | null;
}

export function ByokConfigForm({
  configuredProvider,
  configuredModel,
  onConfigured,
  onClear,
  initialProvider,
  initialBaseUrl,
  initialMaxTokens,
}: ByokConfigFormProps) {
  const supabase = createBrowserSupabaseClient();

  const [selectedProvider, setSelectedProvider] = useState<AIProvider>(
    initialProvider ?? configuredProvider ?? 'gemini',
  );
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(
    initialBaseUrl ?? PROVIDER_METADATA[initialProvider ?? configuredProvider ?? 'gemini'].defaultBaseUrl,
  );
  const [model, setModel] = useState(
    configuredModel ?? PROVIDER_METADATA[initialProvider ?? configuredProvider ?? 'gemini'].defaultModel,
  );
  const [customModel, setCustomModel] = useState('');
  const [maxTokens, setMaxTokens] = useState(
    initialMaxTokens ? String(initialMaxTokens) : '2048',
  );

  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);

  const handleSelectProvider = useCallback((prov: AIProvider) => {
    setSelectedProvider(prov);
    const meta = PROVIDER_METADATA[prov];
    setBaseUrl(meta.defaultBaseUrl);
    setModel(meta.defaultModel);
    setCustomModel('');
    setError(null);
  }, []);

  const handleResetBaseUrl = useCallback(() => {
    setBaseUrl(PROVIDER_METADATA[selectedProvider].defaultBaseUrl);
  }, [selectedProvider]);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
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

        const effectiveModel =
          model === 'custom'
            ? customModel.trim() || PROVIDER_METADATA[selectedProvider].defaultModel
            : model || PROVIDER_METADATA[selectedProvider].defaultModel;

        const parsedMaxTokens = parseInt(maxTokens, 10);
        const effectiveMaxTokens =
          !isNaN(parsedMaxTokens) && parsedMaxTokens > 0 ? parsedMaxTokens : 2048;

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
          session.access_token,
        );

        setApiKey('');
        setSuccess(
          `Clave de ${PROVIDER_METADATA[selectedProvider].name} guardada correctamente (${effectiveModel}).`,
        );
        onConfigured(selectedProvider, effectiveModel);
        saveButtonRef.current?.focus();
      } catch {
        setError('Error al cifrar y guardar la configuración.');
      } finally {
        setLoading(false);
      }
    },
    [
      apiKey,
      selectedProvider,
      model,
      customModel,
      baseUrl,
      maxTokens,
      supabase.auth,
      onConfigured,
    ],
  );

  const handleClear = useCallback(() => {
    clearStoredKey();
    setSuccess(
      'Clave eliminada. Se usará el modelo predeterminado del servidor (NVIDIA MiniMax M3).',
    );
    onClear();
  }, [onClear]);

  // Si cambia el provider inicial tras carga async, sincroniza el state.
  useEffect(() => {
    if (initialProvider) {
      setSelectedProvider(initialProvider);
      setBaseUrl(
        initialBaseUrl ?? PROVIDER_METADATA[initialProvider].defaultBaseUrl,
      );
      setModel(
        configuredModel ?? PROVIDER_METADATA[initialProvider].defaultModel,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProvider]);

  const currentMeta = PROVIDER_METADATA[selectedProvider];

  return (
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
      <form
        onSubmit={handleSave}
        className="rounded-2xl border border-border-default bg-surface-1 p-5 sm:p-6 shadow-sm space-y-5"
        noValidate
      >
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
              placeholder={
                configuredProvider === selectedProvider
                  ? '••••••••••••••••••••••••'
                  : 'Ingresa tu API Key...'
              }
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
            buttonRef={saveButtonRef}
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
  );
}
