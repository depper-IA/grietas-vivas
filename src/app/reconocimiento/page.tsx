import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, BookOpen, ChevronRight } from 'lucide-react';
import { MotionButton } from '@/components/ui/MotionButton';

/**
 * Nivel de riesgo aplicado a cada tipo de grieta. Se mapea a la tripleta
 * bg/fg/border de los tokens semanticos para garantizar contraste WCAG.
 */
type RiskLevel =
  | 'bajo'
  | 'bajo-moderado'
  | 'moderado'
  | 'moderado-alto'
  | 'alto'
  | 'muy-alto';

interface CrackType {
  readonly id: string;
  readonly title: string;
  readonly risk: RiskLevel;
  readonly description: string;
  readonly image: string;
  readonly width: number;
  readonly height: number;
}

const CRACK_TYPES: readonly CrackType[] = [
  {
    id: 'fisura-superficial',
    title: 'Fisuras Superficiales',
    risk: 'bajo',
    description:
      'Muy finas, tipo cabello. En revoque, pintura o estuco. Usualmente no afectan la estructura.',
    image: '/reconocimiento/fisura-superficial.webp',
    width: 200,
    height: 105,
  },
  {
    id: 'vertical',
    title: 'Verticales',
    risk: 'bajo-moderado',
    description:
      'Rectas de arriba abajo. Pueden ser por retraccion o pequenos movimientos. Revisar si aumentan.',
    image: '/reconocimiento/vertical.webp',
    width: 200,
    height: 105,
  },
  {
    id: 'horizontal',
    title: 'Horizontales',
    risk: 'moderado',
    description:
      'Paralelas al piso. Pueden indicar empujes o deformaciones. Requieren atencion.',
    image: '/reconocimiento/horizontal.webp',
    width: 200,
    height: 105,
  },
  {
    id: 'diagonal',
    title: 'Diagonales (~45 grados)',
    risk: 'alto',
    description:
      'En forma diagonal en muros. Pueden indicar movimientos estructurales o asentamientos. Requiere evaluacion.',
    image: '/reconocimiento/diagonal.webp',
    width: 200,
    height: 105,
  },
  {
    id: 'escalera',
    title: 'En Escalera',
    risk: 'alto',
    description:
      'Siguen las juntas de los ladrillos o bloques. Suele asociarse a asentamientos. Requiere evaluacion.',
    image: '/reconocimiento/escalera.webp',
    width: 200,
    height: 105,
  },
  {
    id: 'puerta-ventana',
    title: 'Desde Esquinas de Puertas o Ventanas',
    risk: 'moderado',
    description:
      'Diagonales desde las esquinas. Pueden indicar concentracion de esfuerzos o falta de refuerzo.',
    image: '/reconocimiento/puerta-ventana.webp',
    width: 200,
    height: 85,
  },
  {
    id: 'muro-columna',
    title: 'Separacion Muro-Columna',
    risk: 'moderado',
    description:
      'Grieta vertical en la union entre muro y columna. Diferente comportamiento entre ambos elementos.',
    image: '/reconocimiento/muro-columna.webp',
    width: 200,
    height: 85,
  },
  {
    id: 'muro-losa-viga',
    title: 'Separacion Muro-Losa/Viga',
    risk: 'moderado-alto',
    description:
      'Grieta horizontal en la parte superior del muro. Puede indicar deflexion de la losa o viga.',
    image: '/reconocimiento/muro-losa-viga.webp',
    width: 200,
    height: 85,
  },
  {
    id: 'viga-columna',
    title: 'En Vigas o Columnas de Concreto',
    risk: 'alto',
    description:
      'En elementos estructurales (vigas, columnas, nudos). Puede indicar sobrecarga, cortante, flexion o dano.',
    image: '/reconocimiento/viga-columna.webp',
    width: 200,
    height: 85,
  },
  {
    id: 'oxido',
    title: 'Con Oxido o Desprendimiento',
    risk: 'muy-alto',
    description:
      'Grieta con manchas de oxido, concreto suelto o acero expuesto. Puede haber corrosion. Atencion inmediata.',
    image: '/reconocimiento/oxido.webp',
    width: 200,
    height: 85,
  },
] as const;

interface RiskPresentation {
  readonly label: string;
  readonly ariaLabel: string;
  readonly toneClasses: string;
  readonly solid?: boolean;
}

