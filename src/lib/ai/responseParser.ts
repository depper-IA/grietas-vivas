/**
 * AI Response Parser — Defensive parsers for non-standard provider outputs.
 *
 * Some AI vision providers (notably NVIDIA NIM) don't always return strict JSON
 * even when prompted to. This module provides two fallback layers:
 *
 * 1. stripMarkdownJsonWrapper() — extracts the JSON object from content that
 *    is wrapped in ```json ... ``` fences, with brace-matching to handle
 *    truncated or malformed fences gracefully.
 *
 * 2. parseMarkdownResponse() — last-resort parser for bold-markdown formatted
 *    responses like:
 *      **Risk Level:** Critical
 *      **Description:** Some text here
 *      **Confidence:** 0.85
 */

/**
 * Strip markdown code block wrappers from a JSON string and extract the JSON
 * object via brace-counting. Returns the cleaned JSON string, or the original
 * trimmed content if no JSON object is found.
 *
 * Handles:
 * - ```json ... ``` with proper fences
 * - ``` ... ``` with no language tag
 * - Truncated fences (missing closing ```)
 * - Extra prose before/after the JSON object
 */
export function stripMarkdownJsonWrapper(content: string): string {
  let trimmed = content.trim();

  // Remove leading ```json or ``` (with optional language tag)
  const fenceStartMatch = trimmed.match(/^```(?:json)?\s*/i);
  if (fenceStartMatch) {
    trimmed = trimmed.slice(fenceStartMatch[0].length);
  }

  // Remove trailing ``` if present
  if (trimmed.endsWith('```')) {
    trimmed = trimmed.slice(0, -3);
  }

  // Try to find the JSON object in the remaining content
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace === -1) {
    return trimmed.trim();
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  let lastValidEnd = -1;

  for (let i = firstBrace; i < trimmed.length; i++) {
    const c = trimmed[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (c === '\\') {
      escape = true;
      continue;
    }

    if (c === '"' && !escape) {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        lastValidEnd = i;
        break;
      }
    }
  }

  if (lastValidEnd !== -1) {
    return trimmed.slice(firstBrace, lastValidEnd + 1);
  }

  return trimmed.trim();
}

/**
 * Risk level aliases mapped to the canonical schema values.
 * Includes both English and Spanish variants since the app targets a Spanish audience.
 */
const RISK_LEVEL_ALIASES: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  // English
  low: 'low',
  minor: 'low',
  medium: 'medium',
  moderate: 'medium',
  high: 'high',
  severe: 'high',
  critical: 'critical',
  extreme: 'critical',
  urgent: 'critical',
  // Spanish
  bajo: 'low',
  leve: 'low',
  menor: 'low',
  medio: 'medium',
  moderado: 'medium',
  moderadoa: 'medium',
  alto: 'high',
  elevado: 'high',
  grave: 'high',
  severo: 'high',
  severoa: 'high',
  crítico: 'critical',
  critico: 'critical',
  crítico: 'critical',
  extremo: 'critical',
  extrema: 'critical',
  urgente: 'critical',
};

/**
 * Field label aliases for the markdown fallback parser.
 * Maps logical field name → list of possible label strings (English + Spanish).
 */
const FIELD_LABELS: Record<'riskLevel' | 'description' | 'confidence', string[]> = {
  riskLevel: ['Risk Level', 'Nivel de Riesgo', 'Riesgo', 'Nivel'],
  description: ['Description', 'Descripción', 'Descripcion'],
  confidence: ['Confidence', 'Confianza', 'Certeza'],
};

/**
 * Fallback parser for AI responses that don't return JSON.
 * Returns null if no valid riskLevel + description can be extracted.
 */
