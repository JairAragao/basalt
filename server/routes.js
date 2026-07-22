// routes.js — API REST sob /api. Lê config viva via `config.X` (suporta reload).
// Erros viram 400 (validação/path/404) ou 500, com { error: msg }. Nunca vaza stack.
//
// Commits usam a identidade git CONFIGURADA NO REPO (server/git.js). A mensagem
// é gerada automaticamente por describeChanges (server/commit-msg.js) comparando
// o frontmatter antes vs depois. Após cada commit faz-se push: se o push falhar,
// a operação local NÃO falha — devolve-se { warning } na resposta.

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const matter = require('gray-matter');

const config = require('./config');
const tasksRepo = require('./tasks-repo');
const git = require('./git');
const plugins = require('./plugins');
const { describeChanges } = require('./commit-msg');
const { validatePropertySpec } = require('./validate');

const router = express.Router();

// Arquivos de config vivem no VAULT corrente (config.CONFIG_DIR), que pode mudar
// em runtime (troca de vault). Por isso são FUNÇÕES, não constantes — sempre
// resolvem o caminho atual.
function boardFile() {
  return path.join(config.CONFIG_DIR, 'board.json');
}
function schemaFile() {
  return path.join(config.CONFIG_DIR, 'schema.json');
}
function dashboardFile() {
  return path.join(config.CONFIG_DIR, 'dashboard.json');
}

// Sanitiza a config do dashboard (estrutural). Semântica (props órfãs etc.) é
// self-healed pelo motor de agregação no front. Whitelist de campos → sem lixo.
const CHART_TYPES = new Set(['kpi', 'bar', 'line', 'pie']);
const CHART_AGGS = new Set(['count', 'sum', 'avg', 'leadtime']);
const CHART_BASES = new Set(['all', 'created', 'completed', 'open']);
const CHART_BUCKETS = new Set(['day', 'week', 'month']);
const CHART_SORTS = new Set(['value', 'label', 'sequence']);
function sanitizeDashboard(raw) {
  const rawCharts = raw && Array.isArray(raw.charts) ? raw.charts : [];
  const charts = [];
  const seen = new Set();
  rawCharts.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const type = CHART_TYPES.has(c.type) ? c.type : 'bar';
    let id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `c${i}_${crypto.randomBytes(3).toString('hex')}`;
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    const w = Math.min(12, Math.max(1, parseInt(c.w, 10) || (type === 'kpi' ? 3 : 6)));
    const measure = c.measure && typeof c.measure === 'object' ? c.measure : {};
    const out = {
      id,
      type,
      title: typeof c.title === 'string' ? c.title.slice(0, 120) : '',
      w,
      measure: {
        agg: CHART_AGGS.has(measure.agg) ? measure.agg : 'count',
        prop: typeof measure.prop === 'string' ? measure.prop : null,
      },
      basis: CHART_BASES.has(c.basis) ? c.basis : 'all',
    };
    if (type === 'bar' || type === 'pie') {
      out.dim = typeof c.dim === 'string' ? c.dim : null;
      out.sort = CHART_SORTS.has(c.sort) ? c.sort : 'value';
      out.dir = c.dir === 'asc' ? 'asc' : 'desc';
      out.limit = Number.isInteger(c.limit) && c.limit > 0 ? c.limit : null;
      if (type === 'bar') out.orientation = c.orientation === 'vertical' ? 'vertical' : 'horizontal';
    }
    if (type === 'line') {
      out.dateProp = typeof c.dateProp === 'string' ? c.dateProp : 'created_at';
      out.bucket = CHART_BUCKETS.has(c.bucket) ? c.bucket : 'day';
      out.basis = out.dateProp === 'completed_at' ? 'completed' : 'created';
    }
    charts.push(out);
  });
  return { charts };
}

function statusFor(err) {
  const m = err.message || '';
  if (/validação|id inválido|id fora|não encontrada|já existe/i.test(m)) return 400;
  return 500;
}
function fail(res, err) {
  console.error('[routes]', err.stack || err.message);
  res.status(statusFor(err)).json({ error: err.message });
}
function taskFile(id) {
  return path.join(config.TASKS_DIR, `${id}.md`);
}
// Caminho do arquivo da tarefa RELATIVO ao VAULT (raiz do repo git), para
// git log/show/diff. Sempre com '/' — o git usa posix paths internamente.
function taskRelPath(id) {
  return path
    .relative(config.VAULT, taskFile(id))
    .split(path.sep)
    .join('/');
}
function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

// Anexa warning à resposta JSON só quando existir (campo opcional do contrato).
function withWarning(payload, warning) {
  return warning ? { ...payload, warning } : payload;
}

// Title key resolvido do board (engine genérico — não hardcoda 'titulo').
function titleKeyOf() {
  return (config.board && config.board.card && config.board.card.title) || 'titulo';
}

// Autor da mudança = usuário do git do vault (created_by/updated_by). Local-first,
// sem login: o mesmo nome que assina os commits. Nunca lança. CACHEADO por vault
// (getIdentity spawna git; cache tira do caminho crítico). Invalidado ao trocar vault.
let _actorCache = null;
if (typeof config.onVaultChange === 'function') config.onVaultChange(() => { _actorCache = null; });
async function gitActor() {
  if (_actorCache) return _actorCache; // cacheia SÓ quando há nome (senão re-tenta)
  try {
    const id = await git.getIdentity();
    if (id && id.name) _actorCache = id.name;
  } catch { /* re-tenta na próxima */ }
  return _actorCache || '';
}

// Fila git SERIALIZADA — UMA op por vez (evita lock concorrente entre rotas que
// compartilham o repo do vault). gitChain segue viva após falha.
let gitChain = Promise.resolve();
function gitSerial(fn) {
  const run = gitChain.then(() => fn());
  gitChain = run.then(() => undefined, () => undefined);
  return run;
}

// Warning do último push em background (best-effort) — surfaciado na PRÓXIMA
// resposta (1 op de atraso), restaurando o feedback "push falhou → toast" sem
// bloquear a request. take* lê e limpa (não repete o aviso).
let _lastPushWarning;
function takePushWarning() {
  const w = _lastPushWarning;
  _lastPushWarning = undefined;
  return w;
}

// COMMIT serializado e AGUARDADO (rápido, local): devolve warning de commit (ex.:
// identidade git ausente) ou, na falta dele, o warning do último push em background.
// NUNCA lança. O arquivo já foi gravado de forma síncrona.
async function commitAwaited(commitFn) {
  let commitWarning;
  try {
    await gitSerial(commitFn);
  } catch (e) {
    commitWarning = `não versionado: ${(e && e.message) || e}`;
  }
  const pushWarning = takePushWarning(); // sempre lê+limpa (não fica pendurado)
  return commitWarning || pushWarning;
}

// Como commitAwaited, mas roda TAMBÉM a ESCRITA do arquivo dentro da fila git.
// Sem isso, um `pull --rebase --autostash` em andamento podia intercalar entre o
// write (fora da fila) e o commit (na fila): o save era varrido pro autostash e,
// em conflito, revertido via reset --hard — com a rota respondendo 200 "Salvo".
// Erro do writeFn PROPAGA (vira 400/500 na rota); erro de commit vira warning.
async function commitAwaitedWrite(writeFn, commitFn) {
  let commitWarning;
  await gitSerial(async () => {
    await writeFn();
    try {
      await commitFn();
    } catch (e) {
      commitWarning = `não versionado: ${(e && e.message) || e}`;
    }
  });
  const pushWarning = takePushWarning();
  return commitWarning || pushWarning;
}

