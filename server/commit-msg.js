// commit-msg.js — gera a mensagem de commit AUTOMÁTICA que descreve a mudança
// em uma tarefa, comparando o frontmatter ANTES vs DEPOIS. Função PURA, sem I/O.
//
// describeChanges(oldData, newData, kind, id) -> string
//
//   kind:
//     'create'  → "task <id>: criada — <titulo>"
//     'move'    → "task <id>: status <de>→<para>"
//     'delete'  → "task <id>: removida — <titulo>"
//     'update'  → "task <id>: <campo old→new>; <campo +adicionado>; <campo -removido>"
//
// Para 'update' compara campo a campo (old vs new). Cita prioridade_gute quando
// mudar (é útil no histórico), mesmo sendo derivado. Campos sem mudança são
// omitidos. Se nada mudou, devolve "task <id>: sem alterações".

// Representação textual de um valor para a mensagem. null/undefined/'' viram '∅'.
function fmt(value) {
  if (value === undefined || value === null) return '∅';
  if (typeof value === 'string') {
    const t = value.trim();
    return t === '' ? '∅' : t;
  }
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// "vazio" para fins de adicionado/removido: ausente, null ou string só-espaços.
function isAbsent(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

// Igualdade tolerante: compara pela representação canônica (cobre "3" vs 3 do
// frontmatter e ordena nada — valores de tarefa são escalares/strings).
function sameValue(a, b) {
  if (a === b) return true;
  if (isAbsent(a) && isAbsent(b)) return true;
  return fmt(a) === fmt(b);
}

// Lista os campos que diferem entre oldData e newData -> array de strings.
// - mudou:     "campo old→new"
// - adicionou: "campo +valor"
// - removeu:   "campo -valor"
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
      parts.push(`${k} +${fmt(nv)}`);
    } else if (!oAbsent && nAbsent) {
      parts.push(`${k} -${fmt(ov)}`);
    } else {
      parts.push(`${k} ${fmt(ov)}→${fmt(nv)}`);
    }
  }
  return parts;
}

function titleOf(data) {
  const d = data && typeof data === 'object' ? data : {};
  const t = d.titulo;
  return isAbsent(t) ? '(sem título)' : String(t).trim();
}

function describeChanges(oldData, newData, kind, id) {
  const tag = `task ${id}`;

  switch (kind) {
    case 'create':
      return `${tag}: criada — ${titleOf(newData)}`;

    case 'delete':
      return `${tag}: removida — ${titleOf(oldData)}`;

    case 'move': {
      const de = fmt(oldData && oldData.status);
      const para = fmt(newData && newData.status);
      return `${tag}: status ${de}→${para}`;
    }

    case 'update':
    default: {
      const parts = diffFields(oldData, newData);
      if (!parts.length) return `${tag}: sem alterações`;
      return `${tag}: ${parts.join('; ')}`;
    }
  }
}

module.exports = { describeChanges, diffFields };
