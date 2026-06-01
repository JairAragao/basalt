// git.js — operações git sobre o vault: commit, push, pull, health-check,
// histórico e diff de arquivos. Usa a identidade CONFIGURADA NO REPO do usuário
// (user.name/user.email). NÃO injeta identidade falsa: se o repo não tiver user
// configurado, os helpers de commit lançam para a rota devolver um warning.
//
// O push nunca derruba a operação local: pushNow() captura erros e os RETORNA
// (não lança), para a rota incluí-los como "warning" na resposta.
//
// GIT_TERMINAL_PROMPT=0 garante que nenhum comando trave esperando senha
// (push/fetch/ls-remote em remote autenticado falham rápido em vez de pendurar).

const simpleGit = require('simple-git');
const config = require('./config');

// baseDir do git = config.VAULT (a pasta escolhida pelo usuário, com config/ +
// tasks/ + git PRÓPRIO). Como o VAULT pode mudar em runtime (config.setVault),
// a instância do simple-git é (re)criada de forma preguiçosa quando o VAULT
// muda — assim os comandos sempre operam sobre o vault corrente.
//
// Ambiente não-interativo para TODA chamada git deste módulo.
// Usa a forma .env(nome, valor) — que ADICIONA a variável ao ambiente herdado —
// em vez de .env(objeto), que SUBSTITUI o ambiente inteiro e faria o simple-git
// bloquear por carregar um GIT_ASKPASS herdado (allowUnsafeAskPass). Assim o
// credential helper / chave SSH do usuário continuam valendo, mas nenhum comando
// trava pedindo senha — falha rápido em vez de pendurar.
let _git = null;
let _gitBaseDir = null;
function git() {
  const baseDir = config.VAULT;
  if (!_git || _gitBaseDir !== baseDir) {
    _git = simpleGit({ baseDir }).env('GIT_TERMINAL_PROMPT', '0');
    _gitBaseDir = baseDir;
  }
  return _git;
}

// ── Identidade do repo ───────────────────────────────────────────────────────
// Lê user.name/user.email efetivos (local > global). Retorna null em cada campo
// ausente. NÃO há fallback hardcoded.
async function getIdentity() {
  let name = null;
  let email = null;
  try {
    name = (await git().raw(['config', '--get', 'user.name'])).trim() || null;
  } catch {
    name = null;
  }
  try {
    email = (await git().raw(['config', '--get', 'user.email'])).trim() || null;
  } catch {
    email = null;
  }
  return { name, email };
}

// Garante que o repo tem identidade configurada antes de commitar. Lança um erro
// claro (PT-BR) se faltar — a rota traduz isso num warning ao cliente.
async function ensureIdentity() {
  const id = await getIdentity();
  if (!id.name || !id.email) {
    throw new Error(
      'identidade git não configurada no repositório (defina user.name e user.email com `git config`)'
    );
  }
  return id;
}

// ── Push / Pull ──────────────────────────────────────────────────────────────
// pushNow: faz `git push`. NUNCA lança — retorna { ok, error? }. Sem remote
// 'origin' → ok:false com motivo. Falha de auth/rede também volta como error.
async function pushNow() {
  try {
    const remotes = await git().getRemotes(false);
    if (!remotes || !remotes.length) {
      return { ok: false, error: 'nenhum remote configurado (origin ausente)' };
    }
    await git().push();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: oneLine(err.message) };
  }
}

// pull: `git pull --ff-only`. Retorna { ok, message?, error? } (não lança).
async function pull() {
  try {
    const remotes = await git().getRemotes(false);
    if (!remotes || !remotes.length) {
      return { ok: false, error: 'nenhum remote configurado (origin ausente)' };
    }
    const out = await git().raw(['pull', '--ff-only']);
    return { ok: true, message: oneLine(out) || 'pull concluído' };
  } catch (err) {
    return { ok: false, error: oneLine(err.message) };
  }
}

// ── Commit ───────────────────────────────────────────────────────────────────
// Commita um arquivo de tarefa com a mensagem dada, usando a identidade do repo.
async function commitTask(filePath, message) {
  await ensureIdentity();
  try {
    await git().raw(['add', filePath]);
    await git().raw(['commit', '-m', message]);
  } catch (err) {
    if (/nothing to commit/i.test(err.message)) {
      console.warn('[git] nada a commitar para', filePath);
      return;
    }
    throw err;
  }
}

