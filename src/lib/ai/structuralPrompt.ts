/**
 * Structural Engineering Prompt — Advanced crack analysis
 *
 * Uses domain-specific prompt engineering to extract detailed structural
 * information from multimodal AI models. Asks for crack classification,
 * estimated dimensions, pattern type, and severity assessment based on
 * NSR-10 (Colombia) and FEMA 306 standards.
 *
 * Combined with user-provided structural context (element type, load-bearing
 * status, crack traversal) to produce a weighted risk assessment.
 */

import { z } from 'zod';

/** User-provided structural context from the pre-analysis questionnaire. */
export interface StructuralContext {
  /** Type of structural element */
  elementType: 'column' | 'beam' | 'load-bearing-wall' | 'partition-wall' | 'slab' | 'foundation' | 'other';
  /** Does the crack cross the full width/height of the element? */
  crossesFullSpan: boolean;
  /** Is there a reference object in the photo for scale? */
  hasScaleReference: boolean;
  /** Type of reference object (if any) */
  scaleReferenceType?: 'coin' | 'card' | 'ruler' | 'hand' | 'none';
  /** Approximate distance from camera to crack in meters */
  estimatedDistance?: number;
  /** Has the crack changed recently? (post-earthquake growth) */
  recentGrowth: boolean;
  /** Number of floors in the building */
  buildingFloors?: number;
  /** Floor where the crack is located */
  crackFloor?: number;
}

/** Zod schema for runtime validation of structural context */
export const structuralContextSchema = z.object({
  elementType: z.enum([
    'column',
    'beam',
    'load-bearing-wall',
    'partition-wall',
    'slab',
    'foundation',
    'other',
  ]),
  crossesFullSpan: z.boolean(),
  hasScaleReference: z.boolean(),
  scaleReferenceType: z.enum(['coin', 'card', 'ruler', 'hand', 'none']).optional(),
  estimatedDistance: z.number().positive().optional(),
  recentGrowth: z.boolean(),
  buildingFloors: z.number().int().positive().optional(),
  crackFloor: z.number().int().optional(),
});

/**
 * Build the specialized structural analysis prompt.
 * Includes the user's structural context to help the AI make a better assessment.
 * Supports multi-image analysis (detail photo + structural context photo).
 */
export function buildStructuralPrompt(context: StructuralContext, hasContextImage?: boolean): string {
  const contextSection = buildContextSection(context);
  const scaleSection = buildScaleSection(context);
  const imageGuidanceSection = buildImageGuidanceSection(hasContextImage);

  return `Eres un perito e ingeniero especialista en evaluación forense de daños y triaje estructural post-sismo (NSR-10 Colombia / FEMA 306).

CONTEXTO ESTRUCTURAL SUMINISTRADO POR EL USUARIO:
${contextSection}
${scaleSection}

${imageGuidanceSection}

MATRIZ OFICIAL DE DAÑOS Y SEVERIDAD SÍSMICA (NSR-10 / FEMA 306):
1. CRÍTICO (riskLevel: "critical"):
   - Grietas en "X" o grietas diagonales cruzadas en muros de carga/mampostería (falla por cortante sísmico bidireccional).
   - Daño en elementos estructurales principales: vigas, columnas o nudos viga-columna (grietas diagonales por cortante o flexión, que atraviesan la sección).
   - Concreto desprendido (spalling) con acero de refuerzo/varilla visible o corroída.
   - Desplazamiento relativo entre bordes de la grieta, columnas o muros inclinados, aplastados o pandeados.
2. ALTO (riskLevel: "high"):
   - Grieta diagonal individual (≈45°) o grietas en escalera que atraviesan ladrillos/bloques en muros portantes.
   - Columna o viga con grieta > 2mm de apertura o que atraviesa gran parte de la sección.
   - Grietas horizontales extensas en muros por empujes o flexión fuera del plano.
   - Grietas profundas con separación visible entre muro y losa o columna.
3. MEDIO / MODERADO (riskLevel: "medium"):
   - Fisuras diagonales desde esquinas de puertas o ventanas por concentración de esfuerzos.
   - Separación vertical en la junta muro-columna (muro divisorio no estructural).
   - Grietas en muros divisorios/tabiques sin compromiso de elementos portantes.
   - Grieta horizontal en la parte superior del muro bajo la viga o losa.
4. BAJO (riskLevel: "low"):
   - Fisuras superficiales capilares (<0.3 mm) en revoque, estuco o pintura (daño meramente cosmético).
   - Fisuras verticales finas por retracción de fraguado o dilatación térmica.

REGLAS DE EVALUACIÓN Y SALIDA:
- Todo el reporte debe estar 100% en español profesional.
- Sé directo, contundente y técnicamente certero. Si observas una grieta en "X", nómbrala explícitamente como "Grietas en X por cortante sísmico" y califícala como "critical".
- Redacta el campo "description" estructurado exactamente en estas 4 líneas:
  Patrón: [Tipo exacto de grieta según la matriz: ej. Grietas en X / Diagonal a 45° / Escalonada / Capilar]
  Ubicación: [Elemento afectado: muro de carga, columna, viga, nudo, tabique divisorio, etc.]
  Severidad: [Nivel de riesgo técnico y justificación física del daño observado según NSR-10 / FEMA 306]
  Recomendación: [Indicación clara: ej. EVACUAR INMEDIATAMENTE / NO HABITAR y solicitar peritaje urgente / Monitorear / Habitable]
- "confidence": número entre 0.0 y 1.0 según la claridad visual de las imágenes.

FORMATO DE RESPUESTA (ÚNICAMENTE JSON VÁLIDO):
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "description": "Patrón: ...\\nUbicación: ...\\nSeveridad: ...\\nRecomendación: ...",
  "confidence": 0.0-1.0,
  "crackType": "hairline" | "structural" | "shear" | "flexural" | "settlement" | "cosmetic",
  "estimatedWidthMm": number or null,
  "estimatedLengthCm": number or null,
  "crossesFullSpan": true/false,
  "hasDisplacement": true/false,
  "hasExposedRebar": true/false,
  "immediateAction": "none" | "monitor" | "evacuate" | "restrict-access" | "engineer-required"
}

Responde ÚNICAMENTE con el objeto JSON válido. No uses bloques markdown ni texto explicativo fuera del JSON.`;
}

