/**
 * Tests para CaptureViewfinderHUD — Controles base, crosshair, linterna y botón de captura.
 *
 * Contrato:
 *   - Crosshair / grilla de alineacion (rule of thirds) en SVG.
 *   - Referencia de escala en cm (guia visual de tamano).
 *   - Boton de linterna (torch): toggle on/off con iconos Lucide (Flashlight / Zap).
 *   - Boton de captura: maquina de estados (idle | capturing | processing)
 *     con animacion ring-pulse durante capturing.
 *   - Accesibilidad: aria-label descriptivo en cada control, role/aria-live
 *     en el indicador de nivel.
 *
 * Ref: spec `visual-redesign-core` (Capture Viewfinder HUD).
 * Ref: design `CaptureViewfinderHUD` (slice 4, work unit 4).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CaptureViewfinderHUD } from './CaptureViewfinderHUD';

describe('CaptureViewfinderHUD — Controles Principales', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  describe('crosshair / grilla de alineacion (rule of thirds)', () => {
    it('renderiza un SVG con la grilla de tercios', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const crosshair = container.querySelector('[data-testid="crosshair"]');
      expect(crosshair).not.toBeNull();
      expect(crosshair?.tagName.toLowerCase()).toBe('svg');
    });

    it('el crosshair expone role="presentation" y aria-hidden para AT', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const crosshair = container.querySelector('[data-testid="crosshair"]');
      expect(crosshair).toHaveAttribute('aria-hidden', 'true');
    });

    it('la grilla tiene opacidad reducida (~0.4) para no competir con la imagen', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const crosshair = container.querySelector('[data-testid="crosshair"]');
      const classAttr = crosshair?.getAttribute('class') ?? '';
      expect(classAttr).toMatch(/opacity-(40|\[0\.4\])/);
    });

    it('el SVG incluye las 4 lineas de la regla de los tercios', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const crosshair = container.querySelector('[data-testid="crosshair"]');
      const lines = crosshair?.querySelectorAll('line');
      expect(lines?.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('referencia de escala (scale bar)', () => {
    it('renderiza una referencia de escala visible', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      expect(
        container.querySelector('[data-testid="scale-reference"]')
      ).not.toBeNull();
    });

    it('la escala incluye una unidad de medida en centimetros', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const allText = document.body.textContent ?? '';
      expect(allText).toMatch(/\d+\s*cm/i);
    });
  });

  describe('boton de linterna (torch toggle)', () => {
    it('muestra icono Flashlight cuando torchOn=false', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const torchIcon = container.querySelector('.lucide-flashlight');
      expect(torchIcon).not.toBeNull();
    });

    it('muestra icono Zap cuando torchOn=true', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={true}
        />
      );

      const torchIcon = container.querySelector('.lucide-zap');
      expect(torchIcon).not.toBeNull();
    });

    it('expone aria-label "Activar linterna" cuando esta apagada', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      expect(screen.getByTestId('torch-toggle')).toHaveAttribute(
        'aria-label',
        'Activar linterna'
      );
    });

    it('expone aria-label "Apagar linterna" cuando esta encendida', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={true}
        />
      );

      expect(screen.getByTestId('torch-toggle')).toHaveAttribute(
        'aria-label',
        'Apagar linterna'
      );
    });

    it('expone aria-pressed correcto segun el estado', () => {
      const { rerender } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      expect(screen.getByTestId('torch-toggle')).toHaveAttribute(
        'aria-pressed',
        'false'
      );

      rerender(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={true}
        />
      );

      expect(screen.getByTestId('torch-toggle')).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('llama onTorchToggle al hacer click', () => {
      const onTorchToggle = vi.fn();
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={onTorchToggle}
          torchOn={false}
        />
      );

      fireEvent.click(screen.getByTestId('torch-toggle'));
      expect(onTorchToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe('boton de captura con maquina de estados', () => {
    it('estado idle: permite click y no aplica ring-pulse', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const button = screen.getByTestId('hud-capture-button');
      expect(button).not.toBeDisabled();
      expect(button.className).not.toMatch(/animate-ring-pulse/);
    });

    it('estado idle: expone aria-label "Capturar foto"', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      expect(screen.getByTestId('hud-capture-button')).toHaveAttribute(
        'aria-label',
        'Capturar foto'
      );
    });

    it('estado capturing: aplica clase animate-ring-pulse', () => {
      render(
        <CaptureViewfinderHUD
          captureState="capturing"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const button = screen.getByTestId('hud-capture-button');
      expect(button.className).toMatch(/animate-ring-pulse/);
    });

    it('estado capturing: deshabilita el boton (no permite click)', () => {
      const onCapture = vi.fn();
      render(
        <CaptureViewfinderHUD
          captureState="capturing"
          onCapture={onCapture}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const button = screen.getByTestId('hud-capture-button');
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(onCapture).not.toHaveBeenCalled();
    });

    it('estado capturing: aria-label refleja accion en curso', () => {
      render(
        <CaptureViewfinderHUD
          captureState="capturing"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const label = screen.getByTestId('hud-capture-button').getAttribute('aria-label') ?? '';
      expect(label).toMatch(/Capturando/);
    });

    it('estado processing: muestra Loader2 spinner (animate-spin)', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="processing"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const spinner = container.querySelector('.lucide-loader-2, .lucide-loader-circle');
      expect(spinner).not.toBeNull();
      const classAttr = spinner?.getAttribute('class') ?? '';
      expect(classAttr).toMatch(/animate-spin/);
    });

    it('estado processing: deshabilita el boton', () => {
      render(
        <CaptureViewfinderHUD
          captureState="processing"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      expect(screen.getByTestId('hud-capture-button')).toBeDisabled();
    });

    it('estado idle: click llama onCapture una vez', () => {
      const onCapture = vi.fn();
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={onCapture}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      fireEvent.click(screen.getByTestId('hud-capture-button'));
      expect(onCapture).toHaveBeenCalledTimes(1);
    });

    it('el boton de captura cumple tamano minimo de tap target (>= 44px)', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const button = container.querySelector(
        '[data-testid="hud-capture-button"]'
      );
      expect(button?.className).toMatch(/w-20/);
      expect(button?.className).toMatch(/h-20/);
    });
  });

  describe('accesibilidad ARIA', () => {
    it('todos los botones interactivos tienen aria-label descriptivo', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const torchButton = screen.getByTestId('torch-toggle');
      const captureButton = screen.getByTestId('hud-capture-button');

      expect(torchButton).toHaveAttribute('aria-label');
      expect(captureButton).toHaveAttribute('aria-label');
      expect(torchButton.getAttribute('aria-label')?.length).toBeGreaterThan(0);
      expect(captureButton.getAttribute('aria-label')?.length).toBeGreaterThan(0);
    });

    it('el indicador de nivel expone role="status" + aria-live="polite"', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
          pitch={0}
          roll={0}
        />
      );

      const status = container.querySelector('[role="status"][aria-live="polite"]');
      expect(status).not.toBeNull();
    });

    it('los botones tienen type="button" para evitar submits accidentales', () => {
      const { container } = render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const buttons = container.querySelectorAll('button');
      buttons.forEach((btn) => {
        expect(btn).toHaveAttribute('type', 'button');
      });
    });

    it('los botones son accesibles por teclado (focusable)', () => {
      render(
        <CaptureViewfinderHUD
          captureState="idle"
          onCapture={() => {}}
          onTorchToggle={() => {}}
          torchOn={false}
        />
      );

      const torchButton = screen.getByTestId('torch-toggle');
      const captureButton = screen.getByTestId('hud-capture-button');

      torchButton.focus();
      expect(document.activeElement).toBe(torchButton);

      captureButton.focus();
      expect(document.activeElement).toBe(captureButton);
    });
  });
});
