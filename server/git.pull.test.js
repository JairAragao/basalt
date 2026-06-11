// git.pull.test.js — integração de pullRebase() com repos git TEMPORÁRIOS:
// 1 bare (origin) + 2 clones com identidade git LOCAL (não global). Cenários:
// ff ok, divergência limpa (rebase ok) e conflito real (mesmo arquivo/linha)
// → abort + reason 'diverged' + working tree intacto e sem rebase pendente.
//
// ISOLAMENTO: mesmo padrão do config.test.js — homedir fake ANTES do require
// (nunca toca ~/.basalt nem o vault real) + cache CJS limpo pra load fresco.
// O vault corrente do git.js é apontado pros clones via config.setVault().

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-gitpull-home-'));
const realHomedir = os.homedir;
os.homedir = () => tmpHome;
delete process.env.BASALT_VAULT;
delete require.cache[require.resolve('./config.js')];
delete require.cache[require.resolve('./git.js')];
const config = require('./config.js');
const git = require('./git.js');

const tmpRepos = fs.mkdtempSync(path.join(os.tmpdir(), 'basalt-gitpull-repos-'));
const bare = path.join(tmpRepos, 'origin.git');
const cloneA = path.join(tmpRepos, 'clone-a'); // o "vault" que o git.js opera
const cloneB = path.join(tmpRepos, 'clone-b'); // o "outro usuário"

// execFileSync com ARRAY de args — nunca interpola input em string de comando.
function g(cwd, ...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
}

function write(repo, rel, content) {
  fs.writeFileSync(path.join(repo, rel), content, 'utf8');
}

function commitFile(repo, rel, msg) {
  g(repo, 'add', rel);
  g(repo, 'commit', '-m', msg, '--', rel);
}

// identidade LOCAL do repo de teste (não mexe no git config global da máquina)
function setLocalIdentity(repo, name, email) {
  g(repo, 'config', 'user.name', name);
  g(repo, 'config', 'user.email', email);
  // sem normalização CRLF do Windows — conteúdo dos arquivos fica determinístico
  g(repo, 'config', 'core.autocrlf', 'false');
}

function noRebaseInProgress(repo) {
  return (
    !fs.existsSync(path.join(repo, '.git', 'rebase-merge')) &&
    !fs.existsSync(path.join(repo, '.git', 'rebase-apply'))
  );
}

