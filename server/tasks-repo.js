// tasks-repo.js — CRUD de tarefas como arquivos `tasks/<id>.md`.
// Lê a config viva via `config.X` (suporta reload sem reiniciar).

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const config = require('./config');
const { validateTask, genId } = require('./validate');

const ID_RE = /^[A-Za-z0-9._-]+$/;

function resolveTaskPath(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`id inválido: ${id}`);
  if (id.includes('..') || id.includes('/') || id.includes('\\')) throw new Error(`id inválido: ${id}`);
  const base = path.resolve(config.TASKS_DIR);
  const full = path.resolve(base, `${id}.md`);
  if (full !== path.join(base, `${id}.md`) || !full.startsWith(base + path.sep)) {
    throw new Error(`id fora do diretório de tarefas: ${id}`);
  }
  return full;
}

function orderFrontmatter(id, data) {
  const schema = config.schema;
  const ordered = { id };
  const propKeys = Object.keys((schema && schema.properties) || {});
  const derivedKeys = (schema && Array.isArray(schema.derived)) ? schema.derived : [];
  const placed = new Set(['id']);
  for (const k of propKeys) {
    if (derivedKeys.includes(k)) continue;
    if (k in data) { ordered[k] = data[k]; placed.add(k); }
  }
  for (const k of Object.keys(data)) {
    if (placed.has(k) || derivedKeys.includes(k) || k === 'id') continue;
    ordered[k] = data[k]; placed.add(k);
  }
  for (const k of derivedKeys) {
    if (k in data) { ordered[k] = data[k]; placed.add(k); }
  }
  return ordered;
}

function stripDerived(data) {
  const out = { ...data };
  const derivedKeys = (config.schema && Array.isArray(config.schema.derived)) ? config.schema.derived : [];
  for (const k of derivedKeys) delete out[k];
  return out;
}

// Campos "auto" (gerenciados pelo sistema): auditoria created/updated at/by.
// Não vêm do form; o app nunca os escreve — o tasks-repo carimba.
function autoKeys() {
  const props = (config.schema && config.schema.properties) || {};
  return Object.keys(props).filter((k) => props[k] && props[k].auto);
}
// Remove tanto derivados (fórmula + computed_at) quanto auto do input do app.
function stripManaged(data) {
  const out = stripDerived(data);
  for (const k of autoKeys()) delete out[k];
  return out;
}

// CRLF no corpo quebra o editor: um \r solto dentro do doc ProseMirror desalinha
// o mapeamento DOM↔posição (cursor volta 1 a cada tecla → texto "invertido";
// clique no fim da linha cai na linha de baixo) e o round-trip \r\n→\n do
// tiptap-markdown faz o autosave ver diff eterno. LF em todas as fronteiras.
function normEol(s) {
  return String(s).replace(/\r\n?/g, '\n');
}

function ATOMIC_writeTask(id, data, body) {
  const full = resolveTaskPath(id);
  const tmp = path.join(config.TASKS_DIR, `.${id}.tmp`);
  const ordered = orderFrontmatter(id, data);
  const content = matter.stringify(body == null ? '' : normEol(body), ordered, { sortKeys: false });
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, full);
  _fmCache.delete(`${config.TASKS_DIR}\x1f${id}.md`); // força re-parse (mtime pode colidir no mesmo ms)
  return full;
}

// Cache de frontmatter por (dir, arquivo) indexado pelo mtime — mesmo padrão do
// metadataCache do Obsidian. Sem ele, list() re-parseava o vault INTEIRO a cada
// GET /tasks (autosave, drag, pull, troca de aba): ~900 readFileSync+YAML
// síncronos por request travavam o event loop. Agora só arquivos com mtime novo
// são re-lidos; o resto vem do cache. Invalidado pelo chokidar e pelas escritas.
const _fmCache = new Map(); // key `${TASKS_DIR}\x1f${file}` → { mtimeMs, data }

function list() {
  const dir = config.TASKS_DIR;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const tasks = [];
  const alive = new Set();
  for (const ent of entries) {
    const f = ent.name;
    if (!f.endsWith('.md') || f.startsWith('.')) continue;
    const id = f.slice(0, -3);
    if (!ID_RE.test(id)) continue;
    const full = path.join(dir, f);
    const key = `${dir}\x1f${f}`;
    alive.add(key);
    let mtimeMs;
    try { mtimeMs = fs.statSync(full).mtimeMs; } catch { continue; }
    const cached = _fmCache.get(key);
    if (cached && cached.mtimeMs === mtimeMs) {
      tasks.push({ ...cached.data, id });
      continue;
    }
    try {
      const parsed = matter.read(full);
      _fmCache.set(key, { mtimeMs, data: parsed.data });
      tasks.push({ ...parsed.data, id });
    } catch {
      _fmCache.delete(key);
    }
  }
  for (const key of _fmCache.keys()) {
    if (key.startsWith(`${dir}\x1f`) && !alive.has(key)) _fmCache.delete(key);
  }
  return tasks;
}

