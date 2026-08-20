/**
 * crackTaxonomy — Taxonomia de patrones de grieta y logica de override de
 * seguridad post-sismo (spec seismic-triage-upgrade R1-R4).
 *
 * Mantiene tres responsabilidades puras (sin dependencias de React):
 *   1. `crackPatternSchema` Zod enum con los 10 patrones canónicos
 *      alineados con FEMA 306 / NSR-10 (R1).
 *   2. `dangerSignalsSchema` Zod object con los 5 booleanos de peligro
 *      inmediato (R3).
 *   3. `PATTERN_METADATA` lookup con titulo, descripcion, riesgo base
 *      e identificador de icono SVG (R2).
 *   4. `evaluateSafetyOverride` funcion pura que mapea patron +
 *      senales + severidad AI a un TriageOutcome (R4 y R8).
 *
 * Ninguna importacion de `schemas.ts` para evitar ciclos; los tipos se
 * re-exportan desde `validation/schemas.ts` aguas abajo si un consumidor
 * los necesita re-unificados.
 */

import { z } from 'zod';

/**
 * 10 valores literales que forman el vocabulario del enum CrackPattern.
 * Mantener este array ORDENADO — el orden se refleja en UI / busquedas
 * / fixtures y un cambio no intencionado rompe contratos suaves.
 */
export const CRACK_PATTERN_VALUES = [
  'hairline_cosmetic',
  'vertical_shrinkage',
  'horizontal_flexural',
  'diagonal_shear',
  'stepped_masonry',
  'reentrant_corner',
  'interface_wall_column',
  'interface_wall_beam',
  'structural_beam_column',
  'spalling_corrosion',
] as const;

/** Tipo TS union derivado de la tupla de literales. */
export type CrackPattern = (typeof CRACK_PATTERN_VALUES)[number];

/** Schema Zod que valida los 10 patrones (R1). */
export const crackPatternSchema = z.enum(CRACK_PATTERN_VALUES);

/**
 * 5 senales de peligro inmediato (R3). Cada campo es un booleano que
 * indica si el usuario / observador detecto ese sintoma durante la
 * inspeccion.
 */
export const dangerSignalsSchema = z
  .object({
    jammedDoorsWindows: z.boolean(),
    unleveledFloors: z.boolean(),
    tiltedElements: z.boolean(),
    exposedRebarSpalling: z.boolean(),
    throughWallXCracks: z.boolean(),
  })
  .strict();

export type DangerSignals = z.infer<typeof dangerSignalsSchema>;

/** Niveles de severidad visualizados en el banner de triage (R8). */
export type TriageOutcomeLevel =
  | 'habitable'
  | 'monitoring_required'
  | 'unsafe_no_entry'
  | 'evacuate_emergency';

/**
 * Categoria de riesgo base del patron segun NSR-10 / FEMA 306.
 * - minor: cosmetico, no estructural
 * - moderate: estructural menor, vigilar
 * - critical: riesgo inminente, evacuacion
 */
export type PatternRiskBaseline = 'minor' | 'moderate' | 'critical';

/**
 * Metadata UI por patron (R2). Los textos se exponen en espanol (UI)
 * y nunca incluyen emojis.
 */
export interface PatternMetadata {
  readonly labelEs: string;
  readonly guidanceEs: string;
  readonly riskBaseline: PatternRiskBaseline;
  readonly diagramIconId: string;
}

/**
 * Lookup inmutable: patron -> metadata UI.
 * 10 entradas, una por cada CrackPattern canónico.
 */
