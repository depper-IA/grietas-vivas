/**
 * ImageZoomModal — Tests unitarios
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageZoomModal } from './ImageZoomModal';

describe('ImageZoomModal', () => {
  it('no renderiza nada cuando isOpen es false', () => {
    const { container } = render(
      <ImageZoomModal isOpen={false} onClose={() => {}} imageUrl="https://test.com/img.jpg" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renderiza modal cuando isOpen es true', () => {
    render(
      <ImageZoomModal isOpen={true} onClose={() => {}} imageUrl="https://test.com/img.jpg" />,
    );
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByAltText('Fotografía de daño estructural')).toBeDefined();
  });

  it('llama onClose al hacer click en el botón de cerrar', () => {
    const onClose = vi.fn();
    render(
      <ImageZoomModal isOpen={true} onClose={onClose} imageUrl="https://test.com/img.jpg" />,
    );

    const closeBtn = screen.getByLabelText('Cerrar visor de imagen');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('permite alternar a la foto de contexto si existe', () => {
    render(
      <ImageZoomModal
        isOpen={true}
        onClose={() => {}}
        imageUrl="https://test.com/detail.jpg"
        contextImageUrl="https://test.com/context.jpg"
      />,
    );

    const contextBtn = screen.getByText('Contexto');
    fireEvent.click(contextBtn);

    const img = screen.getByAltText('Fotografía de daño estructural') as HTMLImageElement;
    expect(img.src).toBe('https://test.com/context.jpg');
  });
});