export function parseMarkdownResponse(content: string): {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
} | null {
  const normalize = (s: string): string =>
    s.trim().replace(/^[*_`#\s]+/, '').replace(/[*_`#\s]+$/, '').trim();

  const getField = (labels: string[]): string | null => {
    for (const label of labels) {
      const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patterns = [
        new RegExp(
          `\\*\\*${escapedLabel}\\*?\\*?\\s*[:\\-]\\s*([^\\n*]+?)(?=\\n\\s*\\n|\\n\\s*\\*|$)`,
          'i',
        ),
        new RegExp(`${escapedLabel}\\s*[:\\-]\\s*([^\\n]+)`, 'i'),
      ];
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
          return normalize(match[1]);
        }
      }
    }
    return null;
  };

  const riskLevelRaw = getField(FIELD_LABELS.riskLevel);
  const description = getField(FIELD_LABELS.description);
  const confidenceRaw = getField(FIELD_LABELS.confidence);

  // Need at least riskLevel and description for a valid result
  if (!riskLevelRaw || !description) {
    return null;
  }

  const riskLevelKey = riskLevelRaw.toLowerCase().split(/[\s,]+/)[0];
  const riskLevel = RISK_LEVEL_ALIASES[riskLevelKey] ?? 'medium';

  // Parse confidence — accept 0-1 or 0-100 scales; default to 0.7 if missing
  let confidence = 0.7;
  if (confidenceRaw) {
    // Strip percentage sign if present (e.g. "85%" or "85 %")
    const cleaned = confidenceRaw.replace(/[%\s]/g, '');
    const parsed = parseFloat(cleaned);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      confidence = parsed;
    } else if (!isNaN(parsed) && parsed > 1 && parsed <= 100) {
      confidence = parsed / 100;
    }
  }

  return {
    riskLevel,
    description: description.slice(0, 2000),
    confidence,
  };
}

/**
 * Last-resort parser for AI responses that return pure prose without any
 * labels or structure. Extracts risk level from common phrasing patterns and
 * uses the whole response as the description.
 *
 * Returns null if no risk-level signal can be extracted.
 */
export function parseProseResponse(content: string): {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
} | null {
  const normalized = content.trim();
  if (!normalized) return null;

  const lower = normalized.toLowerCase();

  // Phrases that indicate each risk level, ordered from most-specific to least.
  // Each entry: array of phrases that imply this level.
  const riskSignals: Array<{
    level: 'low' | 'medium' | 'high' | 'critical';
    phrases: string[];
  }> = [
    {
      level: 'critical',
      phrases: [
        'critical risk',
        'critical damage',
        'extreme damage',
        'severe structural damage',
        'urgent',
        'inminente',
        'riesgo crítico',
        'daño crítico',
        'daño estructural severo',
        'peligro inminente',
      ],
    },
    {
      level: 'high',
      phrases: [
        'high risk',
        'severe damage',
        'high severity',
        'structural damage',
        'structural concern',
        'significant cracks',
        'wide cracks',
        'alto riesgo',
        'daño severo',
        'daño grave',
        'daño estructural',
        'severidad alta',
        'preocupación estructural',
        'grietas significativas',
      ],
    },
    {
      level: 'medium',
      phrases: [
        'moderate damage',
        'medium risk',
        'moderate severity',
        'medium severity',
        'daño moderado',
        'riesgo medio',
        'severidad media',
      ],
    },
    {
      level: 'low',
      phrases: [
        'low risk',
        'minor damage',
        'cosmetic',
        'minor crack',
        'hairline',
        'bajo riesgo',
        'daño menor',
        'cosmético',
        'grieta menor',
      ],
    },
  ];

  let detected: 'low' | 'medium' | 'high' | 'critical' | null = null;
  for (const { level, phrases } of riskSignals) {
    if (phrases.some((p) => lower.includes(p))) {
      detected = level;
      break;
    }
  }

  if (!detected) return null;

  return {
    riskLevel: detected,
    description: normalized.slice(0, 2000),
    confidence: 0.5, // Lower confidence since we're guessing the level
  };
}