// Invalida a entrada de cache de um arquivo (chamado pelo watcher em unlink/change
// externo — as escritas do próprio repo já reindexam via mtime na próxima list).
function invalidateCache(fileOrId) {
  const f = String(fileOrId).endsWith('.md') ? fileOrId : `${fileOrId}.md`;
  _fmCache.delete(`${config.TASKS_DIR}\x1f${f}`);
}

function get(id) {
  const full = resolveTaskPath(id);
  if (!fs.existsSync(full)) throw new Error(`tarefa não encontrada: ${id}`);
  const parsed = matter.read(full);
  return { id, data: parsed.data, body: normEol(parsed.content) };
}

function create(data, body, actor) {
  const input = { ...data };
  let id = input.id;
  if (!id) { id = genId(input, config.schema); input.id = id; }
  const full = resolveTaskPath(id);
  if (fs.existsSync(full)) throw new Error(`tarefa já existe com este id: ${id} (renomeie o título)`);

  const { ok, errors } = validateTask(input, config.schema);
  if (!ok) throw new Error(`validação falhou: ${errors.join('; ')}`);

  const clean = stripManaged(input);
  delete clean.id;
  // Auditoria: carimba criação + edição (mesmo instante/autor no create).
  const now = new Date().toISOString();
  const who = actor || '';
  clean.created_at = now;
  clean.created_by = who;
  clean.updated_at = now;
  clean.updated_by = who;
  // Conclusão: criar direto numa etapa do grupo done conta como transição → carimba.
  const done = config.doneStageIds || new Set();
  if (done.has(clean.status)) {
    clean.completed_at = now;
    clean.completed_by = who;
  }
  ATOMIC_writeTask(id, clean, body);
  return { id };
}

