// filtering.test.js — matchesTask/norm (T4): acentos/caixa, AND, bordas de
// datetime inclusivas (dia local), int vazio, multiselect contém, prop órfã.
import { describe, it, expect } from 'vitest';
import { norm, matchesTask } from './filtering';

const schema = {
  properties: {
    titulo: { type: 'string', label: 'Título' },
    desc: { type: 'string', label: 'Descrição' },
    pontos: { type: 'int', label: 'Pontos' },
    criado: { type: 'datetime', label: 'Criado' },
    tipo: { type: 'enum', label: 'Tipo', options: ['bug', 'feature'] },
    tags: { type: 'multiselect', label: 'Tags', options: ['a', 'b', 'c'] },
    dono: { type: 'user', label: 'Dono' },
  },
};

const task = {
  titulo: 'Criação rápida de relatório',
  desc: 'Ação urgente',
  pontos: 3,
  // sem 'Z' → interpretado como hora LOCAL (o filtro é por dia local)
  criado: '2026-06-01T08:30:00',
  tipo: 'bug',
  tags: 'a;b',
  dono: 'u1',
};

describe('norm', () => {
  it('remove diacríticos, baixa caixa e apara', () => {
    expect(norm('  Criação RÁPIDA ')).toBe('criacao rapida');
    expect(norm(null)).toBe('');
    expect(norm(123)).toBe('123');
  });
});

describe('matchesTask — string (contains, sem acento/caixa)', () => {
  it('casa ignorando acentos e caixa', () => {
    expect(matchesTask(task, { titulo: { q: 'CRIACAO' } }, schema)).toBe(true);
    expect(matchesTask(task, { titulo: { q: 'rápida' } }, schema)).toBe(true);
    expect(matchesTask(task, { titulo: { q: 'inexistente' } }, schema)).toBe(false);
  });
  it('q vazio/espaços = sem filtro', () => {
    expect(matchesTask(task, { titulo: { q: '' } }, schema)).toBe(true);
    expect(matchesTask(task, { titulo: { q: '   ' } }, schema)).toBe(true);
  });
  it('valor ausente na tarefa não casa com q preenchido', () => {
    expect(matchesTask({ ...task, titulo: '' }, { titulo: { q: 'x' } }, schema)).toBe(false);
  });
});

describe('matchesTask — AND entre props', () => {
  it('todas precisam casar', () => {
    expect(matchesTask(task, { titulo: { q: 'criacao' }, tipo: { v: 'bug' } }, schema)).toBe(true);
    expect(matchesTask(task, { titulo: { q: 'criacao' }, tipo: { v: 'feature' } }, schema)).toBe(false);
  });
});

describe('matchesTask — datetime (range inclusivo por dia local)', () => {
  it('borda from inclusiva', () => {
    expect(matchesTask(task, { criado: { from: '2026-06-01', to: '' } }, schema)).toBe(true);
    expect(matchesTask(task, { criado: { from: '2026-06-02', to: '' } }, schema)).toBe(false);
  });
  it('borda to inclusiva', () => {
    expect(matchesTask(task, { criado: { from: '', to: '2026-06-01' } }, schema)).toBe(true);
    expect(matchesTask(task, { criado: { from: '', to: '2026-05-31' } }, schema)).toBe(false);
  });
  it('range fechado no mesmo dia', () => {
    expect(matchesTask(task, { criado: { from: '2026-06-01', to: '2026-06-01' } }, schema)).toBe(true);
  });
  it('sem from/to = sem filtro; data ausente com filtro ativo não casa', () => {
    expect(matchesTask(task, { criado: { from: '', to: '' } }, schema)).toBe(true);
    expect(matchesTask({ ...task, criado: '' }, { criado: { from: '2026-06-01', to: '' } }, schema)).toBe(false);
  });
});

describe('matchesTask — int (igualdade; vazio ignora)', () => {
  it('igualdade exata', () => {
    expect(matchesTask(task, { pontos: { n: 3 } }, schema)).toBe(true);
    expect(matchesTask(task, { pontos: { n: 4 } }, schema)).toBe(false);
  });
  it('n vazio/null = sem filtro', () => {
    expect(matchesTask(task, { pontos: { n: '' } }, schema)).toBe(true);
    expect(matchesTask(task, { pontos: { n: null } }, schema)).toBe(true);
  });
  it('zero é valor válido (não é "vazio")', () => {
    expect(matchesTask({ ...task, pontos: 0 }, { pontos: { n: 0 } }, schema)).toBe(true);
    expect(matchesTask(task, { pontos: { n: 0 } }, schema)).toBe(false);
  });
});

describe('matchesTask — multiselect (contém) e enum/user (igualdade)', () => {
  it('multiselect: v contido na lista da tarefa', () => {
    expect(matchesTask(task, { tags: { v: 'b' } }, schema)).toBe(true);
    expect(matchesTask(task, { tags: { v: 'x' } }, schema)).toBe(false);
  });
  it('user: igualdade', () => {
    expect(matchesTask(task, { dono: { v: 'u1' } }, schema)).toBe(true);
    expect(matchesTask(task, { dono: { v: 'u2' } }, schema)).toBe(false);
  });
});

describe('matchesTask — prop órfã no estado (self-heal)', () => {
  it('prop que sumiu do schema é ignorada', () => {
    expect(matchesTask(task, { fantasma: { q: 'nada' } }, schema)).toBe(true);
    expect(matchesTask(task, { fantasma: { q: 'nada' }, tipo: { v: 'bug' } }, schema)).toBe(true);
  });
  it('entrada null no estado é ignorada', () => {
    expect(matchesTask(task, { tipo: null }, schema)).toBe(true);
  });
});