export const PATTERN_METADATA: Readonly<Record<CrackPattern, PatternMetadata>> =
  {
    hairline_cosmetic: {
      labelEs: 'Grieta Capilar Cosmetica',
      guidanceEs:
        'Fisura fina menor a 0.3 mm. Generalmente por retraccion de pintura o mortero. No afecta estructura.',
      riskBaseline: 'minor',
      diagramIconId: 'crack-hairline',
    },
    vertical_shrinkage: {
      labelEs: 'Contraccion Vertical',
      guidanceEs:
        'Grieta vertical por asentamiento o fraguado. Monitorear longitud y ancho durante 72 horas.',
      riskBaseline: 'minor',
      diagramIconId: 'crack-vertical',
    },
    horizontal_flexural: {
      labelEs: 'Flexion Horizontal',
      guidanceEs:
        'Grieta horizontal tipica en vigas o losas por flexion. Verificar flecha y pandeo antes de permanecer.',
      riskBaseline: 'moderate',
      diagramIconId: 'crack-horizontal',
    },
    diagonal_shear: {
      labelEs: 'Corte Diagonal',
      guidanceEs:
        'Grieta diagonal entre 30 y 60 grados. Senal clasica de cortante en muros. Requiere evaluacion profesional urgente.',
      riskBaseline: 'critical',
      diagramIconId: 'crack-diagonal',
    },
    stepped_masonry: {
      labelEs: 'Mamposteria Escalonada',
      guidanceEs:
        'Grieta que sigue juntas de mortero en bloques. Posible movimiento diferencial; inspeccionar planta completa.',
      riskBaseline: 'moderate',
      diagramIconId: 'crack-stepped',
    },
    reentrant_corner: {
      labelEs: 'Esquina Reentrante',
      guidanceEs:
        'Concentracion de esfuerzos en esquinas o huecos de ventana. Tipico post-sismo; documentar extension.',
      riskBaseline: 'moderate',
      diagramIconId: 'crack-reentrant',
    },
    interface_wall_column: {
      labelEs: 'Union Muro-Columna',
      guidanceEs:
        'Separacion entre muro no estructural y columna. Verificar anclajes y movimiento de marco.',
      riskBaseline: 'moderate',
      diagramIconId: 'crack-interface-column',
    },
    interface_wall_beam: {
      labelEs: 'Union Muro-Viga',
      guidanceEs:
        'Separacion horizontal entre muro y viga. Posible redistribucion de cargas; inspeccionar nivel superior.',
      riskBaseline: 'moderate',
      diagramIconId: 'crack-interface-beam',
    },
    structural_beam_column: {
      labelEs: 'Nudo Estructural Viga-Columna',
      guidanceEs:
        'Dano en nudo rigido. Zona critica: evacuar nivel, apagar gas y esperar inspeccion estructural.',
      riskBaseline: 'critical',
      diagramIconId: 'crack-beam-column',
    },
    spalling_corrosion: {
      labelEs: 'Descascaramiento y Corrosion',
      guidanceEs:
        'Concreto desprendido con varilla expuesta y oxidacion. Falla inminente del elemento: evacuar y llamar 123.',
      riskBaseline: 'critical',
      diagramIconId: 'crack-spalling',
    },
  };

/**
 * Resultado del motor de evaluacion: nivel de triage final + etiquetas
 * y accion recomendada en espanol (R8). `safetyOverride` indica que
 * algun disparo de R4 elevo el resultado a `evacuate_emergency`.
 */
export interface TriageOutcome {
  readonly level: TriageOutcomeLevel;
  readonly labelEs: string;
  readonly actionEs: string;
  readonly safetyOverride: boolean;
}

/** Tipo de entrada sin dependencia: severidad AI. Evita import circular. */
export type AIRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Banderas que disparan override de seguridad (R4). Cualquier TRUE
 * fuerza `evacuate_emergency` antes que cualquier otra logica.
 *
 * Regla 4a: `exposedRebarSpalling === true`.
 * Regla 4b: `throughWallXCracks === true`.
 * Regla 4c: patron `diagonal_shear` AND `jammedDoorsWindows === true`.
 * Regla 4d (extencion coherente con R2 y design): patron `spalling_corrosion`
 *   siempre dispara override, independiente del resto.
 */
function triggersSafetyOverride(
  pattern: CrackPattern,
  signals: DangerSignals
): boolean {
  if (signals.exposedRebarSpalling) return true;
  if (signals.throughWallXCracks) return true;
  if (pattern === 'spalling_corrosion') return true;
  if (pattern === 'diagonal_shear' && signals.jammedDoorsWindows) return true;
  return false;
}

/**
 * Mapeo determinista de la severidad AI al nivel de triage baseline
 * (sin senales de override). `critical` AI -> `unsafe_no_entry`;
 * `high` AI -> `monitoring_required`; `low`/`medium` -> `habitable`.
 */
function baselineLevelFromSeverity(risk: AIRiskLevel): TriageOutcomeLevel {
  if (risk === 'critical') return 'unsafe_no_entry';
  if (risk === 'high') return 'monitoring_required';
  return 'habitable';
}

