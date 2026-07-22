// @vitest-environment happy-dom
// Tabelas GFM: extensões table + tiptap-markdown — round-trip precisa preservar.
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { Markdown } from 'tiptap-markdown';

function makeEditor(content = '') {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Editor({
    element: el,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Table.configure({ resizable: false }),
      TableRow, TableHeader, TableCell,
      Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-', linkify: true }),
    ],
    content,
  });
}

const MD_TABLE = [
  'Antes da tabela.',
  '',
  '| Coluna A | Coluna B |',
  '| --- | --- |',
  '| a1 | b1 |',
  '| a2 | b2 |',
  '',
  'Depois da tabela.',
].join('\n');

describe('tabelas GFM no editor', () => {
  it('parseia como nó table (não achata em texto)', () => {
    const e = makeEditor(MD_TABLE);
    let hasTable = false;
    e.state.doc.descendants((n) => { if (n.type.name === 'table') hasTable = true; });
    expect(hasTable).toBe(true);
    expect(e.state.doc.textContent).toContain('a1');
  });
  it('serializa de volta com pipes e preserva células', () => {
    const e = makeEditor(MD_TABLE);
    const md = e.storage.markdown.getMarkdown();
    expect(md).toContain('| Coluna A | Coluna B |');
    expect(md).toContain('| a2 | b2 |');
    expect(md).toContain('Antes da tabela.');
    expect(md).toContain('Depois da tabela.');
    // segunda volta estável
    const e2 = makeEditor(md);
    const md2 = e2.storage.markdown.getMarkdown();
    expect(md2).toContain('| a1 | b1 |');
  });
});
