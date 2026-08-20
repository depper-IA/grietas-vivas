'use client';

/**
 * MotionButton — Lazy-loaded wrapper.
 *
 * The actual implementation lives in `MotionButtonStatic.tsx`. This file
 * is a thin re-export via `next/dynamic` so the Framer Motion library is
 * code-split out of the initial JS bundle.
 *
 * `ssr` is intentionally left at its default (`true`): the button's real
 * markup (a working `<a href>` or `<button>`) still needs to be in the
 * server-rendered HTML so it's visible and clickable before hydration.
 * Only the JS chunk is deferred, not the server render — `ssr: false`
 * was tried here previously and left every button blank until the
 * Framer Motion chunk resolved client-side.
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
);

export const MotionButton = MotionButtonLazy;
export type { MotionButtonProps };
