// git.recover.test.js — regressão de recoverStash() com repo git TEMPORÁRIO.
//
// Bug de origem: a recuperação usava `stash pop` + `add -A` + commit sem olhar o
// CONTEÚDO. Quando o apply deixava marcadores de conflito dentro de um .md, eles
// eram commitados; o frontmatter YAML virava inválido e a tarefa SUMIA do board
// (card sem título). Pior: com `pop` a entrada já tinha sido apagada, então não
// dava pra desfazer sem perder as mudanças.
//
// Aqui se cobre: (a) caminho feliz commita e esvazia a lista; (b) conteúdo com
// marcador é BARRADO — nada commitado, working tree restaurado e a mudança
// CONTINUA guardada.
//
// ISOLAMENTO: mesmo padrão do git.pull.test.js — homedir fake ANTES do require
// (nunca toca ~/.basalt nem o vault real) + cache CJS limpo pra load fresco.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-gitrec-home-'));
const realHomedir = os.homedir;
os.homedir = () => tmpHome;
delete process.env.BASALT_VAULT;
delete require.cache[require.resolve('./config.js')];
delete require.cache[require.resolve('./git.js')];
const config = require('./config.js');
const git = require('./git.js');

const tmpRepos = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-gitrec-repos-'));
const repo = path.join(tmpRepos, 'vault');

function g(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

const TASK = 'tasks/T-teste.md';
const CLEAN = `---
tarefa: Tarefa de teste
status: Em Andamento
updated_at: '2026-08-03T10:00:00.000Z'
---

Corpo da tarefa.
`;

// Conteúdo exatamente como um apply conflitado o deixa: marcadores DENTRO do
// frontmatter — é isso que quebra o gray-matter e some com o card.
const MARKED = `---
tarefa: Tarefa de teste
status: Em Andamento
<<<<<<< Updated upstream
updated_at: '2026-08-03T10:00:00.000Z'
=======
updated_at: '2026-08-03T09:00:00.000Z'
>>>>>>> Stashed changes
---

Corpo da tarefa.
`;

function stashList() {
  return g(repo, 'stash', 'list').trim();
}

beforeAll(() => {
  fs.mkdirSync(path.join(repo, 'tasks'), { recursive: true });
  g(tmpRepos, 'init', 'vault');
  g(repo, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  g(repo, 'config', 'user.name', 'Tester');
  g(repo, 'config', 'user.email', 'tester@test.local');
  g(repo, 'config', 'core.autocrlf', 'false');

  fs.writeFileSync(path.join(repo, TASK), CLEAN, 'utf8');
  g(repo, 'add', TASK);
  g(repo, 'commit', '-m', 'tarefa inicial', '--', TASK);

  config.setVault(repo);
});

afterAll(() => {
  os.homedir = realHomedir;
  fs.rmSync(tmpHome, { recursive: true, force: true, maxRetries: 3 });
  fs.rmSync(tmpRepos, { recursive: true, force: true, maxRetries: 3 });
});

describe('git — recoverStash', () => {
  it('lista vazia → ok:true sem commitar nada', async () => {
    const headBefore = g(repo, 'rev-parse', 'HEAD').trim();
    const r = await git.recoverStash();
    expect(r.ok).toBe(true);
    expect(r.message).toBe('nada a recuperar');
    expect(g(repo, 'rev-parse', 'HEAD').trim()).toBe(headBefore);
  });

  it('mudança guardada limpa → commita e a entrada sai da lista', async () => {
    fs.writeFileSync(path.join(repo, TASK), CLEAN.replace('Corpo da tarefa.', 'Corpo editado.'), 'utf8');
    g(repo, 'stash', 'push', '--', TASK);
    expect(stashList()).not.toBe('');

    const r = await git.recoverStash();

    expect(r.ok).toBe(true);
    expect(fs.readFileSync(path.join(repo, TASK), 'utf8')).toContain('Corpo editado.');
    expect(g(repo, 'log', '--oneline', '-1')).toContain('recupera mudanças guardadas');
    // entrada consumida SÓ depois do commit
    expect(stashList()).toBe('');
    expect(g(repo, 'status', '--porcelain', '-uno').trim()).toBe('');
  });

  it('mudança guardada com marcador de conflito → BARRA, não commita e mantém guardada', async () => {
    fs.writeFileSync(path.join(repo, TASK), MARKED, 'utf8');
    g(repo, 'stash', 'push', '--', TASK);
    const stashBefore = stashList();
    expect(stashBefore).not.toBe('');
    const headBefore = g(repo, 'rev-parse', 'HEAD').trim();

    const r = await git.recoverStash();

    expect(r.ok).toBe(false);
    expect(r.conflict).toBe(true);
    expect(r.error).toMatch(/marcadores de conflito/);

    // nada commitado
    expect(g(repo, 'rev-parse', 'HEAD').trim()).toBe(headBefore);
    // working tree restaurado — sem marcadores, YAML de novo válido
    const content = fs.readFileSync(path.join(repo, TASK), 'utf8');
    expect(content).not.toMatch(/^(<{7}|>{7}) /m);
    expect(g(repo, 'status', '--porcelain', '-uno').trim()).toBe('');
    // e o mais importante: NADA foi perdido — continua guardado
    expect(stashList()).toBe(stashBefore);
  });
});
