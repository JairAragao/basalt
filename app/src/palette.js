// Paleta predefinida — tons dessaturados que combinam com o tema dark.
// Usada nos editores de status e de propriedades (escolha de cor).
export const PALETTE = [
  { name: 'Cinza', value: '#9b9b9b' },
  { name: 'Ardósia', value: '#6f7787' },
  { name: 'Marrom', value: '#a1795f' },
  { name: 'Laranja', value: '#d9730d' },
  { name: 'Âmbar', value: '#e8873a' },
  { name: 'Amarelo', value: '#c9b458' },
  { name: 'Verde', value: '#4caf72' },
  { name: 'Teal', value: '#3aa6a0' },
  { name: 'Azul', value: '#2e83ec' },
  { name: 'Índigo', value: '#6a78d1' },
  { name: 'Roxo', value: '#9a6dd7' },
  { name: 'Rosa', value: '#d35bb0' },
  { name: 'Vermelho', value: '#e0566b' },
];

export const DEFAULT_COLOR = '#6f7787';

// Cor de uma opção de select/multiselect: cor explícita do schema
// (`prop.optionMeta[valor].color`) quando existir; senão hash determinístico do
// texto → entrada da paleta (mesma opção = mesma cor em qualquer card/sessão).
//
// A chave é SEMPRE normalizada (trim) antes de consultar o optionMeta e antes do
// hash. Sem isso, quem passa o valor "cru" (PropSelect) e quem passa "trimado"
// (TaskCard) divergiam: um achava a cor explícita e o outro caía no hash — a
// mesma opção aparecia com cores diferentes na prévia do card e ao abri-lo.
export function colorFor(value, meta) {
  const key = (value == null ? '' : String(value)).trim();
  if (meta) {
    if (meta[key] && meta[key].color) return meta[key].color;
    // tolera espaço nas CHAVES do meta (opção salva com whitespace)
    for (const k in meta) {
      if (meta[k] && meta[k].color && String(k).trim() === key) return meta[k].color;
    }
  }
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length].value;
}
