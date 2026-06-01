// Client REST do orchestra-tasks. Consome SÓ o contrato definido pelo backend.
// Base /api. Em dev o Vite faz proxy pra http://localhost:3001.

const BASE = '/api'

/**
 * Faz a request e trata erro lendo { error } do corpo quando houver.
 * @param {string} url
 * @param {RequestInit} [options]
 */
async function request(url, options = {}) {
  let res
  try {
    res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    })
  } catch (networkErr) {
    throw new Error('Falha de rede ao acessar a API. Verifique se o servidor está no ar.')
  }

  // DELETE pode vir sem corpo (204) — tenta ler JSON, mas não falha se vazio.
  let payload = null
  const text = await res.text()
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch (e) {
      payload = null
    }
  }

  if (!res.ok) {
    const msg = (payload && payload.error) || `Erro ${res.status} na requisição.`
    throw new Error(msg)
  }

  return payload
}

export function getConfig() {
  return request(`${BASE}/config`)
}

export function listTasks() {
  return request(`${BASE}/tasks`)
}

export function getTask(id) {
  return request(`${BASE}/tasks/${encodeURIComponent(id)}`)
}

export function createTask(payload) {
  return request(`${BASE}/tasks`, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
}

export function updateTask(id, payload) {
  return request(`${BASE}/tasks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function moveTask(id, status) {
  return request(`${BASE}/tasks/${encodeURIComponent(id)}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  })
}

export function deleteTask(id) {
  return request(`${BASE}/tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  })
}

// --- Vault (pasta config/ + tasks/ + git próprio) ---
// { path, exists, hasConfig, hasTasks, hasGit, needsSetup }
export function getVault() {
  return request(`${BASE}/vault`)
}

// Define/cria o vault no caminho informado. Semeia config/tasks e git init se faltar.
// path: string não-vazia. Retorna o status do vault + { schema, board, gute? } ou erro 400.
export function setVault(path) {
  return request(`${BASE}/vault`, {
    method: 'POST',
    body: JSON.stringify({ path })
  })
}

// --- Saúde do git / setup ---
// { ok, hasRepo, branch, user, hasRemote, remoteUrl, checks:[{id,label,ok,detail,fix}] }
export function getHealthGit() {
  return request(`${BASE}/health/git`)
}

// Pull sob demanda (git pull --ff-only) -> { ok, message?, error? }
export function syncPull() {
  return request(`${BASE}/sync/pull`, { method: 'POST' })
}

// --- Histórico / diff de uma tarefa ---
// [{ hash, shortHash, date, author, message }]
export function getHistory(id) {
  return request(`${BASE}/tasks/${encodeURIComponent(id)}/history`)
}

// { commit:{...}, before, after, diff }
export function getDiff(id, hash) {
  return request(`${BASE}/tasks/${encodeURIComponent(id)}/diff?hash=${encodeURIComponent(hash)}`)
}

// --- Filtros do board ---
// filters: [string] (nomes de propriedades do schema)
export function saveFilters(filters) {
  return request(`${BASE}/board/filters`, {
    method: 'PUT',
    body: JSON.stringify({ filters })
  })
}

// Config do cartão — o que aparece na face (fields) + subtitle/badge.
export function saveCard(card) {
  return request(`${BASE}/board/card`, { method: 'PUT', body: JSON.stringify(card) })
}

// Config de status (grupos/etapas) — leitura e escrita (migra tarefas em rename).
export function getBoard() {
  return request(`${BASE}/board`)
}

export function saveStatus(payload) {
  return request(`${BASE}/board/status`, { method: 'PUT', body: JSON.stringify(payload) })
}

// Editor de propriedades — add/remove/rename (migra todos os cartões).
// Aceita { properties, renames, optionRenames? }. Só envia optionRenames quando houver.
export function saveProperties(payload) {
  const body = { properties: payload.properties, renames: payload.renames || [] };
  if (Array.isArray(payload.optionRenames) && payload.optionRenames.length) {
    body.optionRenames = payload.optionRenames;
  }
  return request(`${BASE}/schema/properties`, { method: 'PUT', body: JSON.stringify(body) })
}

export default {
  getConfig,
  getBoard,
  saveStatus,
  saveProperties,
  saveFilters,
  saveCard,
  listTasks,
  getTask,
  createTask,
  updateTask,
  moveTask,
  deleteTask,
  getVault,
  setVault,
  getHealthGit,
  syncPull,
  getHistory,
  getDiff
}