beforeAll(() => {
  // bare origin com branch default determinística
  g(tmpRepos, 'init', '--bare', 'origin.git');
  g(bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');

  // clone A: identidade local, commit inicial, push -u
  g(tmpRepos, 'clone', bare, 'clone-a');
  setLocalIdentity(cloneA, 'Tester A', 'a@test.local');
  g(cloneA, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  write(cloneA, 'seed.txt', 'seed\n');
  commitFile(cloneA, 'seed.txt', 'seed inicial');
  g(cloneA, 'push', '-u', 'origin', 'main');

  // clone B: já nasce com main
  g(tmpRepos, 'clone', bare, 'clone-b');
  setLocalIdentity(cloneB, 'Tester B', 'b@test.local');

  // git.js opera sobre o vault corrente → aponta pro clone A
  config.setVault(cloneA);
});

afterAll(() => {
  os.homedir = realHomedir;
  fs.rmSync(tmpHome, { recursive: true, force: true, maxRetries: 3 });
  fs.rmSync(tmpRepos, { recursive: true, force: true, maxRetries: 3 });
});

describe('git — pullRebase (integração com repos temporários)', () => {
  it('fast-forward simples → ok:true e o arquivo remoto chega', async () => {
    write(cloneB, 'b1.txt', 'do B\n');
    commitFile(cloneB, 'b1.txt', 'remoto b1');
    g(cloneB, 'push');

    const r = await git.pullRebase();
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(cloneA, 'b1.txt'))).toBe(true);
  });

  it('divergência limpa (arquivos diferentes) → rebase ok, histórico com os 2 commits', async () => {
    write(cloneB, 'b2.txt', 'do B 2\n');
    commitFile(cloneB, 'b2.txt', 'remoto b2');
    g(cloneB, 'push');

    write(cloneA, 'a2.txt', 'do A 2\n');
    commitFile(cloneA, 'a2.txt', 'local a2');

    const r = await git.pullRebase();
    expect(r.ok).toBe(true);
    expect(fs.existsSync(path.join(cloneA, 'a2.txt'))).toBe(true);
    expect(fs.existsSync(path.join(cloneA, 'b2.txt'))).toBe(true);
    const log = g(cloneA, 'log', '--oneline');
    expect(log).toContain('local a2');
    expect(log).toContain('remoto b2');
    // -uno: ignora os untracked semeados pelo setVault (config/, tasks/)
    expect(g(cloneA, 'status', '--porcelain', '-uno').trim()).toBe('');
    expect(noRebaseInProgress(cloneA)).toBe(true);
  });

  it('conflito real (mesmo arquivo/linha) → ok:false reason diverged, working tree intacto, sem rebase pendente', async () => {
    // realinha os clones num arquivo base comum
    g(cloneA, 'push');
    g(cloneB, 'pull');
    write(cloneB, 'conflict.txt', 'linha base\n');
    commitFile(cloneB, 'conflict.txt', 'base do conflito');
    g(cloneB, 'push');
    g(cloneA, 'pull');

    // mesma linha editada nos dois lados
    write(cloneA, 'conflict.txt', 'versão local\n');
    commitFile(cloneA, 'conflict.txt', 'local conflito');
    write(cloneB, 'conflict.txt', 'versão remota\n');
    commitFile(cloneB, 'conflict.txt', 'remoto conflito');
    g(cloneB, 'push');

    const headBefore = g(cloneA, 'rev-parse', 'HEAD').trim();
    const r = await git.pullRebase();

    expect(r.ok).toBe(false);
    expect(r.reason).toBe('diverged');
    expect(typeof r.detail).toBe('string');
    expect(r.detail.length).toBeGreaterThan(0);

    // working tree INTACTO: conteúdo local preservado, sem marcadores de conflito
    const content = fs.readFileSync(path.join(cloneA, 'conflict.txt'), 'utf8');
    expect(content).toBe('versão local\n');
    expect(content).not.toMatch(/<{7}|={7}|>{7}/);
    // HEAD voltou pro commit local (abort restaurou o estado pré-rebase)
    expect(g(cloneA, 'rev-parse', 'HEAD').trim()).toBe(headBefore);
    // status limpo (sem unmerged/modificados) e nenhum rebase em andamento
    expect(g(cloneA, 'status', '--porcelain', '-uno').trim()).toBe('');
    expect(noRebaseInProgress(cloneA)).toBe(true);
  });

  it('sem remote → ok:false reason no-remote (não tenta pull)', async () => {
    const cloneC = path.join(tmpRepos, 'sem-remote');
    config.setVault(cloneC); // seed + git init, sem origin
    const r = await git.pullRebase();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-remote');
    config.setVault(cloneA); // restaura
  });
});

describe('git — classifyPullReason (classificação de mensagens)', () => {
  it.each([
    ['nenhum remote configurado (origin ausente)', 'no-remote'],
    ['block timeout reached', 'timeout'],
    ["fatal: could not read Username for 'https://github.com': terminal prompts disabled", 'auth'],
    ['Permission denied (publickey).', 'auth'],
    ['CONFLICT (content): Merge conflict in tasks/t.md', 'diverged'],
    ['fatal: Not possible to fast-forward, aborting.', 'diverged'],
    ['error: could not apply abc1234... mensagem', 'diverged'],
    ['algo completamente inesperado', 'other'],
    ['', 'other'],
  ])('"%s" → %s', (msg, expected) => {
    expect(git.classifyPullReason(msg)).toBe(expected);
  });
});
