// format.js — formatação de exibição genérica (datas/valores) compartilhada
// por todo o app. Centraliza o locale pt-BR pra data/hora ficar consistente.

// Data/hora "bonita": 08/06/2026 14:32. Valor inválido → string crua (não quebra).
export function formatDateTime(value) {
  if (value == null || value === '') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Valor de exibição conforme o tipo da propriedade (datetime → bonito).
// Genérico: qualquer outro tipo passa direto.
export function displayValue(prop, value) {
  if (value == null || value === '') return value;
  if (prop && prop.type === 'datetime') return formatDateTime(value);
  return value;
}

// ISO/Date → valor do <input type="datetime-local"> (YYYY-MM-DDTHH:mm, hora local).
export function toDateTimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Valor do <input type="datetime-local"> → ISO (UTC) pra persistir.
export function fromDateTimeLocal(localStr) {
  if (!localStr) return '';
  const d = new Date(localStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

// true se o valor é referência de IMAGEM (asset do vault / URL / data-uri) e não
// um emoji/texto. Usado por ícone de tarefa e capa de card.
export function isImageRef(v) {
  return typeof v === 'string' && (/^\/api\/assets\//.test(v) || /^https?:\/\//.test(v) || /^data:image\//.test(v));
}
