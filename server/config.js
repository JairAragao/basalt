// config.js — resolve o VAULT (pasta com config/ + tasks/ + git próprio),
// carrega/valida os arquivos de config e DERIVA colunas do board, opções de
// status (de board.statusGroups) e a lista de derivados (chaves de props
// type 'formula' + o stamp 'computed_at').
//
// VAULT (path absoluto) é resolvido por prioridade:
//   (1) setting persistido em ~/.basalt/settings.json { "vaultPath": "..." }
//   (2) env BASALT_VAULT
//   (3) ~/.basalt/default-vault (fallback GRAVÁVEL — não a raiz do app, que no
//       app empacotado é o app.asar read-only)
//
// Expõe: config.VAULT, config.CONFIG_DIR (=VAULT/config), config.TASKS_DIR
// (=VAULT/tasks), config.ROOT (=appRoot, fonte dos defaults/seed), reload(),
// vaultStatus(), setVault(path).
//
// Recarregável: config.reload() relê a partir do VAULT corrente sem reiniciar.
// Consumidores devem usar config.X (não destruturar valores mutáveis).

const fs = require('fs');
const os = require('os');
const path = require('path');

const { execFileSync } = require('child_process');

// Raiz do app (pasta acima de server/) — é onde vivem os DEFAULTS de config/.
const ROOT = path.resolve(__dirname, '..');
const DEFAULTS_DIR = path.join(ROOT, 'defaults'); // <appRoot>/defaults — template de seed (NÃO é o config/ do vault, que são dados)

// Settings persistidos do usuário (escolha de vault).
const SETTINGS_DIR = path.join(os.homedir(), '.basalt');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');
// Vault default (fallback) — pasta GRAVÁVEL em ~/.basalt (NÃO a raiz do app, que
// no app empacotado é o app.asar read-only). Semeado do template `defaults/`.
const DEFAULT_VAULT = path.join(SETTINGS_DIR, 'default-vault');

// ── Settings (~/.basalt/settings.json) ───────────────────────────────────────
function readSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

function writeSettings(obj) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  const tmp = SETTINGS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, SETTINGS_FILE);
}

// ── Notificações (LOCAL por máquina, NÃO versionadas) ────────────────────────
// Notificações são pessoais (quem foi citado como responsável numa mudança que
// chegou no pull). Ficam em ~/.basalt/notifications.json, indexadas por vault.
const NOTIF_FILE = path.join(SETTINGS_DIR, 'notifications.json');
function readNotifStore() {
  try {
    const obj = JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8'));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}
function writeNotifStore(obj) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  const tmp = NOTIF_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, NOTIF_FILE);
}

// ── Resolução do VAULT ───────────────────────────────────────────────────────
// Prioridade: setting persistido > env BASALT_VAULT > DEFAULT_VAULT (gravável).
function resolveVault() {
  const settings = readSettings();
  const fromSetting = settings && typeof settings.vaultPath === 'string' ? settings.vaultPath.trim() : '';
  if (fromSetting) return path.resolve(fromSetting);

  const fromEnv = typeof process.env.BASALT_VAULT === 'string' ? process.env.BASALT_VAULT.trim() : '';
  if (fromEnv) return path.resolve(fromEnv);

  return DEFAULT_VAULT;
}

