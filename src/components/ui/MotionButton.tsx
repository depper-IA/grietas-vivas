'use client';

/**
 * MotionButton — Wrapper sobre <button> / Next.js <Link> con animaciones de
 * Framer Motion. Mantiene el sistema unificado de botones:
 *
 *   - Primary:   `bg-brand-cta text-white`      (pill roja)
 *   - Secondary: `bg-white border text-brand`  (outline azul)
 *   - Tertiary:  `bg-white text-text-muted`    (muted)
 *
 * Animaciones:
 *   - whileHover: scale 1.04 + y: -2 (lift sutil)
 *   - whileTap:   scale 0.96 (press)
 *   - spring:     stiffness 400, damping 20 (smooth pero snappy)
 *
 * Respeta `prefers-reduced-motion` automáticamente — sin animación si el
 * usuario lo configuró en su SO.
 */

import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import Link from 'next/link';
import {
  forwardRef,
  type ReactNode,
} from 'react';

const HOVER = { scale: 1.04, y: -2 };
const TAP = { scale: 0.96 };
const SPRING = { type: 'spring' as const, stiffness: 400, damping: 20 };

export interface MotionButtonProps {
  /** Si se pasa, renderiza Next.js <Link> con motion.a; si no, <motion.button>. */
  href?: string;
  /** Contenido del botón. */
  children: ReactNode;
  /** Clases Tailwind adicionales (siguen el sistema unificado). */
  className?: string;
  /** Props específicas de button (cuando href ausente). */
  buttonProps?: Omit<HTMLMotionProps<'button'>, 'children' | 'whileHover' | 'whileTap' | 'transition'>;
  /** aria-label para accesibilidad. */
  'aria-label'?: string;
  /** data-testid para testing. */
  'data-testid'?: string;
  /** id para DOM element. */
  id?: string;
  /** type para <button> (submit, button, reset). */
  type?: 'submit' | 'button' | 'reset';
  /** disabled para <button>. */
  disabled?: boolean;
  /** onClick handler (para <button>). */
  onClick?: () => void;
  [key: `data-${string}`]: unknown;
}

export const MotionButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, MotionButtonProps>(
  function MotionButton(
    {
      href,
      children,
      className,
      buttonProps,
      type = 'button',
      disabled,
      onClick,
      'aria-label': ariaLabel,
      'data-testid': testId,
      id,
      ...restProps
    },
    ref,
  ) {
    const shouldReduceMotion = useReducedMotion();

    const motionProps = shouldReduceMotion
      ? {}
      : { whileHover: HOVER, whileTap: TAP, transition: SPRING };

    if (href !== undefined) {
      return (
        <Link href={href} passHref legacyBehavior>
          <motion.a
            ref={ref as React.Ref<HTMLAnchorElement>}
            id={id}
            data-testid={testId}
            className={className}
            aria-label={ariaLabel}
            {...motionProps}
            {...restProps}
          >
            {children}
          </motion.a>
        </Link>
      );
    }

    return (
      <motion.button
        ref={ref as React.Ref<HTMLButtonElement>}
        id={id}
        data-testid={testId}
        type={type}
        disabled={disabled}
        onClick={onClick}
        className={className}
        aria-label={ariaLabel}
        {...motionProps}
        {...restProps}
        {...buttonProps}
      >
        {children}
      </motion.button>
    );
  },
);
