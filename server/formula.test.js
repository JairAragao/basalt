// formula.test.js — testa o MOTOR DE FÓRMULA GENÉRICO direto (antes só era
// exercitado via o shim gute.js). Cobre o gotcha do parser.consts={} e o null
// em faltante/div-zero, que devem casar com o espelho do cliente (app/src/formula.js).

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const formula = require('./formula.js');

const schema = {
  properties: {
    G: { type: 'int' },
    U: { type: 'int' },
    T: { type: 'int' },
    E: { type: 'int' },
    prioridade: { type: 'formula', expression: '(G * U * T) / E', round: 0 },
  },
};

describe('formula.compute (motor genérico)', () => {
  it('calcula a fórmula com inputs numéricos finitos', () => {
    expect(formula.compute({ G: 4, U: 5, T: 3, E: 2 }, schema)).toEqual({ prioridade: 30 });
  });

  it('variável faltante → null', () => {
    expect(formula.compute({ G: 4, U: 5, T: 3 }, schema).prioridade).toBeNull();
  });

  it('divisão por zero → null', () => {
    expect(formula.compute({ G: 4, U: 5, T: 3, E: 0 }, schema).prioridade).toBeNull();
  });

  it('E é tratado como CAMPO, não como Euler (parser.consts={})', () => {
    // se E virasse Euler (~2.718): 1*1*1/E ≈ 0.37; como campo E=2 → 0.5
    const s = { properties: { A: { type: 'int' }, E: { type: 'int' }, r: { type: 'formula', expression: 'A / E', round: 2 } } };
    expect(formula.compute({ A: 1, E: 2 }, s)).toEqual({ r: 0.5 });
  });

  it('input não-numérico (string "4") é ignorado → null (mesmo critério do server e do cliente)', () => {
    expect(formula.compute({ G: '4', U: 5, T: 3, E: 2 }, schema).prioridade).toBeNull();
  });

  it('arredonda por spec.round', () => {
    const s = { properties: { A: { type: 'int' }, B: { type: 'int' }, r: { type: 'formula', expression: 'A / B', round: 2 } } };
    expect(formula.compute({ A: 10, B: 3 }, s)).toEqual({ r: 3.33 });
  });

  it('expressão malformada → null (memoizado, não lança)', () => {
    const s = { properties: { A: { type: 'int' }, r: { type: 'formula', expression: 'A +', round: 0 } } };
    expect(formula.compute({ A: 5 }, s).r).toBeNull();
  });

  it('schema sem props formula → objeto vazio', () => {
    expect(formula.compute({ A: 1 }, { properties: { A: { type: 'int' } } })).toEqual({});
  });
});

describe('formula.formulaSpecs', () => {
  it('extrai só as propriedades type formula', () => {
    const specs = formula.formulaSpecs({ properties: { x: { type: 'int' }, y: { type: 'formula', expression: 'x * 2' } } });
    expect(specs).toHaveLength(1);
    expect(specs[0][0]).toBe('y');
    expect(specs[0][1].expression).toBe('x * 2');
  });
});