// ── Leitura/validação de config ──────────────────────────────────────────────
function readJson(dir, file) {
  const full = path.join(dir, file);
  let raw;
  try {
    raw = fs.readFileSync(full, 'utf8');
  } catch (e) {
    throw new Error(`config inválida: não foi possível ler ${file} (${e.message})`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`config inválida: ${file} não é JSON válido (${e.message})`);
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function validateSchema(schema) {
  if (!isPlainObject(schema.properties)) throw new Error('config inválida: schema.properties deve ser um objeto');
  // schema.derived é DERIVADO por config (props formula + stamp). Não exigimos
  // mais um array fixo no arquivo — se vier, é ignorado/sobrescrito.
}

function validateBoard(board) {
  if (!Array.isArray(board.statusGroups) || board.statusGroups.length === 0) {
    throw new Error('config inválida: board.statusGroups deve ser um array não-vazio');
  }
  board.statusGroups.forEach((g) => {
    if (!g || !Array.isArray(g.stages) || g.stages.length === 0) {
      throw new Error(`config inválida: grupo "${(g && g.label) || '?'}" precisa de ao menos 1 etapa`);
    }
  });
}

// Carimbo genérico escrito pelo motor de fórmula (substitui o antigo gute_computed_at).
const STAMP_FIELD = 'computed_at';

// schema.derived = chaves de props type 'formula' + o stamp 'computed_at'.
function deriveDerived(schema) {
  const keys = [];
  const props = (schema && schema.properties) || {};
  for (const [k, spec] of Object.entries(props)) {
    if (spec && spec.type === 'formula') keys.push(k);
  }
  keys.push(STAMP_FIELD);
  return keys;
}

// Achata os grupos em colunas planas do board (o front consome board.columns).
function deriveColumns(board) {
  const cols = [];
  board.statusGroups.forEach((g) => {
    (g.stages || []).forEach((s) => {
      cols.push({
        id: s.id,
        label: s.label || s.id,
        color: s.color || '#6f6f6f',
        group: g.label,
        groupId: g.id,
      });
    });
  });
  return cols;
}

// Opções do enum "status" = ids das etapas, na ordem dos grupos.
function deriveStatusOptions(board) {
  const out = [];
  board.statusGroups.forEach((g) => (g.stages || []).forEach((s) => out.push(s.id)));
  return out;
}

// ── Seed: copia os DEFAULTS (<appRoot>/config/*.json) para VAULT/config ───────
// NÃO apaga nada existente. Cria VAULT/config e copia só os arquivos faltantes.
function seedVault(vault) {
  const configDir = path.join(vault, 'config');
  const tasksDir = path.join(vault, 'tasks');
  fs.mkdirSync(vault, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(tasksDir, { recursive: true });

  let defaults = [];
  try {
    defaults = fs.readdirSync(DEFAULTS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    defaults = [];
  }
  for (const f of defaults) {
    // gute.json não é mais necessário — não semeia (motor lê do schema).
    if (f === 'gute.json') continue;
    const dest = path.join(configDir, f);
    if (!fs.existsSync(dest)) {
      try {
        fs.copyFileSync(path.join(DEFAULTS_DIR, f), dest);
      } catch (e) {
        throw new Error(`falha ao semear ${f} no vault (${e.message})`);
      }
    }
  }
}

// git init no vault se não houver repo. Retorna { ok, error? } — nunca lança.
function gitInitVault(vault) {
  try {
    if (fs.existsSync(path.join(vault, '.git'))) return { ok: true };
    execFileSync('git', ['init'], { cwd: vault, stdio: 'ignore' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `não foi possível inicializar git no vault: ${e.message}` };
  }
}

// ── Status do vault (sem efeitos colaterais) ─────────────────────────────────
function statusOf(vault) {
  const configDir = path.join(vault, 'config');
  const tasksDir = path.join(vault, 'tasks');
  const exists = safeIsDir(vault);
  const hasConfig = safeIsFile(path.join(configDir, 'schema.json')) && safeIsFile(path.join(configDir, 'board.json'));
  const hasTasks = safeIsDir(tasksDir);
  const hasGit = safeIsDir(path.join(vault, '.git'));
  return {
    path: vault,
    exists,
    hasConfig,
    hasTasks,
    hasGit,
    needsSetup: !hasConfig,
    // true quando ainda no vault default/fallback (não escolhido pelo usuário) —
    // sinaliza "primeira run" pro SetupWizard.
    isDefault: vault === DEFAULT_VAULT,
  };
}

function safeIsDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function safeIsFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// ── Objeto de config exportado ───────────────────────────────────────────────
const configObj = {
  ROOT, // raiz do app (defaults/seed)
  STAMP_FIELD,
  VAULT: null,
  CONFIG_DIR: null,
  TASKS_DIR: null,
  schema: null,
  board: null,
  gute: null, // legado: pode ficar null se gute.json não existir
  users: [], // roster do time (config/users.json)
};

// Assinantes notificados quando o VAULT efetivo muda (ex.: watcher re-globa).
const _vaultListeners = [];

// load(): resolve o VAULT, semeia se faltar config, e relê tudo.
function load() {
  const prevVault = configObj.VAULT;
  const vault = resolveVault();

  // Se o vault corrente (incluindo o default = appRoot) não tiver config,
  // semeia a partir dos defaults. Para o default isso é no-op (já tem config).
  const configDir = path.join(vault, 'config');
  const haveConfig =
    safeIsFile(path.join(configDir, 'schema.json')) && safeIsFile(path.join(configDir, 'board.json'));
  if (!haveConfig) {
    // Só semeia se o appRoot tiver defaults legíveis; senão deixa o readJson
    // lançar com mensagem clara abaixo.
    try {
      seedVault(vault);
    } catch {
      /* segue — readJson dá o erro definitivo */
    }
  }

  const CONFIG_DIR = path.join(vault, 'config');
  const TASKS_DIR = path.join(vault, 'tasks');
  // Garante a pasta de tarefas (o engine não versiona tasks/ — é criada aqui).
  try { fs.mkdirSync(TASKS_DIR, { recursive: true }); } catch { /* noop */ }

  const schema = readJson(CONFIG_DIR, 'schema.json');
  const board = readJson(CONFIG_DIR, 'board.json');

  // gute.json é OPCIONAL agora (legado). Não quebra se faltar.
  let gute = null;
  try {
    gute = readJson(CONFIG_DIR, 'gute.json');
  } catch {
    gute = null;
  }

  // users.json — roster do time (id estável → nome visível + identidades git).
  // OPCIONAL: vault sem o arquivo => roster vazio (auto-cadastro o cria).
  let users = [];
  try {
    const arr = readJson(CONFIG_DIR, 'users.json');
    users = Array.isArray(arr) ? arr.filter((u) => u && typeof u === 'object' && u.id) : [];
  } catch {
    users = [];
  }

  validateSchema(schema);
  validateBoard(board);

  // Derivados: colunas planas + opções de status vêm de statusGroups.
  board.columns = deriveColumns(board);
  if (schema.properties && schema.properties.status) {
    schema.properties.status.options = deriveStatusOptions(board);
  }

  // schema.derived é DERIVADO (props formula + stamp), sobrescreve qualquer array fixo.
  schema.derived = deriveDerived(schema);

  // Normaliza board.filters: sempre um array de strings (props do schema).
  board.filters = Array.isArray(board.filters)
    ? board.filters.filter((f) => typeof f === 'string' && f.trim() !== '')
    : [];

  // ── Normalização defensiva ──────────────────────────────────────────────
  // O engine é genérico: config/dados específicos de um vault (ou refs órfãs a
  // propriedades removidas) NÃO podem quebrar o sistema. Aqui o config viva é
  // saneado em memória; o arquivo em disco se auto-cura no próximo save.
  //
  // 1) Campos de auditoria são gerenciados pelo engine (tasks-repo carimba):
  //    garante system+auto (read-only no editor) mesmo se o vault não declarou.
  const AUDIT_FIELDS = ['created_at', 'created_by', 'updated_at', 'updated_by'];
  for (const k of AUDIT_FIELDS) {
    if (schema.properties && schema.properties[k]) {
      schema.properties[k].system = true;
      schema.properties[k].auto = true;
    }
  }

  // 2) Poda refs órfãs do board (propriedade removida/renomeada) — nenhum
  //    consumidor (front/save) deve travar por uma chave que não existe mais.
  const propKeys = new Set(Object.keys(schema.properties || {}));
  const derivedKeys = new Set(Array.isArray(schema.derived) ? schema.derived : []);
  const knownKey = (k) => propKeys.has(k) || derivedKeys.has(k);
  if (board.card && typeof board.card === 'object') {
    if (Array.isArray(board.card.fields)) {
      board.card.fields = board.card.fields.filter((k) => typeof k === 'string' && knownKey(k));
    }
    if (board.card.subtitle && !knownKey(board.card.subtitle)) board.card.subtitle = undefined;
    if (board.card.badge && !knownKey(board.card.badge)) board.card.badge = undefined;
  }
  board.filters = board.filters.filter((k) => knownKey(k));
  if (board.sort && board.sort.by && !knownKey(board.sort.by)) {
    board.sort.by = propKeys.has('status') ? 'status' : (Object.keys(schema.properties || {})[0] || 'status');
  }

  configObj.VAULT = vault;
  configObj.CONFIG_DIR = CONFIG_DIR;
  configObj.TASKS_DIR = TASKS_DIR;
  configObj.schema = schema;
  configObj.board = board;
  configObj.gute = gute;
  configObj.users = users;

  // Notifica assinantes se a pasta do vault MUDOU (não em reload no mesmo vault).
  if (prevVault && prevVault !== vault) {
    for (const fn of _vaultListeners) {
      try {
        fn({ from: prevVault, to: vault, TASKS_DIR });
      } catch (e) {
        console.warn('[config] listener de vault falhou:', e.message);
      }
    }
  }
}

load();

// onVaultChange(fn): registra um callback chamado quando o VAULT efetivo troca.
// fn recebe { from, to, TASKS_DIR }. Usado pelo watcher para re-observar.
configObj.onVaultChange = function onVaultChange(fn) {
  if (typeof fn === 'function') _vaultListeners.push(fn);
};

// reload(): relê a partir do VAULT corrente.
configObj.reload = load;

// vaultStatus(): status do VAULT corrente (path, exists, hasConfig, hasTasks,
// hasGit, needsSetup). Sem efeitos colaterais.
configObj.vaultStatus = function vaultStatus() {
  return statusOf(configObj.VAULT || resolveVault());
};

// setVault(p): valida e adota um novo vault.
//   - p: string não-vazia (path do vault).
//   - cria config/tasks via seed (sem apagar nada existente) e git init se faltar.
//   - persiste em ~/.basalt/settings.json e faz reload().
// Retorna { status, git } onde status é o vaultStatus() pós-setup. Lança Error
// (mensagem PT-BR) em path inválido — a rota traduz em 400.
configObj.setVault = function setVault(p) {
  if (typeof p !== 'string' || p.trim() === '') {
    throw new Error('vault inválido: informe um caminho não-vazio');
  }
  const vault = path.resolve(p.trim());

  // Se o path existe e NÃO é diretório → erro.
  if (fs.existsSync(vault) && !safeIsDir(vault)) {
    throw new Error(`vault inválido: "${vault}" existe e não é uma pasta`);
  }

  // Cria/seed config + tasks (não apaga nada existente).
  seedVault(vault);

  // git init se faltar (best-effort; não derruba o setup).
  const gitResult = gitInitVault(vault);

  // Persiste a escolha e recarrega a config a partir do novo vault.
  const settings = readSettings();
  settings.vaultPath = vault;
  // Registra na lista de vaults (abas), sem duplicar.
  const vaults = Array.isArray(settings.vaults) ? settings.vaults.filter((v) => typeof v === 'string') : [];
  if (!vaults.includes(vault)) vaults.push(vault);
  settings.vaults = vaults;
  writeSettings(settings);

  load();

  return { status: statusOf(configObj.VAULT), git: gitResult };
};

// listVaults(): vaults configurados (abas) + o ativo. Migração: se a lista estiver
// vazia mas houver um vault ativo não-default, trata-o como a única aba.
configObj.listVaults = function listVaults() {
  const settings = readSettings();
  let vaults = Array.isArray(settings.vaults) ? settings.vaults.filter((v) => typeof v === 'string') : [];
  const active = configObj.VAULT;
  if (!vaults.length && active && active !== DEFAULT_VAULT) vaults = [active];
  return {
    active,
    vaults: vaults.map((p) => ({ ...statusOf(p), name: path.basename(p) })),
  };
};

// removeVault(p): tira um vault da lista (NÃO apaga a pasta). Se era o ativo, troca
// pro primeiro restante; se a lista esvaziar, volta ao default (app-root).
configObj.removeVault = function removeVault(p) {
  const target = path.resolve((p || '').trim());
  const settings = readSettings();
  const vaults = (Array.isArray(settings.vaults) ? settings.vaults : [])
    .filter((v) => typeof v === 'string' && path.resolve(v) !== target);
  settings.vaults = vaults;
  if (configObj.VAULT === target) {
    if (vaults.length) settings.vaultPath = vaults[0];
    else delete settings.vaultPath;
    writeSettings(settings);
    load();
  } else {
    writeSettings(settings);
  }
  return configObj.listVaults();
};

// clearVault(): volta ao default (remove vaultPath do settings). Util/teste.
configObj.clearVault = function clearVault() {
  const settings = readSettings();
  delete settings.vaultPath;
  writeSettings(settings);
  load();
  return statusOf(configObj.VAULT);
};

// ── Roster (config/users.json no vault) ──────────────────────────────────────
configObj.usersFile = function usersFile() {
  return path.join(configObj.CONFIG_DIR, 'users.json');
};
// writeUsers(arr): grava o roster (atômico) e recarrega config. NÃO commita
// (a rota commita o arquivo, mantendo o histórico no git como o resto).
configObj.writeUsers = function writeUsers(arr) {
  const list = Array.isArray(arr) ? arr.filter((u) => u && typeof u === 'object' && u.id) : [];
  const file = configObj.usersFile();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
  load();
  return configObj.users;
};

// ── Notificações locais (por vault) ──────────────────────────────────────────
configObj.getNotifications = function getNotifications(vault) {
  const all = readNotifStore();
  const key = vault || configObj.VAULT;
  return Array.isArray(all[key]) ? all[key] : [];
};
// addNotifications(items): prepend (mais novas primeiro), dedup por id, cap 200.
configObj.addNotifications = function addNotifications(items) {
  const incoming = (Array.isArray(items) ? items : []).filter(Boolean);
  if (!incoming.length) return configObj.getNotifications();
  const all = readNotifStore();
  const key = configObj.VAULT;
  const existing = Array.isArray(all[key]) ? all[key] : [];
  const seen = new Set(existing.map((n) => n.id));
  const fresh = incoming.filter((n) => n.id && !seen.has(n.id));
  all[key] = [...fresh, ...existing].slice(0, 200);
  writeNotifStore(all);
  return all[key];
};
// clearNotifications(id?): apaga uma (id) ou todas (sem id) do vault corrente.
configObj.clearNotifications = function clearNotifications(id) {
  const all = readNotifStore();
  const key = configObj.VAULT;
  if (id) {
    all[key] = (Array.isArray(all[key]) ? all[key] : []).filter((n) => n.id !== id);
  } else {
    all[key] = [];
  }
  writeNotifStore(all);
  return all[key];
};

module.exports = configObj;