function update(id, data, body, actor, opts) {
  const full = resolveTaskPath(id);
  if (!fs.existsSync(full)) throw new Error(`tarefa não encontrada: ${id}`);

  const existing = matter.read(full);
  const ex = existing.data || {};

  // ── MERGE parcial (não mais full-replace) ─────────────────────────────────
  // Chave AUSENTE no payload = preserva o valor existente; presente = aplica;
  // null ou '' explícito = limpa (remove a chave). Antes o PUT substituía o
  // frontmatter inteiro: um autosave com snapshot velho revertia silenciosamente
  // mudanças remotas nos campos que o usuário nem tocou.
  const props = (config.schema && config.schema.properties) || {};
  const PAGE_META = new Set(['icon', 'cover']);
  const incoming = stripManaged({ ...data });
  delete incoming.id;

  const clean = {};
  for (const k of Object.keys(props)) {
    if (k in ex) clean[k] = ex[k];
  }
  for (const k of PAGE_META) {
    if (k in ex) clean[k] = ex[k];
  }
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === '') delete clean[k];
    else clean[k] = v;
  }

  // Valida SÓ os campos tocados pelo payload (modo parcial). Validar o merge
  // inteiro rejeitava a edição por causa de valor órfão preservado em campo
  // NÃO tocado (opção/etapa deletada, required legado vazio) — e o autosave
  // perdia o que o usuário digitou. Limpar um required segue barrado (o campo
  // tocado é validado com o valor final do merge, ausente = vazio).
  const touched = new Set(Object.keys(incoming));
  const { ok, errors } = validateTask({ ...clean, id }, config.schema, { only: touched });
  if (!ok) throw new Error(`validação falhou: ${errors.join('; ')}`);

  // Preserva os derivados (fórmula) e o carimbo de cálculo (dono = watcher).
  const derivedKeys = (config.schema && Array.isArray(config.schema.derived)) ? config.schema.derived : [];
  for (const k of derivedKeys) {
    if (k in ex) clean[k] = ex[k];
  }
  if ('computed_at' in ex) clean.computed_at = ex.computed_at;

  // Preserva chaves ESTRANGEIRAS do frontmatter — adicionadas à mão, fora do
  // schema e fora das geridas pela UI. O update não pode destruir dado que não
  // conhece (ex.: comments).
  const autoSet = new Set(autoKeys());
  for (const k of Object.keys(ex)) {
    if (k === 'id' || k in clean) continue;
    if (k in props || derivedKeys.includes(k) || k === 'computed_at' || autoSet.has(k) || PAGE_META.has(k)) continue;
    clean[k] = ex[k];
  }
  // Auditoria: preserva a criação; carimba a edição.
  const now = new Date().toISOString();
  const who = actor || '';
  clean.created_at = ex.created_at || now;
  clean.created_by = ex.created_by !== undefined ? ex.created_by : who;
  clean.updated_at = now;
  clean.updated_by = who;

  // Conclusão: carimbo SÓ na transição ∉done→∈done; limpa na inversa; preserva
  // em todo o resto (legado em done sem carimbo continua sem — nada de
  // retro-carimbo; sem doneGroupId nenhum carimbo novo, mas o existente fica).
  const done = config.doneStageIds || new Set();
  const wasDone = done.has(ex.status);
  const isDone = done.has(clean.status);
  if (!wasDone && isDone) {
    clean.completed_at = now;
    clean.completed_by = who;
  } else if (wasDone && !isDone) {
    delete clean.completed_at;
    delete clean.completed_by;
  } else {
    if ('completed_at' in ex) clean.completed_at = ex.completed_at;
    if ('completed_by' in ex) clean.completed_by = ex.completed_by;
  }

  // Corpo: LOSSLESS em edição simultânea. Se o cliente enviou o corpo que ele
  // VIU ao abrir (opts.bodyBase) e o corpo EM DISCO já é outro (um colega editou
  // e chegou via pull), gravar `body` cru apagaria a edição alheia. Nesse caso
  // preserva o de disco e anexa a versão do cliente sob um marcador — ninguém
  // perde conteúdo; o usuário mescla e apaga o bloco depois.
  let bodyConflict = false;
  let finalBody;
  if (body === undefined) {
    finalBody = existing.content;
  } else {
    const onDisk = normEol(existing.content || '');
    const base = opts && typeof opts.bodyBase === 'string' ? normEol(opts.bodyBase) : undefined;
    if (base !== undefined && onDisk.trim() !== base.trim() && onDisk.trim() !== String(body).trim()) {
      finalBody = `${onDisk}\n\n---\n\n> ⚠️ Editado em paralelo — mescle o que precisar e apague este aviso:\n\n${body}`;
      bodyConflict = true;
    } else {
      finalBody = body;
    }
  }
  ATOMIC_writeTask(id, clean, finalBody);
  return { id, bodyConflict };
}

function remove(id) {
  const full = resolveTaskPath(id);
  if (!fs.existsSync(full)) throw new Error(`tarefa não encontrada: ${id}`);
  fs.unlinkSync(full);
  _fmCache.delete(`${config.TASKS_DIR}\x1f${id}.md`);
  return { id };
}

// Comentários no frontmatter (comments:[{author,text,at}]). Reescreve o
// frontmatter inteiro só anexando/tirando da lista (preserva tudo o resto).
function addComment(id, text, actor) {
  const full = resolveTaskPath(id);
  if (!fs.existsSync(full)) throw new Error(`tarefa não encontrada: ${id}`);
  const t = String(text == null ? '' : text).trim();
  if (!t) throw new Error('validação: comentário vazio');
  const parsed = matter.read(full);
  const data = { ...parsed.data };
  delete data.id;
  const list = Array.isArray(data.comments) ? data.comments.slice() : [];
  list.push({ author: actor || '', text: t, at: new Date().toISOString() });
  data.comments = list;
  ATOMIC_writeTask(id, data, parsed.content);
  return { id, comments: list };
}

function removeComment(id, index) {
  const full = resolveTaskPath(id);
  if (!fs.existsSync(full)) throw new Error(`tarefa não encontrada: ${id}`);
  const parsed = matter.read(full);
  const data = { ...parsed.data };
  delete data.id;
  const list = Array.isArray(data.comments) ? data.comments.slice() : [];
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= list.length) throw new Error('validação: índice de comentário inválido');
  list.splice(i, 1);
  if (list.length) data.comments = list; else delete data.comments;
  ATOMIC_writeTask(id, data, parsed.content);
  return { id, comments: list };
}

module.exports = { list, get, create, update, remove, addComment, removeComment, ATOMIC_writeTask, resolveTaskPath, invalidateCache };
