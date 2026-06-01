// validate.js — contrato de dados de uma tarefa (frontmatter de .md).
// Funções PURAS: validação de input e geração de id/slug. Sem I/O, sem libs
// externas. O backend (server/index.js) importa { validateTask, genId }.
//
// "schema" = config/schema.json. Campos de schema.derived (GUT,
// prioridade_gute, gute_computed_at) são escritos pelo watcher — NÃO são
// validados aqui e, se vierem no data, são ignorados (não geram erro).

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

// Vazio = ausente, null, ou string só com espaços. Number 0 NÃO é vazio.
function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

// Inteiro de verdade: aceita number inteiro, ou string numérica inteira
// (frontmatter pode vir como string dependendo do parser). Rejeita float,
// NaN, Infinity, "3.5", "abc", "".
function asInteger(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    // Só dígitos com sinal opcional — evita aceitar "3px" ou "3.0".
    if (!/^[+-]?\d+$/.test(trimmed)) return null;
    const n = Number(trimmed);
    return Number.isInteger(n) ? n : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// validateTask(data, schema) -> { ok, errors }
// ---------------------------------------------------------------------------

/**
 * Valida o frontmatter `data` contra `schema.properties`.
 * - required + vazio  → "o campo X é obrigatório".
 * - int               → precisa ser inteiro; respeita min/max.
 * - enum              → se presente, precisa estar em options.
 * - string            → coerção simples; só erro se required e vazio.
 * Campos em schema.derived são ignorados (responsabilidade do watcher).
 * Retorna { ok: boolean, errors: string[] } — mensagens em PT-BR.
 */
function validateTask(data, schema) {
  const errors = [];
  const input = data && typeof data === 'object' ? data : {};
  const properties = (schema && schema.properties) || {};

  for (const [name, spec] of Object.entries(properties)) {
    const label = (spec && spec.label) || name;
    const value = input[name];
    const empty = isEmpty(value);

    // Obrigatoriedade vale para qualquer tipo.
    if (spec && spec.required && empty) {
      errors.push(`o campo "${label}" é obrigatório`);
      continue; // sem valor não há o que validar adiante
    }

    // Campo opcional e vazio → nada a checar.
    if (empty) continue;

    const type = spec && spec.type;

    if (type === 'int') {
      const n = asInteger(value);
      if (n === null) {
        errors.push(`o campo "${label}" deve ser um número inteiro`);
        continue;
      }
      if (typeof spec.min === 'number' && n < spec.min) {
        errors.push(`o campo "${label}" deve ser no mínimo ${spec.min} (recebido ${n})`);
      }
      if (typeof spec.max === 'number' && n > spec.max) {
        errors.push(`o campo "${label}" deve ser no máximo ${spec.max} (recebido ${n})`);
      }
    } else if (type === 'enum') {
      const options = Array.isArray(spec.options) ? spec.options : [];
      if (!options.includes(value)) {
        errors.push(
          `o campo "${label}" deve ser um de: ${options.join(', ')} (recebido "${value}")`
        );
      }
    } else if (type === 'string') {
      // Coerção simples: já garantimos "não vazio" acima. Nada mais a checar.
    }
    // Tipos desconhecidos são tolerados (não geram erro) — schema é a fonte.
  }

  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// genId(data, schema) -> string
// ---------------------------------------------------------------------------

// Formata a data atual como YYYY-MM-DD (horário local).
function today() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * slugify(text, maxLen)
 *  - minúsculas
 *  - remove acentos (decomposição Unicode NFD + corte de diacríticos)
 *  - troca qualquer coisa fora de [a-z0-9] por "-"
 *  - colapsa "-" repetido
 *  - corta em maxLen e remove "-" das pontas
 */
function slugify(text, maxLen) {
  const limit = Number.isInteger(maxLen) && maxLen > 0 ? maxLen : 60;
  let slug = String(text == null ? '' : text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // tudo que não é letra/dígito vira "-"
    .replace(/-+/g, '-'); // colapsa "-" repetido

  // Corta antes de remover as pontas, para não terminar com "-" pendurado.
  if (slug.length > limit) slug = slug.slice(0, limit);

  slug = slug.replace(/^-+/, '').replace(/-+$/, ''); // remove "-" das pontas
  return slug;
}

/**
 * genId(data, schema) -> "<idPrefix><YYYY-MM-DD>-<slug>"
 * O slug vem de data[schema.idFrom] (ex: titulo). Se vazio, usa "tarefa".
 * A data é sempre a data atual (não é o id de uma task antiga).
 */
function genId(data, schema) {
  const prefix = (schema && schema.idPrefix) || '';
  const idFrom = (schema && schema.idFrom) || 'titulo';
  const source = data ? data[idFrom] : undefined;

  let slug = slugify(source, 60);
  if (slug === '') slug = 'tarefa';

  return `${prefix}${today()}-${slug}`;
}

module.exports = { validateTask, genId };
