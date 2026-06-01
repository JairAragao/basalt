// gute.js — SHIM de retrocompatibilidade. O motor de fórmula foi generalizado
// para server/formula.js. Este módulo mantém a assinatura antiga
// compute(data, guteConfig) usada por consumidores/testes legados, delegando
// para formula.compute (que aceita o formato legado { inputs, derived, round }).
//
// Novo código deve usar require('./formula').

const formula = require('./formula');

// compute(data, guteConfig) — guteConfig no formato legado de config/gute.json:
//   { inputs, derived: { nome: expr }, round, stampField }.
// Garante a presença das chaves GUT/prioridade_gute (mesmo null) quando a
// config legada não as listar, preservando o contrato antigo.
function compute(data, guteConfig) {
  const out = formula.compute(data, guteConfig);
  if (guteConfig && guteConfig.derived && typeof guteConfig.derived === 'object') {
    // formula.compute já cobre todas as chaves de derived; nada a completar.
    return out;
  }
  if (!('GUT' in out)) out.GUT = null;
  if (!('prioridade_gute' in out)) out.prioridade_gute = null;
  return out;
}

module.exports = { compute };
