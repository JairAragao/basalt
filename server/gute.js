// gute.js — cálculo PURO da matriz GUT (Gravidade x Urgência x Tendência) e
// prioridade ponderada por Esforço. Sem I/O, sem Date, sem dependência do
// watcher. Testável isolado.

const { Parser } = require('expr-eval');

const parser = new Parser();
// expr-eval reserva `E` (Euler) e `PI` como constantes — isso SHADOWa nosso input
// `E` (Esforço): "G*U*T/E" virava G*U*T/2.718 = 22.07 em vez de /Esforço. Limpar as
// constantes built-in faz E/PI serem tratados como variáveis do escopo whitelisted.
parser.consts = {};

// Cache de expressões compiladas por string, para não re-parsear a cada task.
const exprCache = new Map();

function getExpr(exprStr) {
  let compiled = exprCache.get(exprStr);
  if (!compiled) {
    compiled = parser.parse(exprStr);
    exprCache.set(exprStr, compiled);
  }
  return compiled;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function roundTo(value, digits) {
  // digits pode vir undefined; nesse caso não arredonda.
  if (!Number.isInteger(digits)) return value;
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

/**
 * compute(data, guteConfig)
 *  - data: frontmatter da task (objeto com possíveis G/U/T/E numéricos).
 *  - guteConfig: { inputs: string[], derived: {nome: expr}, round, ... }.
 * Retorna { GUT, prioridade_gute } com null quando algum input necessário
 * faltar/não-numérico, ou quando E ausente/zero (evita divisão por zero).
 *
 * Whitelist: apenas as variáveis declaradas em guteConfig.inputs entram no
 * escopo do avaliador — nunca eval livre sobre o objeto inteiro.
 */
function compute(data, guteConfig) {
  const inputs = Array.isArray(guteConfig.inputs) ? guteConfig.inputs : [];
  const derived = guteConfig.derived || {};
  const round = guteConfig.round;

  // Monta escopo só com inputs numéricos válidos (whitelist).
  const scope = {};
  for (const name of inputs) {
    const val = data ? data[name] : undefined;
    if (isNum(val)) scope[name] = val;
  }

  const out = {};
  for (const [outName, exprStr] of Object.entries(derived)) {
    out[outName] = evalDerived(outName, exprStr, scope, round);
  }

  // Garante presença das chaves esperadas mesmo se a config não as listar.
  if (!('GUT' in out)) out.GUT = null;
  if (!('prioridade_gute' in out)) out.prioridade_gute = null;
  return out;
}

function evalDerived(outName, exprStr, scope, round) {
  let expr;
  try {
    expr = getExpr(exprStr);
  } catch {
    // Expressão malformada na config → derivado nulo (defensivo).
    return null;
  }

  // Toda variável da expressão precisa existir no escopo whitelisted.
  // Se faltar (ex.: G ausente), o derivado que depende dela é null.
  const usedVars = expr.variables();
  for (const v of usedVars) {
    if (!(v in scope)) return null;
  }

  // Caso especial divisão por esforço: E === 0 → prioridade null (sem
  // Infinity/NaN). O cálculo é genérico, mas guardamos contra E zerado.
  if (Object.prototype.hasOwnProperty.call(scope, 'E') && usedVars.includes('E') && scope.E === 0) {
    return null;
  }

  let result;
  try {
    result = expr.evaluate(scope);
  } catch {
    return null;
  }

  if (!isNum(result)) return null; // protege contra Infinity/NaN residual
  return roundTo(result, round);
}

module.exports = { compute };
