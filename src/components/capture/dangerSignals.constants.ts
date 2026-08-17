/**
 * dangerSignals.constants — Configuracion estatica de las 5 senales
 * de peligro (Spec R3 de seismic-triage-upgrade).
 *
 * Mantiene la fuente unica de verdad para el orden de las senales, sus
 * iconos Lucide y la metadata de UI (label, descripcion, criticidad).
 * Extraido de DangerSignalsChecklist para mantener el componente bajo
 * el limite de 200 LOC del diseno.
 */

import type { ComponentType, SVGProps } from 'react';
import {
  DoorClosed,
  MoveDown,
  Columns,
  AlertOctagon,
  Split,
} from 'lucide-react';
import type { DangerSignals } from '@/lib/validation/crackTaxonomy';

export interface DangerSignalDef {
  readonly field: keyof DangerSignals;
  readonly labelEs: string;
  readonly descriptionEs: string;
  readonly Icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Si la senal dispara banner critico (R3 + R4 override). */
  readonly isCriticalTrigger: boolean;
}

/**
 * Lista cerrada y ordenada de las 5 senales. El orden aqui define
 * el orden de render en UI. Cualquier cambio requiere coordinacion
 * con tests que asumen indices / orden estable.
 */
export const DANGER_SIGNAL_DEFS: readonly DangerSignalDef[] = [
  {
    field: 'jammedDoorsWindows',
    labelEs: 'Puertas o ventanas atascadas',
    descriptionEs:
      'Las puertas o ventanas no abren o cierran con normalidad tras el sismo.',
    Icon: DoorClosed,
    isCriticalTrigger: false,
  },
  {
    field: 'unleveledFloors',
    labelEs: 'Pisos desnivelados',
    descriptionEs:
      'Los pisos presentan inclinacion visible o pelotas ruedan solas.',
    Icon: MoveDown,
    isCriticalTrigger: false,
  },
  {
    field: 'tiltedElements',
    labelEs: 'Elementos estructurales inclinados',
    descriptionEs:
      'Columnas, vigas o muros visiblesmente inclinados respecto a la vertical.',
    Icon: Columns,
    isCriticalTrigger: false,
  },
  {
    field: 'exposedRebarSpalling',
    labelEs: 'Varilla expuesta o concreto descascarado',
    descriptionEs:
      'Concreto desprendido con varilla de refuerzo a la vista y oxidacion.',
    Icon: AlertOctagon,
    isCriticalTrigger: true,
  },
  {
    field: 'throughWallXCracks',
    labelEs: 'Grietas en X que atraviesan el muro',
    descriptionEs:
      'Grietas en patron X visibles en ambas caras del muro (traspasado).',
    Icon: Split,
    isCriticalTrigger: true,
  },
];