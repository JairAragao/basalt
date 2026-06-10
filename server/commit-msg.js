// commit-msg.js — gera a mensagem de commit AUTOMÁTICA que descreve a mudança
// em uma tarefa, comparando o frontmatter ANTES vs DEPOIS. Função PURA, sem I/O.
//
// describeChanges(oldData, newData, kind, id, titleKey, opts) -> string
//
//   'create' → Criou "<título curto>"
//   'delete' → Removeu "<título curto>"
//   'move' / 'update' → SÓ o que mudou, por extenso:
//     status alterado de "A fazer" para "Pausado"; tipo definido como "Bug";
//     responsável removido (era "Leo"); conteúdo atualizado
//
// A mensagem NÃO repete o título da tarefa (título grande afoga o que mudou);
// a tarefa é identificada pelo arquivo do commit (git log -- <arquivo>) — é
// assim que o histórico do card busca as entradas dela.
//
// opts.bodyChanged: o corpo markdown mudou (o diff aqui só vê o frontmatter).

const MAX_VALUE = 60; // valor citado na mensagem
const MAX_TITLE = 40; // título citado em create/delete

function clip(text, max) {
  const t = String(text).trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

// Representação canônica SEM truncar — só pra comparar (cobre "3" vs 3 do
// frontmatter; truncar aqui faria valores longos parecerem iguais).
function canon(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value).trim();
}

// Representação pra EXIBIR na mensagem (truncada).
function fmt(value) {
  if (Array.isArray(value)) return clip(value.join(', '), MAX_VALUE);
  if (value !== null && typeof value === 'object') return clip(canon(value), MAX_VALUE);
  return clip(String(value), MAX_VALUE);
}

// "vazio" para fins de definido/removido: ausente, null ou string só-espaços.
function isAbsent(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function sameValue(a, b) {
  if (a === b) return true;
  if (isAbsent(a) && isAbsent(b)) return true;
  return canon(a) === canon(b);
}

// Lista as mudanças entre oldData e newData -> array de frases.
// - mudou:     `campo alterado de "old" para "new"`
// - adicionou: `campo definido como "new"`
// - removeu:   `campo removido (era "old")`
function diffFields(oldData, newData) {
  const o = oldData && typeof oldData === 'object' ? oldData : {};
  const n = newData && typeof newData === 'object' ? newData : {};
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  keys.delete('id'); // id não é "campo de conteúdo"
  // auditoria/carimbo mudam a cada edição — não poluem a mensagem.
  for (const k of ['created_at', 'created_by', 'updated_at', 'updated_by', 'computed_at']) keys.delete(k);

  const parts = [];
  for (const k of keys) {
    const ov = o[k];
    const nv = n[k];
    if (sameValue(ov, nv)) continue;

    const oAbsent = isAbsent(ov);
    const nAbsent = isAbsent(nv);
    if (oAbsent && !nAbsent) {
      parts.push(`${k} definido como "${fmt(nv)}"`);
    } else if (!oAbsent && nAbsent) {
      parts.push(`${k} removido (era "${fmt(ov)}")`);
    } else {
      parts.push(`${k} alterado de "${fmt(ov)}" para "${fmt(nv)}"`);
    }
  }
  return parts;
}

function titleOf(data, titleKey) {
  const d = data && typeof data === 'object' ? data : {};
  // engine genérico: a chave do título vem do board (card.title), não é fixa.
  const t = d[titleKey || 'titulo'];
  return isAbsent(t) ? '(sem título)' : clip(t, MAX_TITLE);
}

function describeChanges(oldData, newData, kind, id, titleKey, opts = {}) {
  switch (kind) {
    case 'create':
      return `Criou "${titleOf(newData || oldData, titleKey)}"`;

    case 'delete':
      return `Removeu "${titleOf(oldData || newData, titleKey)}"`;

    // move é só um update de status — mesma frase descritiva.
    case 'move':
    case 'update':
    default: {
      const parts = diffFields(oldData, newData);
      if (opts.bodyChanged) parts.push('conteúdo atualizado');
      if (!parts.length) return 'Sem alterações';
      return parts.join('; ');
    }
  }
}

module.exports = { describeChanges, diffFields };
