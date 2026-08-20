'use client';

/**
 * MotionButton — Lazy-loaded wrapper.
 *
 * The actual implementation lives in `MotionButtonStatic.tsx`. This file
 * is a thin re-export via `next/dynamic` with `ssr: false` so the Framer
 * Motion library is excluded from the initial JS bundle.
 *
 * Spec: sdd/improve-project 3.4 — Lazy load Framer Motion in MotionButton.
 *
 * Storybook / unit tests that need the static implementation can import
 * from `./MotionButtonStatic` directly (the original component shape).
 */

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { MotionButtonProps } from './MotionButtonStatic';

const MotionButtonLazy: ComponentType<MotionButtonProps> = dynamic(
  () => import('./MotionButtonStatic').then((m) => m.MotionButton),
  {
    ssr: false,
    loading: () => null,
  },
);

export const MotionButton = MotionButtonLazy;
export type { MotionButtonProps };
