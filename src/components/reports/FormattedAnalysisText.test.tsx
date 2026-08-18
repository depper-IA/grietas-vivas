/**
 * FormattedAnalysisText — Tests unitarios
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormattedAnalysisText } from './FormattedAnalysisText';

describe('FormattedAnalysisText', () => {
  it('renderiza texto estructurado en viñetas', () => {
    const text = `Patrón: Grieta diagonal por cortante.
Ubicación: Muro de mampostería en segundo piso.
Severidad: Alto riesgo estructural con desprendimiento.
Recomendación: Evacuar el área afectada de inmediato.`;

    render(<FormattedAnalysisText text={text} />);

    expect(screen.getByText('Patrón de Daño')).toBeDefined();
    expect(screen.getByText('Ubicación y Elemento')).toBeDefined();
    expect(screen.getByText('Severidad e Impacto')).toBeDefined();
    expect(screen.getByText('Acción Inmediata')).toBeDefined();
    expect(screen.getByText('Grieta diagonal por cortante.')).toBeDefined();
  });

  it('renderiza texto en prosa dividiéndolo en observaciones visuales', () => {
    const text = 'Se observa grieta diagonal en muro portante. Existe desprendimiento severo de revoque.';
    render(<FormattedAnalysisText text={text} />);

    expect(screen.getByText('Se observa grieta diagonal en muro portante.')).toBeDefined();
    expect(screen.getByText('Existe desprendimiento severo de revoque.')).toBeDefined();
  });

  it('no renderiza nada si el texto está vacío', () => {
    const { container } = render(<FormattedAnalysisText text="" />);
    expect(container.firstChild).toBeNull();
  });
});
