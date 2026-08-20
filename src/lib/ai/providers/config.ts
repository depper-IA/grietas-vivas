/**
 * Provider metadata for BYOK configuration UI.
 *
 * Pure data — no React, no DOM. Imported by:
 *   - `src/components/settings/ByokConfigForm.tsx` (form rendering)
 *   - `src/app/(protected)/settings/page.tsx` (orchestrator)
 *
 * Extracted from `settings/page.tsx` (sdd/improve-project 2.1) so the
 * form component can be unit-tested without pulling in the full
 * 730-line settings page.
 */

import type { AIProvider } from '@/lib/ai/types';

export interface ModelOption {
  id: string;
  label: string;
  badge?: string;
}

export interface ProviderMetadata {
  name: string;
  keyUrl: string;
  keyHint: string;
  defaultBaseUrl: string;
  defaultModel: string;
  models: ModelOption[];
}

export const PROVIDER_METADATA: Record<AIProvider, ProviderMetadata> = {
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

export const PROVIDER_ORDER: AIProvider[] = [
  'gemini',
  'openrouter',
  'minimax',
  'nvidia-nim',
  'anthropic',
  'openai',
  'custom',
];