// PUSH best-effort em BACKGROUND e COALESCIDO: não bloqueia a resposta (front
// instantâneo) nem dispara pushes concorrentes. Um push pendente cobre todos os
// commits acumulados; uma falha vira _lastPushWarning (surfaciado na próxima resposta).
let _pushPending = false;
let _pushRunning = false;
// troca de vault descarta push pendente do vault ANTIGO — antes o loop seguia
// vivo e executava o push (e o auto-heal de rebase) contra o vault NOVO.
let _pushVault = null;
if (typeof config.onVaultChange === 'function') config.onVaultChange(() => { _pushPending = false; });
function schedulePush() {
  _pushPending = true;
  _pushVault = config.VAULT;
  if (_pushRunning) return;
  _pushRunning = true;
  // O loop roda fora da gitChain, mas CADA pushSync entra na fila (gitSerial):
  // o push em si não toca o worktree, porém o auto-heal de non-fast-forward faz
  // `pull --rebase --autostash` (e até `rebase --abort`) — isso REESCREVE o
  // working tree e, fora da fila, intercalava com o write+commit de um save
  // (a mesma race que commitAwaitedWrite fechou). Na fila, nunca há write de
  // tarefa entre as fases do rebase.
  (async () => {
    try {
      while (_pushPending) {
        _pushPending = false;
        if (config.VAULT !== _pushVault) break; // vault trocou → pendência morta
        // pushSync se auto-cura em divergência: ao ser rejeitado por non-fast-
        // forward, faz `pull --rebase --autostash` e re-tenta — assim os commits
        // locais nunca ficam presos à frente do origin travando a sincronização.
        const r = await gitSerial(() => git.pushSync());
        _lastPushWarning = (r && r.ok === false) ? `push falhou: ${r.error}` : undefined;
        if (_lastPushWarning) console.warn('[git]', _lastPushWarning);
        // Se o push precisou integrar o remoto, surfaça os commits que chegaram
        // como notificações (mesmo caminho do /sync/pull).
        if (r && r.ok && r.pulled && r.before && r.after && r.before !== r.after) {
          try {
            const ns = await buildNotifications(r.before, r.after);
            if (ns.length) config.addNotifications(ns);
          } catch (e) {
            console.warn('[notif] build pós-push falhou:', e.message);
          }
        }
      }
    } catch (e) {
      console.warn('[git] loop de push falhou:', (e && e.message) || e);
    } finally {
      _pushRunning = false;
    }
  })();
}

// ── Tarefas ──────────────────────────────────────────────────────────────────
router.get('/config', (req, res) => {
  res.json({
    schema: config.schema,
    board: config.board,
    gute: config.gute,
    doneStageIds: Array.from(config.doneStageIds || []),
  });
});

// ── Vault (pasta config/ + tasks/ + git próprio escolhida pelo usuário) ───────
// GET /api/vault → status do vault corrente.
router.get('/vault', (req, res) => {
  try {
    res.json(config.vaultStatus());
  } catch (err) { fail(res, err); }
});

// POST /api/vault { path } → valida/seed/git-init o vault, persiste a escolha,
// recarrega a config e devolve o status + a config nova. Erro de path → 400.
router.post('/vault', async (req, res) => {
  try {
    const p = (req.body || {}).path;
    if (typeof p !== 'string' || p.trim() === '') {
      return res.status(400).json({ error: 'validação: o campo "path" é obrigatório (string não-vazia)' });
    }
    const result = config.setVault(p);
    res.json({
      status: result.status,
      git: result.git,
      schema: config.schema,
      board: config.board,
      gute: config.gute,
    });
  } catch (err) {
    // Erros de path/seed são de validação → 400.
    res.status(400).json({ error: err.message });
  }
});

// ── Vaults configurados (abas) ────────────────────────────────────────────────
// GET /api/vaults → { active, vaults:[{path,name,...status}] }
router.get('/vaults', (req, res) => {
  try { res.json(config.listVaults()); } catch (err) { fail(res, err); }
});

