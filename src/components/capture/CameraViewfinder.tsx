'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface CameraViewfinderProps {
  /** Called when a frame is captured from the video stream */
  onCapture?: (blob: Blob) => void;
  /** External trigger to take a snapshot */
  captureRequested?: boolean;
  /** Reset capture trigger after snapshot */
  onCaptureComplete?: () => void;
  /** Estado del torch (linterna). Cuando cambia, se aplica al track de video si el navegador lo soporta. */
  torchOn?: boolean;
  /** Callback opcional cuando la camara falla (permite a los callers
   *  mostrar el mensaje en su propio layout sin reemplazar el visor). */
  onError?: (message: string | null) => void;
}

/**
 * CameraViewfinder — renders a live camera stream via getUserMedia.
 * Captures a JPEG snapshot when triggered externally via captureRequested.
 * Optionally applies torch (flashlight) constraint to the video track when
 * the device and browser support it (Chrome on Android mainly).
 */
export function CameraViewfinder({
  onCapture,
  captureRequested,
  onCaptureComplete,
  torchOn = false,
  onError,
}: CameraViewfinderProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Notifica al padre cuando cambia el error para que pueda mostrarlo
  // en su propio layout (importante cuando el visor se oculta detras
  // de un overlay, como dentro del DualCaptureHUD).
  useEffect(() => {
    onError?.(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  // Start camera stream
  useEffect(() => {
    let cancelled = false;

    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          await videoRef.current.play();
          setIsReady(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof DOMException && err.name === 'NotAllowedError'
              ? 'Acceso a la cámara denegado. Por favor habilita los permisos en tu navegador.'
              : 'No se pudo acceder a la cámara. Por favor verifica tu dispositivo.'
          );
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply torch constraint when torchOn changes (graceful degradation: silencioso si no soportado)
  useEffect(() => {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;

    const capabilities = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & {
      torch?: boolean;
    };

    if (!('torch' in capabilities)) return;

    track
      .applyConstraints({
        advanced: [{ torch: torchOn } as MediaTrackConstraintSet & { torch?: boolean }],
      })
      .catch(() => {
        // Silenciar: torch no soportado en este navegador/dispositivo
      });
  }, [torchOn, stream]);

  // Capture snapshot when requested
  const takeSnapshot = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isReady) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob && onCapture) {
          onCapture(blob);
        }
        onCaptureComplete?.();
      },
      'image/jpeg',
      0.9
    );
  }, [isReady, onCapture, onCaptureComplete]);

  useEffect(() => {
    if (captureRequested && isReady) {
      takeSnapshot();
    }
  }, [captureRequested, isReady, takeSnapshot]);

  if (error) {
    return (
      <section
        className="flex h-full min-h-[60vh] w-full flex-1 items-center justify-center rounded-2xl border border-status-critical-border bg-surface-1 p-4 shadow-lg"
        aria-label="Cámara no disponible"
      >
        <p className="px-4 text-center text-sm font-medium text-status-critical-border">{error}</p>
      </section>
    );
  }

  return (
    <section className="relative h-full min-h-[60vh] w-full flex-1 overflow-hidden rounded-2xl border border-border-default bg-black shadow-lg">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="h-full w-full object-cover"
        aria-label="Visor de cámara"
      />
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-1">
          <p className="text-sm font-medium text-text-muted">Iniciando cámara...</p>
        </div>
      )}
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </section>
  );
}