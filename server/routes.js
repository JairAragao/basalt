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

const config = require('./config');
const tasksRepo = require('./tasks-repo');
const git = require('./git');
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

// Faz push e devolve um warning (string) se falhar; undefined se OK. Nunca lança.
async function pushOrWarn() {
  const r = await git.pushNow();
  if (r && r.ok === false) return `push falhou: ${r.error}`;
  return undefined;
}

// Anexa warning à resposta JSON só quando existir (campo opcional do contrato).
function withWarning(payload, warning) {
  return warning ? { ...payload, warning } : payload;
}

// Autor da mudança = usuário do git do vault (created_by/updated_by). Local-first,
// sem login: o mesmo nome que assina os commits. Nunca lança. CACHEADO por vault
// (getIdentity spawna git; cache tira do caminho crítico). Invalidado ao trocar vault.
let _actorCache = null;
if (typeof config.onVaultChange === 'function') config.onVaultChange(() => { _actorCache = null; });
async function gitActor() {
  if (_actorCache !== null) return _actorCache;
  try {
    const id = await git.getIdentity();
    _actorCache = (id && id.name) || '';
  } catch {
    _actorCache = '';
  }
  return _actorCache;
}

// Fila git SERIALIZADA — roda commit/push em BACKGROUND (depois de responder ao
// cliente), uma op de cada vez (evita lock concorrente do git). Falha não derruba
// a request: loga warning. É o que deixa o front instantâneo (o arquivo já foi
// gravado de forma síncrona = fonte da verdade; git é bookkeeping).
let gitChain = Promise.resolve();
function enqueueGit(fn, label) {
  gitChain = gitChain.then(fn).catch((e) => {
    console.warn(`[git] ${label || 'op'} falhou:`, (e && e.message) || e);
  });
}

// ── Tarefas ──────────────────────────────────────────────────────────────────
router.get('/config', (req, res) => {
  res.json({ schema: config.schema, board: config.board, gute: config.gute });
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
    const { id } = tasksRepo.create(cleanData, taskBody, await gitActor());
    // Lê o que ficou gravado para a mensagem refletir o id/titulo finais.
    const after = safeGetData(id) || { ...cleanData, id };
    const msg = describeChanges(null, after, 'create', id);
    res.status(201).json({ id }); // responde já; git em background
    enqueueGit(async () => { await git.commitTask(taskFile(id), msg); await git.pushNow(); }, `create ${id}`);
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

    // Frontmatter ANTES (para descrever a mudança). Pode não existir → null.
    const before = safeGetData(id);
    tasksRepo.update(id, cleanData, taskBody, await gitActor());
    const after = safeGetData(id) || { ...cleanData, id };

    const msg = describeChanges(before, after, 'update', id);
    res.json({ id }); // responde já; git em background
    enqueueGit(async () => { await git.commitTask(taskFile(id), msg); await git.pushNow(); }, `update ${id}`);
  } catch (err) { fail(res, err); }
});

router.patch('/tasks/:id/move', async (req, res) => {
  try {
    const id = req.params.id;
    const novoStatus = (req.body || {}).status;
    if (!novoStatus) return res.status(400).json({ error: 'status é obrigatório' });
    const current = tasksRepo.get(id);
    const before = current.data;
    tasksRepo.update(id, { ...current.data, status: novoStatus }, current.body, await gitActor());
    const after = safeGetData(id) || { ...current.data, status: novoStatus };

    const msg = describeChanges(before, after, 'move', id);
    res.json({ id, status: novoStatus }); // responde já; git em background
    enqueueGit(async () => { await git.commitTask(taskFile(id), msg); await git.pushNow(); }, `move ${id}`);
  } catch (err) { fail(res, err); }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const file = taskFile(id);
    // Frontmatter ANTES de remover (para citar o título na mensagem).
    const before = safeGetData(id);
    tasksRepo.remove(id);
    const msg = describeChanges(before, null, 'delete', id);
    res.json({ id }); // responde já; git em background
    enqueueGit(async () => { await git.removeAndCommit(file, msg); await git.pushNow(); }, `delete ${id}`);
  } catch (err) { fail(res, err); }
});

// Lê o frontmatter de uma tarefa sem lançar (retorna null se não existir).
function safeGetData(id) {
  try {
    return tasksRepo.get(id).data;
  } catch {
    return null;
  }
}