/** Etiquetas y acciones canonicas por nivel de triage (R8). */
const TRIAGE_LABELS: Record<
  TriageOutcomeLevel,
  { readonly labelEs: string; readonly actionEs: string }
> = {
  habitable: {
    labelEs: 'Habitable',
    actionEs:
      'Puedes permanecer en la vivienda. Reinspecciona la grieta despues de 72 horas y documenta cualquier cambio.',
  },
  monitoring_required: {
    labelEs: 'Monitoreo Requerido',
    actionEs:
      'Agenda una inspeccion profesional en los proximos 7 dias. Evita modificacion de muros hasta entonces.',
  },
  unsafe_no_entry: {
    labelEs: 'No Habitar',
    actionEs:
      'No permanezcas en el area afectada. Contacta un ingeniero estructural antes de cualquier intervencion.',
  },
  evacuate_emergency: {
    labelEs: 'Evacuacion Inmediata',
    actionEs:
      'Sal del inmueble ahora. Corta gas y agua, no uses ascensor. Llama a la linea de emergencias 123.',
  },
};

/**
 * Evalua patron + senales + severidad AI y devuelve un TriageOutcome.
 *
 * Orden de reglas:
 *   1) Si `triggersSafetyOverride` (R4 + R2 excepcion), devuelve
 *      `evacuate_emergency` con `safetyOverride=true`.
 *   2) En caso contrario, mapea severity AI al nivel baseline y devuelve
 *      el TriageOutcome correspondiente con `safetyOverride=false`.
 *
 * Funcion pura: mismo input produce mismo output, sin efectos
 * secundarios. Determinista para uso en tests property-based.
 */
export function evaluateSafetyOverride(
  pattern: CrackPattern,
  signals: DangerSignals,
  aiRisk: AIRiskLevel
): TriageOutcome {
  if (triggersSafetyOverride(pattern, signals)) {
    const emergency = TRIAGE_LABELS.evacuate_emergency;
    return {
      level: 'evacuate_emergency',
      labelEs: emergency.labelEs,
      actionEs: emergency.actionEs,
      safetyOverride: true,
    };
  }
  const baseline = baselineLevelFromSeverity(aiRisk);
  const labels = TRIAGE_LABELS[baseline];
  return {
    level: baseline,
    labelEs: labels.labelEs,
    actionEs: labels.actionEs,
    safetyOverride: false,
  };
}

/** Contexto estructural para evaluación heurística offline. */
export interface StructuralContextInput {
  elementType:
    | 'column'
    | 'beam'
    | 'load-bearing-wall'
    | 'partition-wall'
    | 'slab'
    | 'foundation'
    | 'other';
  crossesFullSpan: boolean;
  hasScaleReference: boolean;
  scaleReferenceType?: 'coin' | 'ruler' | 'hand' | 'none';
  estimatedDistance?: number;
  recentGrowth: boolean;
  buildingFloors?: number;
  crackFloor?: number;
}

/**
 * evaluateEmergencyOffline — Motor heurístico determinista de triaje de emergencia
 * post-sismo (NSR-10 / FEMA 306).
 *
 * Se ejecuta 100% en el dispositivo de forma instantánea cuando no hay conexión
 * a internet o cuando todos los proveedores de IA del servidor fallan.
 *
 * Garantiza triaje estructural inmediato y seguro sin depender de servicios remotos.
 */
