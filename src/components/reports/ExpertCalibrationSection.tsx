/**
 * ExpertCalibrationSection — Retroalimentación y calibración pericial para aprendizaje continuo.
 *
 * Permite a los usuarios e ingenieros validar o ajustar el diagnóstico de la IA,
 * alimentando un banco de datos calibrados (Ground Truth) para Few-Shot RAG y futuro Fine-Tuning.
 *
 * Cero emojis: SVG Lucide + tokens semánticos dark-first.
 */

import React, { useState } from 'react';
import {
  CheckCircle,
  Edit3,
  Sparkles,
  ShieldCheck,
  Send,
  Loader2,
  Check,
} from 'lucide-react';
import { CRACK_PATTERN_VALUES, PATTERN_METADATA, type CrackPattern } from '@/lib/validation/crackTaxonomy';
import { calibrateReport } from '@/app/actions/report';
import type { RiskLevel } from '@/lib/ai/types';

export interface ExpertCalibrationSectionProps {
  reportId: string;
  currentRiskLevel: RiskLevel;
  currentPattern?: string | null;
  existingCalibration?: {
    isAccurate: boolean;
    verifiedRiskLevel: string;
    verifiedPattern?: string | null;
    notes?: string | null;
    calibratedAt: string;
  } | null;
}

const RISK_OPTIONS: Array<{ value: RiskLevel; label: string }> = [
  { value: 'low', label: 'Bajo' },
  { value: 'medium', label: 'Medio' },
  { value: 'high', label: 'Alto' },
  { value: 'critical', label: 'Crítico' },
];

export function ExpertCalibrationSection({
  reportId,
  currentRiskLevel,
  currentPattern,
  existingCalibration,
}: ExpertCalibrationSectionProps) {
  const [isCalibrated, setIsCalibrated] = useState(Boolean(existingCalibration));
  const [calibrationData, setCalibrationData] = useState(existingCalibration);
  const [isEditing, setIsEditing] = useState(false);
  const [isAccurate, setIsAccurate] = useState(true);
  const [verifiedRisk, setVerifiedRisk] = useState<RiskLevel>(currentRiskLevel);
  const [verifiedPattern, setVerifiedPattern] = useState<string>(currentPattern || 'hairline_cosmetic');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleQuickConfirm = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await calibrateReport({
        reportId,
        isAccurate: true,
        verifiedRiskLevel: currentRiskLevel,
        verifiedPattern: currentPattern || undefined,
        notes: 'Confirmado por usuario/perito.',
      });

      if (res.success) {
        setIsCalibrated(true);
        setCalibrationData({
          isAccurate: true,
          verifiedRiskLevel: currentRiskLevel,
          verifiedPattern: currentPattern || null,
          notes: 'Confirmado por usuario/perito.',
          calibratedAt: new Date().toISOString(),
        });
      } else {
        setErrorMsg(res.error?.message || 'Error al guardar.');
      }
    } catch {
      setErrorMsg('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await calibrateReport({
        reportId,
        isAccurate,
        verifiedRiskLevel: verifiedRisk,
        verifiedPattern: verifiedPattern,
        notes,
      });

      if (res.success) {
        setIsCalibrated(true);
        setIsEditing(false);
        setCalibrationData({
          isAccurate,
          verifiedRiskLevel: verifiedRisk,
          verifiedPattern,
          notes,
          calibratedAt: new Date().toISOString(),
        });
      } else {
        setErrorMsg(res.error?.message || 'Error al guardar calibración.');
      }
    } catch {
      setErrorMsg('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section aria-labelledby="calibration-heading" className="mb-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 id="calibration-heading" className="text-lg font-bold text-text-primary tracking-tight flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-accent" aria-hidden="true" />
          <span>Calibración y Aprendizaje</span>
        </h2>
        {isCalibrated && !isEditing && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-minor/20 text-status-minor-fg text-xs font-semibold border border-status-minor-border/30">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Verificado</span>
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5 shadow-sm">
        {isCalibrated && !isEditing ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-secondary">
              {calibrationData?.isAccurate
                ? 'Este reporte ha sido validado como diagnóstico certero. Servirá como caso de referencia para mejorar análisis futuros.'
                : 'Diagnóstico calibrado manualmente. La corrección se ha indexado en el banco de aprendizaje.'}
            </p>
            {calibrationData?.notes && (
              <div className="rounded-xl bg-surface-2 p-3 border border-border-subtle text-xs text-text-primary">
                <span className="font-semibold text-text-muted block mb-1">Notas técnicas:</span>
                {calibrationData.notes}
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-brand-accent hover:underline pt-1"
            >
              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Modificar calibración</span>
            </button>
          </div>
        ) : !isEditing ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">
              ¿Es preciso este análisis? Ayuda al sistema a aprender confirmando o corrigiendo el diagnóstico técnico.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleQuickConfirm}
                disabled={loading}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-status-minor/20 border border-status-minor-border text-status-minor-fg px-4 py-2 text-sm font-semibold hover:bg-status-minor/30 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                <span>Es Correcto</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsEditing(true);
                  setIsAccurate(false);
                }}
                disabled={loading}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-surface-2 border border-border-default text-text-primary px-4 py-2 text-sm font-semibold hover:border-border-strong active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <Edit3 className="h-4 w-4 text-brand-accent" />
                <span>Corregir / Ajustar</span>
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCustomSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1.5">
                Nivel de Riesgo Real Verificado:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RISK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVerifiedRisk(opt.value)}
                    className={`min-h-[38px] rounded-lg border text-xs font-semibold transition-all ${
                      verifiedRisk === opt.value
                        ? 'bg-brand-accent text-white border-brand-accent shadow-sm'
                        : 'bg-surface-2 text-text-secondary border-border-default hover:text-text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="verified-pattern" className="block text-xs font-semibold text-text-primary mb-1.5">
                Patrón de Grieta Verificado (NSR-10):
              </label>
              <select
                id="verified-pattern"
                value={verifiedPattern}
                onChange={(e) => setVerifiedPattern(e.target.value)}
                className="w-full rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5 text-xs sm:text-sm text-text-primary focus:border-brand-accent focus:outline-none"
              >
                {CRACK_PATTERN_VALUES.map((pat) => (
                  <option key={pat} value={pat}>
                    {PATTERN_METADATA[pat as CrackPattern]?.labelEs || pat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="calib-notes" className="block text-xs font-semibold text-text-primary mb-1.5">
                Notas y observaciones técnicas:
              </label>
              <textarea
                id="calib-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Falla por cortante en muro de carga, se observa deformación en el dintel."
                className="w-full rounded-xl border border-border-default bg-surface-2 p-3 text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus:border-brand-accent focus:outline-none"
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-status-critical-fg font-medium">{errorMsg}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="min-h-[40px] px-4 rounded-xl border border-border-default bg-surface-2 text-xs font-semibold text-text-secondary hover:text-text-primary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="min-h-[40px] px-5 rounded-xl bg-brand-cta text-xs font-semibold text-white shadow-md hover:bg-brand-cta/90 disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                <span>Guardar Calibración</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