const RISK_PRESENTATION: Record<RiskLevel, RiskPresentation> = {
  bajo: {
    label: 'Riesgo Bajo',
    ariaLabel: 'Nivel de riesgo: bajo',
    toneClasses:
      'bg-status-minor/15 text-status-minor-fg border-status-minor-border',
  },
  'bajo-moderado': {
    label: 'Riesgo Bajo a Moderado',
    ariaLabel: 'Nivel de riesgo: bajo a moderado',
    toneClasses:
      'bg-status-moderate/15 text-status-moderate-fg border-status-moderate-border',
  },
  moderado: {
    label: 'Riesgo Moderado',
    ariaLabel: 'Nivel de riesgo: moderado',
    toneClasses:
      'bg-status-moderate/15 text-status-moderate-fg border-status-moderate-border',
  },
  'moderado-alto': {
    label: 'Riesgo Moderado a Alto',
    ariaLabel: 'Nivel de riesgo: moderado a alto',
    toneClasses:
      'bg-status-critical/15 text-status-critical-border border-status-critical-border',
  },
  alto: {
    label: 'Riesgo Alto',
    ariaLabel: 'Nivel de riesgo: alto',
    toneClasses:
      'bg-status-critical/15 text-status-critical-border border-status-critical-border',
  },
  'muy-alto': {
    label: 'Riesgo Muy Alto',
    ariaLabel: 'Nivel de riesgo: muy alto',
    toneClasses:
      'bg-status-critical text-white border-status-critical-border',
    solid: true,
  },
};

function RiskBadge({ level }: { level: RiskLevel }) {
  const presentation = RISK_PRESENTATION[level];
  return (
    <span
      role="status"
      aria-label={presentation.ariaLabel}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide',
        'transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]',
        presentation.toneClasses,
      ].join(' ')}
    >
      {presentation.solid ? (
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      ) : null}
      <span>{presentation.label}</span>
    </span>
  );
}

export const metadata = {
  title: 'Reconocimiento de Grietas — Grietas Vivas',
  description:
    'Guia visual para identificar los 10 tipos de grietas mas comunes tras un sismo. Aprende a reconocer patrones y niveles de riesgo.',
};

export default function ReconocimientoPage() {
  return (
    <main className="min-h-[100dvh] bg-surface-0 text-text-primary overflow-x-hidden pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      {/* Hero compacto */}
      <header className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Volver al inicio"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-text-secondary transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-surface-1 hover:text-brand-accent focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Volver al inicio</span>
        </Link>

        <div className="mt-2 flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-accent/10 border border-brand-accent/30">
            <BookOpen
              className="h-6 w-6 text-brand-accent"
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
              Reconocimiento de Grietas
            </h1>
            <p className="mt-1 text-sm text-text-secondary sm:text-base">
              Aprende a identificar los 10 tipos de grietas post-sismo mas
              comunes.
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-text-muted leading-relaxed max-w-2xl">
          Guia visual de campo. Observa el patron, ubica la ubicacion en la
          estructura y cruza con el nivel de riesgo sugerido. Si tienes
          dudas, documenta con la app y consulta a un profesional.
        </p>
      </header>

      {/* Bento grid responsive */}
      <section
        aria-label="Galeria de tipos de grietas"
        className="mx-auto mt-8 grid w-full max-w-4xl grid-cols-1 gap-4 px-4 pb-10 sm:px-6 md:grid-cols-2 md:gap-5 lg:grid-cols-3"
      >
        {CRACK_TYPES.map((crack) => (
          <article
            key={crack.id}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-1 shadow-sm transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:shadow-lg focus-within:-translate-y-0.5 focus-within:shadow-lg"
          >
            <div className="relative aspect-[4/3] w-full bg-surface-2">
              <Image
                src={crack.image}
                alt={`Diagrama del patron: ${crack.title}`}
                fill
                sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.02]"
              />
            </div>

            <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
              <h2 className="text-base font-semibold tracking-tight text-text-primary sm:text-lg">
                {crack.title}
              </h2>
              <RiskBadge level={crack.risk} />
              <p className="text-sm leading-relaxed text-text-secondary">
                {crack.description}
              </p>
            </div>
          </article>
        ))}
      </section>

      {/* Volver al inicio */}
      <footer className="mx-auto flex w-full max-w-4xl justify-center px-4 pb-2 sm:px-6">
        <MotionButton
          href="/"
          aria-label="Volver al inicio"
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-brand-accent bg-white px-6 py-3 text-sm font-medium text-brand-accent shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-accent focus:ring-offset-2 focus:ring-offset-surface-0"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
          <span>Volver al inicio</span>
        </MotionButton>
      </footer>
    </main>
  );
}