export function evaluateEmergencyOffline(
  structuralContext: StructuralContextInput,
  pattern: CrackPattern,
  dangerSignals: DangerSignals
): {
  riskLevel: AIRiskLevel;
  description: string;
  confidence: number;
  provider: string;
  analyzedAt: string;
} {
  const meta = PATTERN_METADATA[pattern];

  const elementLabels: Record<string, string> = {
    column: 'Columna estructural',
    beam: 'Viga estructural',
    'load-bearing-wall': 'Muro de carga (portante)',
    'partition-wall': 'Tabique divisorio (no estructural)',
    slab: 'Placa / Losa de entrepiso',
    foundation: 'Cimiento / Sobrecimiento',
    other: 'Elemento no especificado',
  };

  const elementLabel =
    elementLabels[structuralContext.elementType] || 'Elemento estructural';

  let riskLevel: AIRiskLevel = 'low';

  // 1. Reglas críticas de seguridad incondicional
  if (
    dangerSignals.exposedRebarSpalling ||
    dangerSignals.throughWallXCracks ||
    pattern === 'spalling_corrosion' ||
    (pattern === 'diagonal_shear' && dangerSignals.jammedDoorsWindows)
  ) {
    riskLevel = 'critical';
  } else if (dangerSignals.tiltedElements || dangerSignals.unleveledFloors) {
    riskLevel = [
      'column',
      'beam',
      'load-bearing-wall',
      'foundation',
    ].includes(structuralContext.elementType)
      ? 'critical'
      : 'high';
  } else if (
    ['column', 'beam', 'foundation'].includes(structuralContext.elementType)
  ) {
    if (
      pattern === 'structural_beam_column' ||
      pattern === 'diagonal_shear'
    ) {
      riskLevel = 'critical';
    } else if (
      pattern === 'horizontal_flexural' ||
      (pattern === 'stepped_masonry' && structuralContext.crossesFullSpan)
    ) {
      riskLevel = 'high';
    } else {
      riskLevel =
        meta.riskBaseline === 'critical'
          ? 'critical'
          : meta.riskBaseline === 'moderate'
            ? 'high'
            : 'medium';
    }
  } else if (structuralContext.elementType === 'load-bearing-wall') {
    if (pattern === 'diagonal_shear') {
      riskLevel = structuralContext.crossesFullSpan ? 'critical' : 'high';
    } else if (
      pattern === 'horizontal_flexural' ||
      pattern === 'stepped_masonry'
    ) {
      riskLevel = structuralContext.crossesFullSpan ? 'high' : 'medium';
    } else {
      riskLevel =
        meta.riskBaseline === 'critical'
          ? 'high'
          : meta.riskBaseline === 'moderate'
            ? 'medium'
            : 'low';
    }
  } else if (structuralContext.elementType === 'partition-wall') {
    if (
      pattern === 'hairline_cosmetic' ||
      pattern === 'vertical_shrinkage'
    ) {
      riskLevel = 'low';
    } else {
      riskLevel = 'medium';
    }
  } else {
    // slab / other
    if (meta.riskBaseline === 'critical') {
      riskLevel = structuralContext.crossesFullSpan ? 'critical' : 'high';
    } else if (meta.riskBaseline === 'moderate') {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }
  }

  // Modificador por crecimiento reciente post-sismo
  if (structuralContext.recentGrowth && riskLevel !== 'critical') {
    if (riskLevel === 'low') riskLevel = 'medium';
    else if (riskLevel === 'medium') riskLevel = 'high';
    else if (riskLevel === 'high') riskLevel = 'critical';
  }

  const severityNotes: string[] = [];
  if (riskLevel === 'critical') {
    severityNotes.push(
      'Riesgo crítico por daño severo en elemento estructural o presencia de señales de colapso'
    );
  } else if (riskLevel === 'high') {
    severityNotes.push(
      'Riesgo alto que compromete la integridad del elemento portante'
    );
  } else if (riskLevel === 'medium') {
    severityNotes.push(
      'Riesgo moderado con afectación localizada que requiere monitoreo'
    );
  } else {
    severityNotes.push(
      'Riesgo bajo correspondiente a daño superficial o retracción no estructural'
    );
  }

  const recommendations: Record<AIRiskLevel, string> = {
    critical:
      'EVACUACIÓN INMEDIATA. Cortar suministros y contactar a las autoridades de gestión del riesgo (123).',
    high:
      'NO HABITAR el área afectada. Solicitar inspección técnica de un ingeniero estructural.',
    medium:
      'Monitorear evolución de la grieta en las próximas 72 horas y restringir acceso si se observa crecimiento.',
    low:
      'Inmueble habitable. Documentar posibles variaciones tras réplicas o sismos secundarios.',
  };

  const description = [
    `Patrón: ${meta.labelEs}`,
    `Ubicación: ${elementLabel}`,
    `Severidad: [Triaje Offline NSR-10 / FEMA 306] ${severityNotes.join('. ')}`,
    `Recomendación: ${recommendations[riskLevel]}`,
  ].join('\n');

  return {
    riskLevel,
    description,
    confidence: 0.88,
    provider: 'Motor Heurístico NSR-10 (Offline)',
    analyzedAt: new Date().toISOString(),
  };
}