function buildImageGuidanceSection(hasContextImage?: boolean): string {
  if (hasContextImage) {
    return `FOTOGRAFÍAS ADJUNTAS PARA EL ANÁLISIS MULTIMODAL:
- Foto 1 (Detalle de la grieta): Macro/primer plano con calibración de escala para medir apertura (mm), longitud y profundidad.
- Foto 2 (Contexto estructural del entorno): Vista amplia que muestra el elemento completo y sus conexiones (vigas, columnas, nudos, losas o muros colindantes).
INSTRUCCIÓN: Evalúa cómo se correlaciona la grieta de detalle con el sistema estructural global visible en la foto de contexto.`;
  }

  return `FOTOGRAFÍA ADJUNTA PARA EL ANÁLISIS:
- Foto 1 (Detalle de la grieta): Evalúa la morfología, apertura, trayectoria y profundidad del daño visible.`;
}

function buildContextSection(context: StructuralContext): string {
  const elementLabels: Record<string, string> = {
    'column': 'Columna estructural',
    'beam': 'Viga estructural',
    'load-bearing-wall': 'Muro de carga / portante',
    'partition-wall': 'Muro divisorio / tabique no estructural',
    'slab': 'Losa de entrepiso / techo',
    'foundation': 'Elemento de cimentación',
    'other': 'Otro / elemento no determinado',
  };

  const lines: string[] = [
    `- Tipo de elemento: ${elementLabels[context.elementType] || context.elementType}`,
    `- La grieta cruza toda la sección/longitud: ${context.crossesFullSpan ? 'SÍ (indicador grave de compromiso estructural)' : 'No'}`,
    `- Crecimiento reciente post-sismo: ${context.recentGrowth ? 'SÍ (progresión activa)' : 'No / Desconocido'}`,
  ];

  if (context.buildingFloors) {
    lines.push(`- Altura de la edificación: ${context.buildingFloors} pisos`);
  }
  if (context.crackFloor) {
    lines.push(`- Grieta ubicada en el piso: ${context.crackFloor}`);
  }
  if (context.estimatedDistance) {
    lines.push(`- Distancia aproximada de captura: ${context.estimatedDistance} metros`);
  }

  return lines.join('\n');
}

