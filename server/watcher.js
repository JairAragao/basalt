// watcher.js — observa tasks/*.md e (re)calcula os campos FÓRMULA derivados.
// NUNCA commita. Anti-loop GENÉRICO: só regrava se algum campo fórmula mudou.
//
// O motor é server/formula.js (compute(data, schema)). O carimbo de cálculo é
// o campo genérico 'computed_at' (ISO).

const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const matter = require('gray-matter');
const formula = require('./formula');

const STAMP_FIELD = 'computed_at';

// Extrai o id (nome do arquivo sem .md) de um path.
function idFromFile(file) {
  return path.basename(file, '.md');
}

// Compara dois valores derivados tratando null/undefined como equivalentes.
function sameDerived(a, b) {
  if (a == null && b == null) return true;
  return a === b;
}

// Resolve o "schema" usado pelo motor a partir das deps, aceitando o formato
// novo (deps.schema) e o legado (deps.guteConfig = config/gute.json).
function resolveSchema(deps) {
  return deps.schema || deps.guteConfig || {};
}

// Stamp field efetivo: legado usa o stampField do gute.json se presente,
// senão o genérico 'computed_at'.
function resolveStampField(deps) {
  const sch = resolveSchema(deps);
  if (sch && typeof sch.stampField === 'string' && sch.stampField) return sch.stampField;
  return STAMP_FIELD;
}

/**
 * recompute(file, deps) — núcleo testável (sem chokidar).
 *  deps: { schema | guteConfig, writeTask(id, data, body), readFile(file)->raw }
 * Retorna true se reescreveu, false se pulou (anti-loop / arquivo inválido).
 */
function recompute(file, deps) {
  const { writeTask } = deps;
  const readFile = deps.readFile || ((f) => fs.readFileSync(f, 'utf8'));
  const schema = resolveSchema(deps);
  const stampField = resolveStampField(deps);

  let parsed;
  try {
    parsed = matter(readFile(file));
  } catch {
    return false; // arquivo ilegível/corrompido → ignora
  }
  const data = parsed.data || {};
  const body = parsed.content;

  // Calcula TODOS os campos fórmula do schema sobre as props numéricas da task.
  const computed = formula.compute(data, schema);
  const formulaKeys = Object.keys(computed);

  // ANTI-LOOP GENÉRICO: se todos os campos fórmula atuais já batem com os
  // calculados, não regrava.
  let changed = false;
  for (const k of formulaKeys) {
    if (!sameDerived(data[k], computed[k])) {
      changed = true;
      break;
    }
  }
  if (!changed) return false;

  // Atualiza os campos fórmula + carimbo de cálculo.
  for (const k of formulaKeys) data[k] = computed[k];
  data[stampField] = new Date().toISOString();

  const id = idFromFile(file);
  writeTask(id, data, body);
  return true;
}

/**
 * startWatcher({ TASKS_DIR, schema })
 * Inicia o chokidar e liga add/change ao recompute. Usa a escrita atômica
 * do tasks-repo (mesmo .tmp + rename) para o carimbo dos derivados.
 *
 * Re-observa automaticamente o TASKS_DIR do vault novo quando o usuário troca
 * de vault (config.onVaultChange) — sem reiniciar o servidor.
 */
function startWatcher({ TASKS_DIR, schema }) {
  // require tardio evita ciclo de import com tasks-repo no boot.
  const tasksRepo = require('./tasks-repo');
  const config = require('./config');

  const deps = {
    // Lê o schema vivo no momento do cálculo (suporta reload/troca de vault).
    get schema() {
      return (config && config.schema) || schema;
    },
    writeTask: (id, data, body) => tasksRepo.ATOMIC_writeTask(id, stripId(data), body),
  };

  const onChange = (file) => {
    try {
      recompute(file, deps);
    } catch (err) {
      console.warn('[watcher] recompute falhou para', file, '-', err.message);
    }
  };

  let watcher = null;
  function watch(dir) {
    const glob = path.join(dir, '*.md');
    watcher = chokidar.watch(glob, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 200 },
    });
    watcher.on('add', onChange).on('change', onChange);
    console.log('[watcher] observando', glob);
    return watcher;
  }

  watch(TASKS_DIR);

  // Troca de vault → fecha o watcher antigo e abre no novo TASKS_DIR.
  if (typeof config.onVaultChange === 'function') {
    config.onVaultChange(({ TASKS_DIR: nextDir }) => {
      const target = nextDir || config.TASKS_DIR;
      if (watcher) {
        try { watcher.close(); } catch { /* noop */ }
      }
      watch(target);
    });
  }

  return watcher;
}

// O id é gravado pela ordenação do tasks-repo; remove do data pra não duplicar.
function stripId(data) {
  const out = { ...data };
  delete out.id;
  return out;
}

module.exports = { startWatcher, recompute, sameDerived, idFromFile };
