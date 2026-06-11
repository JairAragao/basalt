import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { describeChanges } = require('./commit-msg.js');

const base = {
  id: 'finalizar-servicos',
  titulo: 'Finalizar serviços',
  status: 'A fazer',
  tipo: 'Bug',
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-01T10:00:00Z',
};

describe('describeChanges', () => {
  it('move: frase descritiva sem o título da tarefa', () => {
    const msg = describeChanges(base, { ...base, status: 'Pausado' }, 'move', base.id, 'titulo');
    expect(msg).toBe('status alterado de "A fazer" para "Pausado"');
  });

  it('update: alterado / definido / removido, separados por ";"', () => {
    const after = { ...base, tipo: 'Feature', projeto: 'Ignite GO', responsavel: undefined };
    const before = { ...base, responsavel: 'Leo' };
    const msg = describeChanges(before, after, 'update', base.id, 'titulo');
    expect(msg).toContain('tipo alterado de "Bug" para "Feature"');
    expect(msg).toContain('projeto definido como "Ignite GO"');
    expect(msg).toContain('responsavel removido (era "Leo")');
    expect(msg).not.toContain('Finalizar serviços');
  });

  it('update: auditoria/carimbos não aparecem', () => {
    const after = { ...base, status: 'Pausado', updated_at: '2026-06-02T10:00:00Z', updated_by: 'Leo', computed_at: 'x' };
    const msg = describeChanges(base, after, 'update', base.id, 'titulo');
    expect(msg).toBe('status alterado de "A fazer" para "Pausado"');
  });

  it('move pra done: carimbo de conclusão (completed_*) não polui a mensagem', () => {
    const after = {
      ...base,
      status: 'Concluído',
      completed_at: '2026-06-10T12:00:00Z',
      completed_by: 'Jair',
    };
    const msg = describeChanges(base, after, 'move', base.id, 'titulo');
    expect(msg).toBe('status alterado de "A fazer" para "Concluído"');
  });

  it('saída de done: remoção dos carimbos também é silenciosa', () => {
    const before = { ...base, status: 'Concluído', completed_at: '2026-06-10T12:00:00Z', completed_by: 'Jair' };
    const after = { ...base, status: 'A fazer' };
    const msg = describeChanges(before, after, 'move', base.id, 'titulo');
    expect(msg).toBe('status alterado de "Concluído" para "A fazer"');
  });

  it('update: só o corpo mudou → "conteúdo atualizado" (não "Sem alterações")', () => {
    expect(describeChanges(base, { ...base }, 'update', base.id, 'titulo', { bodyChanged: true }))
      .toBe('conteúdo atualizado');
    expect(describeChanges(base, { ...base }, 'update', base.id, 'titulo')).toBe('Sem alterações');
  });

  it('valores longos são truncados na exibição, mas comparados inteiros', () => {
    const longA = 'x'.repeat(70);
    const longB = `${'x'.repeat(65)}difere`; // só difere depois do corte de 60
    const msg = describeChanges({ ...base, obs: longA }, { ...base, obs: longB }, 'update', base.id, 'titulo');
    expect(msg).toMatch(/^obs alterado de "x{59}…" para /);
  });

  it('"3" vs 3 do frontmatter não conta como mudança', () => {
    const msg = describeChanges({ ...base, pontos: '3' }, { ...base, pontos: 3 }, 'update', base.id, 'titulo');
    expect(msg).toBe('Sem alterações');
  });

  it('create/delete citam o título truncado em 40 chars', () => {
    const longo = { ...base, titulo: 'FAst message na opção em cima do msgs deve ficar em varias linhas' };
    const created = describeChanges(null, longo, 'create', base.id, 'titulo');
    expect(created.startsWith('Criou "')).toBe(true);
    expect(created).toContain('…');
    expect(created.length).toBeLessThan(60);
    expect(describeChanges(base, null, 'delete', base.id, 'titulo')).toBe('Removeu "Finalizar serviços"');
  });
});
