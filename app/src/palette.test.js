import { describe, it, expect } from 'vitest';
import { colorFor } from './palette';

describe('colorFor — cor consistente entre prévia e edição', () => {
  const meta = { bug: { color: '#d35bb0' } }; // "bug" = rosa explícito

  it('cor explícita do optionMeta vence o hash', () => {
    expect(colorFor('bug', meta)).toBe('#d35bb0');
  });

  it('valor cru e valor trimado dão a MESMA cor (o bug reportado)', () => {
    // TaskCard passava trimado; PropSelect passava cru — divergiam
    expect(colorFor(' bug', meta)).toBe(colorFor('bug', meta));
    expect(colorFor('bug ', meta)).toBe('#d35bb0');
  });

  it('tolera espaço na CHAVE do meta', () => {
    const metaSpaced = { 'bug ': { color: '#d35bb0' } };
    expect(colorFor('bug', metaSpaced)).toBe('#d35bb0');
  });

  it('sem cor explícita: hash estável e igual para cru/trimado', () => {
    expect(colorFor('feature', {})).toBe(colorFor(' feature ', {}));
    expect(colorFor('feature')).toBe(colorFor('feature', {}));
  });
});