function buildScaleSection(context: StructuralContext): string {
  if (!context.hasScaleReference) {
    return `REFERENCIA DE ESCALA: Ninguna específica en la foto. Estima dimensiones relativas a texturas constructivas estándar (ladrillo tolete ≈ 6 cm alto, bloque de concreto ≈ 19 cm alto, junta de mortero ≈ 1.5 cm).`;
  }

  const references: Record<string, string> = {
    'coin': 'Moneda de 500 pesos colombianos (diámetro exacto: 23.7 mm) visible en la foto de detalle.',
    'card': 'Tarjeta estándar de crédito/documento (85.6 mm × 53.98 mm) visible en la foto de detalle.',
    'ruler': 'Regla graduada o cinta métrica milimetrada visible en la foto de detalle.',
    'hand': 'Mano humana (ancho de palma promedio ≈ 8.0 cm) visible para escala aproximada.',
    'none': 'Sin objeto de referencia específico.',
  };

  const refType = context.scaleReferenceType || 'none';
  return `REFERENCIA DE ESCALA CALIBRADA: ${references[refType]} Utilízala para calibrar la estimación de apertura (ancho en mm) y longitud (cm).`;
}

/**
 * Enhanced analysis result with structural detail fields.
 */
export interface StructuralAnalysisResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
  provider?: string;
  analyzedAt?: string;
  crackType?: string;
  estimatedWidthMm?: number | null;
  estimatedLengthCm?: number | null;
  crossesFullSpan?: boolean;
  hasDisplacement?: boolean;
  hasExposedRebar?: boolean;
  immediateAction?: string;
}

/**
 * Rule engine: Apply structural weighting rules to adjust the AI's raw assessment.
 * This catches cases where the AI might underestimate risk on critical elements.
 */
export function applyStructuralRules<T extends StructuralAnalysisResult>(
  aiResult: T,
  context: StructuralContext,
): T {
  let adjustedRisk = aiResult.riskLevel;
  const riskOrder = ['low', 'medium', 'high', 'critical'] as const;
  const currentIndex = riskOrder.indexOf(adjustedRisk);

  // Rule 1: Exposed rebar or displacement = CRITICAL regardless
  if (aiResult.hasExposedRebar || aiResult.hasDisplacement) {
    adjustedRisk = 'critical';
  }

  // Rule 2: Critical structural elements with full-span cracks
  if (
    ['column', 'beam', 'foundation'].includes(context.elementType) &&
    (context.crossesFullSpan || aiResult.crossesFullSpan) &&
    (aiResult.crackType === 'shear' || aiResult.crackType === 'structural')
  ) {
    adjustedRisk = 'critical';
  }

  // Rule 3: Column/beam with width > 2mm
  if (
    ['column', 'beam'].includes(context.elementType) &&
    aiResult.estimatedWidthMm != null &&
    aiResult.estimatedWidthMm > 2
  ) {
    if (currentIndex < 2) adjustedRisk = 'high'; // minimum HIGH
  }

  // Rule 4: Load-bearing wall with diagonal/horizontal full-span crack
  if (
    context.elementType === 'load-bearing-wall' &&
    (context.crossesFullSpan || aiResult.crossesFullSpan) &&
    (aiResult.crackType === 'shear' || aiResult.crackType === 'flexural')
  ) {
    if (currentIndex < 2) adjustedRisk = 'high'; // minimum HIGH
  }

  // Rule 5: Partition wall caps at MEDIUM (unless critical hazard like exposed rebar or displacement)
  if (
    context.elementType === 'partition-wall' &&
    !aiResult.hasExposedRebar &&
    !aiResult.hasDisplacement &&
    riskOrder.indexOf(adjustedRisk) > 1
  ) {
    adjustedRisk = 'medium';
  }

  // Rule 6: Recent growth → increase one level
  if (context.recentGrowth && riskOrder.indexOf(adjustedRisk) < 3) {
    const newIndex = Math.min(riskOrder.indexOf(adjustedRisk) + 1, 3);
    adjustedRisk = riskOrder[newIndex];
  }

  // Rule 7: Cosmetic/hairline on partition = LOW max
  if (
    (aiResult.crackType === 'cosmetic' || aiResult.crackType === 'hairline') &&
    context.elementType === 'partition-wall'
  ) {
    adjustedRisk = 'low';
  }

  let finalDescription = aiResult.description;
  if (adjustedRisk !== aiResult.riskLevel) {
    const note = `\n\n[Nota: Nivel de riesgo ajustado de "${aiResult.riskLevel}" a "${adjustedRisk}" por el motor de reglas estructurales basado en el contexto proporcionado.]`;
    if ((finalDescription + note).length <= 2000) {
      finalDescription = `${finalDescription}${note}`;
    } else {
      finalDescription = `${finalDescription.slice(0, 2000 - note.length)}${note}`;
    }
  }

  return {
    ...aiResult,
    riskLevel: adjustedRisk,
    description: finalDescription,
  };
}