// ── Sync / Health ────────────────────────────────────────────────────────────
// Pull sob demanda (fast-forward only). Nunca lança — devolve o resultado do git.
router.post('/sync/pull', async (req, res) => {
  try {
    const r = await git.pull();
    res.status(r.ok ? 200 : 200).json(r);
  } catch (err) { fail(res, err); }
});

// Diagnóstico do setup git: repo, identidade, remote, push/pull sem senha.
router.get('/health/git', async (req, res) => {
  try {
    const h = await git.healthGit();
    res.json(h);
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
    const { statusGroups, renames } = req.body || {};
    validateStatusGroups(statusGroups);

    const board = JSON.parse(fs.readFileSync(boardFile(), 'utf8'));
    board.statusGroups = statusGroups;
    writeJsonAtomic(boardFile(), board);

    const rn = (Array.isArray(renames) ? renames : []).filter((r) => r && r.from && r.to && r.from !== r.to);
    let changed = [];
    if (rn.length) {
      const map = new Map(rn.map((r) => [r.from, r.to]));
      changed = migrateTasks((data) => (map.has(data.status) ? { ...data, status: map.get(data.status) } : null));
    }

    config.reload();
    await git.commitPaths([boardFile(), ...changed], `status: config atualizada${rn.length ? ` (${rn.length} renomeada(s))` : ''}`);
    const warning = await pushOrWarn();
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
    const clean = [];
    for (const f of filters) {
      if (typeof f !== 'string' || !f.trim()) throw new Error('validação: cada filtro deve ser uma string não-vazia');
      const key = f.trim();
      if (!(key in props)) throw new Error(`validação: a propriedade "${key}" não existe no schema`);
      if (!clean.includes(key)) clean.push(key);
    }

    const board = JSON.parse(fs.readFileSync(boardFile(), 'utf8'));
    board.filters = clean;
    writeJsonAtomic(boardFile(), board);

    config.reload();
    await git.commitPaths([boardFile()], `board: filtros atualizados (${clean.length})`);
    const warning = await pushOrWarn();
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
    const clean = [];
    for (const f of fields) {
      if (typeof f !== 'string' || !f.trim()) throw new Error('validação: cada campo deve ser uma string não-vazia');
      const key = f.trim();
      if (!known(key)) throw new Error(`validação: a propriedade "${key}" não existe`);
      if (!clean.includes(key)) clean.push(key);
    }
    for (const k of [subtitle, badge]) {
      if (k != null && k !== '' && !known(k)) throw new Error(`validação: a propriedade "${k}" não existe`);
    }

    const board = JSON.parse(fs.readFileSync(boardFile(), 'utf8'));
    board.card = { ...(board.card || {}), fields: clean };
    if (subtitle !== undefined) board.card.subtitle = subtitle || undefined;
    if (badge !== undefined) board.card.badge = badge || undefined;
    writeJsonAtomic(boardFile(), board);

    config.reload();
    await git.commitPaths([boardFile()], 'board: campos do cartão atualizados');
    const warning = await pushOrWarn();
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

    schema.properties = properties;
    writeJsonAtomic(schemaFile(), schema);

    const newKeys = Object.keys(properties);
    const rn = rnRaw;
    const renameMap = new Map(rn.map((r) => [r.from, r.to]));
    const removed = oldKeys.filter((k) => !newKeys.includes(k) && !renameMap.has(k) && !derived.has(k));
    // Props NOVAS a semear nas tarefas — exclui renomeadas e props type 'formula'
    // (estas são derivadas: o watcher as calcula, não viram campo manual vazio).
    const added = newKeys.filter(
      (k) =>
        !oldKeys.includes(k) &&
        ![...renameMap.values()].includes(k) &&
        !(properties[k] && properties[k].type === 'formula')
    );

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

    const changed = migrateTasks((data) => {
      let dirty = false;
      // renomeia chave
      for (const [from, to] of renameMap) {
        if (from in data) { data[to] = data[from]; delete data[from]; dirty = true; }
      }
      // remove chave
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
      // migra valores de opção enum renomeados
      for (const [prop, valueMap] of optByProp) {
        if (prop in data && valueMap.has(data[prop])) {
          data[prop] = valueMap.get(data[prop]);
          dirty = true;
        }
      }
      return dirty ? data : null;
    });

    config.reload();
    const optNote = optRn.length ? `, ${optRn.length} opção(ões) migrada(s)` : '';
    await git.commitPaths([schemaFile(), ...changed], `schema: propriedades atualizadas${optNote}`);
    const warning = await pushOrWarn();
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

module.exports = router;
