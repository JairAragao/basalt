// @vitest-environment happy-dom
// Repro dos bugs relatados no editor (formatação morta, link que apaga tudo,
// Enter na borda do link, round-trip do blob de URLs coladas do Notion).
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';

const lowlight = createLowlight(common);

const MarkdownImage = Image.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state, node) {
          state.write(`![](${node.attrs.src || ''})`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

function makeEditor(content = '') {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return new Editor({
    element: el,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
      Placeholder.configure({ placeholder: '…', includeChildren: false }),
      Link.configure({ openOnClick: false, autolink: true, validate: (h) => /^(https?:\/\/|mailto:)/i.test(h) }),
      TaskList,
      TaskItem.configure({ nested: true }),
      MarkdownImage.configure({ inline: false, allowBase64: false }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
      Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-', linkify: false, transformPastedText: true, transformCopiedText: true }),
    ],
    content,
  });
}

// texto no espírito do card do usuário: blob de URLs coladas + texto normal
const BLOB = 'https://dbdocs.io/https://dbdocs.io/Holistics/Ecommercehttps://docs.dbdocs.io/https://dbml.dbdiagram.io/home/https://dbdocs.io/jairaragao22/orchestra?view=table_structure Bom porem as cores e agrupamentos nao funcionam, tentar achar alternativa open source que use arquivo dbml pq assim podemos usar a funcao db2dbml /';

function findText(editor, needle) {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found !== -1) return false;
    if (node.isText && node.text.includes(needle)) {
      found = pos + node.text.indexOf(needle);
      return false;
    }
    return true;
  });
  return found;
}

describe('bug 1 — toggleBold em seleção', () => {
  it('negrito aplica na seleção e serializa com **', () => {
    const editor = makeEditor('Um texto simples para formatar.');
    const p = findText(editor, 'simples');
    expect(p).toBeGreaterThan(-1);
    editor.chain().setTextSelection({ from: p, to: p + 'simples'.length }).toggleBold().run();
    const md = editor.storage.markdown.getMarkdown();
    expect(md).toContain('**simples**');
  });

  it('negrito no meio do card com blob de URLs também funciona', () => {
    const editor = makeEditor(BLOB);
    const p = findText(editor, 'cores');
    expect(p).toBeGreaterThan(-1);
    editor.chain().setTextSelection({ from: p, to: p + 'cores'.length }).toggleBold().run();
    const md = editor.storage.markdown.getMarkdown();
    expect(md).toContain('**cores**');
    expect(md).toContain('agrupamentos'); // resto do texto intacto
  });
});

describe('bug 2 — aplicar link não pode apagar conteúdo', () => {
  it('setLink numa seleção de texto normal preserva o doc', () => {
    const editor = makeEditor(BLOB);
    const p = findText(editor, 'alternativa');
    editor.chain().setTextSelection({ from: p, to: p + 'alternativa'.length })
      .extendMarkRange('link').setLink({ href: 'https://example.com' }).run();
    const md = editor.storage.markdown.getMarkdown();
    expect(md).toContain('agrupamentos');
    expect(md).toContain('db2dbml');
    expect(md.length).toBeGreaterThan(100);
  });

  it('setLink com cursor COLAPSADO dentro do autolink gigante não apaga nada', () => {
    const editor = makeEditor(BLOB);
    const p = findText(editor, 'Ecommerce');
    editor.chain().setTextSelection(p + 2)
      .extendMarkRange('link').setLink({ href: 'https://app.notion.com/p/x' }).run();
    const md = editor.storage.markdown.getMarkdown();
    expect(md).toContain('Bom porem as cores');
    expect(md).toContain('db2dbml');
  });

  it('round-trip: serializa e re-parseia sem perder o texto', () => {
    const editor = makeEditor(BLOB);
    const md1 = editor.storage.markdown.getMarkdown();
    const editor2 = makeEditor(md1);
    const md2 = editor2.storage.markdown.getMarkdown();
    expect(editor2.state.doc.textContent).toContain('Bom porem as cores');
    expect(editor2.state.doc.textContent).toContain('db2dbml');
    // segunda passada estável (não degrada mais)
    const editor3 = makeEditor(md2);
    expect(editor3.state.doc.textContent).toContain('db2dbml');
  });
});

describe('linkify desligado — nome de arquivo não vira link', () => {
  it('"CHANGELOG.md" carregado permanece texto puro (".md" é TLD da Moldávia)', () => {
    const editor = makeEditor('Veja o CHANGELOG.md antes do release.');
    const md = editor.storage.markdown.getMarkdown();
    expect(md).toContain('CHANGELOG.md');
    expect(md).not.toContain('](http://changelog.md');
    expect(md).not.toContain('[CHANGELOG.md]');
  });
  it('link markdown explícito continua funcionando', () => {
    const editor = makeEditor('Um [link](https://example.com) real.');
    const md = editor.storage.markdown.getMarkdown();
    expect(md).toContain('[link](https://example.com)');
  });
});

describe('bug 3 — Enter na borda do link', () => {
  it('cursor antes do "B" de "Bom": Enter empurra "Bom" pra baixo (B não sobe)', () => {
    const editor = makeEditor(BLOB);
    const p = findText(editor, 'Bom porem');
    expect(p).toBeGreaterThan(-1);
    editor.chain().setTextSelection(p).run();
    editor.commands.splitBlock();
    const paras = [];
    editor.state.doc.forEach((n) => paras.push(n.textContent));
    // 1º parágrafo termina no espaço pós-link; 2º começa com "Bom"
    expect(paras[0].includes('Bom')).toBe(false);
    expect(paras[1].startsWith('Bom')).toBe(true);
  });
});
