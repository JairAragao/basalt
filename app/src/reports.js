// reports.js — agregação client-side do dashboard (contrato D2.1 do design).
// Módulo PURO: zero import de Vue/DOM, testável em Vitest node.

// timestamp (ISO/Date) → chave de dia LOCAL 'YYYY-MM-DD'. O app é local-first:
// a tarefa conta no dia em que o usuário a viu acontecer. Inválido/vazio → null.
export function dayKey(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 'YYYY-MM-DD' → Date local meia-noite (new Date('YYYY-MM-DD') parsearia em UTC).
function fromKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

// chave da segunda-feira da semana do dia (bucket 'week')
function weekStartKey(key) {
  const d = fromKey(key);
  const dow = (d.getDay() + 6) % 7; // 0 = segunda
  return dayKey(addDays(d, -dow));
}

// chave do 1º dia do mês (bucket 'month')
function monthStartKey(key) {
  const [y, m] = String(key).split('-').map(Number);
  return dayKey(new Date(y, m - 1, 1));
}

const msPerDay = 86400000;

/**
 * buildReport(input) -> report
 * input: {
 *   tasks,        // GET /tasks (frontmatter + id)
 *   schema,       // config.schema (props enum + labels)
 *   doneStageIds, // do GET /config (array ou Set)
 *   users,        // GET /users (roster) — pode ser []
 *   range: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' },  // inclusivo
 *   bucket: 'day' | 'week',
 *   enumKey: string | null
 * }
 */
export function buildReport(input) {
  const tasks = (input && input.tasks) || [];
  const schema = (input && input.schema) || {};
  const users = (input && input.users) || [];
  const range = (input && input.range) || {};
  const bucket = input && input.bucket === 'week' ? 'week' : 'day';
  const enumKey = (input && input.enumKey) || null;
  const rawDone = (input && input.doneStageIds) || [];
  const done = rawDone instanceof Set ? rawDone : new Set(rawDone);

  const from = range.from || null;
  const to = range.to || null;
  // chaves 'YYYY-MM-DD' comparam corretamente como string
  const inRange = (key) => key != null && from != null && to != null && key >= from && key <= to;

  // ── buckets da série (labels = início de cada bucket, do range inteiro) ──
  const labels = [];
  if (from && to && from <= to) {
    let k = bucket === 'day' ? from : weekStartKey(from);
    while (k <= to) {
      labels.push(k);
      k = dayKey(addDays(fromKey(k), bucket === 'day' ? 1 : 7));
    }
  }
  const bucketIndex = new Map(labels.map((l, i) => [l, i]));
  const bucketOf = (key) => (bucket === 'day' ? key : weekStartKey(key));

  const createdSeries = labels.map(() => 0);
  const completedSeries = labels.map(() => 0);

  // ── resolução de usuário: created_by/completed_by (string git) × roster ──
  const userRows = new Map();
  const resolveUser = (raw) => {
    const s = raw == null ? '' : String(raw);
    if (!s) return null;
    const entry = users.find((u) => (u && u.gitNames ? u.gitNames : []).includes(s));
    if (entry) return { name: entry.nome || entry.id, userId: entry.id };
    return { name: s, userId: null }; // sem match → string git crua
  };
  const bumpUser = (raw, field) => {
    const r = resolveUser(raw);
    if (!r) return;
    const key = r.userId != null ? `id:${r.userId}` : `git:${r.name}`;
    let row = userRows.get(key);
    if (!row) {
      row = { name: r.name, userId: r.userId, created: 0, completed: 0 };
      userRows.set(key, row);
    }
    row[field] += 1;
  };

  const enumProp = enumKey && schema.properties ? schema.properties[enumKey] : null;
  const enumOptions = enumProp && Array.isArray(enumProp.options) ? enumProp.options : null;
  const enumCounts = new Map();

  let created = 0;
  let completed = 0;
  let open = 0;
  let completedNoDate = 0;
  let leadSumMs = 0;
  let leadCount = 0;

  for (const t of tasks) {
    if (!t) continue;
    const createdKey = dayKey(t.created_at);
    const completedKey = dayKey(t.completed_at);
    const isDone = done.has(t.status);

    // snapshot atual (independe do range)
    if (!isDone) open += 1;
    if (isDone && completedKey == null) completedNoDate += 1; // legado em done sem carimbo

    if (inRange(createdKey)) {
      created += 1;
      const i = bucketIndex.get(bucketOf(createdKey));
      if (i !== undefined) createdSeries[i] += 1;
      bumpUser(t.created_by, 'created');

      if (enumKey) {
        const v = t[enumKey];
        let option;
        if (v === null || v === undefined || v === '') option = '(sem valor)';
        else if (enumOptions && !enumOptions.includes(v)) option = '(removido)';
        else option = String(v);
        enumCounts.set(option, (enumCounts.get(option) || 0) + 1);
      }
    }

    if (inRange(completedKey)) {
      completed += 1;
      const i = bucketIndex.get(bucketOf(completedKey));
      if (i !== undefined) completedSeries[i] += 1;
      bumpUser(t.completed_by, 'completed');

      if (createdKey != null) {
        const ms = new Date(t.completed_at).getTime() - new Date(t.created_at).getTime();
        // negativo = relógio bagunçado; não distorce a média
        if (Number.isFinite(ms) && ms >= 0) {
          leadSumMs += ms;
          leadCount += 1;
        }
      }
    }
  }

  const leadTimeAvgDays = leadCount
    ? Math.round((leadSumMs / leadCount / msPerDay) * 10) / 10
    : null;

  const byUser = [...userRows.values()].sort(
    (a, b) => (b.created + b.completed) - (a.created + a.completed) || a.name.localeCompare(b.name)
  );

  let byEnum = null;
  if (enumKey) {
    // empate de contagem: opções reais antes dos buckets sintéticos
    const synthetic = (o) => (o === '(sem valor)' || o === '(removido)' ? 1 : 0);
    const rows = [...enumCounts.entries()]
      .map(([option, count]) => ({ option, count }))
      .sort((a, b) =>
        b.count - a.count || synthetic(a.option) - synthetic(b.option) || a.option.localeCompare(b.option)
      );
    byEnum = { key: enumKey, label: (enumProp && enumProp.label) || enumKey, rows };
  }

  return {
    counts: { created, completed, open, leadTimeAvgDays, completedNoDate },
    series: { labels, created: createdSeries, completed: completedSeries },
    byUser,
    byEnum,
  };
}

// ── Motor de gráfico genérico (dashboard configurável) ───────────────────────
// computeChart(def, ctx) — def = uma entrada de dashboard.json (ver routes.js
// sanitizeDashboard); ctx = { tasks, schema, doneStageIds, range:{from,to},
// seqFor?:{propKey:[values]} }. Retorna forma normalizada pelo tipo:
//   kpi        → { value: number|null }
//   bar | pie  → { rows: [{ key, label, value }] }
//   line       → { labels: [key], points: [number] }
// Módulo PURO — cores/labels de usuário são resolvidas na view.
export function computeChart(def, ctx) {
  const d = def || {};
  const tasks = (ctx && ctx.tasks) || [];
  const schema = (ctx && ctx.schema) || {};
  const props = schema.properties || {};
  const range = (ctx && ctx.range) || {};
  const from = range.from || null;
  const to = range.to || null;
  const rawDone = (ctx && ctx.doneStageIds) || [];
  const done = rawDone instanceof Set ? rawDone : new Set(rawDone);
  const inRange = (key) => key != null && from != null && to != null && key >= from && key <= to;

  // conjunto de trabalho conforme a "base"
  const basisSet = (basis) => {
    if (basis === 'created') return tasks.filter((t) => t && inRange(dayKey(t.created_at)));
    if (basis === 'completed') return tasks.filter((t) => t && inRange(dayKey(t.completed_at)));
    if (basis === 'open') return tasks.filter((t) => t && !done.has(t.status));
    return tasks.filter(Boolean); // 'all'
  };

  // agrega uma medida sobre um array de tarefas → número (ou null)
  const measureOf = (set, measure) => {
    const m = measure || { agg: 'count' };
    if (m.agg === 'count') return set.length;
    if (m.agg === 'leadtime') {
      let sum = 0; let n = 0;
      for (const t of set) {
        const a = t && t.created_at ? new Date(t.created_at).getTime() : NaN;
        const b = t && t.completed_at ? new Date(t.completed_at).getTime() : NaN;
        const ms = b - a;
        if (Number.isFinite(ms) && ms >= 0) { sum += ms; n += 1; }
      }
      return n ? Math.round((sum / n / msPerDay) * 10) / 10 : null;
    }
    // sum | avg sobre prop numérica
    const key = m.prop;
    if (!key) return m.agg === 'sum' ? 0 : null;
    let sum = 0; let n = 0;
    for (const t of set) {
      const v = t ? t[key] : undefined;
      if (v === null || v === undefined || v === '') continue;
      const num = Number(v);
      if (!Number.isFinite(num)) continue;
      sum += num; n += 1;
    }
    if (m.agg === 'sum') return sum;
    return n ? Math.round((sum / n) * 100) / 100 : null;
  };

  if (d.type === 'kpi') {
    return { value: measureOf(basisSet(d.basis || 'all'), d.measure) };
  }

  if (d.type === 'bar' || d.type === 'pie') {
    const set = basisSet(d.basis || 'all');
    const dim = d.dim;
    const prop = dim ? props[dim] : null;
    const isMulti = prop && (prop.type === 'multiselect' || (prop.type === 'user' && prop.multiple));
    // agrupa: cada tarefa cai em 1 (ou N, multiselect) baldes; agrega a medida.
    // sum/avg precisam do conjunto por balde → acumula listas; count é direto.
    const groups = new Map(); // key → array de tarefas
    const put = (k, t) => {
      const kk = (k === null || k === undefined || k === '') ? '(sem valor)' : String(k);
      if (!groups.has(kk)) groups.set(kk, []);
      groups.get(kk).push(t);
    };
    for (const t of set) {
      const v = dim ? (t ? t[dim] : undefined) : '(total)';
      if (isMulti) {
        const list = String(v == null ? '' : v).split(';').map((s) => s.trim()).filter(Boolean);
        if (!list.length) put('(sem valor)', t);
        else list.forEach((item) => put(item, t));
      } else {
        put(v, t);
      }
    }
    let rows = [...groups.entries()].map(([key, arr]) => ({
      key,
      label: key,
      value: measureOf(arr, d.measure),
    }));
    // ordenação
    const synthetic = (k) => (k === '(sem valor)' || k === '(removido)' ? 1 : 0);
    const seq = (ctx && ctx.seqFor && ctx.seqFor[dim]) || null;
    if (d.sort === 'label') {
      // base A→Z; 'desc' inverte (antes o reverse valia pro asc e A→Z virava Z→A)
      rows.sort((a, b) => synthetic(a.key) - synthetic(b.key) || a.label.localeCompare(b.label));
      if (d.dir === 'desc') rows.reverse();
    } else if (d.sort === 'sequence' && seq) {
      const rank = (k) => { const i = seq.indexOf(k); return i === -1 ? (synthetic(k) ? 2e9 : 1e9) : i; };
      rows.sort((a, b) => rank(a.key) - rank(b.key)); // dir não se aplica
    } else {
      // 'value' (default): base maior→menor; 'asc' inverte
      rows.sort((a, b) => (b.value || 0) - (a.value || 0) || synthetic(a.key) - synthetic(b.key) || a.label.localeCompare(b.label));
      if (d.dir === 'asc') rows.reverse();
    }
    if (d.limit && rows.length > d.limit) rows = rows.slice(0, d.limit);
    return { rows };
  }

  if (d.type === 'line') {
    const bucket = d.bucket || 'day';
    const dateProp = d.dateProp || 'created_at';
    const bucketKeyOf = (key) => {
      if (bucket === 'week') return weekStartKey(key);
      if (bucket === 'month') return monthStartKey(key);
      return key;
    };
    const stepNext = (key) => {
      if (bucket === 'week') return dayKey(addDays(fromKey(key), 7));
      if (bucket === 'month') { const [y, m] = key.split('-').map(Number); return dayKey(new Date(y, m, 1)); }
      return dayKey(addDays(fromKey(key), 1));
    };
    const labels = [];
    if (from && to && from <= to) {
      let k = bucketKeyOf(from);
      const end = bucketKeyOf(to);
      let guard = 0;
      while (k <= end && guard++ < 5000) { labels.push(k); k = stepNext(k); }
    }
    const idx = new Map(labels.map((l, i) => [l, i]));
    // acumula tarefas por bucket, depois agrega a medida
    const buckets = labels.map(() => []);
    for (const t of tasks) {
      if (!t) continue;
      const key = dayKey(t[dateProp]);
      if (!inRange(key)) continue;
      const i = idx.get(bucketKeyOf(key));
      if (i !== undefined) buckets[i].push(t);
    }
    const points = buckets.map((set) => {
      const v = measureOf(set, d.measure);
      return v == null ? 0 : v;
    });
    return { labels, points };
  }

  return { rows: [] };
}
