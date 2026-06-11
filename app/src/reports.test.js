import { describe, it, expect } from 'vitest';
import { buildReport, dayKey } from './reports.js';

// Timestamps ao meio-dia UTC: a chave de dia local bate com a UTC em qualquer
// fuso |offset| < 12h — testes determinísticos sem fixar TZ.
const noon = (d) => `${d}T12:00:00Z`;

const schema = {
  properties: {
    titulo: { type: 'string', label: 'Título' },
    status: { type: 'enum', label: 'Status', options: ['A fazer', 'Em andamento', 'Concluído'] },
    tipo: { type: 'enum', label: 'Tipo', options: ['Bug', 'Feature'] },
  },
};

const doneStageIds = ['Concluído'];

function task(over = {}) {
  return {
    id: 't-' + Math.random().toString(36).slice(2, 8),
    titulo: 'Tarefa',
    status: 'A fazer',
    created_at: noon('2026-06-02'),
    created_by: 'jair-git',
    ...over,
  };
}

describe('buildReport — range e buckets', () => {
  it('bucket day: labels cobrem o range inclusivo e contam por dia', () => {
    const tasks = [
      task({ created_at: noon('2026-06-01') }),
      task({ created_at: noon('2026-06-01') }),
      task({ created_at: noon('2026-06-03') }),
      task({ created_at: noon('2026-05-31') }), // fora do range
      task({ created_at: noon('2026-06-08') }), // fora do range
    ];
    const r = buildReport({
      tasks, schema, doneStageIds, users: [],
      range: { from: '2026-06-01', to: '2026-06-07' }, bucket: 'day', enumKey: null,
    });
    expect(r.series.labels).toEqual([
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07',
    ]);
    expect(r.series.created).toEqual([2, 0, 1, 0, 0, 0, 0]);
    expect(r.counts.created).toBe(3); // só as do range
  });

  it('bucket week: labels são segundas-feiras e agregam a semana', () => {
    // 2026-06-01 e 2026-06-08 são segundas
    const tasks = [
      task({ created_at: noon('2026-06-02') }),
      task({ created_at: noon('2026-06-05') }),
      task({ created_at: noon('2026-06-09') }),
    ];
    const r = buildReport({
      tasks, schema, doneStageIds, users: [],
      range: { from: '2026-06-01', to: '2026-06-14' }, bucket: 'week', enumKey: null,
    });
    expect(r.series.labels).toEqual(['2026-06-01', '2026-06-08']);
    expect(r.series.created).toEqual([2, 1]);
  });

  it('bucket week: dia no range cuja semana começa antes do from cai no 1º bucket', () => {
    // from = quarta 2026-06-03; semana dela começa em 2026-06-01
    const tasks = [task({ created_at: noon('2026-06-04') })];
    const r = buildReport({
      tasks, schema, doneStageIds, users: [],
      range: { from: '2026-06-03', to: '2026-06-09' }, bucket: 'week', enumKey: null,
    });
    expect(r.series.labels[0]).toBe('2026-06-01');
    expect(r.series.created[0]).toBe(1);
  });
});

