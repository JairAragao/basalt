// formula.js (cliente) — ESPELHO de server/formula.js. Permite recalcular os
// campos type 'formula' AO VIVO no editor (estilo Notion), sem ida ao servidor
// nem esperar o watcher. Mesma semântica do motor do back: escopo = props
// numéricas finitas presentes em `data`; variável faltante / divisão por zero /
// Inf / NaN → null; arredonda por spec.round (default 2).
//
// Mantenha em sincronia com server/formula.js (mesma matemática, mesmo null).

import { Parser } from 'expr-eval-fork';

const parser = new Parser();
// expr-eval reserva E (Euler) e PI como constantes — limpar deixa os nomes de
// campo (ex.: E = Esforço) livres como variáveis do escopo. Ver server/formula.js.
parser.consts = {};

const exprCache = new Map();

function getExpr(exprStr) {
  if (typeof exprStr !== 'string' || exprStr.trim() === '') return null;
  if (exprCache.has(exprStr)) return exprCache.get(exprStr);
  let compiled;
  try {
    compiled = parser.parse(exprStr);
  } catch {
    compiled = null; // expressão malformada → memoiza null
  }
  exprCache.set(exprStr, compiled);
  return compiled;
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function roundTo(value, digits) {
  const d = Number.isInteger(digits) ? digits : 2;
  const factor = Math.pow(10, d);
  return Math.round(value * factor) / factor;
}

// [chave, spec] de cada propriedade type 'formula' do schema.
export function formulaSpecs(schema) {
  const out = [];
  const props = schema && schema.properties;
  if (props && typeof props === 'object') {
    for (const [key, spec] of Object.entries(props)) {
      if (spec && spec.type === 'formula' && typeof spec.expression === 'string') {
        out.push([key, { expression: spec.expression, round: spec.round }]);
      }
    }
  }
  return out;
}

// Escopo = só props numéricas finitas. Tolera string numérica ("4") vinda de
// inputs ainda não coeridos — o save converte de qualquer modo (buildPayload).
function numericScope(data) {
  const scope = {};
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (isNum(v)) scope[k] = v;
      else if (typeof v === 'string' && v.trim() !== '' && isNum(Number(v))) scope[k] = Number(v);
    }
  }
  return scope;
}

function evalFormula(exprStr, scope, round) {
  const expr = getExpr(exprStr);
  if (!expr) return null;
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
  if (!isNum(result)) return null;
  return roundTo(result, round);
}

// compute(data, schema) -> { [formulaKey]: number|null }
export function compute(data, schema) {
  const scope = numericScope(data);
  const out = {};
  for (const [key, spec] of formulaSpecs(schema)) {
    out[key] = evalFormula(spec.expression, scope, spec.round);
  }
  return out;
}
