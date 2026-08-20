'use client';

/**
 * Settings Page — Orquestador (~120 LOC).
 *
 * Tras sdd/improve-project 2.4 la página delega la UI a componentes
 * enfocados:
 *   - `<FallbackStatusSection />` — tarjetas de los 3 modos servidor
 *   - `<ByokConfigForm />` — formulario BYOK completo
 *   - `<ApiKeyGuide />` — mini tutorial siempre visible
 *
 * Esta página solo mantiene:
 *   - El state de la pestaña activa (fallback vs byok)
 *   - La lectura inicial de la clave persistida
 *   - El banner de redirección cuando llegan por `?reason=fallback_failed`
 */

import { useEffect, useState } from 'react';
import { Key } from 'lucide-react';
import type { AIProvider } from '@/lib/ai/types';
import { FallbackStatusSection } from '@/components/settings/FallbackStatusSection';
import { ByokConfigForm } from '@/components/settings/ByokConfigForm';
import { ApiKeyGuide } from '@/components/settings/ApiKeyGuide';
import { loadByokConfig } from '@/app/actions/byokSettings';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'fallback' | 'byok'>('fallback');
  const [isFallbackRedirect, setIsFallbackRedirect] = useState(false);
  const [configuredProvider, setConfiguredProvider] = useState<AIProvider | null>(null);
  const [configuredModel, setConfiguredModel] = useState<string | null>(null);
  const [initialProvider, setInitialProvider] = useState<AIProvider | null>(null);
  const [initialBaseUrl, setInitialBaseUrl] = useState<string | null>(null);
  const [initialMaxTokens, setInitialMaxTokens] = useState<number | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reason') === 'fallback_failed') {
        setIsFallbackRedirect(true);
        setActiveTab('byok');
      }
    }
  }, []);

  useEffect(() => {
    async function loadKeyStatus() {
      try {
        const result = await loadByokConfig();
        if (result.success && result.config) {
          const prov = result.config.provider as AIProvider;
          setActiveTab('byok');
          setConfiguredProvider(prov);
          setConfiguredModel(result.config.model ?? null);
          setInitialProvider(prov);
          setInitialBaseUrl(result.config.baseUrl ?? null);
          setInitialMaxTokens(result.config.maxTokens ?? null);
        }
      } catch {
        // No config stored or error — stay on fallback tab
      } finally {
        setInitializing(false);
      }
    }
    void loadKeyStatus();
  }, []);

  if (initializing) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-surface-0 px-4">
        <p className="text-sm font-medium text-text-muted">Cargando configuración...</p>
      </main>
    );
  }

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

      {activeTab === 'fallback' && !configuredProvider && <FallbackStatusSection />}

      {(activeTab === 'byok' || configuredProvider) && (
        <ByokConfigForm
          configuredProvider={configuredProvider}
          configuredModel={configuredModel}
          initialProvider={initialProvider}
          initialBaseUrl={initialBaseUrl}
          initialMaxTokens={initialMaxTokens}
          onConfigured={(provider, model) => {
            setConfiguredProvider(provider);
            setConfiguredModel(model);
            setActiveTab('byok');
          }}
          onClear={() => {
            setConfiguredProvider(null);
            setConfiguredModel(null);
            setInitialProvider(null);
            setInitialBaseUrl(null);
            setInitialMaxTokens(null);
            setActiveTab('fallback');
          }}
        />
      )}

      <ApiKeyGuide />
    </main>
  );
}