describe('buildReport — finalizadas, legado e lead time', () => {
  it('finalizadas contam por completed_at; legado em done sem carimbo vai pra completedNoDate', () => {
    const tasks = [
      task({ status: 'Concluído', completed_at: noon('2026-06-03'), completed_by: 'jair-git' }),
      task({ status: 'Concluído' }), // legado: done sem completed_at → nota, nunca série
      task({ status: 'Em andamento' }),
    ];
    const r = buildReport({
      tasks, schema, doneStageIds, users: [],
      range: { from: '2026-06-01', to: '2026-06-07' }, bucket: 'day', enumKey: null,
    });
    expect(r.counts.completed).toBe(1);
    expect(r.counts.completedNoDate).toBe(1);
    expect(r.counts.open).toBe(1); // snapshot: só a "Em andamento"
    expect(r.series.completed.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('lead time = média de (completed_at − created_at) das finalizadas no range com as 2 datas', () => {
    const tasks = [
      task({ status: 'Concluído', created_at: noon('2026-06-01'), completed_at: noon('2026-06-03') }), // 2 dias
      task({ status: 'Concluído', created_at: noon('2026-06-01'), completed_at: noon('2026-06-06') }), // 5 dias
      task({ status: 'Concluído', created_at: null, completed_at: noon('2026-06-04') }), // sem created → fora da média
    ];
    const r = buildReport({
      tasks, schema, doneStageIds, users: [],
      range: { from: '2026-06-01', to: '2026-06-07' }, bucket: 'day', enumKey: null,
    });
    expect(r.counts.leadTimeAvgDays).toBe(3.5);
    expect(r.counts.completed).toBe(3);
  });

  it('sem nenhuma finalizada elegível → leadTimeAvgDays null', () => {
    const r = buildReport({
      tasks: [task()], schema, doneStageIds, users: [],
      range: { from: '2026-06-01', to: '2026-06-07' }, bucket: 'day', enumKey: null,
    });
    expect(r.counts.leadTimeAvgDays).toBeNull();
  });
});

describe('buildReport — byUser', () => {
  it('resolve created_by/completed_by contra o roster via gitNames', () => {
    const users = [{ id: 'u-a1b2c3', nome: 'Jair', gitEmails: [], gitNames: ['jair-git', 'JairAragao'] }];
    const tasks = [
      task({ created_by: 'jair-git' }),
      task({ created_by: 'JairAragao' }),
      task({ status: 'Concluído', created_by: 'jair-git', completed_at: noon('2026-06-03'), completed_by: 'jair-git' }),
    ];
    const r = buildReport({
      tasks, schema, doneStageIds, users,
      range: { from: '2026-06-01', to: '2026-06-07' }, bucket: 'day', enumKey: null,
    });
    expect(r.byUser).toEqual([{ name: 'Jair', userId: 'u-a1b2c3', created: 3, completed: 1 }]);
  });

  it('sem match no roster → string git crua com userId null (roster vazio incluso)', () => {
    const users = [{ id: 'u-1', nome: 'Jair', gitNames: ['jair-git'] }];
    const tasks = [
      task({ created_by: 'leo-git' }),
      task({ created_by: 'leo-git' }),
      task({ created_by: 'jair-git' }),
    ];
    const r = buildReport({
      tasks, schema, doneStageIds, users,
      range: { from: '2026-06-01', to: '2026-06-07' }, bucket: 'day', enumKey: null,
    });
    expect(r.byUser).toEqual([
      { name: 'leo-git', userId: null, created: 2, completed: 0 },
      { name: 'Jair', userId: 'u-1', created: 1, completed: 0 },
    ]);

    const semRoster = buildReport({
      tasks, schema, doneStageIds, users: [],
      range: { from: '2026-06-01', to: '2026-06-07' }, bucket: 'day', enumKey: null,
    });
    expect(semRoster.byUser.every((u) => u.userId === null)).toBe(true);
  });
});

describe('buildReport — byEnum', () => {
  it('agrupa criadas no range; vazio → "(sem valor)", opção fora do schema → "(removido)"', () => {
    const tasks = [
      task({ tipo: 'Bug' }),
      task({ tipo: 'Bug' }),
      task({ tipo: '' }),
      task({ tipo: null }),
      task({ tipo: 'Chore' }), // opção removida do schema
      task({ tipo: 'Bug', created_at: noon('2026-05-01') }), // fora do range → não conta
    ];
    const r = buildReport({
      tasks, schema, doneStageIds, users: [],
      range: { from: '2026-06-01', to: '2026-06-07' }, bucket: 'day', enumKey: 'tipo',
    });
    expect(r.byEnum.key).toBe('tipo');
    expect(r.byEnum.label).toBe('Tipo');
    expect(r.byEnum.rows).toEqual([
      { option: 'Bug', count: 2 },
      { option: '(sem valor)', count: 2 },
      { option: '(removido)', count: 1 },
    ]);
  });

  it('enumKey null → byEnum null', () => {
    const r = buildReport({
      tasks: [task()], schema, doneStageIds, users: [],
      range: { from: '2026-06-01', to: '2026-06-07' }, bucket: 'day', enumKey: null,
    });
    expect(r.byEnum).toBeNull();
  });
});

describe('buildReport — vault sem doneStageIds', () => {
  it('done vazio: tudo conta como aberto, sem completedNoDate; carimbo preservado ainda conta como finalizada', () => {
    const tasks = [
      task({ status: 'Concluído' }), // sem semântica de done → "aberta"
      task({ status: 'Concluído', completed_at: noon('2026-06-03') }), // carimbo legado preservado
      task(),
    ];
    const r = buildReport({
      tasks, schema, doneStageIds: [], users: [],
      range: { from: '2026-06-01', to: '2026-06-07' }, bucket: 'day', enumKey: null,
    });
    expect(r.counts.open).toBe(3);
    expect(r.counts.completedNoDate).toBe(0);
    expect(r.counts.completed).toBe(1); // finalizadas = completed_at ∈ range, independe do done
  });
});

describe('dayKey', () => {
  it('vazio/inválido → null; Date e ISO funcionam', () => {
    expect(dayKey(null)).toBeNull();
    expect(dayKey('')).toBeNull();
    expect(dayKey('não-é-data')).toBeNull();
    expect(dayKey(new Date(2026, 5, 10))).toBe('2026-06-10');
  });
});
