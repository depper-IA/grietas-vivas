/**
 * ImageZoomModal — Visor interactivo de alta resolución con zoom y paneo.
 *
 * Permite inspeccionar a fondo las fisuras estructurales:
 * - Zoom in / Zoom out / Reset (1x a 4x)
 * - Arrastre y paneo suave cuando la imagen está ampliada
 * - Alternar entre Foto de Detalle y Foto de Contexto
 * - Cero emojis: iconografía Lucide + tokens semánticos dark-first
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Layers,
  Camera,
} from 'lucide-react';

export interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** URL de la foto principal (detalle) */
  imageUrl: string;
  /** URL opcional de la segunda foto (contexto) */
  contextImageUrl?: string | null;
  /** Texto alternativo para accesibilidad */
  alt?: string;
  /** Título del visor */
  title?: string;
}

export function ImageZoomModal({
  isOpen,
  onClose,
  imageUrl,
  contextImageUrl,
  alt = 'Fotografía de daño estructural',
  title = 'Inspección de Imagen',
}: ImageZoomModalProps) {
  const [activeTab, setActiveTab] = useState<'detail' | 'context'>('detail');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });

  const activeUrl = activeTab === 'context' && contextImageUrl ? contextImageUrl : imageUrl;

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanPosition({ x: 0, y: 0 });
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const next = Math.max(prev - 0.5, 1);
      if (next === 1) setPanPosition({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Manejo de teclado (Esc para cerrar, +/- para zoom)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-' || e.key === '_') handleZoomOut();
      if (e.key === '0') handleResetZoom();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleZoomIn, handleZoomOut, handleResetZoom]);

  // Reset al abrir o cambiar de imagen
  useEffect(() => {
    if (isOpen) {
      handleResetZoom();
      setActiveTab('detail');
    }
  }, [isOpen, handleResetZoom]);

  if (!isOpen) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX - panPosition.x,
      y: e.clientY - panPosition.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoomLevel <= 1) return;
    setPanPosition({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (zoomLevel > 1) {
      handleResetZoom();
    } else {
      setZoomLevel(2.5);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md animate-in fade-in duration-150"
    >
      {/* Barra superior */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-surface-0/60 z-10">
        <div className="flex items-center gap-3">
          <Maximize2 className="h-5 w-5 text-brand-accent shrink-0" aria-hidden="true" />
          <div className="flex flex-col">
            <h3 className="text-sm font-semibold text-white tracking-tight">{title}</h3>
            <span className="text-[11px] text-text-muted">
              {zoomLevel > 1 ? `Zoom: ${zoomLevel.toFixed(1)}x (Arrastra para mover)` : 'Doble click o botones para zoom'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Selector de fotos si hay contexto */}
          {contextImageUrl && (
            <div className="flex items-center rounded-lg bg-surface-2 p-0.5 border border-white/10 mr-2">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('detail');
                  handleResetZoom();
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'detail'
                    ? 'bg-brand-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Detalle</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('context');
                  handleResetZoom();
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === 'context'
                    ? 'bg-brand-accent text-white shadow-sm'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Contexto</span>
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor de imagen"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Área central con la imagen interactiva */}
      <div
        className={`relative flex-1 overflow-hidden flex items-center justify-center select-none ${
          zoomLevel > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- pan/zoom requiere tamaño intrínseco de la imagen; incompatible con next/image fill. Fuente puede ser blob: (cache offline) o URL firmada de Supabase. */}
        <img
          src={activeUrl}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${panPosition.x}px, ${panPosition.y}px) scale(${zoomLevel})`,
            transition: isDragging ? 'none' : 'transform 150ms ease-out',
          }}
          className="max-h-[85vh] max-w-[95vw] object-contain select-none pointer-events-auto rounded-md shadow-2xl"
        />
      </div>

      {/* Barra flotante de controles de zoom */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full border border-white/15 bg-surface-1/90 px-4 py-2 shadow-2xl backdrop-blur-md z-10">
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoomLevel <= 1}
          aria-label="Reducir zoom"
          className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/15 disabled:opacity-40 active:scale-95 transition-all"
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </button>

        <span className="min-w-[48px] text-center font-mono text-xs font-semibold text-white tabular-nums">
          {Math.round(zoomLevel * 100)}%
        </span>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoomLevel >= 4}
          aria-label="Aumentar zoom"
          className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/15 disabled:opacity-40 active:scale-95 transition-all"
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="h-4 w-px bg-white/20 mx-1" />

        <button
          type="button"
          onClick={handleResetZoom}
          aria-label="Restablecer zoom"
          title="Restablecer zoom"
          className="flex h-8 w-8 items-center justify-center rounded-full text-white hover:bg-white/15 active:scale-95 transition-all"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
