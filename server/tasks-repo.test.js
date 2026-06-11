// tasks-repo.test.js — carimbo de conclusão (tabela de cenários do design,
// linha a linha), path-safety do resolveTaskPath, atomicidade da escrita e
// preservação de chaves estrangeiras no update.
//
// ISOLAMENTO: mesmo padrão do config.test.js — homedir fake ANTES do require
// (nunca toca ~/.basalt nem o vault real) + cache CJS limpo pra load fresco.

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-repo-test-'));
const realHomedir = os.homedir;
os.homedir = () => tmpHome;
delete process.env.BASALT_VAULT;
delete require.cache[require.resolve('./config.js')];
delete require.cache[require.resolve('./tasks-repo.js')];
const config = require('./config.js');
const tasksRepo = require('./tasks-repo.js');

const vaultConfigDir = path.join(tmpHome, '.basalt', 'default-vault', 'config');

afterAll(() => {
  os.homedir = realHomedir;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

const boardDone = {
  groupBy: 'status',
  doneGroupId: 'concluido',
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
      stages: [{ id: 'feito', label: 'Feito', color: '#3fb950' }],
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

beforeAll(() => {
  writeBoard(boardDone);
});

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

describe('tasks-repo — carimbo de conclusão (tabela do design)', () => {
  it('1. create com status ∉ done → sem completed_*', () => {
    tasksRepo.create({ id: 'c1', titulo: 'Cenário 1', status: 'backlog' }, '', 'Jair');
    const { data } = tasksRepo.get('c1');
    expect('completed_at' in data).toBe(false);
    expect('completed_by' in data).toBe(false);
  });

  it('2. create direto com status ∈ done → carimba now/actor', () => {
    tasksRepo.create({ id: 'c2', titulo: 'Cenário 2', status: 'feito' }, '', 'Jair');
    const { data } = tasksRepo.get('c2');
    expect(data.completed_at).toMatch(ISO_RE);
    expect(data.completed_by).toBe('Jair');
    expect(data.completed_at).toBe(data.created_at); // mesmo instante do create
  });

  it('3. update mantendo status ∈ done → preserva o carimbo (não re-carimba)', () => {
    tasksRepo.create({ id: 'c3', titulo: 'Cenário 3', status: 'feito' }, '', 'Jair');
    const stamped = tasksRepo.get('c3').data;
    tasksRepo.update('c3', { titulo: 'Cenário 3 editado', status: 'feito' }, undefined, 'Leo');
    const { data } = tasksRepo.get('c3');
    expect(data.completed_at).toBe(stamped.completed_at);
    expect(data.completed_by).toBe('Jair'); // não vira 'Leo'
  });

  it('3. legado em done SEM carimbo → continua sem (nada de retro-carimbo)', () => {
    tasksRepo.ATOMIC_writeTask('c3-legado', { titulo: 'Legado', status: 'feito' }, '');
    tasksRepo.update('c3-legado', { titulo: 'Legado editado', status: 'feito' }, undefined, 'Leo');
    const { data } = tasksRepo.get('c3-legado');
    expect('completed_at' in data).toBe(false);
    expect('completed_by' in data).toBe(false);
  });

  it('4. update com transição ∉ done → ∈ done → carimba now/actor', () => {
    tasksRepo.create({ id: 'c4', titulo: 'Cenário 4', status: 'backlog' }, '', 'Jair');
    tasksRepo.update('c4', { titulo: 'Cenário 4', status: 'feito' }, undefined, 'Leo');
    const { data } = tasksRepo.get('c4');
    expect(data.completed_at).toMatch(ISO_RE);
    expect(data.completed_by).toBe('Leo'); // quem concluiu, não quem criou
  });

  it('5. update com transição ∈ done → ∉ done → remove ambos', () => {
    tasksRepo.create({ id: 'c5', titulo: 'Cenário 5', status: 'feito' }, '', 'Jair');
    tasksRepo.update('c5', { titulo: 'Cenário 5', status: 'backlog' }, undefined, 'Leo');
    const { data } = tasksRepo.get('c5');
    expect('completed_at' in data).toBe(false);
    expect('completed_by' in data).toBe(false);
  });

  it('6. update mantendo status ∉ done → ausentes continuam ausentes', () => {
    tasksRepo.create({ id: 'c6', titulo: 'Cenário 6', status: 'backlog' }, '', 'Jair');
    tasksRepo.update('c6', { titulo: 'Cenário 6', status: 'andamento' }, undefined, 'Leo');
    const { data } = tasksRepo.get('c6');
    expect('completed_at' in data).toBe(false);
    expect('completed_by' in data).toBe(false);
  });

  it('7. input do app com completed_* forjado → stripManaged descarta (create)', () => {
    tasksRepo.create(
      { id: 'c7', titulo: 'Cenário 7', status: 'backlog', completed_at: '1999-01-01T00:00:00Z', completed_by: 'Forjado' },
      '',
      'Jair'
    );
    const { data } = tasksRepo.get('c7');
    expect('completed_at' in data).toBe(false);
    expect('completed_by' in data).toBe(false);
  });

  it('7. input do app com completed_* forjado → stripManaged descarta (update em done)', () => {
    tasksRepo.create({ id: 'c7b', titulo: 'Cenário 7b', status: 'feito' }, '', 'Jair');
    const stamped = tasksRepo.get('c7b').data;
    tasksRepo.update(
      'c7b',
      { titulo: 'Cenário 7b', status: 'feito', completed_at: '1999-01-01T00:00:00Z', completed_by: 'Forjado' },
      undefined,
      'Leo'
    );
    const { data } = tasksRepo.get('c7b');
    expect(data.completed_at).toBe(stamped.completed_at); // o do create, não o forjado
    expect(data.completed_by).toBe('Jair');
  });

  it('8. vault sem doneGroupId → nenhum carimbo novo; existentes preservados', () => {
    // carimba ANTES de desmarcar o grupo
    tasksRepo.create({ id: 'c8-velho', titulo: 'Cenário 8 velho', status: 'feito' }, '', 'Jair');
    const stamped = tasksRepo.get('c8-velho').data;

    writeBoard({ ...boardDone, doneGroupId: null });

    // (a) carimbo existente NÃO é destruído quando o usuário desmarca o grupo
    tasksRepo.update('c8-velho', { titulo: 'Cenário 8 velho editado', status: 'feito' }, undefined, 'Leo');
    const velho = tasksRepo.get('c8-velho').data;
    expect(velho.completed_at).toBe(stamped.completed_at);
    expect(velho.completed_by).toBe('Jair');

    // (b) sem doneGroupId, mover pra etapa "feito" não carimba
    tasksRepo.create({ id: 'c8-novo', titulo: 'Cenário 8 novo', status: 'backlog' }, '', 'Jair');
    tasksRepo.update('c8-novo', { titulo: 'Cenário 8 novo', status: 'feito' }, undefined, 'Leo');
    const novo = tasksRepo.get('c8-novo').data;
    expect('completed_at' in novo).toBe(false);
    expect('completed_by' in novo).toBe(false);

    // (c) create direto em "feito" também não carimba
    tasksRepo.create({ id: 'c8-create', titulo: 'Cenário 8 create', status: 'feito' }, '', 'Jair');
    const criado = tasksRepo.get('c8-create').data;
    expect('completed_at' in criado).toBe(false);

    writeBoard(boardDone); // restaura pros demais testes
  });
});

describe('tasks-repo — path-safety (resolveTaskPath)', () => {
  it('rejeita travessia e separadores de path', () => {
    expect(() => tasksRepo.resolveTaskPath('..')).toThrow(/id inválido/);
    expect(() => tasksRepo.resolveTaskPath('../evil')).toThrow(/id inválido/);
    expect(() => tasksRepo.resolveTaskPath('a/b')).toThrow(/id inválido/);
    expect(() => tasksRepo.resolveTaskPath('a\\b')).toThrow(/id inválido/);
    expect(() => tasksRepo.resolveTaskPath('a..b')).toThrow(/id inválido/);
    expect(() => tasksRepo.resolveTaskPath('com espaço')).toThrow(/id inválido/);
    expect(() => tasksRepo.resolveTaskPath('')).toThrow(/id inválido/);
    expect(() => tasksRepo.resolveTaskPath(null)).toThrow(/id inválido/);
  });

  it('id válido resolve DENTRO de tasks/', () => {
    const full = tasksRepo.resolveTaskPath('T-2026-06-10-ok_1.x');
    expect(full.startsWith(path.resolve(config.TASKS_DIR) + path.sep)).toBe(true);
    expect(full.endsWith('T-2026-06-10-ok_1.x.md')).toBe(true);
  });
});

describe('tasks-repo — atomicidade e preservação', () => {
  it('escrita atômica: nenhum .tmp sobra em tasks/ após create/update', () => {
    tasksRepo.create({ id: 'atomico', titulo: 'Atômico', status: 'backlog' }, 'corpo', 'Jair');
    tasksRepo.update('atomico', { titulo: 'Atômico v2', status: 'andamento' }, 'corpo 2', 'Jair');
    const leftovers = fs.readdirSync(config.TASKS_DIR).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
    expect(tasksRepo.get('atomico').body.trim()).toBe('corpo 2');
  });

  it('update preserva chaves ESTRANGEIRAS do frontmatter (fora do schema/UI)', () => {
    tasksRepo.ATOMIC_writeTask('estrangeira', { titulo: 'Com extra', status: 'backlog', chave_manual: 'não destrua' }, '');
    tasksRepo.update('estrangeira', { titulo: 'Com extra v2', status: 'backlog' }, undefined, 'Jair');
    const { data } = tasksRepo.get('estrangeira');
    expect(data.chave_manual).toBe('não destrua');
  });
});
