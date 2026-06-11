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
