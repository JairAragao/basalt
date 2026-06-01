// config.js — carrega/valida os 3 arquivos de config e DERIVA as colunas do board
// e as opções de status a partir de board.statusGroups (fonte da verdade do status).
// Recarregável: config.reload() relê os arquivos (usado após edição via API),
// sem reiniciar o servidor. Consumidores devem usar config.X (não destruturar).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_DIR = path.join(ROOT, 'config');
const TASKS_DIR = path.join(ROOT, 'tasks');

function readJson(file) {
  const full = path.join(CONFIG_DIR, file);
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
  if (!Array.isArray(schema.derived)) throw new Error('config inválida: schema.derived deve ser um array');
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

function validateGute(gute) {
  if (!('inputs' in gute) || !Array.isArray(gute.inputs)) throw new Error('config inválida: gute.inputs ausente ou não é array');
  if (!('derived' in gute) || !isPlainObject(gute.derived)) throw new Error('config inválida: gute.derived ausente ou não é objeto');
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

const configObj = { ROOT, TASKS_DIR, schema: null, board: null, gute: null };

function load() {
  const schema = readJson('schema.json');
  const board = readJson('board.json');
  const gute = readJson('gute.json');

  validateSchema(schema);
  validateBoard(board);
  validateGute(gute);

  // Derivados: colunas planas + opções de status vêm de statusGroups.
  board.columns = deriveColumns(board);
  if (schema.properties && schema.properties.status) {
    schema.properties.status.options = deriveStatusOptions(board);
  }

  // Normaliza board.filters: sempre um array de strings (props do schema).
  // A validação de que cada filtro referencia uma propriedade existente fica na
  // rota PUT /api/board/filters (precisa do schema vivo no momento da escrita).
  board.filters = Array.isArray(board.filters)
    ? board.filters.filter((f) => typeof f === 'string' && f.trim() !== '')
    : [];

  configObj.schema = schema;
  configObj.board = board;
  configObj.gute = gute;
}

load();

configObj.reload = load;
module.exports = configObj;
