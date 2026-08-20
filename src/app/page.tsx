'use client';

import Image from 'next/image';
import {
  BookOpen,
  Camera,
  FileText,
  Settings2,
  WifiOff,
  MapPin,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { MotionButton } from '@/components/ui/MotionButton';

export default function Home() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-0 px-4 py-5 sm:px-6 sm:py-8 text-text-primary pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] overflow-x-hidden">
      {/* Hero Container: Logo + Title + Value Prop */}
      <div className="relative w-full max-w-md mx-auto flex flex-col justify-center space-y-7">
        {/* Brand Logo: Emil Kowalski-style centered logo on circular badge */}
        <div className="flex flex-col items-center text-center space-y-3.5">
          <div className="relative h-28 w-28 sm:h-32 sm:w-32 rounded-full bg-white p-3 shadow-lg border border-border-default flex items-center justify-center">
            <Image
              src="/grietas_vivas_logo.png"
              alt="Logo Grietas Vivas"
              width={112}
              height={112}
              className="h-3/4 w-3/4 object-contain rounded-full"
              priority
            />
          </div>
          <div className="space-y-1">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-text-primary">
              Grietas Vivas
            </h1>
            <p className="text-sm sm:text-base font-medium text-text-secondary">
              Triaje forense de daños sísmicos
            </p>
          </div>
        </div>

        {/* Compact feature pills: One-line critical info — Emil Kowalski minimalist */}
        <div className="flex flex-wrap justify-center gap-2" role="list" aria-label="Características clave">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-1 border border-border-default text-text-primary">
            <WifiOff className="h-3.5 w-3.5 text-text-secondary shrink-0" aria-hidden="true" />
            100% Offline
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-1 border border-border-default text-text-primary">
            <MapPin className="h-3.5 w-3.5 text-text-secondary shrink-0" aria-hidden="true" />
            GPS Verificado
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-1 border border-border-default text-text-primary">
            <Sparkles className="h-3.5 w-3.5 text-text-secondary shrink-0" aria-hidden="true" />
            IA Forense
          </span>
        </div>
      </div>

      {/* Actions: Touch-first stack with primary CTA */}
      <div className="relative w-full max-w-md mx-auto flex flex-col gap-2.5 mt-8">
        {/* CTA primario — Capturar foto con HUD */}
        <MotionButton
          href="/capture"
          aria-label="Iniciar captura guiada de foto de grieta"
          className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-2xl bg-brand-cta px-6 text-base font-bold text-white shadow-lg shadow-brand-cta/30 hover:bg-brand-cta/90 active:scale-[0.98] focus:outline-none focus:ring-4 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
        >
          <span className="flex items-center gap-3">
            <Camera className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>Capturar Grieta</span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
        </MotionButton>

        {/* Secondary actions grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <MotionButton
            href="/reports"
            aria-label="Ver mis reportes de triaje estructural"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-border-default bg-surface-0 px-4 text-sm font-semibold text-text-primary hover:border-brand-accent hover:bg-surface-1 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <FileText className="h-4 w-4 text-brand-accent shrink-0" aria-hidden="true" />
            <span>Reportes</span>
          </MotionButton>

          <MotionButton
            href="/reconocimiento"
            aria-label="Abrir galería de reconocimiento de grietas"
            className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-border-default bg-surface-0 px-4 text-sm font-semibold text-text-primary hover:border-brand-accent hover:bg-surface-1 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-brand-accent"
          >
            <BookOpen className="h-4 w-4 text-brand-accent shrink-0" aria-hidden="true" />
            <span>Reconocimiento</span>
          </MotionButton>
        </div>

        {/* Tertiary action: Settings */}
        <MotionButton
          href="/settings"
          aria-label="Ir a configuración y proveedores de IA"
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-full text-xs text-text-muted hover:text-brand-accent active:scale-[0.98] transition-all"
        >
          <Settings2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Configuración y Modelos IA</span>
        </MotionButton>
      </div>

      {/* Footer minimalista — sin duplicación */}
      <footer className="mt-4 text-center text-[11px] text-text-muted space-y-0.5">
        <p className="font-semibold text-text-secondary">Grietas Vivas</p>
        <p>PWA de Emergencia Sísmica • Datos Cifrados • Reportes Inmutables</p>
      </footer>
    </main>
  );
}
