import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const matter = require('gray-matter');
const { recompute } = require('./watcher.js');

const guteConfig = {
  inputs: ['G', 'U', 'T', 'E'],
  derived: {
    GUT: 'G * U * T',
    prioridade_gute: 'G * U * T / E',
  },
  stampField: 'gute_computed_at',
  round: 2,
};

// Monta um arquivo .md (string) a partir de frontmatter + corpo.
function makeFile(data, body = 'corpo') {
  return matter.stringify(body, data);
}

describe('watcher.recompute — anti-loop', () => {
  it('derivados já corretos → NÃO reescreve', () => {
    const raw = makeFile({
      id: 'T-x',
      G: 4,
      U: 5,
      T: 3,
      E: 2,
      GUT: 60,
      prioridade_gute: 30,
      gute_computed_at: '2026-06-01T09:00:00.000Z',
    });
    const writeTask = vi.fn();
    const wrote = recompute('tasks/T-x.md', {
      guteConfig,
      readFile: () => raw,
      writeTask,
    });
    expect(wrote).toBe(false);
    expect(writeTask).not.toHaveBeenCalled();
  });

  it('derivados desatualizados → reescreve 1x; segundo recompute não reescreve', () => {
    // Estado inicial com derivados errados/ausentes.
    let raw = makeFile({ id: 'T-y', G: 4, U: 5, T: 3, E: 2 });

    const writeTask = vi.fn((id, data, body) => {
      // Simula a persistência: regrava o "arquivo" com os novos derivados.
      raw = makeFile({ id, ...data }, body);
    });

    const deps = { guteConfig, readFile: () => raw, writeTask };

    const first = recompute('tasks/T-y.md', deps);
    expect(first).toBe(true);
    expect(writeTask).toHaveBeenCalledTimes(1);

    // Confere que os derivados foram calculados e carimbados.
    const callData = writeTask.mock.calls[0][1];
    expect(callData.GUT).toBe(60);
    expect(callData.prioridade_gute).toBe(30);
    expect(typeof callData.gute_computed_at).toBe('string');

    // Segundo recompute sobre o estado já atualizado → anti-loop.
    const second = recompute('tasks/T-y.md', deps);
    expect(second).toBe(false);
    expect(writeTask).toHaveBeenCalledTimes(1); // não chamou de novo
  });

  it('arquivo corrompido/ilegível → não reescreve', () => {
    const writeTask = vi.fn();
    const wrote = recompute('tasks/bad.md', {
      guteConfig,
      readFile: () => {
        throw new Error('EACCES');
      },
      writeTask,
    });
    expect(wrote).toBe(false);
    expect(writeTask).not.toHaveBeenCalled();
  });

  it('G ausente → derivados viram null; reescreve se antes havia valor', () => {
    let raw = makeFile({ id: 'T-z', U: 5, T: 3, E: 2, GUT: 60, prioridade_gute: 30 });
    const writeTask = vi.fn();
    const wrote = recompute('tasks/T-z.md', {
      guteConfig,
      readFile: () => raw,
      writeTask,
    });
    expect(wrote).toBe(true);
    const callData = writeTask.mock.calls[0][1];
    expect(callData.GUT).toBeNull();
    expect(callData.prioridade_gute).toBeNull();
  });
});
