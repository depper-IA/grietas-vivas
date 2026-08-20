'use client';

import React from 'react';
import Image from 'next/image';
import { X, BookOpen, Check } from 'lucide-react';
import type { CrackPattern } from '@/lib/validation/crackTaxonomy';
import { SeverityBadge } from '@/components/ui/SeverityBadge';
import type { SeverityLevel } from '@/lib/ui/severity';

interface GuideItem {
  id: CrackPattern;
  technicalTitle: string;
  popularTitle: string;
  image: string;
  risk: SeverityLevel;
  description: string;
}

const GUIDE_ITEMS: readonly GuideItem[] = [
  {
    id: 'hairline_cosmetic',
    technicalTitle: 'Grieta Capilar Cosmética',
    popularTitle: 'Fisuras Superficiales (acabados)',
    image: '/reconocimiento/fisura-superficial.webp',
    risk: 'minor',
    description: 'Muy finas, tipo cabello (<0.3 mm). En revoque, estuco o pintura. No compromete la estructura.',
  },
  {
    id: 'vertical_shrinkage',
    technicalTitle: 'Contracción Vertical',
    popularTitle: 'Verticales rectas',
    image: '/reconocimiento/vertical.webp',
    risk: 'minor',
    description: 'Rectas de arriba abajo. Suelen ser por fraguado o pequeños movimientos. Monitorear si abren.',
  },
  {
    id: 'horizontal_flexural',
    technicalTitle: 'Flexión Horizontal',
    popularTitle: 'Horizontales paralelas al piso',
    image: '/reconocimiento/horizontal.webp',
    risk: 'moderate',
    description: 'Paralelas al piso en muros o vigas. Indican empujes o deflexión. Requieren inspección.',
  },
  {
    id: 'diagonal_shear',
    technicalTitle: 'Corte Diagonal (~45°)',
    popularTitle: 'Diagonales de esfuerzo',
    image: '/reconocimiento/diagonal.webp',
    risk: 'critical',
    description: 'Forma diagonal en muros. Indican cortante sísmico o asentamiento diferencial severo.',
  },
  {
    id: 'stepped_masonry',
    technicalTitle: 'Mampostería Escalonada',
    popularTitle: 'En Escalera (zigzag)',
    image: '/reconocimiento/escalera.webp',
    risk: 'critical',
    description: 'Siguen las juntas de mortero en ladrillo o bloque. Asentamiento o cortante de muros.',
  },
  {
    id: 'reentrant_corner',
    technicalTitle: 'Esquina Reentrante',
    popularTitle: 'Desde esquinas de puertas o ventanas',
    image: '/reconocimiento/puerta-ventana.webp',
    risk: 'moderate',
    description: 'Nacen en los vértices de vanos por concentración de tensiones o falta de refuerzo.',
  },
  {
    id: 'interface_wall_column',
    technicalTitle: 'Unión Muro-Columna',
    popularTitle: 'Separación entre muro y columna',
    image: '/reconocimiento/muro-columna.webp',
    risk: 'moderate',
    description: 'Grieta vertical en la junta de dos materiales distintos con comportamiento dinámico dispar.',
  },
  {
    id: 'interface_wall_beam',
    technicalTitle: 'Unión Muro-Viga',
    popularTitle: 'Separación muro-losa / viga',
    image: '/reconocimiento/muro-losa-viga.webp',
    risk: 'moderate',
    description: 'Grieta horizontal bajo la losa o viga. Suele indicar deflexión del elemento superior.',
  },
  {
    id: 'structural_beam_column',
    technicalTitle: 'Nudo Estructural Viga-Columna',
    popularTitle: 'En vigas o columnas de concreto',
    image: '/reconocimiento/viga-columna.webp',
    risk: 'critical',
    description: 'Grieta en elemento maestro de carga (columna/viga). Zona crítica: evacuar y pedir auxilio.',
  },
  {
    id: 'spalling_corrosion',
    technicalTitle: 'Descascaramiento y Corrosión',
    popularTitle: 'Con óxido o desprendimiento',
    image: '/reconocimiento/oxido.webp',
    risk: 'critical',
    description: 'Concreto estallado con varilla de acero expuesta y óxido visible. Pérdida de capacidad.',
  },
] as const;

export interface VisualPatternGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPattern: CrackPattern | null;
  onSelect: (pattern: CrackPattern) => void;
}

export function VisualPatternGuideModal({
  isOpen,
  onClose,
  selectedPattern,
  onSelect,
}: VisualPatternGuideModalProps) {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guía visual de reconocimiento de grietas"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div className="relative flex flex-col w-full max-w-2xl max-h-[90vh] rounded-2xl border border-border-default bg-surface-0 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border-default bg-surface-1">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-accent/10 border border-brand-accent/30 text-brand-accent">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary tracking-tight">
                Guía Visual con Fotos Reales
              </h2>
              <p className="text-xs text-text-muted">
                Compara tu grieta con los 10 patrones sin salir del flujo de captura
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar guía visual"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border-default bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Lista con fotos */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          {GUIDE_ITEMS.map((item) => {
            const isSelected = selectedPattern === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelect(item.id);
                  onClose();
                }}
                className={[
                  'w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 p-3 sm:p-3.5 rounded-2xl border text-left transition-all duration-150',
                  isSelected
                    ? 'border-brand-accent bg-brand-accent/5 ring-2 ring-brand-accent shadow-sm'
                    : 'border-border-default bg-surface-1 hover:border-border-strong hover:bg-surface-2/70',
                ].join(' ')}
              >
                {/* Foto real */}
                <div className="relative aspect-[4/3] sm:w-36 shrink-0 rounded-xl overflow-hidden bg-surface-2 border border-border-subtle">
                  <Image
                    src={item.image}
                    alt={item.popularTitle}
                    fill
                    sizes="(min-width: 640px) 144px, 100vw"
                    className="object-cover"
                  />
                </div>

                {/* Detalles */}
                <div className="flex flex-1 flex-col justify-between gap-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block">
                        {item.popularTitle}
                      </span>
                      <h3 className="text-sm font-bold text-text-primary leading-tight">
                        {item.technicalTitle}
                      </h3>
                    </div>
                    <SeverityBadge level={item.risk} size="sm" />
                  </div>

                  <p className="text-xs leading-relaxed text-text-secondary mt-1">
                    {item.description}
                  </p>

                  <div className="flex items-center justify-end pt-1">
                    <span
                      className={[
                        'inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border',
                        isSelected
                          ? 'border-brand-accent bg-brand-accent text-white'
                          : 'border-border-default bg-surface-2 text-text-secondary hover:text-brand-accent',
                      ].join(' ')}
                    >
                      {isSelected ? (
                        <>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Seleccionado</span>
                        </>
                      ) : (
                        <span>Elegir este patrón</span>
                      )}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 sm:p-4 border-t border-border-default bg-surface-1 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-5 rounded-full border border-border-default bg-surface-2 text-xs font-semibold text-text-primary hover:bg-surface-3 transition-colors"
          >
            Cerrar guía
          </button>
        </div>
      </div>
    </div>
  );
}