// POST /api/vaults/switch { path } → troca o vault ativo (deve já existir) + reload.
router.post('/vaults/switch', async (req, res) => {
  try {
    const p = (req.body || {}).path;
    if (typeof p !== 'string' || p.trim() === '') {
      return res.status(400).json({ error: 'validação: o campo "path" é obrigatório' });
    }
    const result = config.setVault(p);
    res.json({
      status: result.status,
      git: result.git,
      schema: config.schema,
      board: config.board,
      gute: config.gute,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/vaults { path } → tira o vault da lista (não apaga a pasta).
router.delete('/vaults', (req, res) => {
  try {
    const p = (req.body || {}).path;
    if (typeof p !== 'string' || p.trim() === '') {
      return res.status(400).json({ error: 'validação: o campo "path" é obrigatório' });
    }
    res.json(config.removeVault(p));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Navegador de pastas (para o picker do SetupWizard) ───────────────────────
// GET /api/fs/list?path=... → lista SÓ subpastas do diretório (nunca arquivos,
// nunca conteúdo). Sem path → home do usuário. Path-safe: resolve absoluto,
// nunca lê arquivos. Em win32 expõe as unidades (drives) em `roots`.
function listDrivesWin() {
  const drives = [];
  for (let c = 65; c <= 90; c++) {
    const d = String.fromCharCode(c) + ':\\';
    try { if (fs.statSync(d).isDirectory()) drives.push(d); } catch { /* sem unidade */ }
  }
  return drives;
}
router.get('/fs/list', (req, res) => {
  try {
    const q = (req.query.path || '').toString().trim();
    const dir = q ? path.resolve(q) : os.homedir();
    if (!fs.statSync(dir).isDirectory()) {
      return res.status(400).json({ error: 'o caminho não é uma pasta' });
    }
    const dirs = fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => {
        if (!d.isDirectory()) return false;
        // esconde ocultas (.git etc) e de sistema do Windows ($RECYCLE.BIN, etc)
        if (d.name.startsWith('.') || d.name.startsWith('$')) return false;
        return true;
      })
      .map((d) => ({ name: d.name, path: path.join(dir, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const parent = path.dirname(dir);
    res.json({
      path: dir,
      parent: parent === dir ? null : parent,
      dirs,
      roots: process.platform === 'win32' ? listDrivesWin() : ['/'],
      sep: path.sep,
      home: os.homedir(),
    });
  } catch (err) {
    res.status(400).json({ error: `não foi possível listar a pasta: ${err.message}` });
  }
});

router.get('/tasks', (req, res) => {
  try { res.json(tasksRepo.list()); } catch (err) { fail(res, err); }
});

router.get('/tasks/:id', (req, res) => {
  try { res.json(tasksRepo.get(req.params.id)); } catch (err) { fail(res, err); }
});

router.post('/tasks', async (req, res) => {
  try {
    const { body, ...rest } = req.body || {};
    const data = rest.data && typeof rest.data === 'object' ? rest.data : rest;
    const taskBody = body !== undefined ? body : data.body;
    const cleanData = { ...data };
    delete cleanData.body;
    const actor = await gitActor();
    let id;
    const warning = await commitAwaitedWrite(
      () => { ({ id } = tasksRepo.create(cleanData, taskBody, actor)); },
      () => {
        // Lê o que ficou gravado para a mensagem refletir o id/titulo finais.
        const after = safeGetData(id) || { ...cleanData, id };
        const msg = describeChanges(null, after, 'create', id, titleKeyOf());
        return git.commitTask(taskFile(id), msg);
      }
    );
    schedulePush();
    res.status(201).json(withWarning({ id }, warning));
  } catch (err) { fail(res, err); }
});

router.put('/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body || {};
    const data = payload.data && typeof payload.data === 'object' ? payload.data : { ...payload };
    const taskBody = payload.body !== undefined ? payload.body : data.body;
    const cleanData = { ...data };
    delete cleanData.body;
    delete cleanData.bodyBase;

    // Tarefa ANTES (frontmatter pro diff; corpo pra detectar edição de conteúdo).
    const beforeTask = safeGetTask(id);
    const before = beforeTask ? beforeTask.data : null;
    const actor = await gitActor();
    const bodyBase = typeof payload.bodyBase === 'string' ? payload.bodyBase : undefined;
    let after; let bodyConflict = false;
    const warning = await commitAwaitedWrite(
      () => {
        ({ bodyConflict } = tasksRepo.update(id, cleanData, taskBody, actor, { bodyBase }));
        after = safeGetData(id) || { ...cleanData, id };
      },
      () => {
        const bodyChanged = !!beforeTask && taskBody !== undefined
          && String(taskBody).trim() !== String(beforeTask.body || '').trim();
        const msg = describeChanges(before, after, 'update', id, titleKeyOf(), { bodyChanged });
        return git.commitTask(taskFile(id), msg);
      }
    );
    schedulePush();
    await gcOrphanAssets(before, after); // limpa capa/ícone trocados/removidos
    const conflictWarn = bodyConflict
      ? 'Esta tarefa foi editada em paralelo. Sua versão do texto foi preservada no fim do corpo (bloco marcado) — mescle e apague o aviso.'
      : null;
    res.json(withWarning({ id, bodyConflict }, warning || conflictWarn));
  } catch (err) { fail(res, err); }
});

router.patch('/tasks/:id/move', async (req, res) => {
  try {
    const id = req.params.id;
    const novoStatus = (req.body || {}).status;
    if (!novoStatus) return res.status(400).json({ error: 'status é obrigatório' });
    const current = tasksRepo.get(id);
    const before = current.data;
    const actor = await gitActor();
    let after;
    const warning = await commitAwaitedWrite(
      () => {
        // merge parcial: só o status muda (update preserva o resto)
        tasksRepo.update(id, { status: novoStatus }, undefined, actor);
        after = safeGetData(id) || { ...current.data, status: novoStatus };
      },
      () => {
        const msg = describeChanges(before, after, 'move', id, titleKeyOf());
        return git.commitTask(taskFile(id), msg);
      }
    );
    schedulePush();
    res.json(withWarning({ id, status: novoStatus }, warning));
  } catch (err) { fail(res, err); }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const file = taskFile(id);
    // Frontmatter ANTES de remover (para citar o título na mensagem).
    const before = safeGetData(id);
    const warning = await commitAwaitedWrite(
      () => { tasksRepo.remove(id); },
      () => git.removeAndCommit(file, describeChanges(before, null, 'delete', id, titleKeyOf()))
    );
    schedulePush();
    await gcOrphanAssets(before, null); // tarefa apagada → limpa capa/ícone órfãos
    res.json(withWarning({ id }, warning));
  } catch (err) { fail(res, err); }
});

// Lê a tarefa inteira (frontmatter + corpo) sem lançar (null se não existir).
function safeGetTask(id) {
  try {
    return tasksRepo.get(id);
  } catch {
    return null;
  }
}

// Lê o frontmatter de uma tarefa sem lançar (retorna null se não existir).
function safeGetData(id) {
  const t = safeGetTask(id);
  return t ? t.data : null;
}

// ── Usuários (roster) + identidade "eu" ──────────────────────────────────────
// "Eu" = identidade git do repo (name/email) + userId estável (git config
// basalt.userid), casado contra o roster (config/users.json). Local-first.
async function resolveMe() {
  const id = await git.getIdentity(); // { name, email }
  let userId = await git.getUserId(); // basalt.userid ou null
  const roster = config.users || [];
  let entry = userId ? roster.find((u) => u.id === userId) : null;
  if (!entry && id.email) {
    const lo = String(id.email).toLowerCase();
    entry = roster.find((u) => (u.gitEmails || []).some((e) => String(e).toLowerCase() === lo));
  }
  if (!entry && id.name) entry = roster.find((u) => (u.gitNames || []).includes(id.name));
  if (entry && !userId) userId = entry.id;
  return { userId: userId || null, gitName: id.name, gitEmail: id.email, entry: entry || null };
}

// Chaves de propriedades type 'user' no schema (ex.: responsavel).
function userFieldKeys() {
  const props = (config.schema && config.schema.properties) || {};
  return Object.keys(props).filter((k) => props[k] && props[k].type === 'user');
}

// A tarefa tem ALGUM campo 'user' apontando pra mim? (id, ou — legado — nome/git name)
function taskTargetsMe(data, me) {
  if (!data || !me) return false;
  for (const k of userFieldKeys()) {
    const raw = data[k];
    if (raw == null || raw === '') continue;
    // user múltiplo guarda "id1;id2" — testa cada id da lista
    const values = String(raw).split(';').map((s) => s.trim()).filter(Boolean);
    for (const v of values) {
      if (me.userId && v === me.userId) return true;
      if (me.entry) {
        if (v === me.entry.nome) return true;
        if ((me.entry.gitNames || []).includes(v)) return true;
      }
    }
  }
  return false;
}

function relTasksDir() {
  return path.relative(config.VAULT, config.TASKS_DIR).split(path.sep).join('/');
}
function taskIdFromRel(rel) {
  const base = (rel || '').split('/').pop() || '';
  return base.endsWith('.md') ? base.slice(0, -3) : '';
}

// Monta notificações a partir dos commits que chegaram no pull (before..after):
// para cada tarefa cujo responsável sou eu e cujo autor da mudança NÃO sou eu.
// "O que mudou" = a mensagem (auto-descritiva) do commit. Só a mudança mais
// recente por tarefa entra (evita ruído).
async function buildNotifications(before, after) {
  const me = await resolveMe();
  const commits = await git.commitsInRange(before, after);
  if (!commits.length) return [];
  const prefix = relTasksDir() + '/';
  const titleKey = titleKeyOf();
  const out = [];
  const seen = new Set();

  // 1º toque (commits vêm do mais novo pro mais antigo) → autor/mensagem exibidos.
  // Só o toque de OUTRA pessoa gera notificação (não notifico minhas mudanças).
  const affected = new Map(); // id → { rel, c }
  for (const c of commits) {
    const mine =
      (me.gitEmail && c.authorEmail && c.authorEmail.toLowerCase() === String(me.gitEmail).toLowerCase()) ||
      (me.gitName && c.authorName === me.gitName);
    if (mine) continue;
    for (const f of c.files) {
      if (!f.startsWith(prefix) || !f.endsWith('.md')) continue;
      const id = taskIdFromRel(f);
      if (!id || affected.has(id)) continue;
      affected.set(id, { rel: f, c });
    }
  }

  for (const [id, { rel, c }] of affected) {
    if (seen.has(id)) continue;
    const afterData = safeGetData(id); // estado atual (pós-pull); null = apagada
    let beforeData = null;
    try {
      const raw = await git.showAt(before, rel); // estado ANTES do pull
      if (raw) beforeData = matter(raw).data || null;
    } catch { beforeData = null; }

    const wasMine = taskTargetsMe(beforeData, me);
    const isMine = taskTargetsMe(afterData, me);

    let summary = null;
    let title = null;
    if (isMine) {
      // continua/passou a ser minha e mudou → aviso normal
      summary = c.message || 'mudança';
      title = (afterData && afterData[titleKey]) || id;
    } else if (wasMine && !afterData) {
      summary = 'removeu uma tarefa sua';
      title = (beforeData && beforeData[titleKey]) || id;
    } else if (wasMine) {
      summary = 'tirou você da tarefa';
      title = (afterData && afterData[titleKey]) || (beforeData && beforeData[titleKey]) || id;
    }
    if (!summary) continue; // nunca foi minha → não interessa

    seen.add(id);
    out.push({
      id: `${c.hash}:${id}`,
      taskId: id,
      title,
      author: c.authorName || c.authorEmail || 'alguém',
      summary,
      hash: c.shortHash || (c.hash || '').slice(0, 7),
      at: c.date || null,
    });
  }
  return out;
}

// ── Sync / Health ────────────────────────────────────────────────────────────
// Pull sob demanda. body opcional { strategy: 'safe' | 'rebase' } — default
// 'safe' (= --ff-only --autostash, compat com quem não manda body); 'rebase'
// usa pull --rebase --autostash. Nunca lança — devolve o resultado do git.
router.post('/sync/pull', async (req, res) => {
  try {
    const strategy = ((req.body || {}).strategy === 'rebase') ? 'rebase' : 'safe';
    // Captura HEAD antes/depois DENTRO da fila git (atômico com o pull) para
    // descobrir o range de commits que chegaram e montar notificações.
    const r = await gitSerial(async () => {
      const before = await git.currentHead();
      const result = strategy === 'rebase' ? await git.pullRebase() : await git.pull();
      const after = await git.currentHead();
      return { result, before, after };
    });
    let newNotifications = [];
    if (r.result && r.result.ok && r.before && r.after && r.before !== r.after) {
      // O pull pode ter trazido board.json/schema.json/users.json novos (ex.: um
      // colega deu "salvar pra todos" nos filtros). Sem reload, a config viva
      // ficava velha até reiniciar — a mudança remota nunca aparecia.
      try { config.reload(); } catch (e) { console.warn('[config] reload pós-pull falhou:', e.message); }
      try {
        newNotifications = await buildNotifications(r.before, r.after);
        if (newNotifications.length) config.addNotifications(newNotifications);
      } catch (e) {
        console.warn('[notif] build falhou:', e.message);
      }
    }
    // Sucesso mantém os campos atuais; falha vira { ok:false, reason, detail }
    // (reason ∈ diverged|no-remote|auth|timeout|other). `error` fica como alias
    // de detail enquanto o front antigo ainda lê esse campo.
    let payload = r.result || {};
    if (payload.ok === false) {
      const detail = payload.detail || payload.error || '';
      payload = { ok: false, reason: payload.reason || git.classifyPullReason(detail), detail, error: detail };
    }
    // resultado (ok/erro) vai no CORPO; status 200 — falha de pull não é erro HTTP.
    res.json({ ...payload, newNotifications, notifications: config.getNotifications() });
  } catch (err) { fail(res, err); }
});

// Diagnóstico do setup git: repo, identidade, remote, push/pull sem senha.
router.get('/health/git', async (req, res) => {
  try {
    const h = await git.healthGit();
    res.json(h);
  } catch (err) { fail(res, err); }
});

// Estado pra UI de recuperação: commits não enviados + mudanças guardadas.
router.get('/sync/recovery', async (req, res) => {
  try { res.json(await git.syncState()); } catch (err) { fail(res, err); }
});

// Reenviar commits locais (retry manual do push). Devolve o estado atualizado.
router.post('/sync/push', async (req, res) => {
  try {
    const r = await gitSerial(() => git.pushSync());
    res.json({ ...(r || {}), ...(await git.syncState()) });
  } catch (err) { fail(res, err); }
});

// Recuperar a mudança guardada mais recente (stash pop + commit).
router.post('/sync/recover', async (req, res) => {
  try {
    const r = await gitSerial(() => git.recoverStash());
    if (r && r.ok) schedulePush();
    res.json({ ...(r || {}), ...(await git.syncState()) });
  } catch (err) { fail(res, err); }
});

// ── Usuários (roster) + notificações ─────────────────────────────────────────
// GET /api/users → roster do time (config/users.json).
router.get('/users', (req, res) => {
  try { res.json(config.users || []); } catch (err) { fail(res, err); }
});

// GET /api/me → quem sou eu (git identity + userId + entrada no roster, se houver).
router.get('/me', async (req, res) => {
  try { res.json(await resolveMe()); } catch (err) { fail(res, err); }
});

// POST /api/users/register { nome } → identifica/cadastra o usuário local:
// adota a entrada existente (casada por userId/email/nome) ou cria uma nova,
// grava basalt.userid no git config e commita o roster. Idempotente.
router.post('/users/register', async (req, res) => {
  try {
    const nome = (((req.body || {}).nome) || '').trim();
    const id = await git.getIdentity();
    const roster = (config.users || []).map((u) => ({ ...u }));
    let userId = await git.getUserId();
    let entry = userId ? roster.find((u) => u.id === userId) : null;
    if (!entry && id.email) {
      const lo = String(id.email).toLowerCase();
      entry = roster.find((u) => (u.gitEmails || []).some((e) => String(e).toLowerCase() === lo));
    }
    if (!entry && id.name) entry = roster.find((u) => (u.gitNames || []).includes(id.name));

    if (entry) {
      userId = entry.id;
      if (nome) entry.nome = nome;
      entry.gitEmails = entry.gitEmails || [];
      entry.gitNames = entry.gitNames || [];
      if (id.email && !entry.gitEmails.includes(id.email)) entry.gitEmails.push(id.email);
      if (id.name && !entry.gitNames.includes(id.name)) entry.gitNames.push(id.name);
    } else {
      userId = userId || `u-${crypto.randomBytes(6).toString('hex')}`;
      entry = {
        id: userId,
        nome: nome || id.name || 'Sem nome',
        gitEmails: id.email ? [id.email] : [],
        gitNames: id.name ? [id.name] : [],
      };
      roster.push(entry);
    }

    try { await git.setUserId(userId); } catch (e) { console.warn('[users] setUserId falhou:', e.message); }
    const warning = await commitAwaitedWrite(
      () => { config.writeUsers(roster); },
      () => git.commitPaths([config.usersFile()], `users: ${entry.nome}`)
    );
    schedulePush();
    res.json(withWarning({ userId, entry, users: config.users }, warning));
  } catch (err) { fail(res, err); }
});

// PUT /api/users/:id { nome } → edita o nome visível de uma entrada do roster.
router.put('/users/:id', async (req, res) => {
  try {
    const targetId = req.params.id;
    const nome = (((req.body || {}).nome) || '').trim();
    const roster = (config.users || []).map((u) => ({ ...u }));
    const entry = roster.find((u) => u.id === targetId);
    if (!entry) return res.status(404).json({ error: 'usuário não encontrado no roster' });
    if (nome) entry.nome = nome;
    const warning = await commitAwaitedWrite(
      () => { config.writeUsers(roster); },
      () => git.commitPaths([config.usersFile()], `users: ${entry.nome}`)
    );
    schedulePush();
    res.json(withWarning({ entry, users: config.users }, warning));
  } catch (err) { fail(res, err); }
});

// GET /api/notifications → notificações locais do vault corrente.
router.get('/notifications', (req, res) => {
  try { res.json(config.getNotifications()); } catch (err) { fail(res, err); }
});

// POST /api/notifications/clear { id? } → limpa uma (id) ou todas (sem id).
router.post('/notifications/clear', (req, res) => {
  try {
    const id = ((req.body || {}).id) || null;
    res.json(config.clearNotifications(id));
  } catch (err) { fail(res, err); }
});

// ── Comentários por tarefa (frontmatter; autor = usuário do git) ─────────────
router.get('/tasks/:id/comments', (req, res) => {
  try {
    const t = tasksRepo.get(req.params.id);
    res.json({ id: t.id, comments: Array.isArray(t.data.comments) ? t.data.comments : [] });
  } catch (err) { fail(res, err); }
});

router.post('/tasks/:id/comments', async (req, res) => {
  try {
    const id = req.params.id;
    const actor = await gitActor();
    let r;
    const warning = await commitAwaitedWrite(
      () => { r = tasksRepo.addComment(id, (req.body || {}).text, actor); },
      () => {
        const title = (safeGetData(id) || {})[titleKeyOf()] || id;
        return git.commitTask(taskFile(id), `comentário em ${title}`);
      }
    );
    schedulePush();
    res.status(201).json(withWarning({ id, comments: r.comments }, warning));
  } catch (err) { fail(res, err); }
});

router.delete('/tasks/:id/comments/:idx', async (req, res) => {
  try {
    const id = req.params.id;
    let r;
    const warning = await commitAwaitedWrite(
      () => { r = tasksRepo.removeComment(id, req.params.idx); },
      () => {
        const title = (safeGetData(id) || {})[titleKeyOf()] || id;
        return git.commitTask(taskFile(id), `remove comentário em ${title}`);
      }
    );
    schedulePush();
    res.json(withWarning({ id, comments: r.comments }, warning));
  } catch (err) { fail(res, err); }
});

// ── Histórico e diff por tarefa ──────────────────────────────────────────────
router.get('/tasks/:id/history', async (req, res) => {
  try {
    const id = req.params.id;
    // Reaproveita a path-safety do repo (lança em id inválido / fora do dir).
    tasksRepo.resolveTaskPath(id);
    const rel = taskRelPath(id);
    const history = await git.logHistory(rel);
    res.json(history);
  } catch (err) { fail(res, err); }
});

router.get('/tasks/:id/diff', async (req, res) => {
  try {
    const id = req.params.id;
    tasksRepo.resolveTaskPath(id); // path-safety
    const hash = (req.query.hash || '').toString().trim();
    if (!hash) return res.status(400).json({ error: 'parâmetro hash é obrigatório' });
    if (!/^[0-9a-fA-F]{4,40}$/.test(hash)) {
      return res.status(400).json({ error: 'hash inválido' });
    }

    const rel = taskRelPath(id);
    const before = await git.showAt(`${hash}^`, rel);
    const after = await git.showAt(hash, rel);
    const diff = await git.diffFile(`${hash}^`, hash, rel);

    // Metadados do commit (1 registro do log restrito a esse hash).
    const meta = await git.logHistory(rel);
    const commit = meta.find((c) => c.hash === hash || c.shortHash === hash) || { hash };

    res.json({
      commit: {
        hash: commit.hash || hash,
        shortHash: commit.shortHash || hash.slice(0, 7),
        date: commit.date || null,
        author: commit.author || null,
        message: commit.message || null,
      },
      before,
      after,
      diff,
    });
  } catch (err) { fail(res, err); }
});

// ── Histórico git global (todos os commits, todo arquivo) — paginado ─────────
// GET /history?skip=0&limit=50 -> { commits:[{hash,shortHash,date,authorName,
// authorEmail,message,filesCount}], hasMore, skip, limit }
router.get('/history', async (req, res) => {
  try {
    const skip = Math.max(0, parseInt(req.query.skip, 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const { commits, hasMore } = await git.logAll({ skip, limit });
    res.json({ commits, hasMore, skip, limit });
  } catch (err) { fail(res, err); }
});

// ── Dashboard (config/dashboard.json no vault — gráficos do usuário) ──────────
// GET /dashboard -> { charts:[...] } (default {charts:[]} se o arquivo não existe;
// NÃO cria o arquivo — só é escrito no primeiro PUT).
router.get('/dashboard', (req, res) => {
  try {
    let data = { charts: [] };
    try {
      data = JSON.parse(fs.readFileSync(dashboardFile(), 'utf8'));
    } catch { /* ausente/ilegível → default vazio */ }
    res.json(sanitizeDashboard(data));
  } catch (err) { fail(res, err); }
});

// PUT /dashboard { charts:[...] } -> grava, commita e devolve a versão saneada.
router.put('/dashboard', async (req, res) => {
  try {
    const clean = sanitizeDashboard(req.body || {});
    const warning = await commitAwaitedWrite(
      () => { writeJsonAtomic(dashboardFile(), clean); },
      () => git.commitPaths([dashboardFile()], `dashboard: ${clean.charts.length} gráfico(s)`)
    );
    schedulePush();
    res.json(withWarning(clean, warning));
  } catch (err) { fail(res, err); }
});

// ── Migração genérica: aplica transform(data)->dataNova|null em cada tarefa ───
// Usa ATOMIC_writeTask (sem validar) — durante migração os dados podem violar o
// schema novo transitoriamente (ex.: propriedade required recém-adicionada).
function migrateTasks(transform) {
  const changed = [];
  for (const t of tasksRepo.list()) {
    const full = tasksRepo.get(t.id);
    const next = transform({ ...full.data });
    if (next) {
      const clean = { ...next };
      delete clean.id;
      tasksRepo.ATOMIC_writeTask(t.id, clean, full.body);
      changed.push(taskFile(t.id));
    }
  }
  return changed;
}

// ── Editor de STATUS (grupos/etapas) ─────────────────────────────────────────
router.get('/board', (req, res) => {
  res.json({ statusGroups: config.board.statusGroups || [] });
});

router.put('/board/status', async (req, res) => {
  try {
    const { statusGroups, renames, doneGroupId } = req.body || {};
    validateStatusGroups(statusGroups);
    // doneGroupId opcional: null explícito desmarca; string deve referenciar um
    // grupo do PAYLOAD (validação estrita aqui — o self-heal do config.js é só
    // pra board.json gravado à mão).
    if (doneGroupId !== undefined && doneGroupId !== null) {
      if (typeof doneGroupId !== 'string' || !statusGroups.some((g) => g && g.id === doneGroupId)) {
        return res.status(400).json({ error: `doneGroupId "${doneGroupId}" não corresponde a nenhum grupo` });
      }
    }

    // escrita do board + migração de tarefas + commit DENTRO da fila git —
    // mesma proteção do save de tarefa (pull --autostash não intercala).
    const rn = (Array.isArray(renames) ? renames : []).filter((r) => r && r.from && r.to && r.from !== r.to);
    let changed = [];
    const warning = await commitAwaitedWrite(
      () => {
        const board = JSON.parse(fs.readFileSync(boardFile(), 'utf8'));
        board.statusGroups = statusGroups;
        if (doneGroupId !== undefined) board.doneGroupId = doneGroupId;
        writeJsonAtomic(boardFile(), board);
        if (rn.length) {
          const map = new Map(rn.map((r) => [r.from, r.to]));
          changed = migrateTasks((data) => (map.has(data.status) ? { ...data, status: map.get(data.status) } : null));
        }
        config.reload();
      },
      () => git.commitPaths([boardFile(), ...changed], `status: config atualizada${rn.length ? ` (${rn.length} renomeada(s))` : ''}`)
    );
    schedulePush();
    res.json(withWarning({ schema: config.schema, board: config.board, gute: config.gute }, warning));
  } catch (err) { fail(res, err); }
});

function validateStatusGroups(groups) {
  if (!Array.isArray(groups) || !groups.length) throw new Error('validação: precisa de ao menos 1 grupo');
  const seen = new Set();
  for (const g of groups) {
    if (!g || !Array.isArray(g.stages) || g.stages.length < 1) {
      throw new Error(`validação: grupo "${(g && g.label) || '?'}" precisa de ao menos 1 etapa`);
    }
    for (const s of g.stages) {
      const id = ((s && s.id) || '').trim();
      if (!id) throw new Error('validação: etapa sem nome');
      if (seen.has(id)) throw new Error(`validação: etapa duplicada "${id}"`);
      seen.add(id);
    }
  }
}

// ── Editor de FILTROS do board ───────────────────────────────────────────────
// body: { filters: [string] } — cada filtro deve ser uma propriedade do schema.
router.put('/board/filters', async (req, res) => {
  try {
    const { filters } = req.body || {};
    if (!Array.isArray(filters)) throw new Error('validação: filters deve ser um array');
    const props = (config.schema && config.schema.properties) || {};
    // Self-heal: descarta refs a propriedades inexistentes (ex.: removidas) em
    // vez de quebrar — a config do board não deve travar por uma chave órfã.
    const clean = [];
    for (const f of filters) {
      if (typeof f !== 'string' || !f.trim()) continue;
      const key = f.trim();
      if (!(key in props)) continue;
      if (!clean.includes(key)) clean.push(key);
    }

    const warning = await commitAwaitedWrite(
      () => {
        const board = JSON.parse(fs.readFileSync(boardFile(), 'utf8'));
        board.filters = clean;
        writeJsonAtomic(boardFile(), board);
        config.reload();
      },
      () => git.commitPaths([boardFile()], `board: filtros atualizados (${clean.length})`)
    );
    schedulePush();
    res.json(withWarning({ schema: config.schema, board: config.board, gute: config.gute }, warning));
  } catch (err) { fail(res, err); }
});

// ── Config do CARTÃO (o que aparece na face, antes de abrir) ─────────────────
// body: { fields:[propKey], subtitle?:propKey|''|null, badge?:propKey|''|null }
router.put('/board/card', async (req, res) => {
  try {
    const { fields, subtitle, badge } = req.body || {};
    const props = (config.schema && config.schema.properties) || {};
    const derived = new Set((config.schema && config.schema.derived) || []);
    const known = (k) => k in props || derived.has(k);

    if (!Array.isArray(fields)) throw new Error('validação: fields deve ser um array');
    // Self-heal: ignora campos que apontam p/ propriedades inexistentes
    // (removidas/renomeadas) — salvar o cartão não pode travar por ref órfã.
    const clean = [];
    for (const f of fields) {
      if (typeof f !== 'string' || !f.trim()) continue;
      const key = f.trim();
      if (!known(key)) continue;
      if (!clean.includes(key)) clean.push(key);
    }
    // subtitle/badge órfãos viram vazio (em vez de lançar erro).
    const cleanRef = (k) => (k != null && k !== '' && known(k) ? k : undefined);

    const warning = await commitAwaitedWrite(
      () => {
        const board = JSON.parse(fs.readFileSync(boardFile(), 'utf8'));
        board.card = { ...(board.card || {}), fields: clean };
        if (subtitle !== undefined) board.card.subtitle = cleanRef(subtitle);
        if (badge !== undefined) board.card.badge = cleanRef(badge);
        writeJsonAtomic(boardFile(), board);
        config.reload();
      },
      () => git.commitPaths([boardFile()], 'board: campos do cartão atualizados')
    );
    schedulePush();
    res.json(withWarning({ schema: config.schema, board: config.board, gute: config.gute }, warning));
  } catch (err) { fail(res, err); }
});

// ── Editor de PROPRIEDADES (padrão dos cartões) ──────────────────────────────
// body: { properties: {key:{type,label,...}}, renames: [{from,to}],
//         optionRenames: [{property,from,to}] }
// Migra todas as tarefas: renomeia chave, remove chave sumida, adiciona chave
// nova, e migra VALORES de opção enum renomeados (data[prop]===from → to).
router.put('/schema/properties', async (req, res) => {
  try {
    const { properties, renames, optionRenames } = req.body || {};
    validateProperties(properties);

    const schema = JSON.parse(fs.readFileSync(schemaFile(), 'utf8'));
    const oldKeys = Object.keys(schema.properties || {});
    const oldProps = schema.properties || {}; // snapshot p/ detectar opções removidas (antes do reassign)
    // schema.derived é DERIVADO por config (props formula + 'computed_at').
    // No arquivo em disco pode não existir; recomputa aqui pra não tratar
    // chaves de fórmula como "removidas" na migração.
    const derived = new Set(config.schema && Array.isArray(config.schema.derived) ? config.schema.derived : []);

    // SÓ a propriedade "status" é de sistema: não pode ser removida nem renomeada.
    // (A trava antiga valia p/ titulo/G/U/T/E — agora são props normais.)
    const rnRaw = (Array.isArray(renames) ? renames : []).filter((r) => r && r.from && r.to && r.from !== r.to);
    for (const k of oldKeys) {
      const sys = schema.properties[k] && schema.properties[k].system;
      if (!sys) continue;
      if (!(k in properties)) throw new Error(`validação: a propriedade de sistema "${k}" não pode ser removida`);
      if (rnRaw.some((r) => r.from === k)) throw new Error(`validação: a propriedade de sistema "${k}" não pode ser renomeada`);
    }

    // Garante que o spec de "status" preserve system:true (o front pode omitir).
    if (properties.status && typeof properties.status === 'object') {
      properties.status.system = true;
    }

    // Options mistas no payload (string | {value,color}): sanitiza pro disco —
    // objeto SÓ pra opção com cor válida (#rrggbb), string crua pro resto.
    // ANTES de descartar o optionMeta ecoado, re-hidrata a cor nas opções que
    // vieram como string crua (payloads em formato de MEMÓRIA — ex.: quick-edit
    // do peek manda options string[] + optionMeta separado; sem isso, salvar
    // apagava a cor de TODAS as opções não-reenviadas como {value,color}).
    for (const spec of Object.values(properties)) {
      if (!spec || typeof spec !== 'object') continue;
      const meta = spec.optionMeta && typeof spec.optionMeta === 'object' ? spec.optionMeta : null;
      delete spec.optionMeta;
      if ((spec.type === 'enum' || spec.type === 'multiselect') && spec.options !== undefined) {
        let opts = Array.isArray(spec.options) ? spec.options : [];
        if (meta) {
          opts = opts.map((o) => {
            if (typeof o !== 'string') return o; // já veio {value,color}
            const m = meta[o] || meta[String(o).trim()];
            return m && m.color ? { value: o, color: m.color } : o;
          });
        }
        spec.options = config.sanitizeOptionsForDisk(opts);
      }
    }

    const rn = rnRaw;
    const renameMap = new Map(rn.map((r) => [r.from, r.to]));

    // optionRenames: [{property,from,to}] — migra valores de opção enum.
    // Indexado por propriedade-DESTINO (após eventual rename de chave), pois a
    // migração de chave roda antes no mesmo passo.
    const optRn = (Array.isArray(optionRenames) ? optionRenames : []).filter(
      (o) => o && o.property && o.from !== undefined && o.to !== undefined && o.from !== o.to
    );
    const optByProp = new Map();
    for (const o of optRn) {
      const prop = renameMap.has(o.property) ? renameMap.get(o.property) : o.property;
      if (!optByProp.has(prop)) optByProp.set(prop, new Map());
      optByProp.get(prop).set(o.from, o.to);
    }

    // Rename de opção preserva a cor: se o payload não trouxe cor explícita pro
    // novo nome, herda a cor que o nome antigo tinha no schema em disco.
    for (const o of optRn) {
      const newKey = renameMap.has(o.property) ? renameMap.get(o.property) : o.property;
      const spec = properties[newKey];
      if (!spec || !Array.isArray(spec.options)) continue;
      let oldKey = newKey;
      for (const [from, to] of renameMap) { if (to === newKey) oldKey = from; }
      const oldSpec = oldProps[oldKey];
      if (!oldSpec) continue;
      const oldMeta = config.splitOptions(oldSpec.options).optionMeta;
      const color = oldMeta[o.from] && oldMeta[o.from].color;
      if (!color) continue;
      spec.options = spec.options.map((opt) => (opt === o.to ? { value: o.to, color } : opt));
    }

    // idFrom acompanha o rename da chave (senão o id passa a usar o fallback e o
    // campo-título deixa de gerar id).
    if (schema.idFrom && renameMap.has(schema.idFrom)) schema.idFrom = renameMap.get(schema.idFrom);

    // (escrita do schema/board/migração roda adiante, DENTRO da fila git)
    const writeSchemaAndBoard = () => {
    schema.properties = properties;
    writeJsonAtomic(schemaFile(), schema);

    // Referências do board às chaves renomeadas acompanham o rename (self-heal):
    // título do card, subtitle, badge, campos exibidos, filtros e sort. Sem isso,
    // renomear a prop-título (ex.: "titulo" → "tarefa") faz o card perder o título
    // e o campo virar uma propriedade comum.
    if (renameMap.size) {
      const board = JSON.parse(fs.readFileSync(boardFile(), 'utf8'));
      const mapKey = (k) => (k && renameMap.has(k) ? renameMap.get(k) : k);
      if (board.card && typeof board.card === 'object') {
        for (const f of ['title', 'subtitle', 'badge']) {
          if (board.card[f] && renameMap.has(board.card[f])) { board.card[f] = renameMap.get(board.card[f]); boardChanged = true; }
        }
        if (Array.isArray(board.card.fields)) {
          const nf = board.card.fields.map(mapKey);
          if (nf.some((v, i) => v !== board.card.fields[i])) { board.card.fields = nf; boardChanged = true; }
        }
      }
      if (Array.isArray(board.filters)) {
        const nf = board.filters.map(mapKey);
        if (nf.some((v, i) => v !== board.filters[i])) { board.filters = nf; boardChanged = true; }
      }
      if (board.sort && board.sort.by && renameMap.has(board.sort.by)) { board.sort.by = renameMap.get(board.sort.by); boardChanged = true; }
      if (boardChanged) writeJsonAtomic(boardFile(), board);
    }
    };
    let boardChanged = false;

    const newKeys = Object.keys(properties);
    const removed = oldKeys.filter((k) => !newKeys.includes(k) && !renameMap.has(k) && !derived.has(k));
    // Props NOVAS a semear nas tarefas — exclui renomeadas e props type 'formula'
    // (estas são derivadas: o watcher as calcula, não viram campo manual vazio).
    const added = newKeys.filter(
      (k) =>
        !oldKeys.includes(k) &&
        ![...renameMap.values()].includes(k) &&
        !(properties[k] && properties[k].type === 'formula')
    );

    // Opções REMOVIDAS de cada enum/multiselect (sumiram e NÃO foram renomeadas) →
    // limpar o valor nas tarefas que as usavam. Compara por VALUE (as arrays
    // podem ser mistas dos dois lados), ignorando os 'from' de renames.
    const optRemovalsByProp = new Map();
    for (const newKey of newKeys) {
      const spec = properties[newKey];
      if (!spec || (spec.type !== 'enum' && spec.type !== 'multiselect')) continue;
      let oldKey = newKey;
      for (const [from, to] of renameMap) { if (to === newKey) oldKey = from; }
      const oldSpec = oldProps[oldKey];
      if (!oldSpec || !Array.isArray(oldSpec.options)) continue;
      const newOpts = new Set(config.splitOptions(spec.options).options);
      const renamedFrom = optByProp.has(newKey) ? new Set(optByProp.get(newKey).keys()) : new Set();
      const removedOpts = config.splitOptions(oldSpec.options).options.filter((o) => !newOpts.has(o) && !renamedFrom.has(o));
      if (removedOpts.length) optRemovalsByProp.set(newKey, new Set(removedOpts));
    }

    const migrateFn = () => migrateTasks((data) => {
      let dirty = false;
      for (const [from, to] of renameMap) {
        if (from in data) { data[to] = data[from]; delete data[from]; dirty = true; }
      }
      for (const k of removed) {
        if (k in data) { delete data[k]; dirty = true; }
      }
      // adiciona chave nova com default/empty
      for (const k of added) {
        if (!(k in data)) {
          const spec = properties[k] || {};
          data[k] = spec.default !== undefined ? spec.default : (spec.type === 'int' ? null : '');
          dirty = true;
        }
      }
      // migra valores de opção renomeados (enum: valor direto; multiselect: dentro do ';')
      for (const [prop, valueMap] of optByProp) {
        if (!(prop in data)) continue;
        const spec = properties[prop];
        if (spec && spec.type === 'multiselect') {
          const parts = String(data[prop]).split(';').map((s) => s.trim()).filter(Boolean);
          let ch = false;
          const next = parts.map((p) => (valueMap.has(p) ? (ch = true, valueMap.get(p)) : p));
          if (ch) { data[prop] = next.join(';'); dirty = true; }
        } else if (valueMap.has(data[prop])) {
          data[prop] = valueMap.get(data[prop]);
          dirty = true;
        }
      }
      // limpa opções REMOVIDAS (enum → vazio; multiselect → tira da lista)
      for (const [prop, removedSet] of optRemovalsByProp) {
        if (!(prop in data)) continue;
        const spec = properties[prop];
        if (spec && spec.type === 'multiselect') {
          const parts = String(data[prop]).split(';').map((s) => s.trim()).filter(Boolean);
          const kept = parts.filter((p) => !removedSet.has(p));
          if (kept.length !== parts.length) { data[prop] = kept.join(';'); dirty = true; }
        } else if (removedSet.has(data[prop])) {
          data[prop] = '';
          dirty = true;
        }
      }
      return dirty ? data : null;
    });

    // escrita do schema+board + migração de TODAS as tarefas + reload DENTRO da
    // fila git — um pull --autostash no meio revertia tudo com resposta 200.
    let changed = [];
    const warning = await commitAwaitedWrite(
      () => {
        writeSchemaAndBoard();
        changed = migrateFn();
        config.reload();
      },
      () => {
        const optNote = optRn.length ? `, ${optRn.length} opção(ões) migrada(s)` : '';
        const commitList = [schemaFile(), ...changed];
        if (boardChanged) commitList.push(boardFile());
        return git.commitPaths(commitList, `schema: propriedades atualizadas${optNote}`);
      }
    );
    schedulePush();
    res.json(withWarning({ schema: config.schema, board: config.board, gute: config.gute }, warning));
  } catch (err) { fail(res, err); }
});

function validateProperties(props) {
  if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error('validação: properties deve ser um objeto');
  const keys = Object.keys(props);
  if (!keys.length) throw new Error('validação: precisa de ao menos 1 propriedade');
  // status é obrigatório (é o que dirige o kanban e é a única prop de sistema).
  if (!('status' in props)) throw new Error('validação: a propriedade de sistema "status" é obrigatória');
  for (const k of keys) {
    if (!/^[A-Za-z0-9_]+$/.test(k)) throw new Error(`validação: chave de propriedade inválida "${k}" (use letras/números/_)`);
    const spec = props[k];
    if (!spec || typeof spec !== 'object') throw new Error(`validação: propriedade "${k}" sem definição`);
    // Valida enum (options) e formula (expression não-vazia) — server/validate.js.
    const specErr = validatePropertySpec(k, spec);
    if (specErr) throw new Error(`validação: ${specErr}`);
  }
}

// ── Assets (imagens coladas/arrastadas no editor de corpo) ───────────────────
// Guardadas em <vault>/assets/ (versionadas no git do vault, viajam no push/pull).
// Servidas por /api/assets/<name> — resolve em dev (proxy), prod (estático) e
// Electron (same-origin). O markdown referencia /api/assets/<name>.
// SVG fora da allowlist DE PROPÓSITO: pode conter <script> e, servido same-origin,
// vira vetor de XSS armazenado (e viaja no git/pull). Só raster.
const ASSET_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif',
};
const ASSET_MIME = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
};
function assetsDir() {
  return path.join(config.VAULT, 'assets');
}
// nome path-safe: só [A-Za-z0-9._-], sem travessia de diretório.
function safeAssetName(name) {
  return typeof name === 'string' && /^[A-Za-z0-9._-]+$/.test(name)
    && !name.includes('..') && name !== '.' && name !== '..';
}
const MAX_ASSET_BYTES = 10 * 1024 * 1024;

// Extrai o nome do asset de uma URL "/api/assets/<name>" (ou null).
function assetNameFromUrl(u) {
  if (typeof u !== 'string') return null;
  const m = u.match(/\/api\/assets\/([A-Za-z0-9._-]+)/);
  return m ? m[1] : null;
}
// TODOS os assets ainda referenciados (cover/icon/corpo de QUALQUER tarefa).
// Garante que o GC nunca apague um asset compartilhado/ainda em uso.
function collectReferencedAssets() {
  const used = new Set();
  let list = [];
  try { list = tasksRepo.list(); } catch { list = []; }
  for (const t of list) {
    let full;
    try { full = tasksRepo.get(t.id); } catch { continue; }
    const d = full.data || {};
    for (const k of ['cover', 'icon']) {
      const n = assetNameFromUrl(d[k]);
      if (n) used.add(n);
    }
    const re = /\/api\/assets\/([A-Za-z0-9._-]+)/g;
    let m;
    while ((m = re.exec(full.body || ''))) used.add(m[1]);
  }
  return used;
}
// gcOrphanAssets(before, after): ao trocar/remover cover/icon (ou apagar a
// tarefa, after=null), apaga o arquivo antigo SE nenhuma outra tarefa o usa.
// Commita a remoção (best-effort). Nunca lança.
async function gcOrphanAssets(before, after) {
  try {
    if (!before) return;
    const oldNames = new Set();
    for (const k of ['cover', 'icon']) {
      const oldN = assetNameFromUrl(before[k]);
      const newN = assetNameFromUrl(after ? after[k] : null);
      if (oldN && oldN !== newN) oldNames.add(oldN);
    }
    if (!oldNames.size) return;
    const stillUsed = collectReferencedAssets();
    let removed = 0;
    for (const name of oldNames) {
      if (stillUsed.has(name)) continue;
      const file = path.join(assetsDir(), name);
      if (!fs.existsSync(file)) continue;
      try {
        fs.unlinkSync(file);
        await commitAwaited(() => git.removeAndCommit(file, `assets: remove ${name} (órfão)`));
        removed++;
      } catch (e) { console.warn('[assets] gc:', e.message); }
    }
    if (removed) schedulePush();
  } catch (e) {
    console.warn('[assets] gcOrphanAssets:', e.message);
  }
}

// POST /assets — body { data: base64|dataURI, mime } → grava + commita (best-effort).
router.post('/assets', async (req, res) => {
  try {
    const { data, mime } = req.body || {};
    if (typeof data !== 'string' || !data) throw new Error('validação: data (base64) é obrigatório');
    const ext = ASSET_EXT[String(mime || '').toLowerCase()];
    if (!ext) throw new Error('validação: tipo de imagem não suportado');
    // aceita data URI ("data:...;base64,XXXX") ou base64 cru
    const b64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) throw new Error('validação: imagem vazia');
    if (buf.length > MAX_ASSET_BYTES) throw new Error('validação: imagem acima de 10MB');

    const dir = assetsDir();
    fs.mkdirSync(dir, { recursive: true });
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const file = path.join(dir, name);
    const warning = await commitAwaitedWrite(
      () => {
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, file);
      },
      () => git.commitPaths([file], `assets: ${name}`)
    );
    schedulePush();
    res.json(withWarning({ url: `/api/assets/${name}`, name }, warning));
  } catch (err) { fail(res, err); }
});

// GET /assets/:name — serve o arquivo do vault corrente (path-safe).
router.get('/assets/:name', (req, res) => {
  try {
    const name = req.params.name || '';
    if (!safeAssetName(name)) return res.status(400).json({ error: 'nome inválido' });
    const ext = (name.split('.').pop() || '').toLowerCase();
    // só serve extensões da allowlist raster — um .svg que tenha viajado no git
    // (de antes do drop) NÃO é servido como imagem executável.
    if (!ASSET_MIME[ext]) return res.status(404).json({ error: 'asset não encontrado' });
    const file = path.join(assetsDir(), name);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'asset não encontrado' });
    res.type(ASSET_MIME[ext]);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(file);
  } catch (err) { fail(res, err); }
});

// ── Plugins / Extensões ──────────────────────────────────────────────────────
// Instalação por-vault (<vault>/plugins/<name>/). Ver server/plugins.js.
function pluginRelPaths() {
  // caminho do dir plugins relativo ao vault (posix) p/ git add/commit
  return path.relative(config.VAULT, plugins.pluginsDir()).split(path.sep).join('/');
}

router.get('/plugins', (req, res) => {
  try { res.json({ plugins: plugins.list() }); } catch (err) { fail(res, err); }
});

router.post('/plugins/install', async (req, res) => {
  try {
    const { repo, ref } = req.body || {};
    if (typeof repo !== 'string' || !repo.trim()) throw new Error('validação: repo é obrigatório');
    const r = await plugins.install(repo.trim(), (ref || '').trim() || null);
    // versiona o plugin no vault (best-effort; .env e node_modules são gitignorados)
    const warning = await commitAwaited(() => git.commitPaths([path.join(config.VAULT, '.gitignore'), pluginRelPaths()], `plugins: instala ${r.name}`));
    schedulePush();
    res.json(withWarning({ plugins: plugins.list(), name: r.name, depsWarning: r.warning || '' }, warning));
  } catch (err) { fail(res, err); }
});

router.delete('/plugins/:name', async (req, res) => {
  try {
    plugins.remove(req.params.name);
    const warning = await commitAwaited(() => git.commitPaths([pluginRelPaths()], `plugins: remove ${req.params.name}`));
    schedulePush();
    res.json(withWarning({ plugins: plugins.list() }, warning));
  } catch (err) { fail(res, err); }
});

router.get('/plugins/:name/env', (req, res) => {
  try { res.json({ values: plugins.readEnvFile(req.params.name) }); } catch (err) { fail(res, err); }
});

router.put('/plugins/:name/env', (req, res) => {
  try {
    const { values } = req.body || {};
    if (!values || typeof values !== 'object') throw new Error('validação: values deve ser um objeto');
    plugins.writeEnvFile(req.params.name, values);
    // .env é gitignorado no vault → não commita (segredos ficam locais)
    const found = plugins.list().find((p) => p.name === req.params.name);
    res.json({ ok: true, configured: !!(found && found.configured) });
  } catch (err) { fail(res, err); }
});

router.get('/plugins/:name/icon', (req, res) => {
  try {
    const p = plugins.iconPath(req.params.name);
    if (!p) return res.status(404).json({ error: 'sem ícone' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(p);
  } catch (err) { fail(res, err); }
});

router.post('/plugins/:name/run', (req, res) => {
  try {
    const { commandId } = req.body || {};
    const runId = plugins.startRun(req.params.name, (commandId || '').trim() || null);
    res.json({ runId });
  } catch (err) { fail(res, err); }
});

// SSE: transmite o log do run (buffer + ao vivo) e fecha ao terminar.
router.get('/plugins/:name/run/:runId', (req, res) => {
  const rec = plugins.getRun(req.params.runId);
  if (!rec) return res.status(404).json({ error: 'run não encontrado' });
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const send = (event, data) => { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  // despeja o que já saiu
  if (rec.chunks.length) send('log', rec.chunks.join(''));
  if (rec.done) { send('done', { code: rec.code }); return res.end(); }

  const onData = (chunk, code) => {
    if (chunk != null) send('log', chunk);
    if (code !== undefined && code !== null || (chunk == null)) {
      send('done', { code: rec.code });
      rec.listeners.delete(onData);
      res.end();
    }
  };
  rec.listeners.add(onData);
  req.on('close', () => { rec.listeners.delete(onData); });
});

// ── Changelog (aba Atualizações) ─────────────────────────────────────────────
// Serve o CHANGELOG.md empacotado (versionado no repo do engine). Same-origin →
// sem depender de rede/CSP. A versão corrente sai do package.json.
const APP_VERSION = (() => { try { return require('../package.json').version || ''; } catch (_) { return ''; } })();
router.get('/changelog', (req, res) => {
  try {
    let markdown = '';
    try { markdown = fs.readFileSync(path.resolve(__dirname, '..', 'CHANGELOG.md'), 'utf8'); } catch (_) { markdown = ''; }
    res.json({ markdown, version: APP_VERSION });
  } catch (err) { fail(res, err); }
});

module.exports = router;
