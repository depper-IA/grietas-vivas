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
 * Order matters: more specific terms should appear before less specific ones.
 */
const RISK_LEVEL_ALIASES: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  low: 'low',
  minor: 'low',
  medium: 'medium',
  moderate: 'medium',
  high: 'high',
  severe: 'high',
  critical: 'critical',
  extreme: 'critical',
  urgent: 'critical',
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

  const getField = (label: string): string | null => {
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
    return null;
  };

  const riskLevelRaw = getField('Risk Level');
  const description = getField('Description');
  const confidenceRaw = getField('Confidence');

  // Need at least riskLevel and description for a valid result
  if (!riskLevelRaw || !description) {
    return null;
  }

  const riskLevelKey = riskLevelRaw.toLowerCase().split(/[\s,]+/)[0];
  const riskLevel = RISK_LEVEL_ALIASES[riskLevelKey] ?? 'medium';

  // Parse confidence — accept 0-1 or 0-100 scales; default to 0.7 if missing
  let confidence = 0.7;
  if (confidenceRaw) {
    const parsed = parseFloat(confidenceRaw);
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