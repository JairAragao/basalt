import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const gute = require('./gute.js');

// Config equivalente a config/gute.json.
const guteConfig = {
  inputs: ['G', 'U', 'T', 'E'],
  derived: {
    GUT: 'G * U * T',
    prioridade_gute: 'G * U * T / E',
  },
  stampField: 'gute_computed_at',
  round: 2,
};

describe('gute.compute', () => {
  it('GUTE normal: G4 U5 T3 E2 → GUT 60, prioridade 30', () => {
    const out = gute.compute({ G: 4, U: 5, T: 3, E: 2 }, guteConfig);
    expect(out.GUT).toBe(60);
    expect(out.prioridade_gute).toBe(30);
  });

  it('E = 0 → prioridade null (sem divisão por zero), GUT calculado', () => {
    const out = gute.compute({ G: 4, U: 5, T: 3, E: 0 }, guteConfig);
    expect(out.GUT).toBe(60);
    expect(out.prioridade_gute).toBeNull();
  });

  it('E ausente → prioridade null, GUT calculado', () => {
    const out = gute.compute({ G: 4, U: 5, T: 3 }, guteConfig);
    expect(out.GUT).toBe(60);
    expect(out.prioridade_gute).toBeNull();
  });

  it('G ausente → GUT null e prioridade null', () => {
    const out = gute.compute({ U: 5, T: 3, E: 2 }, guteConfig);
    expect(out.GUT).toBeNull();
    expect(out.prioridade_gute).toBeNull();
  });

  it('input não-numérico (string) é tratado como ausente', () => {
    const out = gute.compute({ G: '4', U: 5, T: 3, E: 2 }, guteConfig);
    expect(out.GUT).toBeNull();
    expect(out.prioridade_gute).toBeNull();
  });

  it('arredonda prioridade conforme round', () => {
    // 5*5*5 / 3 = 41.666... → 41.67 com round:2
    const out = gute.compute({ G: 5, U: 5, T: 5, E: 3 }, guteConfig);
    expect(out.GUT).toBe(125);
    expect(out.prioridade_gute).toBe(41.67);
  });

  it('data vazio → ambos null', () => {
    const out = gute.compute({}, guteConfig);
    expect(out.GUT).toBeNull();
    expect(out.prioridade_gute).toBeNull();
  });
});
