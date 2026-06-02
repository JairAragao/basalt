// formula.js — MOTOR DE FÓRMULA GENÉRICO. Generaliza o antigo gute.js.
// Avalia, para CADA propriedade do schema com type==='formula', a sua
// `expression` sobre as props NUMÉRICAS presentes em `data` (whitelist).
// Sem I/O, sem Date, sem dependência do watcher. Testável isolado.
//
// compute(data, schema) -> { [formulaKey]: number|null }
//   - escopo = só as props numéricas finitas presentes em `data` (whitelist).
//   - se alguma variável usada na expressão faltar/não-numérica → resultado null.
//   - divisão por zero / Infinity / NaN → null.
//   - arredonda por spec.round (default 2).
//
// Aceita também o formato LEGADO de gute.json ({ inputs, derived, round }) para
// retrocompatibilidade dos testes/consumidores antigos. Quando recebe um schema
// "de verdade" (com .properties), usa as propriedades type 'formula'.

const { Parser } = require('expr-eval-fork');

const parser = new Parser();
// IMPORTANTE: expr-eval reserva `E` (Euler) e `PI` como constantes — isso
// SHADOWa um campo chamado `E` (Esforço): "G*U*T/E" viraria G*U*T/2.718. Limpar
// as constantes built-in faz E/PI serem tratados como variáveis do escopo
// whitelisted (nomes de campo), nunca como constantes matemáticas.
parser.consts = {};

// Cache de expressões compiladas por string, para não re-parsear a cada task.
const exprCache = new Map();

function getExpr(exprStr) {
  if (typeof exprStr !== 'string' || exprStr.trim() === '') return null;
  let compiled = exprCache.get(exprStr);
  if (compiled === undefined) {
    try {
      compiled = parser.parse(exprStr);
    } catch {
      compiled = null; // expressão malformada → memoiza null
    }
    exprCache.set(exprStr, compiled);
  }
  return compiled;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function roundTo(value, digits) {
  // digits default 2; só arredonda se for inteiro válido.
  const d = Number.isInteger(digits) ? digits : 2;
  const factor = Math.pow(10, d);
  return Math.round(value * factor) / factor;
}

// Extrai a lista de [chave, spec] das propriedades type 'formula' do schema.
// Suporta o schema novo ({ properties }) e o formato legado ({ inputs, derived }).
function formulaSpecs(schema) {
  const out = [];
  if (schema && schema.properties && typeof schema.properties === 'object') {
    for (const [key, spec] of Object.entries(schema.properties)) {
      if (spec && spec.type === 'formula' && typeof spec.expression === 'string') {
        out.push([key, { expression: spec.expression, round: spec.round }]);
      }
    }
    return out;
  }
  // Legado: gute.json { derived: { nome: "expr" }, round }.
  if (schema && schema.derived && typeof schema.derived === 'object' && !Array.isArray(schema.derived)) {
    for (const [key, expr] of Object.entries(schema.derived)) {
      out.push([key, { expression: expr, round: schema.round }]);
    }
  }
  return out;
}

// Monta o escopo de avaliação: só as props NUMÉRICAS finitas presentes em data.
function numericScope(data) {
  const scope = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (isNum(v)) scope[k] = v;
    }
  }
  return scope;
}

/**
 * compute(data, schema)
 *  - data: frontmatter da task.
 *  - schema: config.schema (props type 'formula') ou legado gute.json.
 * Retorna { [formulaKey]: number|null }.
 */
function compute(data, schema) {
  const scope = numericScope(data);
  const specs = formulaSpecs(schema);

  const out = {};
  for (const [key, spec] of specs) {
    out[key] = evalFormula(spec.expression, scope, spec.round);
  }
  return out;
}

function evalFormula(exprStr, scope, round) {
  const expr = getExpr(exprStr);
  if (!expr) return null;

  // Toda variável usada precisa existir no escopo whitelisted (numérico).
  // Se faltar (ex.: G ausente / não-numérica), o resultado é null.
  let usedVars;
  try {
    usedVars = expr.variables();
  } catch {
    return null;
  }
  for (const v of usedVars) {
    if (!Object.prototype.hasOwnProperty.call(scope, v)) return null;
  }

  let result;
  try {
    result = expr.evaluate(scope);
  } catch {
    return null;
  }

  // Protege contra divisão por zero / Infinity / NaN.
  if (!isNum(result)) return null;
  return roundTo(result, round);
}

module.exports = { compute, formulaSpecs };