// Para delete: o arquivo já não existe, então `add` registra a remoção.
async function removeAndCommit(filePath, message) {
  await ensureIdentity();
  try {
    await git().raw(['add', filePath]);
    await git().raw(['commit', '-m', message]);
  } catch (err) {
    if (/nothing to commit/i.test(err.message)) {
      console.warn('[git] nada a commitar para remoção de', filePath);
      return;
    }
    throw err;
  }
}

// Commita um conjunto específico de paths (board.json/schema.json + tarefas
// migradas). Escopo explícito — NÃO usa `add -A` pra não varrer o repo inteiro.
async function commitPaths(paths, message) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  await ensureIdentity();
  try {
    await git().raw(['add', ...list]);
    await git().raw(['commit', '-m', message]);
  } catch (err) {
    if (/nothing to commit/i.test(err.message)) {
      console.warn('[git] nada a commitar para', message);
      return;
    }
    throw err;
  }
}

// ── Health-check ─────────────────────────────────────────────────────────────
// healthGit() -> objeto do contrato. Cada check é não-interativo e nunca trava.
async function healthGit() {
  const checks = [];

  // 1) Repo git existe.
  let hasRepo = false;
  try {
    hasRepo = await git().checkIsRepo();
  } catch {
    hasRepo = false;
  }
  checks.push({
    id: 'repo',
    label: 'Repositório git inicializado',
    ok: !!hasRepo,
    detail: hasRepo ? 'repositório git encontrado' : 'a pasta não é um repositório git',
    fix: hasRepo ? null : 'git init',
  });

  // Sem repo, não há o que checar adiante — devolve o esqueleto.
  if (!hasRepo) {
    return {
      ok: false,
      hasRepo: false,
      branch: null,
      user: null,
      hasRemote: false,
      remoteUrl: null,
      checks,
    };
  }

  // Branch atual.
  let branch = null;
  try {
    branch = (await git().raw(['rev-parse', '--abbrev-ref', 'HEAD'])).trim() || null;
  } catch {
    branch = null;
  }

  // 2) Identidade (user.name + user.email).
  const id = await getIdentity();
  const userOk = !!(id.name && id.email);
  checks.push({
    id: 'user',
    label: 'Identidade git configurada (user.name e user.email)',
    ok: userOk,
    detail: userOk
      ? `${id.name} <${id.email}>`
      : 'user.name e/ou user.email não configurados — commits ficariam sem autor real',
    fix: userOk
      ? null
      : 'git config user.name "Seu Nome" && git config user.email "voce@exemplo.com"',
  });

  // 3) Remote 'origin' existe.
  let remotes = [];
  try {
    remotes = await git().getRemotes(true);
  } catch {
    remotes = [];
  }
  const origin = (remotes || []).find((r) => r.name === 'origin');
  const hasRemote = !!origin;
  const remoteUrl =
    (origin && origin.refs && (origin.refs.push || origin.refs.fetch)) || null;
  checks.push({
    id: 'remote',
    label: "Remote 'origin' configurado",
    ok: hasRemote,
    detail: hasRemote ? `origin → ${remoteUrl}` : "remote 'origin' não encontrado",
    fix: hasRemote ? null : 'git remote add origin <url>',
  });

  // 4) Push sem senha (git push --dry-run). Só roda se houver remote.
  if (hasRemote) {
    const pushCheck = await tryRemoteCmd(
      ['push', '--dry-run'],
      'push',
      'Push sem pedir senha (autenticação OK)',
      'consegue enviar commits ao origin sem prompt de senha',
      'configure um credential helper ou chave SSH (ex.: `git config credential.helper store` ou troque a URL do origin para SSH)'
    );
    checks.push(pushCheck);

    // 5) Pull/fetch sem senha (git ls-remote). Não interativo, não muda nada.
    const pullCheck = await tryRemoteCmd(
      ['ls-remote', 'origin'],
      'pull',
      'Pull/fetch sem pedir senha (autenticação OK)',
      'consegue ler o origin sem prompt de senha',
      'configure um credential helper ou chave SSH (ex.: `git config credential.helper store` ou troque a URL do origin para SSH)'
    );
    checks.push(pullCheck);
  } else {
    checks.push({
      id: 'push',
      label: 'Push sem pedir senha (autenticação OK)',
      ok: false,
      detail: 'sem remote origin não há como testar push',
      fix: 'git remote add origin <url>',
    });
    checks.push({
      id: 'pull',
      label: 'Pull/fetch sem pedir senha (autenticação OK)',
      ok: false,
      detail: 'sem remote origin não há como testar pull/fetch',
      fix: 'git remote add origin <url>',
    });
  }

  const ok = checks.every((c) => c.ok);
  return {
    ok,
    hasRepo: true,
    branch,
    user: userOk ? { name: id.name, email: id.email } : null,
    hasRemote,
    remoteUrl,
    checks,
  };
}

