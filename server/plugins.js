// plugins.js — sistema de extensões do Basalt (estilo VSCode), puxadas de repos
// GitHub. Instalação POR-VAULT: os arquivos do plugin vivem em <vault>/plugins/
// <name>/ e são versionados no git do vault. O `.env` (segredos) e o node_modules
// são gitignorados no vault (ver ensureVaultGitignore) — não viajam no push.
//
// Estrutura esperada no repo do plugin:
//   basalt-plugin.json   manifesto (name, version, icon, entry, env[], commands[])
//   README.md            descrição exibida no card
//   <icon>               ícone (caminho relativo do manifesto)
//   <entry>              script executável (node)
//   package.json         deps (npm install no install; opcional)
//
// Execução: roda o entry com o Node EMBUTIDO do Electron (ELECTRON_RUN_AS_NODE) —
// em dev (server via `node`) roda com o próprio node. Sem depender de node no PATH.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const config = require('./config');

const IS_WIN = process.platform === 'win32';

// ── remoção robusta (Windows) ─────────────────────────────────────────────────
// O git marca arquivos do .git/ (packs/objects) como SOMENTE-LEITURA; no Windows
// fs.rmSync — mesmo com force — dá EPERM neles. Limpamos o atributo read-only da
// árvore e tentamos de novo (com retries p/ EBUSY de handles que acabaram de soltar).
function chmodTreeWritable(p) {
  let st;
  try { st = fs.lstatSync(p); } catch (_) { return; }
  try { fs.chmodSync(p, 0o700); } catch (_) { /* noop */ }
  if (st.isDirectory()) {
    let entries = [];
    try { entries = fs.readdirSync(p); } catch (_) { entries = []; }
    for (const e of entries) chmodTreeWritable(path.join(p, e));
  }
}
function rmrf(target) {
  if (!fs.existsSync(target)) return;
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
    return;
  } catch (e) {
    chmodTreeWritable(target);
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  }
}

// ── caminhos / validação ─────────────────────────────────────────────────────
function pluginsDir() { return path.join(config.VAULT, 'plugins'); }

function slug(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'plugin';
}
// nome de diretório de plugin seguro (sem traversal)
function safeName(n) { return /^[a-z0-9][a-z0-9._-]*$/.test(n) && !n.includes('..'); }
function dirOf(name) {
  if (!safeName(name)) throw new Error('validação: nome de plugin inválido');
  return path.join(pluginsDir(), name);
}

// ── manifesto / README / .env ────────────────────────────────────────────────
function readManifest(dir) {
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'basalt-plugin.json'), 'utf8'));
  return {
    name: String(raw.name || '').trim(),
    version: String(raw.version || '').trim(),
    icon: typeof raw.icon === 'string' ? raw.icon : null,
    entry: typeof raw.entry === 'string' ? raw.entry : null,
    env: Array.isArray(raw.env)
      ? raw.env
          .map((e) => ({
            key: String((e && e.key) || '').trim(),
            label: String((e && (e.label || e.key)) || '').trim(),
            secret: !!(e && e.secret),
            required: !!(e && e.required),
            placeholder: String((e && e.placeholder) || ''),
          }))
          .filter((e) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(e.key))
      : [],
    commands: Array.isArray(raw.commands)
      ? raw.commands
          .map((c) => ({
            id: String((c && c.id) || '').trim(),
            label: String((c && (c.label || c.id)) || '').trim(),
            run: typeof (c && c.run) === 'string' ? c.run : null,
          }))
          .filter((c) => c.id)
      : [],
  };
}

