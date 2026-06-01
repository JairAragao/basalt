// watcher.js — observa tasks/*.md e (re)calcula os derivados GUT.
// NUNCA commita. Anti-loop: só regrava se os derivados mudaram.

const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar');
const matter = require('gray-matter');
const gute = require('./gute');

// Extrai o id (nome do arquivo sem .md) de um path.
function idFromFile(file) {
  return path.basename(file, '.md');
}

// Compara dois valores derivados tratando null/undefined como equivalentes.
function sameDerived(a, b) {
  if (a == null && b == null) return true;
  return a === b;
}

/**
 * recompute(file, deps) — núcleo testável (sem chokidar).
 *  deps: { guteConfig, writeTask(id, data, body), readFile(file)->raw }
 * Retorna true se reescreveu, false se pulou (anti-loop / arquivo inválido).
 */
function recompute(file, deps) {
  const { guteConfig, writeTask } = deps;
  const readFile = deps.readFile || ((f) => fs.readFileSync(f, 'utf8'));

  let parsed;
  try {
    parsed = matter(readFile(file));
  } catch {
    return false; // arquivo ilegível/corrompido → ignora
  }
  const data = parsed.data || {};
  const body = parsed.content;

  const derived = gute.compute(data, guteConfig);

  // ANTI-LOOP: se os derivados atuais já batem com os calculados, não regrava.
  const unchanged =
    sameDerived(data.GUT, derived.GUT) &&
    sameDerived(data.prioridade_gute, derived.prioridade_gute);
  if (unchanged) return false;

  // Atualiza derivados + carimbo de cálculo.
  data.GUT = derived.GUT;
  data.prioridade_gute = derived.prioridade_gute;
  const stampField = guteConfig.stampField || 'gute_computed_at';
  data[stampField] = new Date().toISOString();

  const id = idFromFile(file);
  writeTask(id, data, body);
  return true;
}

/**
 * startWatcher({ TASKS_DIR, gute: guteConfig, schema })
 * Inicia o chokidar e liga add/change ao recompute. Usa a escrita atômica
 * do tasks-repo (mesmo .tmp + rename) para o carimbo dos derivados.
 */
function startWatcher({ TASKS_DIR, gute: guteConfig }) {
  // require tardio evita ciclo de import com tasks-repo no boot.
  const tasksRepo = require('./tasks-repo');

  const deps = {
    guteConfig,
    writeTask: (id, data, body) => tasksRepo.ATOMIC_writeTask(id, stripId(data), body),
  };

  const glob = path.join(TASKS_DIR, '*.md');
  const watcher = chokidar.watch(glob, {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 200 },
  });

  const onChange = (file) => {
    try {
      recompute(file, deps);
    } catch (err) {
      console.warn('[watcher] recompute falhou para', file, '-', err.message);
    }
  };

  watcher.on('add', onChange).on('change', onChange);
  console.log('[watcher] observando', glob);
  return watcher;
}

// O id é gravado pela ordenação do tasks-repo; remove do data pra não duplicar.
function stripId(data) {
  const out = { ...data };
  delete out.id;
  return out;
}

module.exports = { startWatcher, recompute, sameDerived, idFromFile };