// Roda um comando git que toca o remote de forma não-interativa. Sucesso → ok.
// Falha (auth, rede, prompt evitado por GIT_TERMINAL_PROMPT=0) → ok:false com fix.
async function tryRemoteCmd(args, id, label, okDetail, fix) {
  try {
    await git().raw(args);
    return { id, label, ok: true, detail: okDetail, fix: null };
  } catch (err) {
    return { id, label, ok: false, detail: oneLine(err.message), fix };
  }
}

// ── Histórico e diff de arquivo ──────────────────────────────────────────────
// logHistory(relPath) -> [{ hash, shortHash, date(ISO), author, message }]
// Usa --follow para acompanhar renomeações do arquivo.
async function logHistory(relPath) {
  // Formato com separadores improváveis no conteúdo (\x1f campo, \x1e registro).
  const FMT = '%H%x1f%h%x1f%aI%x1f%an%x1f%s%x1e';
  let out;
  try {
    out = await git().raw(['log', '--follow', `--format=${FMT}`, '--', relPath]);
  } catch (err) {
    if (/unknown revision|does not have any commits|bad revision/i.test(err.message)) {
      return [];
    }
    throw err;
  }
  const records = String(out || '')
    .split('\x1e')
    .map((r) => r.replace(/^\s+/, ''))
    .filter(Boolean);
  return records.map((rec) => {
    const [hash, shortHash, date, author, message] = rec.split('\x1f');
    return {
      hash: (hash || '').trim(),
      shortHash: (shortHash || '').trim(),
      date: (date || '').trim(),
      author: (author || '').trim(),
      message: (message || '').trim(),
    };
  });
}

// showAt(ref, relPath) -> conteúdo do arquivo em `ref` (ex.: "H", "H^").
// Se o caminho não existir naquele ref (ex.: sem pai), retorna "".
async function showAt(ref, relPath) {
  try {
    return await git().raw(['show', `${ref}:${relPath}`]);
  } catch (err) {
    // Sem pai / arquivo inexistente naquele ref → trata como vazio.
    if (
      /exists on disk, but not in|does not exist|unknown revision|bad revision|invalid object|fatal: path/i.test(
        err.message
      )
    ) {
      return '';
    }
    throw err;
  }
}

// diffFile(hashParentExpr, hash, relPath) -> unified diff entre pai e commit.
// hashParentExpr costuma ser "H^"; se o commit não tiver pai, usa o empty-tree
// (assim o diff mostra o arquivo inteiro como adicionado).
async function diffFile(hashParentExpr, hash, relPath) {
  // Confere se o "pai" RESOLVE para um commit; senão, usa a árvore vazia do git.
  // `rev-parse --verify --quiet` com revisão inexistente NÃO lança no simple-git:
  // sai com código 1 e stdout vazio. Por isso checamos o output, não só o throw.
  let base = await resolveCommit(hashParentExpr);
  if (!base) base = await emptyTreeHash();
  return git().raw(['diff', base, hash, '--', relPath]);
}

// Resolve uma expressão de revisão para um SHA de commit. Retorna '' se não
// existir (ex.: pai de um commit-raiz). Não lança nesses casos.
async function resolveCommit(expr) {
  try {
    const out = await git().raw(['rev-parse', '--verify', '--quiet', `${expr}^{commit}`]);
    return String(out || '').trim();
  } catch {
    return '';
  }
}

// Hash da árvore vazia do git (constante para SHA-1). Calcula via hash-object
// para ser robusto a repositórios SHA-256.
let _emptyTree = null;
async function emptyTreeHash() {
  if (_emptyTree) return _emptyTree;
  try {
    _emptyTree = (await git().raw(['hash-object', '-t', 'tree', '/dev/null'])).trim();
  } catch {
    // Fallback: constante SHA-1 conhecida.
    _emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  }
  return _emptyTree;
}

// ── util ─────────────────────────────────────────────────────────────────────
// Achata mensagens multi-linha em uma linha enxuta (para warnings/details).
function oneLine(s) {
  return String(s == null ? '' : s)
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  commitTask,
  removeAndCommit,
  commitPaths,
  pushNow,
  pull,
  healthGit,
  getIdentity,
  logHistory,
  showAt,
  diffFile,
};
