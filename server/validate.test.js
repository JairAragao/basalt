// validateTask — modo parcial ({ only }): valor órfão em campo não-tocado não
// pode bloquear a edição de outro campo (regressão do merge parcial do update).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { validateTask } = require('./validate');

const schema = {
  properties: {
    titulo: { type: 'string', required: true, label: 'Título' },
    status: { type: 'enum', required: true, label: 'Status', options: ['A fazer', 'Feito'] },
    tipo: { type: 'enum', label: 'Tipo', options: ['Bug', 'Feature'] },
    pontos: { type: 'int', label: 'Pontos', min: 0 },
  },
};

describe('validateTask — modo parcial (only)', () => {
  it('valor órfão em campo NÃO tocado não bloqueia', () => {
    const merged = { titulo: 'X', status: 'A fazer', tipo: 'Removida' }; // 'Removida' saiu do schema
    const r = validateTask(merged, schema, { only: new Set(['pontos']) });
    expect(r.ok).toBe(true);
  });

  it('campo tocado segue validado', () => {
    const merged = { titulo: 'X', status: 'A fazer', tipo: 'Inexistente' };
    const r = validateTask(merged, schema, { only: new Set(['tipo']) });
    expect(r.ok).toBe(false);
  });

  it('limpar required tocado é barrado', () => {
    const merged = { titulo: 'X' }; // status limpo pelo merge
    const r = validateTask(merged, schema, { only: new Set(['status']) });
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/obrigatório/);
  });

  it('sem only, valida tudo (create)', () => {
    const r = validateTask({ titulo: 'X', status: 'A fazer', tipo: 'Inexistente' }, schema);
    expect(r.ok).toBe(false);
  });
});
