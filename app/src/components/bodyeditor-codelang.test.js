// @vitest-environment happy-dom
// Monta o BodyEditor.vue REAL e reproduz a troca de linguagem com um "pai" que
// reflete @input de volta no :value (como o TaskPeek faz com model.body).
import { describe, it, expect, vi } from 'vitest';

// tippy (bubble menu) não roda em happy-dom → mock mínimo
// evita tippy/bubble menu no ambiente de teste: BubbleMenuPlugin vira um plugin PM vazio
vi.mock('@tiptap/extension-bubble-menu', async () => {
  const { Plugin } = await import('@tiptap/pm/state');
  return { BubbleMenuPlugin: () => new Plugin({}) };
});

import { mount } from '@vue/test-utils';
import BodyEditor from './BodyEditor.vue';

const MD = ['Antes.', '', '```', 'SELECT 1;', '```', '', 'Depois.'].join('\n');
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// happy-dom não implementa layout — stub p/ refreshCodeLang/coordsAtPos não quebrarem
const rect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
if (!Element.prototype.getBoundingClientRect) Element.prototype.getBoundingClientRect = rect;
Element.prototype.getBoundingClientRect = rect;
Range.prototype.getBoundingClientRect = rect;
Range.prototype.getClientRects = () => [];

describe('BodyEditor.vue — troca de linguagem (componente real, pai reflete @input)', () => {
  it('não apaga o corpo ao trocar a linguagem', async () => {
    const wrapper = mount(BodyEditor, { props: { value: MD } });
    await tick(60);
    const vm = wrapper.vm;
    expect(vm.editor).toBeTruthy();

    let cbPos = -1;
    vm.editor.state.doc.descendants((n, p) => { if (n.type.name === 'codeBlock') cbPos = p; });
    vm.editor.chain().setTextSelection(cbPos + 2).run();
    vm.editor.commands.blur(); // usuário clicou no <select> nativo → editor perde foco

    vm.onCodeLangChange({ target: { value: 'sql' } });
    await tick(10);

    // o pai (TaskPeek) faz: model.body = <valor emitido> → volta no :value
    const emitted = wrapper.emitted('input') || [];
    const last = emitted.length ? emitted[emitted.length - 1][0] : MD;
    console.log('LAST_EMIT=', JSON.stringify(last));
    await wrapper.setProps({ value: last });
    await tick(20);

    const md = vm.editor.storage.markdown.getMarkdown();
    const diag = `\nLAST_EMIT=${JSON.stringify(last)}\nFINAL=${JSON.stringify(md)}\n`;
    // o corpo inteiro sobrevive à troca de linguagem (o bug apagava tudo)
    expect(last, diag).toContain('SELECT 1;');
    expect(last, diag).toContain('Antes.');
    expect(last, diag).toContain('Depois.');
    expect(last, diag).toContain('```sql');
    expect(md, diag).toContain('SELECT 1;');
    expect(md, diag).toContain('Depois.');
    try { wrapper.unmount(); } catch (_) { /* teardown do happy-dom, irrelevante */ }
  });
});
