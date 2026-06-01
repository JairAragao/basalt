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

function ATOMIC_writeTask(id, data, body) {
  const full = resolveTaskPath(id);
  const tmp = path.join(config.TASKS_DIR, `.${id}.tmp`);
  const ordered = orderFrontmatter(id, data);
  const content = matter.stringify(body == null ? '' : body, ordered, { sortKeys: false });
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, full);
  return full;
}

function list() {
  let files;
  try {
    files = fs.readdirSync(config.TASKS_DIR);
  } catch {
    return [];
  }
  const tasks = [];
  for (const f of files) {
    if (!f.endsWith('.md') || f.startsWith('.')) continue;
    const id = f.slice(0, -3);
    if (!ID_RE.test(id)) continue;
    try {
      const parsed = matter.read(path.join(config.TASKS_DIR, f));
      tasks.push({ ...parsed.data, id });
    } catch {
      /* arquivo corrompido ignorado na listagem */
    }
  }
  return tasks;
}

function get(id) {
  const full = resolveTaskPath(id);
  if (!fs.existsSync(full)) throw new Error(`tarefa não encontrada: ${id}`);
  const parsed = matter.read(full);
  return { id, data: parsed.data, body: parsed.content };
}

function create(data, body) {
  const input = { ...data };
  let id = input.id;
  if (!id) { id = genId(input, config.schema); input.id = id; }
  const full = resolveTaskPath(id);
  if (fs.existsSync(full)) throw new Error(`tarefa já existe com este id: ${id} (renomeie o título)`);

  const { ok, errors } = validateTask(input, config.schema);
  if (!ok) throw new Error(`validação falhou: ${errors.join('; ')}`);

  const clean = stripDerived(input);
  delete clean.id;
  ATOMIC_writeTask(id, clean, body);
  return { id };
}

function update(id, data, body) {
  const full = resolveTaskPath(id);
  if (!fs.existsSync(full)) throw new Error(`tarefa não encontrada: ${id}`);
  const input = { ...data, id };

  const { ok, errors } = validateTask(input, config.schema);
  if (!ok) throw new Error(`validação falhou: ${errors.join('; ')}`);

  const existing = matter.read(full);
  const clean = stripDerived(input);
  delete clean.id;
  // Preserva os derivados já no arquivo (dono = watcher).
  const derivedKeys = (config.schema && Array.isArray(config.schema.derived)) ? config.schema.derived : [];
  for (const k of derivedKeys) {
    if (k in (existing.data || {})) clean[k] = existing.data[k];
  }

  const finalBody = body === undefined ? existing.content : body;
  ATOMIC_writeTask(id, clean, finalBody);
  return { id };
}

function remove(id) {
  const full = resolveTaskPath(id);
  if (!fs.existsSync(full)) throw new Error(`tarefa não encontrada: ${id}`);
  fs.unlinkSync(full);
  return { id };
}

module.exports = { list, get, create, update, remove, ATOMIC_writeTask, resolveTaskPath };
