import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Project Setup', () => {
  it('should have vitest configured correctly', () => {
    expect(true).toBe(true);
  });

  it('should support fast-check property testing', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      })
    );
  });
});
