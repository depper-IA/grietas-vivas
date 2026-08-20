/**
 * DualCaptureHUD — Vista guiada para captura dual de fotos
 * (Spec R5, R6, R7 de seismic-triage-upgrade).
 *
 * Orquesta dos pasos:
 *   - step="detail"  : Foto de detalle a 30-50 cm con referencia de
 *                      escala (moneda o tarjeta). Guia al usuario con
 *                      un cuadro de encuadre cercano superpuesto a la
 *                      camara en vivo o permite subir de galería.
 *   - step="context" : Foto de contexto a ~2 metros. Encuadra columnas,
 *                      vigas y elementos estructurales del entorno.
 *                      Muestra thumbnail del step 1 para que el usuario
 *                      recuerde que ya capturo. Permite capturar, subir
 *                      de galería, retomar paso 1 u omitir contexto.
 *
 * Cero emojis: SVG Lucide + tokens. ARIA live announcements para que
 * tecnologias asistivas anuncien el cambio de paso. Tap targets
 * >= 44px.
 */

'use client';

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Camera,
  Coins,
  Maximize2,
  RefreshCw,
  Square,
  Upload,
  SkipForward,
  Eye,
  X,
} from 'lucide-react';
import { CameraViewfinder } from './CameraViewfinder';

/** Paso actual del flujo de captura dual. */
export type DualCaptureStep = 'detail' | 'context';

/** Props publicas del componente. */
export interface DualCaptureHUDProps {
  /** Paso actual: detail (R5) o context (R6). */
  step: DualCaptureStep;
  /** URL del blob/preview de la foto de detalle (para thumbnail en step 2). */
  detailPreviewUrl?: string | null;
  /** Callback invocado al confirmar captura: recibe (blob, step). */
  onCapture: (blob: Blob, step: DualCaptureStep) => void;
  /** Callback invocado al pulsar "Retomar foto 1" (solo en step=context). */
  onRetakeStep1: () => void;
  /** Callback opcional al pulsar "Omitir contexto" (solo en step=context). */
  onSkipContext?: () => void;
  /** Clases Tailwind adicionales para override externo. */
  className?: string;
}

const DEFAULT_ARIA_LABEL = 'Captura dual de fotos';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

async function normalizeImageForAnalysis(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file);
  }

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el contexto de canvas.');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('No se pudo convertir la imagen a JPEG.'));
        }
      },
      'image/jpeg',
      0.9
    );
  });
}

/**
 * Marco de encuadre cercano (step=detail) con marcador de escala.
 * Renderizado como overlay absoluto sobre el `CameraViewfinder`.
 */
