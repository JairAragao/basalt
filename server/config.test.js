// config.test.js — doneGroupId (self-heal), derive de doneStageIds e a
// normalização de completed_* como auditoria (system+auto).
//
// ISOLAMENTO: config.js resolve ~/.basalt e o vault default no LOAD do módulo.
// Antes do require: homedir é apontado pra um diretório temporário (nunca toca
// o ~/.basalt nem o vault real do usuário), BASALT_VAULT é limpo e o cache CJS
// do módulo é descartado (o cache nativo sobrevive entre arquivos no worker).

import { describe, it, expect, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-config-test-'));
const realHomedir = os.homedir;
os.homedir = () => tmpHome;
delete process.env.BASALT_VAULT;
delete require.cache[require.resolve('./config.js')];
const config = require('./config.js');

const vaultConfigDir = path.join(tmpHome, '.basalt', 'default-vault', 'config');

afterAll(() => {
  os.homedir = realHomedir;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

const boardBase = {
  groupBy: 'status',
  statusGroups: [
    {
      id: 'fazer',
      label: 'A fazer',
      stages: [
        { id: 'backlog', label: 'Backlog', color: '#6f6f6f' },
        { id: 'andamento', label: 'Em andamento', color: '#d9a01e' },
      ],
    },
    {
      id: 'concluido',
      label: 'Concluído',
      stages: [
        { id: 'feito', label: 'Feito', color: '#3fb950' },
        { id: 'arquivado', label: 'Arquivado', color: '#4b4b4b' },
      ],
    },
  ],
  card: { title: 'titulo', fields: [] },
  sort: { by: 'created_at', dir: 'desc' },
  filters: [],
};

function writeBoard(board) {
  fs.writeFileSync(path.join(vaultConfigDir, 'board.json'), JSON.stringify(board, null, 2) + '\n', 'utf8');
  config.reload();
}

describe('config — doneGroupId + doneStageIds', () => {
  it('seed do template default vem com doneGroupId apontando pro grupo "done"', () => {
    // o load inicial semeou o vault temp a partir de defaults/board.json
    expect(config.board.doneGroupId).toBe('done');
    expect(config.doneStageIds.has('Concluído')).toBe(true);
  });

  it('doneGroupId válido → doneStageIds = Set das etapas do grupo', () => {
    writeBoard({ ...boardBase, doneGroupId: 'concluido' });
    expect(config.board.doneGroupId).toBe('concluido');
    expect(config.doneStageIds).toEqual(new Set(['feito', 'arquivado']));
  });

  it('self-heal: doneGroupId órfão (grupo inexistente) → null, sem erro', () => {
    writeBoard({ ...boardBase, doneGroupId: 'fantasma' });
    expect(config.board.doneGroupId).toBeNull();
    expect(config.doneStageIds.size).toBe(0);
  });

  it('self-heal: doneGroupId não-string (número/objeto) → null', () => {
    writeBoard({ ...boardBase, doneGroupId: 42 });
    expect(config.board.doneGroupId).toBeNull();
    expect(config.doneStageIds.size).toBe(0);
  });

  it('doneGroupId ausente → null + Set vazio', () => {
    writeBoard({ ...boardBase });
    expect(config.board.doneGroupId).toBeNull();
    expect(config.doneStageIds.size).toBe(0);
  });

  it('reload recomputa o derive (marcar → desmarcar)', () => {
    writeBoard({ ...boardBase, doneGroupId: 'concluido' });
    expect(config.doneStageIds.has('feito')).toBe(true);
    writeBoard({ ...boardBase, doneGroupId: null });
    expect(config.board.doneGroupId).toBeNull();
    expect(config.doneStageIds.size).toBe(0);
  });
});

describe('config — completed_* normalizados como auditoria', () => {
  it('injeta completed_at/completed_by no schema (vault que não os declara) como system+auto', () => {
    writeBoard({ ...boardBase, doneGroupId: 'concluido' });
    const at = config.schema.properties.completed_at;
    const by = config.schema.properties.completed_by;
    expect(at).toBeTruthy();
    expect(at.type).toBe('datetime');
    expect(at.label).toBe('Concluída em');
    expect(at.system).toBe(true);
    expect(at.auto).toBe(true);
    expect(by).toBeTruthy();
    expect(by.type).toBe('string');
    expect(by.label).toBe('Concluída por');
    expect(by.system).toBe(true);
    expect(by.auto).toBe(true);
  });

  it('auditoria existente (created_*/updated_*) segue system+auto', () => {
    for (const k of ['created_at', 'created_by', 'updated_at', 'updated_by']) {
      expect(config.schema.properties[k].system).toBe(true);
      expect(config.schema.properties[k].auto).toBe(true);
    }
  });

  it('completed_* NÃO entram em schema.derived (não são fórmula)', () => {
    expect(config.schema.derived).not.toContain('completed_at');
    expect(config.schema.derived).not.toContain('completed_by');
  });
});

// ── Options mistas (string | {value,color}) → split values/optionMeta ────────
const schemaFile = path.join(vaultConfigDir, 'schema.json');

function writeSchema(schema) {
  fs.writeFileSync(schemaFile, JSON.stringify(schema, null, 2) + '\n', 'utf8');
  config.reload();
}

function schemaWithTipo(options) {
  return {
    idPrefix: 'T-',
    idFrom: 'titulo',
    properties: {
      titulo: { type: 'string', required: true, label: 'Título' },
      status: { type: 'enum', required: true, label: 'Status', system: true, options: ['backlog'], default: 'backlog' },
      tipo: { type: 'enum', label: 'Tipo', options },
    },
  };
}

describe('config — options mistas de enum (split values + optionMeta)', () => {
  it('array mista em disco → options vira string[] (ordem preservada) + optionMeta só pra quem tem cor', () => {
    writeSchema(schemaWithTipo(['bug', { value: 'feature', color: '#4caf72' }, 'docs']));
    const tipo = config.schema.properties.tipo;
    expect(tipo.options).toEqual(['bug', 'feature', 'docs']);
    expect(tipo.optionMeta).toEqual({ feature: { color: '#4caf72' } });
  });

  it('color inválida é descartada silenciosamente (a opção fica, sem meta)', () => {
    writeSchema(schemaWithTipo([
      { value: 'a', color: 'vermelho' },
      { value: 'b', color: '#12345' },
      { value: 'c', color: '#1234567' },
      { value: 'd', color: '#A1b2C3' },
    ]));
    const tipo = config.schema.properties.tipo;
    expect(tipo.options).toEqual(['a', 'b', 'c', 'd']);
    expect(tipo.optionMeta).toEqual({ d: { color: '#A1b2C3' } });
  });

  it('value duplicado → primeira vence (inclusive misto string × objeto)', () => {
    writeSchema(schemaWithTipo(['bug', { value: 'bug', color: '#4caf72' }, { value: 'docs', color: '#112233' }, 'docs']));
    const tipo = config.schema.properties.tipo;
    expect(tipo.options).toEqual(['bug', 'docs']);
    // 'bug' apareceu primeiro como string crua → sem meta; 'docs' primeiro com cor → meta fica
    expect(tipo.optionMeta).toEqual({ docs: { color: '#112233' } });
  });

  it('entrada sem value string utilizável é ignorada (self-heal, nunca lança)', () => {
    writeSchema(schemaWithTipo([
      'ok',
      42,
      null,
      '',
      '   ',
      { color: '#112233' },
      { value: 7, color: '#112233' },
      { value: '', color: '#112233' },
      ['array'],
    ]));
    const tipo = config.schema.properties.tipo;
    expect(tipo.options).toEqual(['ok']);
    expect(tipo.optionMeta).toEqual({});
  });

  it('round-trip: a mista em disco é PRESERVADA pelo load (config nunca reescreve o schema.json)', () => {
    const mista = ['bug', { value: 'feature', color: '#4caf72' }, 'docs'];
    writeSchema(schemaWithTipo(mista));
    config.reload();
    const onDisk = JSON.parse(fs.readFileSync(schemaFile, 'utf8'));
    expect(onDisk.properties.tipo.options).toEqual(mista);
    // e em memória segue split
    expect(config.schema.properties.tipo.options).toEqual(['bug', 'feature', 'docs']);
  });

  it('options string[] puro (legado) → no-op com optionMeta vazio', () => {
    writeSchema(schemaWithTipo(['x', 'y']));
    const tipo = config.schema.properties.tipo;
    expect(tipo.options).toEqual(['x', 'y']);
    expect(tipo.optionMeta).toEqual({});
  });
});

describe('config — sanitizeOptionsForDisk (persistência seletiva)', () => {
  it('objeto {value,color} só pra opção com cor válida; string crua pro resto', () => {
    expect(config.sanitizeOptionsForDisk(['bug', { value: 'feature', color: '#4caf72' }, 'docs']))
      .toEqual(['bug', { value: 'feature', color: '#4caf72' }, 'docs']);
  });

  it('cor inválida → degrada pra string crua; dups e entradas sem value caem fora', () => {
    expect(config.sanitizeOptionsForDisk([
      { value: 'a', color: 'zzz' },
      { value: 'b', color: '#aabbcc' },
      'b',
      null,
      { color: '#aabbcc' },
    ])).toEqual(['a', { value: 'b', color: '#aabbcc' }]);
  });

  it('input não-array → array vazia (nunca lança)', () => {
    expect(config.sanitizeOptionsForDisk(undefined)).toEqual([]);
    expect(config.sanitizeOptionsForDisk('bug')).toEqual([]);
  });

  it('round-trip disco→memória→disco é estável (idempotente)', () => {
    const mista = ['bug', { value: 'feature', color: '#4caf72' }, 'docs'];
    const persisted = config.sanitizeOptionsForDisk(mista);
    expect(persisted).toEqual(mista);
    const { options, optionMeta } = config.splitOptions(persisted);
    expect(options).toEqual(['bug', 'feature', 'docs']);
    expect(optionMeta).toEqual({ feature: { color: '#4caf72' } });
    expect(config.sanitizeOptionsForDisk(persisted)).toEqual(mista);
  });
});
