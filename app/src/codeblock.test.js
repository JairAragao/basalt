// @vitest-environment happy-dom
// Repro fiel: mesma pilha de extensões do BodyEditor real.
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
          const alt = state.esc(node.attrs.alt || '');
          const src = node.attrs.src || '';
          const title = node.attrs.title ? ` "${String(node.attrs.title).replace(/"/g, '\\"')}"` : '';
          state.write(`![${alt}](${src}${title})`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

function makeEditor() {
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
      Markdown.configure({ html: false, tightLists: true, bulletListMarker: '-', linkify: true, transformPastedText: true, transformCopiedText: true }),
    ],
    content: '',
  });
}

const MD = [
  '# Título',
  '',
  'Parágrafo com **negrito** e um [link](https://x.com).',
  '',
  '- item 1',
  '- item 2',
  '',
  '```',
  'SELECT * FROM tarefa WHERE id = 1;',
  'AND status = 2;',
  '```',
  '',
  'Texto final depois do código.',
].join('\n');

describe('code block language — pilha completa', () => {
  it('trocar linguagem preserva TODO o corpo', () => {
    const editor = makeEditor();
    editor.commands.setContent(MD, false);
    const before = editor.storage.markdown.getMarkdown();
    expect(before).toContain('SELECT * FROM tarefa');
    expect(before).toContain('Texto final');

    let cbPos = -1;
    editor.state.doc.descendants((node, pos) => { if (node.type.name === 'codeBlock') cbPos = pos; });
    editor.chain().setTextSelection(cbPos + 2).run();
    editor.view.dom.blur && editor.view.dom.blur();
    editor.chain().focus().updateAttributes('codeBlock', { language: 'sql' }).run();

    const after = editor.storage.markdown.getMarkdown();
    console.log('--- corpo depois de trocar p/ sql ---\n' + after + '\n===');
    expect(after).toContain('SELECT * FROM tarefa');
    expect(after).toContain('AND status = 2;');
    expect(after).toContain('Título');
    expect(after).toContain('Texto final');
    expect(after).toContain('```sql');

    // round-trip (o que acontece se o watcher re-setar o conteúdo)
    editor.commands.setContent(after, false);
    const rt = editor.storage.markdown.getMarkdown();
    console.log('--- round-trip ---\n' + rt + '\n===');
    expect(rt).toContain('SELECT * FROM tarefa');
    expect(rt).toContain('Texto final');
    editor.destroy();
  });
});
