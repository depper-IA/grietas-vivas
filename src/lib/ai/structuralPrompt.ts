/**
 * Structural Engineering Prompt — Advanced crack analysis
 *
 * Uses domain-specific prompt engineering to extract detailed structural
 * information from multimodal AI models. Asks for crack classification,
 * estimated dimensions, pattern type, and severity assessment.
 *
 * Combined with user-provided structural context (element type, load-bearing
 * status, crack traversal) to produce a weighted risk assessment.
 */

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

/**
 * Build the specialized structural analysis prompt.
 * Includes the user's structural context to help the AI make a better assessment.
 */
export function buildStructuralPrompt(context: StructuralContext): string {
  const contextSection = buildContextSection(context);
  const scaleSection = buildScaleSection(context);

  return `You are a structural damage assessment AI specialized in post-earthquake building inspection in Colombia. 

STRUCTURAL CONTEXT PROVIDED BY THE USER:
${contextSection}
${scaleSection}

ANALYSIS INSTRUCTIONS:
Examine this photograph of building damage and provide a detailed structural assessment.

1. CRACK CLASSIFICATION:
   - Type: Identify if this is a hairline crack, structural crack, shear crack (diagonal), flexural crack (horizontal), settlement crack, or surface/cosmetic crack.
   - Pattern: Is it singular, branching (map cracking), stepped (following mortar joints), or through-crack?
   - Orientation: Vertical, horizontal, diagonal (specify approximate angle), or mixed.

2. ESTIMATED DIMENSIONS (visual estimation):
   - Estimated width: in millimeters (use the scale reference if visible, otherwise estimate relative to surface texture)
   - Estimated length: in centimeters
   - Depth assessment: surface-only, partial-depth, or appears to go through the element

3. SEVERITY INDICATORS:
   - Is there displacement (one side higher/lower than the other)?
   - Is there spalling (concrete chunks falling off)?
   - Is there exposed reinforcement (rebar visible)?
   - Is there water infiltration or staining around the crack?
   - Is the crack active (fresh edges) or dormant (filled with dust/paint)?

4. RISK ASSESSMENT:
   Based on ALL the above factors combined with the structural context:
   - riskLevel: one of "low", "medium", "high", "critical"
   - Use the STRUCTURAL WEIGHTING rules below

STRUCTURAL WEIGHTING RULES:
- Column/beam/foundation + diagonal crack + crosses full span = CRITICAL (immediate danger)
- Column/beam + any crack > 2mm width = HIGH minimum
- Load-bearing wall + horizontal/diagonal crack + crosses full span = HIGH minimum
- Partition wall + any crack = maximum MEDIUM (non-structural)
- Recent growth after earthquake = increase one level
- Exposed rebar or displacement = CRITICAL regardless of element
- Surface/cosmetic crack on any element = LOW maximum
- Hairline crack (< 0.3mm) on partition = LOW

RESPONSE FORMAT (JSON only):
{
  "riskLevel": "low|medium|high|critical",
  "description": "Detailed assessment in Spanish (max 2000 chars). Include: crack type, estimated dimensions, severity factors observed, structural implications, and recommended immediate action.",
  "confidence": 0.0-1.0,
  "crackType": "hairline|structural|shear|flexural|settlement|cosmetic",
  "estimatedWidthMm": number or null,
  "estimatedLengthCm": number or null,
  "crossesFullSpan": true/false,
  "hasDisplacement": true/false,
  "hasExposedRebar": true/false,
  "immediateAction": "none|monitor|evacuate|restrict-access|engineer-required"
}

Respond ONLY with valid JSON. No markdown, no explanation outside the JSON.`;
}

function buildContextSection(context: StructuralContext): string {
  const elementLabels: Record<string, string> = {
    'column': 'Structural column',
    'beam': 'Structural beam',
    'load-bearing-wall': 'Load-bearing wall',
    'partition-wall': 'Non-structural partition wall',
    'slab': 'Floor/ceiling slab',
    'foundation': 'Foundation element',
    'other': 'Other/unknown element',
  };

  const lines: string[] = [
    `- Element type: ${elementLabels[context.elementType] || context.elementType}`,
    `- Crack crosses full span: ${context.crossesFullSpan ? 'YES (serious indicator)' : 'No'}`,
    `- Recent growth post-earthquake: ${context.recentGrowth ? 'YES (active progression)' : 'No / Unknown'}`,
  ];

  if (context.buildingFloors) {
    lines.push(`- Building height: ${context.buildingFloors} floors`);
  }
  if (context.crackFloor) {
    lines.push(`- Crack located on floor: ${context.crackFloor}`);
  }

  return lines.join('\n');
}

function buildScaleSection(context: StructuralContext): string {
  if (!context.hasScaleReference) {
    return `\nSCALE REFERENCE: None provided. Estimate dimensions relative to surface texture (typical brick = 6cm face, typical block = 19cm face).`;
  }

  const references: Record<string, string> = {
    'coin': 'Colombian 500 peso coin (diameter: 23.7mm) or similar coin visible in photo',
    'card': 'Standard credit/ID card (85.6mm × 53.98mm) visible in photo',
    'ruler': 'Ruler or measuring tape visible in photo',
    'hand': 'Human hand (average palm width ~8cm) visible for scale',
    'none': 'No specific reference',
  };

  const refType = context.scaleReferenceType || 'none';
  return `\nSCALE REFERENCE: ${references[refType]}. Use this to calibrate your dimension estimates.`;
}

/**
 * Enhanced analysis result with structural detail fields.
 */
export interface StructuralAnalysisResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  confidence: number;
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
export function applyStructuralRules(
  aiResult: StructuralAnalysisResult,
  context: StructuralContext,
): StructuralAnalysisResult {
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

  // Rule 5: Partition wall caps at MEDIUM
  if (context.elementType === 'partition-wall' && riskOrder.indexOf(adjustedRisk) > 1) {
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

  return {
    ...aiResult,
    riskLevel: adjustedRisk,
    description: adjustedRisk !== aiResult.riskLevel
      ? `${aiResult.description}\n\n[Nota: Nivel de riesgo ajustado de "${aiResult.riskLevel}" a "${adjustedRisk}" por el motor de reglas estructurales basado en el contexto proporcionado.]`
      : aiResult.description,
  };
}