function DetailFrame() {
  return (
    <div
      data-testid="dual-hud-scale-box"
      className="pointer-events-none absolute inset-2 sm:inset-4 flex items-center justify-center"
    >
      <div className="relative aspect-square w-full max-w-[85%] max-h-[85%] rounded-2xl border-2 border-dashed border-status-moderate">
        {/* Esquinas resaltadas en oro/amarillo */}
        <span
          aria-hidden="true"
          className="absolute -top-1 -left-1 h-5 w-5 border-t-4 border-l-4 border-status-moderate rounded-tl"
        />
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 h-5 w-5 border-t-4 border-r-4 border-status-moderate rounded-tr"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-status-moderate rounded-bl"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-status-moderate rounded-br"
        />
        {/* Texto guia sobre banda semitransparente */}
        <span className="absolute inset-x-0 bottom-3 mx-auto flex max-w-[92%] items-center justify-center gap-1.5 rounded-xl bg-black/80 px-3 py-2 text-center text-xs font-semibold text-white sm:text-sm shadow-xl backdrop-blur-md border border-white/20">
          <Coins className="h-4 w-4 text-status-moderate shrink-0" aria-hidden="true" />
          <span>Detalle (30-50 cm) · Coloca una moneda ($500 o $1.000) o tu mano al lado</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Marco de encuadre amplio (step=context) con marcadores de contexto
 * en las esquinas para ayudar a encuadrar columnas y vigas.
 */
function ContextFrame() {
  return (
    <div
      data-testid="dual-hud-context-frame"
      className="pointer-events-none absolute inset-2 sm:inset-4 flex items-center justify-center"
    >
      <div className="relative aspect-video w-full max-w-[92%] max-h-[88%] rounded-2xl border-2 border-dashed border-status-minor">
        <span
          aria-hidden="true"
          className="absolute -top-1 -left-1 h-5 w-5 border-t-4 border-l-4 border-status-minor rounded-tl"
        />
        <span
          aria-hidden="true"
          className="absolute -top-1 -right-1 h-5 w-5 border-t-4 border-r-4 border-status-minor rounded-tr"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -left-1 h-5 w-5 border-b-4 border-l-4 border-status-minor rounded-bl"
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 h-5 w-5 border-b-4 border-r-4 border-status-minor rounded-br"
        />
        <span className="absolute inset-x-0 bottom-3 mx-auto flex max-w-[92%] items-center justify-center gap-1.5 rounded-xl bg-black/80 px-3 py-2 text-center text-xs font-semibold text-white sm:text-sm shadow-xl backdrop-blur-md border border-white/20">
          <Maximize2 className="h-4 w-4 text-status-minor shrink-0" aria-hidden="true" />
          <span>Contexto (2 metros) · Enmarca columnas, vigas y losas</span>
        </span>
      </div>
    </div>
  );
}

/**
 * Thumbnail pequeno de la foto de detalle capturada, visible solo
 * cuando estamos en step=context y existe un preview URL.
 */
function Step1Thumbnail({ src }: { src: string }) {
  return (
    <figure
      data-testid="dual-hud-step1-thumbnail"
      className="flex items-center gap-2 rounded-lg border border-border-default bg-surface-2 p-2"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Miniatura de la foto de detalle capturada"
        className="h-12 w-12 rounded object-cover"
      />
      <figcaption className="text-xs text-text-secondary">
        Foto 1 (detalle) capturada
      </figcaption>
    </figure>
  );
}

/**
 * DualCaptureHUD — Componente publico.
 */
export function DualCaptureHUD({
  step,
  detailPreviewUrl = null,
  onCapture,
  onRetakeStep1,
  onSkipContext,
  className = '',
}: DualCaptureHUDProps) {
  const [captureRequested, setCaptureRequested] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showExampleModal, setShowExampleModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleCaptureClick = useCallback(() => {
    if (isCapturing) return;
    setUploadError(null);
    setIsCapturing(true);
    setCaptureRequested(true);
  }, [isCapturing]);

  const handleCameraCapture = useCallback(
    (blob: Blob) => {
      onCapture(blob, step);
    },
    [onCapture, step]
  );

  const handleCameraCaptureComplete = useCallback(() => {
    setCaptureRequested(false);
    setIsCapturing(false);
  }, []);

  const handleCameraError = useCallback((message: string | null) => {
    setCameraError(message);
  }, []);

  const handleUploadClick = useCallback(() => {
    setUploadError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;

      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        setUploadError(
          `Formato no soportado (${file.type || 'desconocido'}). Usa JPG, PNG, WebP o HEIC.`
        );
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setUploadError(
          `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)}MB. Máximo permitido: 10MB.`
        );
        return;
      }

      setIsCapturing(true);
      setUploadError(null);

      try {
        const normalizedBlob = await normalizeImageForAnalysis(file);
        onCapture(normalizedBlob, step);
      } catch (err) {
        setUploadError(
          err instanceof Error
            ? err.message
            : 'No se pudo procesar la imagen seleccionada.'
        );
      } finally {
        setIsCapturing(false);
      }
    },
    [onCapture, step]
  );

  const isContext = step === 'context';

  return (
    <section
      role="region"
      aria-label={DEFAULT_ARIA_LABEL}
      className={[
        'flex w-full flex-1 flex-col gap-4 rounded-2xl border border-border-default bg-surface-1 p-4 sm:p-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Announcer accesible (cambia con step) */}
      <p
        data-testid="dual-hud-step-announcer"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isContext
          ? 'Ahora foto de contexto'
          : 'Ahora foto de detalle'}
      </p>

      {/* Header: indicador de paso + titulo */}
      <header className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {isContext ? '2 / 2' : '1 / 2'}
          </p>
          <h2 className="text-base font-bold leading-tight text-text-primary sm:text-lg">
            {isContext
              ? 'Paso 2 de 2: Foto de Contexto (a 2 metros)'
              : 'Paso 1 de 2: Foto de Detalle (30-50 cm)'}
          </h2>
        </div>
        <Camera
          className="h-6 w-6 shrink-0 text-brand-accent"
          aria-hidden="true"
          focusable="false"
        />
      </header>

      {/* Visor de camara en vivo con overlay del marco segun paso */}
      <div
        data-testid="dual-hud-camera"
        className="relative w-full flex-1 min-h-[50vh] sm:min-h-[55vh]"
      >
        <CameraViewfinder
          captureRequested={captureRequested}
          onCapture={handleCameraCapture}
          onCaptureComplete={handleCameraCaptureComplete}
          onError={handleCameraError}
        />
        {isContext ? <ContextFrame /> : <DetailFrame />}
        {(cameraError || uploadError) && (
          <p
            role="alert"
            className="mt-2 text-center text-xs text-status-critical-border font-medium"
          >
            {cameraError || uploadError}
          </p>
        )}
      </div>

      {/* Texto guia descriptivo con boton interactivo para ver foto de ejemplo */}
      <div className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-surface-2/60 border border-border-subtle">
        <p className="text-xs sm:text-sm leading-snug text-text-secondary flex-1">
          {isContext
            ? 'Aléjate unos 2 metros. Enmarca columnas, vigas y elementos estructurales del entorno.'
            : 'Acércate a 30-50 cm. Coloca una moneda ($500 o $1.000) o tu mano al lado para dar escala a la IA.'}
        </p>
        <button
          type="button"
          onClick={() => setShowExampleModal(true)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-brand-accent/40 bg-surface-1 px-3 py-1 text-xs font-semibold text-brand-accent hover:bg-surface-2 transition-colors shrink-0"
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Ver ejemplo</span>
        </button>
      </div>

      {/* Modal didactico de encuadre */}
      {showExampleModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ejemplo de encuadre fotográfico"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="relative flex flex-col w-full max-w-sm rounded-2xl border border-border-default bg-surface-0 shadow-2xl overflow-hidden p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
              <h3 className="text-sm font-bold text-text-primary">
                {isContext ? 'Foto de Contexto (2 m)' : 'Foto de Detalle con Escala (30-50 cm)'}
              </h3>
              <button
                type="button"
                onClick={() => setShowExampleModal(false)}
                aria-label="Cerrar ejemplo"
                className="p-1 rounded-lg text-text-muted hover:text-text-primary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-surface-2 border border-border-subtle">
              <Image
                src={isContext ? '/examples/guide-context-beam.webp' : '/examples/guide-detail-coin.webp'}
                alt="Ejemplo didáctico de encuadre"
                fill
                sizes="(min-width: 640px) 384px, 100vw"
                className="object-cover"
              />
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              {isContext
                ? 'Muestra las uniones con columnas, vigas y losas para que los algoritmos de IA entiendan la ubicación global del daño.'
                : 'Coloca una moneda ($500 o $1.000) o tu mano al lado para que la IA calibre con exactitud el ancho milimétrico y la profundidad de la fisura.'}
            </p>

            <button
              type="button"
              onClick={() => setShowExampleModal(false)}
              className="w-full min-h-[40px] rounded-xl bg-brand-cta text-xs font-semibold text-white shadow-sm hover:bg-brand-cta/90"
            >
              Entendido, volver al visor
            </button>
          </div>
        </div>
      )}

      {/* Thumbnail del step 1 cuando estamos en step 2 */}
      {isContext && detailPreviewUrl && (
        <Step1Thumbnail src={detailPreviewUrl} />
      )}

      {/* Input de archivo oculto para carga desde galeria */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      {/* Botones de accion */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center pt-1">
        <button
          type="button"
          data-testid="dual-hud-capture-button"
          onClick={handleCaptureClick}
          disabled={isCapturing}
          aria-label={
            isContext ? 'Capturar foto de contexto' : 'Capturar foto de detalle'
          }
          className="flex min-h-[52px] flex-1 items-center justify-center gap-2.5 rounded-xl bg-brand-cta px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-cta/25 transition-all duration-150 hover:bg-brand-cta/90 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera className="h-5 w-5" aria-hidden="true" focusable="false" />
          <span>{isContext ? 'Capturar foto de contexto' : 'Capturar foto de detalle'}</span>
        </button>

        <button
          type="button"
          data-testid="dual-hud-upload-button"
          onClick={handleUploadClick}
          disabled={isCapturing}
          aria-label="Subir foto desde galería"
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-border-default bg-surface-2 px-4 py-3 text-sm font-semibold text-text-primary transition-all duration-150 hover:bg-surface-3 hover:border-border-strong active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0 disabled:opacity-50"
        >
          <Upload className="h-5 w-5 text-brand-accent" aria-hidden="true" focusable="false" />
          <span className="hidden sm:inline">Subir de galería</span>
          <span className="sm:hidden">Galería</span>
        </button>

        {isContext && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              data-testid="dual-hud-retake-step1"
              onClick={onRetakeStep1}
              aria-label="Retomar foto 1"
              className="flex min-h-[52px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-border-default bg-surface-2 px-3.5 py-3 text-xs sm:text-sm font-semibold text-text-primary transition-all duration-150 hover:bg-surface-3 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" focusable="false" />
              <span>Retomar 1</span>
            </button>

            {onSkipContext && (
              <button
                type="button"
                data-testid="dual-hud-skip-context"
                onClick={onSkipContext}
                aria-label="Omitir foto de contexto"
                className="flex min-h-[52px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border border-border-subtle bg-surface-1 px-3.5 py-3 text-xs sm:text-sm font-semibold text-text-muted hover:text-text-primary hover:bg-surface-2 active:scale-[0.98] transition-all"
              >
                <SkipForward className="h-4 w-4" aria-hidden="true" focusable="false" />
                <span>Omitir</span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}