// Paleta predefinida — tons dessaturados que combinam com o tema dark.
// Usada nos editores de status e de propriedades (escolha de cor).
export const PALETTE = [
  { name: 'Cinza', value: '#9b9b9b' },
  { name: 'Ardósia', value: '#6f7787' },
  { name: 'Marrom', value: '#a1795f' },
  { name: 'Laranja', value: '#d9730d' },
  { name: 'Âmbar', value: '#d9a01e' },
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

// Cor determinística pra uma opção de select/multiselect: hash do texto →
// entrada da paleta. Mesma opção = mesma cor em qualquer card/sessão.
export function colorFor(value) {
  const s = String(value);
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length].value;
}
