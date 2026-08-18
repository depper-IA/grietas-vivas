/**
 * FormattedAnalysisText — Renderizado visual y estructurado del análisis forense AI.
 *
 * Transforma el texto del análisis (prosa, viñetas o secciones) en micro-tarjetas
 * visuales con iconos semánticos, badges de categoría y tipografía jerarquizada.
 *
 * Cero emojis: SVG Lucide + tokens semánticos dark-first.
 */

import React from 'react';
import {
  Activity,
  Compass,
  ShieldAlert,
  CheckCircle2,
  FileText,
} from 'lucide-react';

export interface FormattedAnalysisTextProps {
  /** Texto descriptivo crudo generado por el modelo AI. */
  text: string;
  /** Clases CSS adicionales. */
  className?: string;
}

interface ParsedSection {
  id: string;
  category: 'patron' | 'ubicacion' | 'severidad' | 'recomendacion' | 'general';
  label: string;
  content: string;
}

/**
 * Detecta la categoría de una línea o bloque de texto según palabras clave estructurales.
 */
function detectCategory(
  line: string,
): { category: ParsedSection['category']; label: string; content: string } {
  const cleanLine = line.replace(/^[\s*•\-–—\d.)]+/, '').trim();

  // Patrón / Tipo de falla
  const patronMatch = cleanLine.match(/^(?:patr[oó]n|tipo(?: de grieta)?|mecanismo)\s*[:\-]\s*(.+)/i);
  if (patronMatch) {
    return {
      category: 'patron',
      label: 'Patrón de Daño',
      content: patronMatch[1].trim(),
    };
  }

  // Ubicación / Elemento
  const ubicacionMatch = cleanLine.match(/^(?:ubicaci[oó]n|elemento(?: afectado)?|zona|posici[oó]n)\s*[:\-]\s*(.+)/i);
  if (ubicacionMatch) {
    return {
      category: 'ubicacion',
      label: 'Ubicación y Elemento',
      content: ubicacionMatch[1].trim(),
    };
  }

  // Severidad / Signos de alerta / Daño
  const severidadMatch = cleanLine.match(/^(?:severidad|nivel(?: de riesgo)?|da[nñ]o|alerta|riesgo)\s*[:\-]\s*(.+)/i);
  if (severidadMatch) {
    return {
      category: 'severidad',
      label: 'Severidad e Impacto',
      content: severidadMatch[1].trim(),
    };
  }

  // Recomendación / Acción
  const recomendacionMatch = cleanLine.match(/^(?:recomendaci[oó]n|acci[oó]n|medida|sugerencia)\s*[:\-]\s*(.+)/i);
  if (recomendacionMatch) {
    return {
      category: 'recomendacion',
      label: 'Acción Inmediata',
      content: recomendacionMatch[1].trim(),
    };
  }

  // Detección contextual por contenido
  const lower = cleanLine.toLowerCase();
  if (lower.includes('patrón') || lower.includes('grieta diagonal') || lower.includes('grieta vertical') || lower.includes('cizallamiento') || lower.includes('fisura')) {
    return {
      category: 'patron',
      label: 'Patrón y Mecanismo',
      content: cleanLine,
    };
  }
  if (lower.includes('ubicada') || lower.includes('muro') || lower.includes('columna') || lower.includes('viga') || lower.includes('losa') || lower.includes('techo') || lower.includes('pared')) {
    return {
      category: 'ubicacion',
      label: 'Elemento Estructural',
      content: cleanLine,
    };
  }
  if (lower.includes('severo') || lower.includes('crítico') || lower.includes('peligro') || lower.includes('desprendimiento') || lower.includes('riesgo')) {
    return {
      category: 'severidad',
      label: 'Nivel de Alerta',
      content: cleanLine,
    };
  }
  if (lower.includes('evacuar') || lower.includes('inspección') || lower.includes('recomienda') || lower.includes('contactar')) {
    return {
      category: 'recomendacion',
      label: 'Recomendación',
      content: cleanLine,
    };
  }

  return {
    category: 'general',
    label: 'Observación',
    content: cleanLine,
  };
}

/**
 * Parsea el texto del análisis en secciones estructuradas.
 */
function parseAnalysisSections(text: string): ParsedSection[] {
  if (!text || !text.trim()) return [];

  // Separar por saltos de línea primero
  const rawLines = text
    .split(/\r?\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Si viene en formato de lista con viñetas o saltos de línea
  if (rawLines.length > 1) {
    return rawLines.map((line, idx) => {
      const { category, label, content } = detectCategory(line);
      return {
        id: `sec-${idx}`,
        category,
        label,
        content: content || line,
      };
    });
  }

  // Si es un párrafo largo continuo, dividir por oraciones con sentido
  const sentences = text
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  if (sentences.length > 1) {
    return sentences.map((sentence, idx) => {
      const { category, label, content } = detectCategory(sentence);
      return {
        id: `sen-${idx}`,
        category,
        label,
        content: content || sentence,
      };
    });
  }

  // Texto simple de una sola línea / oración
  const { category, label, content } = detectCategory(text);
  return [
    {
      id: 'sec-0',
      category,
      label,
      content: content || text,
    },
  ];
}

const CATEGORY_STYLES = {
  patron: {
    icon: Activity,
    badgeBg: 'bg-brand-accent/15 text-brand-accent border-brand-accent/30',
    border: 'border-l-brand-accent',
  },
  ubicacion: {
    icon: Compass,
    badgeBg: 'bg-status-moderate/15 text-status-moderate-fg border-status-moderate-border/40',
    border: 'border-l-status-moderate',
  },
  severidad: {
    icon: ShieldAlert,
    badgeBg: 'bg-status-critical/15 text-status-critical-fg border-status-critical-border/40',
    border: 'border-l-status-critical',
  },
  recomendacion: {
    icon: CheckCircle2,
    badgeBg: 'bg-status-minor/15 text-status-minor-fg border-status-minor-border/40',
    border: 'border-l-status-minor',
  },
  general: {
    icon: FileText,
    badgeBg: 'bg-surface-3 text-text-secondary border-border-default',
    border: 'border-l-border-strong',
  },
};

export function FormattedAnalysisText({
  text,
  className = '',
}: FormattedAnalysisTextProps) {
  const sections = parseAnalysisSections(text);

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className={`space-y-2.5 ${className}`}>
      {sections.map((sec) => {
        const style = CATEGORY_STYLES[sec.category] || CATEGORY_STYLES.general;
        const IconComponent = style.icon;

        return (
          <div
            key={sec.id}
            className={`flex flex-col gap-1.5 rounded-xl border border-border-subtle bg-surface-2/70 p-3 sm:p-3.5 shadow-sm border-l-4 ${style.border} transition-all duration-150`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase ${style.badgeBg}`}
              >
                <IconComponent className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{sec.label}</span>
              </span>
            </div>
            <p className="text-sm font-normal leading-relaxed text-text-primary pl-0.5">
              {sec.content}
            </p>
          </div>
        );
      })}
    </div>
  );
}
