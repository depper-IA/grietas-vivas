'use client';

import { useState } from 'react';
import {
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Key,
} from 'lucide-react';

interface GuideItem {
  id: string;
  providerName: string;
  costLabel: string;
  isFreeTier: boolean;
  url: string;
  steps: string[];
  tips: string;
}

const GUIDES: GuideItem[] = [
  {
    id: 'gemini',
    providerName: 'Google Gemini (Recomendado Gratuito)',
    costLabel: 'Gratis con cuota generosa',
    isFreeTier: true,
    url: 'https://aistudio.google.com/app/apikey',
    steps: [
      'Ingresa a aistudio.google.com con tu cuenta de Google.',
      'Haz clic en el botón azul "Get API key" o "Create API key".',
      'Selecciona o crea un proyecto de Google Cloud rápido.',
      'Copia la clave que empieza por "AIza..." y pégala en esta aplicación.',
    ],
    tips: 'Gemini 2.0 Flash ofrece análisis visual ultra rápido sin costo alguno para uso regular.',
  },
  {
    id: 'openrouter',
    providerName: 'OpenRouter (Modelos Gratuitos y Multiprovision)',
    costLabel: 'Modelos :free disponibles',
    isFreeTier: true,
    url: 'https://openrouter.ai/keys',
    steps: [
      'Crea una cuenta en openrouter.ai (con Google o GitHub).',
      'Ve a la sección "Keys" en el menú o ingresa a openrouter.ai/keys.',
      'Haz clic en "Create Key", asígnale un nombre (ej. "SafeSpace").',
      'Copia la clave ("sk-or-...") y pégala en el campo de clave API.',
    ],
    tips: 'Puedes seleccionar modelos con terminación ":free" (como Qwen 2.5 VL o Llama 3.2 Vision) para no consumir saldo.',
  },
  {
    id: 'minimax',
    providerName: 'MiniMax (Token Plan Internacional)',
    costLabel: 'Créditos iniciales / Pago por uso',
    isFreeTier: false,
    url: 'https://platform.minimax.io/',
    steps: [
      'Regístrate en platform.minimax.io (Plataforma Global).',
      'Dirígete a "API Keys" o "Token Plan" en tu panel de control.',
      'Genera una nueva API Key y copia el token.',
      'Pégala en SafeSpace con el modelo "MiniMax-M3" (recomendado para visión).',
    ],
    tips: 'Para la plataforma global usa https://api.minimax.io/v1 como URL base.',
  },
  {
    id: 'nvidia',
    providerName: 'NVIDIA NIM (Créditos de Desarrollador)',
    costLabel: '1000 créditos gratis al registrarte',
    isFreeTier: true,
    url: 'https://build.nvidia.com/',
    steps: [
      'Entra a build.nvidia.com y crea tu cuenta gratuita de NVIDIA Developer.',
      'Busca el modelo "MiniMax M3" o "Llama 3.2 Vision".',
      'Haz clic en "Get API Key" para generar tu clave ("nvapi-...").',
      'Pégala en el apartado NVIDIA NIM de SafeSpace.',
    ],
    tips: 'NVIDIA otorga 1,000 créditos gratuitos que alcanzan para cientos de análisis visuales.',
  },
  {
    id: 'openai',
    providerName: 'OpenAI',
    costLabel: 'Pago por uso (saldo prepago)',
    isFreeTier: false,
    url: 'https://platform.openai.com/api-keys',
    steps: [
      'Ingresa a platform.openai.com y crea una cuenta con saldo prepago.',
      'Ve a "API Keys" y haz clic en "Create new secret key".',
      'Copia la clave ("sk-...") y pégala en SafeSpace.',
    ],
    tips: 'Requiere recargar saldo mínimo (~$5 USD) en OpenAI Platform para activar las llamadas a la API.',
  },
  {
    id: 'anthropic',
    providerName: 'Anthropic Claude',
    costLabel: 'Pago por uso (Consola Desarrollador)',
    isFreeTier: false,
    url: 'https://console.anthropic.com/settings/keys',
    steps: [
      'Entra a console.anthropic.com y crea tu cuenta.',
      'Ve a "Settings" -> "API Keys" y pulsa "Create Key".',
      'Copia tu clave ("sk-ant-...") e ingrésala en SafeSpace.',
    ],
    tips: 'Claude 3.7 Sonnet es el modelo más preciso para evaluación técnica y grietas complejas.',
  },
];

export function ApiKeyGuide() {
  const [openItem, setOpenItem] = useState<string | null>(null);

  const toggleItem = (id: string) => {
    setOpenItem((prev) => (prev === id ? null : id));
  };

  return (
    <div className="rounded-2xl border border-border-default bg-surface-1 p-5 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-brand-accent/10 flex items-center justify-center shrink-0 text-brand-accent">
          <HelpCircle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-text-primary">
            Guía: Cómo Obtener Claves API
          </h2>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
            Si los créditos predeterminados del servidor se agotan, conecta tu propia clave en menos de 2 minutos para seguir utilizando la aplicación de forma continua.
          </p>
        </div>
      </div>

      {/* Acordeón de proveedores */}
      <div className="space-y-2 pt-1">
        {GUIDES.map((item) => {
          const isOpen = openItem === item.id;

          return (
            <div
              key={item.id}
              className="rounded-xl border border-border-default bg-surface-2/40 overflow-hidden transition-all duration-150"
            >
              <button
                type="button"
                onClick={() => toggleItem(item.id)}
                className="w-full flex items-center justify-between p-3.5 text-left hover:bg-surface-2 focus:outline-none"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Key className="h-4 w-4 text-brand-accent shrink-0" />
                  <span className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                    {item.providerName}
                  </span>
                  {item.isFreeTier && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-status-minor/20 text-status-minor-fg shrink-0">
                      Gratis
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-text-muted hidden sm:inline">
                    {item.costLabel}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4 text-text-muted" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-text-muted" />
                  )}
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 pt-1 border-t border-border-subtle space-y-3">
                  <ol className="space-y-2 text-xs text-text-secondary list-decimal list-inside leading-relaxed">
                    {item.steps.map((step, idx) => (
                      <li key={idx} className="pl-1">
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>

                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[11px] text-text-muted italic">
                      {item.tips}
                    </p>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-accent hover:underline shrink-0"
                    >
                      <span>Abrir consola</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