function readReadme(dir) {
  for (const n of ['README.md', 'readme.md', 'Readme.md', 'README.MD']) {
    const f = path.join(dir, n);
    if (fs.existsSync(f)) { try { return fs.readFileSync(f, 'utf8'); } catch (_) { /* noop */ } }
  }
  return '';
}
// 1º parágrafo não-título como resumo curto pro card
function readmeExcerpt(md) {
  const lines = String(md || '').split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('#') || s.startsWith('![') || s.startsWith('<')) continue;
    return s.replace(/[*_`]/g, '').slice(0, 220);
  }
  return '';
}

function envFile(name) { return path.join(dirOf(name), '.env'); }
function readEnvFile(name) {
  const out = {};
  const f = envFile(name);
  if (!fs.existsSync(f)) return out;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const i = s.indexOf('=');
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}
function writeEnvFile(name, values) {
  const clean = values && typeof values === 'object' ? values : {};
  const lines = Object.keys(clean)
    .filter((k) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(k))
    .map((k) => `${k}=${String(clean[k] == null ? '' : clean[k])}`);
  fs.writeFileSync(envFile(name), lines.join('\n') + '\n');
}

// ── vault .gitignore: nunca versionar .env (segredos) nem node_modules ────────
function ensureVaultGitignore() {
  const gi = path.join(config.VAULT, '.gitignore');
  let cur = '';
  try { cur = fs.readFileSync(gi, 'utf8'); } catch (_) { /* novo */ }
  const have = new Set(cur.split(/\r?\n/).map((l) => l.trim()));
  const needed = ['plugins/**/.env', 'plugins/**/node_modules/'];
  const add = needed.filter((l) => !have.has(l));
  if (!add.length) return false;
  const next = cur + (cur && !cur.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n';
  fs.writeFileSync(gi, next);
  return true;
}

// ── listar ───────────────────────────────────────────────────────────────────
function list() {
  const dir = pluginsDir();
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!safeName(name)) continue;
    const d = path.join(dir, name);
    try { if (!fs.statSync(d).isDirectory()) continue; } catch (_) { continue; }
    if (!fs.existsSync(path.join(d, 'basalt-plugin.json'))) continue;
    let m;
    try { m = readManifest(d); } catch (_) { continue; }
    const env = readEnvFile(name);
    const configured = m.env.filter((e) => e.required).every((e) => env[e.key] && String(env[e.key]).trim());
    const readme = readReadme(d);
    out.push({
      name,
      title: m.name || name,
      version: m.version,
      description: readmeExcerpt(readme),
      readme,
      hasIcon: !!(m.icon && fs.existsSync(path.join(d, m.icon))),
      env: m.env, // schema (labels/flags); valores vão só no GET /env
      commands: m.commands,
      configured,
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

function iconPath(name) {
  const d = dirOf(name);
  const m = readManifest(d);
  if (!m.icon) return null;
  const p = path.join(d, m.icon);
  // path-safe: o ícone tem que estar DENTRO da pasta do plugin
  if (!path.resolve(p).startsWith(path.resolve(d) + path.sep)) return null;
  return fs.existsSync(p) ? p : null;
}

// ── helpers de processo ───────────────────────────────────────────────────────
function execFileP(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 180000, maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr || err.message).slice(0, 800)));
      resolve(String(stdout || ''));
    });
  });
}

// npm install (best-effort, não-fatal): dev deps fora; falha vira warning
function installDeps(dir) {
  return new Promise((resolve) => {
    if (!fs.existsSync(path.join(dir, 'package.json'))) return resolve('');
    const npm = IS_WIN ? 'npm.cmd' : 'npm';
    let out = '';
    let child;
    try {
      child = spawn(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: dir, shell: IS_WIN, windowsHide: true });
    } catch (e) { return resolve(`npm install falhou: ${e.message}`); }
    child.stdout && child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr && child.stderr.on('data', (d) => { out += d.toString(); });
    child.on('error', (e) => resolve(`npm install falhou (npm no PATH?): ${e.message}`));
    child.on('close', (code) => resolve(code === 0 ? '' : `npm install saiu com código ${code}`));
  });
}

// ── normalizar repo GitHub ────────────────────────────────────────────────────
// aceita "owner/repo", "https://github.com/owner/repo(.git)", com "#ref" opcional
function normalizeRepo(input) {
  let s = String(input || '').trim();
  let ref = null;
  if (s.includes('#')) { const [a, b] = s.split('#'); s = a.trim(); ref = (b || '').trim() || null; }
  let url;
  if (/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/?$/.test(s)) url = s.replace(/\/$/, '').replace(/\.git$/, '') + '.git';
  else if (/^[\w.-]+\/[\w.-]+$/.test(s)) url = `https://github.com/${s}.git`;
  else throw new Error('validação: use "owner/repo" ou "https://github.com/owner/repo"');
  if (ref && !/^[\w.\-/]+$/.test(ref)) throw new Error('validação: ref inválida');
  return { url, ref };
}

// ── instalar ──────────────────────────────────────────────────────────────────
// clona --depth 1 num tmp DENTRO de plugins/ (mesmo drive → rename seguro), lê o
// manifesto, remove o .git (vira arquivo simples versionado pelo vault), roda
// npm install e move pro nome final. Retorna { name, warning }.
async function install(repo, refArg) {
  const { url, ref } = normalizeRepo(refArg ? `${repo}#${refArg}` : repo);
  const root = pluginsDir();
  fs.mkdirSync(root, { recursive: true });
  const tmp = path.join(root, `.tmp-${Date.now().toString(36)}`);

  const args = ['clone', '--depth', '1'];
  if (ref) args.push('--branch', ref);
  args.push(url, tmp);
  try {
    await execFileP('git', args, { env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  } catch (e) {
    try { rmrf(tmp); } catch (_) { /* noop */ }
    throw new Error(`falha ao clonar: ${e.message}`);
  }

  try {
    if (!fs.existsSync(path.join(tmp, 'basalt-plugin.json'))) {
      throw new Error('o repo não tem basalt-plugin.json na raiz — não é um plugin Basalt');
    }
    const m = readManifest(tmp);
    if (!m.name) throw new Error('manifesto sem "name"');

    // remove o .git do plugin (evita repo aninhado dentro do vault)
    rmrf(path.join(tmp, ".git"));

    // nome de pasta final único
    let name = slug(m.name);
    let n = 2;
    while (fs.existsSync(path.join(root, name))) { name = `${slug(m.name)}-${n++}`; }
    const finalDir = path.join(root, name);
    fs.renameSync(tmp, finalDir);

    ensureVaultGitignore();
    const depsWarn = await installDeps(finalDir);
    return { name, title: m.name, warning: depsWarn };
  } catch (e) {
    try { rmrf(tmp); } catch (_) { /* noop */ }
    throw e;
  }
}

function remove(name) {
  const d = dirOf(name);
  if (!fs.existsSync(d)) throw new Error('plugin não encontrado');
  rmrf(d);
}

// ── execução (registro de runs em memória p/ streaming SSE) ───────────────────
const runs = new Map(); // runId -> { chunks:[], done, code, listeners:Set }
let RUN_SEQ = 0;

function startRun(name, commandId) {
  const dir = dirOf(name);
  const m = readManifest(dir);
  const cmd = commandId ? m.commands.find((c) => c.id === commandId) : (m.commands[0] || null);
  const entry = (cmd && cmd.run) || m.entry;
  if (!entry) throw new Error('validação: comando/entry não definido no manifesto');
  const entryPath = path.join(dir, entry);
  if (!path.resolve(entryPath).startsWith(path.resolve(dir) + path.sep)) throw new Error('validação: entry fora do plugin');
  if (!fs.existsSync(entryPath)) throw new Error(`entry não encontrado: ${entry}`);

  const runId = `r${++RUN_SEQ}`;
  const rec = { chunks: [], done: false, code: null, listeners: new Set() };
  runs.set(runId, rec);

  // BASALT_VAULT: raiz do vault corrente — plugins que geram/leem tasks/ usam isso
  // (o cwd é a pasta do plugin, não o vault). BASALT_PLUGIN_DIR = a própria pasta.
  const env = {
    ...process.env,
    ...readEnvFile(name),
    BASALT_VAULT: config.VAULT,
    BASALT_PLUGIN_DIR: dir,
    ELECTRON_RUN_AS_NODE: '1',
  };
  let child;
  try {
    child = spawn(process.execPath, [entryPath], { cwd: dir, env, windowsHide: true });
  } catch (e) {
    rec.done = true; rec.code = -1; rec.chunks.push(`[erro] ${e.message}\n`);
    return runId;
  }
  const emit = (chunk, code) => {
    if (chunk != null) rec.chunks.push(chunk);
    rec.listeners.forEach((fn) => { try { fn(chunk, code); } catch (_) { /* noop */ } });
  };
  child.stdout.on('data', (d) => emit(d.toString()));
  child.stderr.on('data', (d) => emit(d.toString()));
  child.on('error', (e) => emit(`[erro] ${e.message}\n`));
  child.on('close', (code) => { rec.done = true; rec.code = code; emit(null, code); });

  // faxina: expira o registro 5 min após terminar
  child.on('close', () => setTimeout(() => runs.delete(runId), 5 * 60 * 1000));
  return runId;
}

function getRun(runId) { return runs.get(runId) || null; }

module.exports = {
  pluginsDir, dirOf, list, iconPath,
  readEnvFile, writeEnvFile, readManifest,
  install, remove, ensureVaultGitignore,
  startRun, getRun,
};
