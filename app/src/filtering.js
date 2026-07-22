// filtering.js — filtros tipados da topbar (contrato T4 do design).
// Módulo PURO: zero import de Vue/DOM, testável em Vitest node.
//
// Estado: { [propKey]: F | null } onde F depende do tipo da prop no schema:
//   string              → { q }            contains normalizado (sem acento/caixa)
//   int                 → { n }            igualdade (null/'' = sem filtro)
//   datetime            → { from?, to? }   'YYYY-MM-DD', inclusivo por dia LOCAL
//   enum / user / etc.  → { v }            igualdade
//   multiselect         → { v }            v contido na lista ';' da tarefa
// AND entre props; F null/vazio é ignorado; prop órfã no estado (sumiu do
// schema) é ignorada — self-heal.

import { dayKey } from './reports';

// normaliza pra comparação: NFD sem diacríticos, lowercase, trim
export function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const empty = (v) => v === null || v === undefined || v === '';

export function matchesTask(task, state, schema) {
  const props = (schema && schema.properties) || {};
  for (const key of Object.keys(state || {})) {
    const f = state[key];
    if (f == null) continue;
    const prop = props[key];
    if (!prop) continue; // prop órfã no estado → ignora
    const v = task ? task[key] : undefined;

    if (prop.type === 'string') {
      const q = norm(f.q);
      if (!q) continue;
      if (!norm(v).includes(q)) return false;
    } else if (prop.type === 'int') {
      if (empty(f.n)) continue;
      if (empty(v) || Number(v) !== Number(f.n)) return false;
    } else if (prop.type === 'datetime') {
      const from = f.from || null;
      const to = f.to || null;
      if (!from && !to) continue;
      const k = dayKey(v); // dia LOCAL — bordas inclusivas
      if (k == null) return false;
      if (from && k < from) return false;
      if (to && k > to) return false;
    } else if (prop.type === 'multiselect' || prop.type === 'user') {
      // multiselect / user: o valor da tarefa é lista ';'; o filtro pode ter 1+
      // valores selecionados (também ';'). Casa se QUALQUER selecionado estiver
      // na lista da tarefa (OR). Cobre single e multi.
      if (empty(f.v)) continue;
      const list = String(v == null ? '' : v).split(';').map((s) => s.trim()).filter(Boolean);
      const wanted = String(f.v).split(';').map((s) => s.trim()).filter(Boolean);
      if (!wanted.some((w) => list.includes(w))) return false;
    } else if (prop.type === 'boolean') {
      // f.v é boolean (true/false); ausente/'' = sem filtro. Valor da tarefa
      // ausente/qualquer-coisa conta como false (só true estrito é "Sim").
      if (f.v === null || f.v === undefined || f.v === '') continue;
      const want = f.v === true || f.v === 'true';
      const has = v === true || v === 'true';
      if (has !== want) return false;
    } else {
      // enum / user / demais: igualdade direta
      if (empty(f.v)) continue;
      if (v !== f.v) return false;
    }
  }
  return true;
}
