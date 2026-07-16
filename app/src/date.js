// date.js — utilidades de calendário (locale pt-BR) compartilhadas pelos
// componentes DatePicker/DateRangePicker. Tudo em data LOCAL; as strings de
// intervalo/filtro usam o formato YYYY-MM-DD (dia, sem fuso), consistente com
// o filtering.js. Datetime completo (com hora) continua em ISO via format.js.

export const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
export const WEEKDAYS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const pad = (n) => String(n).padStart(2, '0');

// Date → 'YYYY-MM-DD' (componentes locais, sem conversão de fuso).
export function ymd(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 'YYYY-MM-DD' → Date local (meio-dia p/ blindar contra DST). Vazio/ inválido → null.
export function parseYMD(str) {
  if (!str || typeof str !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (!m) { const d = new Date(str); return Number.isNaN(d.getTime()) ? null : d; }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

// 'YYYY-MM-DD' (ou Date/ISO) → 'dd/mm/aaaa' pra exibir no gatilho.
export function fmtBR(value) {
  const d = value instanceof Date ? value : parseYMD(value) || (value ? new Date(value) : null);
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function todayYMD() {
  return ymd(new Date());
}

// Matriz do mês (semanas começando no domingo) p/ montar a grade do calendário.
// Retorna 6 linhas × 7 dias: { date, ymd, inMonth }.
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay()); // recua até domingo
  const weeks = [];
  const cur = new Date(start);
  for (let w = 0; w < 6; w++) {
    const days = [];
    for (let d = 0; d < 7; d++) {
      days.push({ date: new Date(cur), ymd: ymd(cur), inMonth: cur.getMonth() === month });
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(days);
  }
  return weeks;
}

// compara duas strings YYYY-MM-DD (a<b → -1, a>b → 1, igual → 0). Vazio ordena por último.
export function cmpYMD(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}
