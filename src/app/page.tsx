'use client';

import Image from 'next/image';
import { Camera, FileText, Settings2, WifiOff, MapPin, Sparkles } from 'lucide-react';
import { MotionButton } from '@/components/ui/MotionButton';

export default function Home() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-surface-0 px-4 py-8 sm:px-6 sm:py-12 text-text-primary pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] overflow-x-hidden">
      {/* Background glow sutil — solo para dar profundidad en el hero */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 sm:w-96 h-80 sm:h-96 bg-brand-cta/10 rounded-full blur-3xl pointer-events-none" />

      {/* Hero Container */}
      <div className="relative text-center max-w-md w-full">
        {/* Brand Logo — PNG institucional, fondo claro coherente con tema */}
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-2xl bg-brand-cta/10 border border-brand-cta/30 shadow-lg">
          <Image
            src="/grietas_vivas_logo.png"
            alt="Logo Ruta Ayuda — Grietas Vivas"
            width={72}
            height={72}
            className="h-16 w-16 object-contain"
            priority
          />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">Grietas Vivas</h1>
        <p className="mt-2 text-base font-medium text-brand-accent">
          Triaje de grietas post-sismo con IA
        </p>
        <p className="mt-3 text-sm text-text-secondary leading-relaxed">
          Documenta daños estructurales con metadatos GPS, marcas de tiempo certificadas y análisis con IA. Genera reportes inmutables para autoridades y aseguradoras.
        </p>

        {/* Feature Pills — fondo claro con borde sutil, íconos ámbar/verde como acento */}
        <div className="mt-6 flex flex-wrap justify-center gap-2" role="list" aria-label="Características clave">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-1 border border-border-default text-text-primary">
            <WifiOff className="h-3.5 w-3.5 text-brand-accent shrink-0" aria-hidden="true" />
            100% Offline-First
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-1 border border-border-default text-text-primary">
            <MapPin className="h-3.5 w-3.5 text-status-minor-bg shrink-0" aria-hidden="true" />
            GPS Certificado
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-surface-1 border border-border-default text-text-primary">
            <Sparkles className="h-3.5 w-3.5 text-brand-accent shrink-0" aria-hidden="true" />
            Análisis Estructural IA
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="relative mt-8 flex w-full max-w-sm flex-col gap-3">
        {/* CTA primario — pill rojo con animacion spring de Framer Motion */}
        <MotionButton
          href="/capture"
          aria-label="Abrir visor HUD para capturar foto de grieta"
          className="flex min-h-[52px] items-center justify-center gap-2.5 rounded-full bg-brand-cta px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-brand-cta/30 hover:bg-brand-cta/90 focus:outline-none focus:ring-2 focus:ring-brand-cta focus:ring-offset-2 focus:ring-offset-surface-0"
        >
          <Camera className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Capturar Grieta (HUD)</span>
        </MotionButton>

        {/* Secondary — outline azul */}
        <MotionButton
          href="/reports"
          aria-label="Ver mis reportes de triaje estructural"
          className="flex min-h-[48px] items-center justify-center gap-2.5 rounded-full border border-brand-accent bg-white px-6 py-3 text-base font-medium text-brand-accent shadow-sm hover:bg-brand-accent/5 focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
        >
          <FileText className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>Mis Reportes de Triaje</span>
        </MotionButton>

        {/* Tertiary — muted */}
        <MotionButton
          href="/settings"
          aria-label="Ir a configuración y proveedores de modelos IA"
          className="flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-border-default bg-white px-6 py-2.5 text-sm font-medium text-text-muted hover:text-brand-accent hover:border-brand-accent"
        >
          <Settings2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Configuración y Modelos IA</span>
        </MotionButton>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-text-muted">
        <p>Grietas Vivas — Cali, Colombia</p>
        <p className="mt-1">PWA de Emergencia Sísmica • Datos Cifrados • Reportes Inmutables</p>
      </footer>
    </main>
  );
}
