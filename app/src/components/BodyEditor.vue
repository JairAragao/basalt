<template>
  <!--
    Editor de corpo estilo Notion. Round-trip com markdown:
      value (md) -> setContent -> edição visual -> onUpdate -> emite input (md)
    TipTap v2 instanciado imperativamente (sem binding oficial p/ Vue 2.7).
  -->
  <!--
    -mx-6 anula o px-6 do container pai (TaskPeek): o respiro lateral passa a
    ser padding INTERNO do .ProseMirror (ver CSS), então clicar/arrastar na
    margem ao redor do texto já seleciona — como no Notion — em vez de exigir
    o clique exato sobre o glifo.
  -->
  <div class="body-editor relative -mx-6">
    <!-- input oculto do "/ Imagem" (paste/drop não passam por aqui) -->
    <input
      ref="imageInput"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      multiple
      style="display: none"
      @change="onImageFileChange"
    />

    <!-- superfície de edição (ProseMirror é montado aqui) -->
    <div ref="editor" class="body-editor__surface"></div>

    <!-- toolbar flutuante de seleção (bubble). Posição controlada pelo BubbleMenuPlugin. -->
    <div
      ref="bubble"
      class="be-bubble"
      :style="{ visibility: bubbleVisible ? 'visible' : 'hidden' }"
    >
      <button class="be-bubble__btn" :class="{ 'is-active': mark.bold }" title="Negrito (Ctrl+B)" @mousedown.prevent @click="run('toggleBold')"><b>B</b></button>
      <button class="be-bubble__btn" :class="{ 'is-active': mark.italic }" title="Itálico (Ctrl+I)" @mousedown.prevent @click="run('toggleItalic')"><i>i</i></button>
      <button class="be-bubble__btn" :class="{ 'is-active': mark.strike }" title="Tachado" @mousedown.prevent @click="run('toggleStrike')"><s>S</s></button>
      <button class="be-bubble__btn be-bubble__btn--mono" :class="{ 'is-active': mark.code }" title="Código inline" @mousedown.prevent @click="run('toggleCode')">&lt;/&gt;</button>
      <span class="be-bubble__sep"></span>
      <button class="be-bubble__btn" :class="{ 'is-active': mark.link }" title="Link" @mousedown.prevent @click="toggleLink"><svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 12a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1" stroke-linecap="round"/><path d="M12 8a3 3 0 0 0-4 0l-2 2a3 3 0 0 0 4 4l1-1" stroke-linecap="round"/></svg></button>
    </div>

    <!-- barrinha de link (substitui o prompt do navegador) -->
    <div
      v-show="linkEditor.open"
      ref="linkbar"
      class="be-linkbar"
      :style="{ left: linkEditor.x + 'px', top: linkEditor.y + 'px' }"
      @mousedown.prevent
    >
      <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.6" class="be-linkbar__icon"><path d="M8 12a3 3 0 0 0 4 0l2-2a3 3 0 0 0-4-4l-1 1" stroke-linecap="round"/><path d="M12 8a3 3 0 0 0-4 0l-2 2a3 3 0 0 0 4 4l1-1" stroke-linecap="round"/></svg>
      <input
        ref="linkInput"
        v-model="linkEditor.url"
        type="url"
        placeholder="Colar ou digitar link…"
        class="be-linkbar__input"
        @keydown.enter.prevent="applyLink"
        @keydown.esc.prevent="closeLink"
      />
      <button class="be-bubble__btn" title="Aplicar" @mousedown.prevent @click="applyLink">✓</button>
      <button v-if="linkEditor.has" class="be-bubble__btn" title="Remover link" @mousedown.prevent @click="removeLink">✕</button>
    </div>

    <!-- menu de blocos (slash). Posicionado no caret. -->
    <div
      v-show="slash.open"
      ref="slashMenu"
      class="be-slash"
      :style="{ left: slash.x + 'px', top: slash.y + 'px' }"
    >
      <div v-if="filteredSlashItems.length" class="be-slash__list">
        <button
          v-for="(item, i) in filteredSlashItems"
          :key="item.id"
          ref="slashItem"
          class="be-slash__item"
          :class="{ 'is-active': i === slash.index }"
          @mousedown.prevent
          @mouseenter="slash.index = i"
          @click="applySlash(item)"
        >
          <span class="be-slash__icon" v-html="item.icon"></span>
          <span class="be-slash__text">
            <span class="be-slash__title">{{ item.title }}</span>
            <span class="be-slash__desc">{{ item.desc }}</span>
          </span>
        </button>
      </div>
      <div v-else class="be-slash__empty">Nenhum bloco</div>
    </div>

    <!-- handle de bloco (6 pontinhos) à esquerda do bloco sob o cursor -->
    <button
      v-show="bh.visible && !bm.open"
      class="be-blockhandle"
      :style="{ top: bh.top + 'px' }"
      title="Opções do bloco"
      @mousedown.prevent
      @click="openBlockMenu"
    >
      <svg viewBox="0 0 20 20" fill="currentColor"><circle cx="7" cy="5" r="1.3" /><circle cx="13" cy="5" r="1.3" /><circle cx="7" cy="10" r="1.3" /><circle cx="13" cy="10" r="1.3" /><circle cx="7" cy="15" r="1.3" /><circle cx="13" cy="15" r="1.3" /></svg>
    </button>

    <!-- menu do bloco: transformar (dentro do que o .md suporta) / duplicar / excluir -->
    <div v-show="bm.open" ref="blockMenu" class="be-blockmenu" :style="{ left: bm.x + 'px', top: bm.y + 'px' }">
      <template v-if="blockItems.length">
        <div class="be-blockmenu__label">Transformar em</div>
        <button v-for="item in blockItems" :key="item.id" class="be-slash__item" @mousedown.prevent @click="turnInto(item)">
          <span class="be-slash__icon" v-html="item.icon"></span>
          <span class="be-slash__title">{{ item.title }}</span>
        </button>
        <div class="be-blockmenu__sep"></div>
      </template>
      <button class="be-slash__item" @mousedown.prevent @click="duplicateBlock"><span class="be-slash__title">Duplicar</span></button>
      <button class="be-slash__item be-blockmenu__danger" @mousedown.prevent @click="deleteBlock"><span class="be-slash__title">Excluir</span></button>
    </div>

    <!-- seletor de linguagem do code block (flutua no canto do bloco sob o cursor).
         FORA do ProseMirror → mexer nele não corrompe o documento. -->
    <select
      v-show="codeLang.visible"
      class="be-codelang"
      :style="{ top: codeLang.top + 'px', left: codeLang.left + 'px' }"
      :value="codeLang.value"
      @mousedown.stop
      @change="onCodeLangChange"
    >
      <option v-for="l in codeLangs" :key="l.value" :value="l.value">{{ l.label }}</option>
    </select>

    <!-- lightbox: clicar numa imagem do corpo abre ela expandida (estilo Notion) -->
    <div v-if="lightbox.open" class="be-lightbox" @click="closeLightbox">
      <button class="be-lightbox__close" title="Fechar (Esc)" @click.stop="closeLightbox">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="20" height="20"><path d="M14 6l-8 8M6 6l8 8" stroke-linecap="round" /></svg>
      </button>
      <img :src="lightbox.src" :alt="lightbox.alt" class="be-lightbox__img" @click.stop />
    </div>
  </div>
</template>

<script>
import { Editor, Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Image from '@tiptap/extension-image';
import { BubbleMenuPlugin } from '@tiptap/extension-bubble-menu';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { uploadAsset } from '../api';

// Syntax highlight dos code blocks. `common` = ~35 linguagens populares do
// highlight.js. A linguagem escolhida vira o atributo `language` do nó e o
// tiptap-markdown a serializa na cerca do .md (```lang) — round-trip completo.
const lowlight = createLowlight(common);

// Linguagens oferecidas no seletor do code block (value = id do highlight.js).
// 'plaintext' = sem cor. Rótulos amigáveis; a lista cobre o dia-a-dia do ERP.
const CODE_LANGS = [
  { value: 'plaintext', label: 'Texto' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Shell / Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'HTML / XML' },
  { value: 'css', label: 'CSS' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'diff', label: 'Diff' },
];


// Image com serializer markdown de BLOCO explícito. O default do tiptap-markdown
// serializa imagem como INLINE; com inline:false (nosso caso, imagem em bloco) a
// marcação não é emitida e a imagem some do .md (asset fica órfão). Aqui geramos
// `![](src)` em linha própria — round-trip correto com o markdown-it na volta.
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
        parse: {}, // markdown-it já entende ![](...)
      },
    };
  },
});

// Itens do menu de blocos (slash). `keywords` ajuda o filtro.
// `action(editor)` recebe uma chain já com .focus() e .deleteRange() aplicados
// (a barra "/" + texto digitado é removida antes de aplicar o bloco).
const ICONS = {
  text: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 6h10M5 10h10M5 14h6" stroke-linecap="round"/></svg>',
  h1: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5v10M11 5v10M4 10h7" stroke-linecap="round"/><text x="13" y="15" font-size="8" fill="currentColor" stroke="none">1</text></svg>',
  h2: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5v10M11 5v10M4 10h7" stroke-linecap="round"/><text x="13" y="15" font-size="8" fill="currentColor" stroke="none">2</text></svg>',
  h3: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 5v10M11 5v10M4 10h7" stroke-linecap="round"/><text x="13" y="15" font-size="8" fill="currentColor" stroke="none">3</text></svg>',
  bullet: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="10" r="1" fill="currentColor"/><circle cx="5" cy="14" r="1" fill="currentColor"/><path d="M9 6h7M9 10h7M9 14h7" stroke-linecap="round"/></svg>',
  ordered: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><text x="2.5" y="7.5" font-size="6" fill="currentColor" stroke="none">1</text><text x="2.5" y="13.5" font-size="6" fill="currentColor" stroke="none">2</text><path d="M9 6h7M9 13h7" stroke-linecap="round"/></svg>',
  todo: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3.5" y="4" width="5" height="5" rx="1"/><path d="M4.5 6.3l1.2 1.2 1.8-2" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 6.5h5" stroke-linecap="round"/><rect x="3.5" y="12" width="5" height="5" rx="1"/><path d="M11 14.5h5" stroke-linecap="round"/></svg>',
  quote: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 5v10" stroke-linecap="round"/><path d="M9 7h7M9 11h7" stroke-linecap="round"/></svg>',
  code: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 7l-3 3 3 3M13 7l3 3-3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  divider: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 10h14" stroke-linecap="round"/></svg>',
  image: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="14" height="12" rx="2"/><circle cx="7.5" cy="8.5" r="1.5"/><path d="M4 14l4-4 3 3 2-2 3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function buildSlashItems() {
  return [
    { id: 'text', title: 'Texto', desc: 'Parágrafo simples', icon: ICONS.text, keywords: ['texto', 'paragrafo', 'paragraph', 'text', 'p'], action: (c) => c.setParagraph().run() },
    { id: 'h1', title: 'Título 1', desc: 'Cabeçalho grande', icon: ICONS.h1, keywords: ['titulo 1', 'h1', 'heading', 'cabecalho'], action: (c) => c.toggleHeading({ level: 1 }).run() },
    { id: 'h2', title: 'Título 2', desc: 'Cabeçalho médio', icon: ICONS.h2, keywords: ['titulo 2', 'h2', 'heading', 'cabecalho'], action: (c) => c.toggleHeading({ level: 2 }).run() },
    { id: 'h3', title: 'Título 3', desc: 'Cabeçalho pequeno', icon: ICONS.h3, keywords: ['titulo 3', 'h3', 'heading', 'cabecalho'], action: (c) => c.toggleHeading({ level: 3 }).run() },
    { id: 'bullet', title: 'Lista', desc: 'Lista com marcadores', icon: ICONS.bullet, keywords: ['lista', 'bullet', 'ul', 'marcador'], action: (c) => c.toggleBulletList().run() },
    { id: 'ordered', title: 'Lista numerada', desc: 'Lista ordenada', icon: ICONS.ordered, keywords: ['lista numerada', 'ordered', 'ol', 'numero'], action: (c) => c.toggleOrderedList().run() },
    { id: 'todo', title: 'To-do', desc: 'Lista de tarefas', icon: ICONS.todo, keywords: ['todo', 'to-do', 'checkbox', 'tarefa', 'check'], action: (c) => c.toggleTaskList().run() },
    { id: 'quote', title: 'Citação', desc: 'Bloco de citação', icon: ICONS.quote, keywords: ['citacao', 'quote', 'blockquote'], action: (c) => c.toggleBlockquote().run() },
    { id: 'code', title: 'Código', desc: 'Bloco de código', icon: ICONS.code, keywords: ['codigo', 'code', 'codeblock'], action: (c) => c.toggleCodeBlock().run() },
    { id: 'divider', title: 'Divisor', desc: 'Linha separadora', icon: ICONS.divider, keywords: ['divisor', 'divider', 'hr', 'linha', 'separador'], action: (c) => c.setHorizontalRule().run() },
    // Imagem: tratada à parte em applySlash (abre file picker → upload → insere URL).
    { id: 'image', title: 'Imagem', desc: 'Enviar do computador', icon: ICONS.image, keywords: ['imagem', 'image', 'img', 'foto', 'picture', 'figura', 'anexo'], action: null },
  ];
}

// Normaliza p/ comparação acento-insensível.
function norm(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default {
  name: 'BodyEditor',
  props: {
    value: { type: String, default: '' },
    placeholder: { type: String, default: 'Escreva algo…' },
  },
  data() {
    return {
      editor: null,
      // estado das marcas (atualiza a aparência dos botões da bubble)
      mark: { bold: false, italic: false, strike: false, code: false, link: false },
      bubbleVisible: false,
      linkEditor: { open: false, url: '', has: false, x: 0, y: 0 },
      // menu slash
      slash: {
        open: false,
        x: 0,
        y: 0,
        index: 0,
        query: '',
        range: null, // { from, to } do trecho "/..."
        // posição do caret (relativa ao host + viewport) p/ decidir abrir ↓ ou ↑
        caretTop: 0,
        caretBottom: 0,
        vpTop: 0,
        vpBottom: 0,
      },
      slashItems: buildSlashItems(),
      // handle de bloco (6 pontinhos) + menu do bloco sob o cursor
      bh: { visible: false, top: 0, start: 0, end: 0 },
      bm: { open: false, x: 0, y: 0 },
      blockItems: [], // opções "transformar em" aplicáveis ao bloco atual
      lightbox: { open: false, src: '', alt: '' }, // imagem expandida (estilo Notion)
      codeLangs: CODE_LANGS,
      // seletor de linguagem do code block sob o cursor (flutua no canto do bloco)
      codeLang: { visible: false, top: 0, left: 0, value: 'plaintext' },
    };
  },
  computed: {
    // itens de "transformar em" = blocos do slash, menos os atoms (divisor/imagem não são alvos)
    turnIntoItems() {
      return this.slashItems.filter((i) => i.id !== 'divider' && i.id !== 'image');
    },
    filteredSlashItems() {
      const q = norm(this.slash.query);
      if (!q) return this.slashItems;
      return this.slashItems.filter((it) => {
        if (norm(it.title).includes(q)) return true;
        return (it.keywords || []).some((k) => norm(k).includes(q));
      });
    },
  },
  watch: {
    value(newVal) {
      if (!this.editor) return;
      // Evita loop: só re-seta o conteúdo quando o valor externo realmente
      // diverge do markdown atual E o editor não está sendo editado (sem foco).
      const current = this.getMarkdown();
      const incoming = newVal || '';
      if (incoming === current) return;
      if (this.editor.isFocused) return;
      this.editor.commands.setContent(incoming, false);
    },
  },
  mounted() {
    const self = this;

    // Extensão custom: plugin ProseMirror que detecta "/" e dirige o menu de blocos.
    const SlashCommand = Extension.create({
      name: 'slashCommand',
      addProseMirrorPlugins() {
        return [
          new Plugin({
            key: new PluginKey('basaltSlash'),
            props: {
              handleKeyDown(view, event) {
                // Quando o menu está aberto, capturamos navegação aqui.
                if (!self.slash.open) return false;
                if (event.key === 'ArrowDown') {
                  self.moveSlash(1);
                  return true;
                }
                if (event.key === 'ArrowUp') {
                  self.moveSlash(-1);
                  return true;
                }
                if (event.key === 'Enter') {
                  const item = self.filteredSlashItems[self.slash.index];
                  if (item) {
                    self.applySlash(item);
                    return true;
                  }
                  self.closeSlash();
                  return true;
                }
                if (event.key === 'Escape') {
                  self.closeSlash();
                  return true;
                }
                return false;
              },
            },
          }),
        ];
      },
    });

    this.editor = new Editor({
      element: this.$refs.editor,
      extensions: [
        StarterKit.configure({
          // mantém todos os nós/marcas que serializam p/ markdown
          heading: { levels: [1, 2, 3] },
          // desliga o codeBlock do StarterKit — usamos o CodeBlockLowlight
          // (realce de sintaxe via decorações; o seletor de linguagem é um
          // controle flutuante FORA do ProseMirror, ver refreshCodeLang).
          codeBlock: false,
        }),
        CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
        Placeholder.configure({
          placeholder: this.placeholder,
          // Só no 1º bloco e só quando o doc inteiro está vazio: o texto-guia
          // some assim que você escolhe um tipo de bloco (/) OU começa a digitar
          // — sem duplicar em headings/listas vazias. (Ver CSS: só is-editor-empty.)
          includeChildren: false,
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer nofollow' },
          // só http(s)/mailto viram link — bloqueia javascript:/data: (XSS latente)
          validate: (href) => /^(https?:\/\/|mailto:)/i.test(href),
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        // Imagens: src = URL (/api/assets/...). Nada de base64 inline (incha o .md);
        // o paste/drop/"/" sobe o arquivo pro vault e insere a URL servível.
        // MarkdownImage garante a serialização `![](src)` no .md (ver acima).
        MarkdownImage.configure({ inline: false, allowBase64: false }),
        Markdown.configure({
          html: false,
          tightLists: true,
          bulletListMarker: '-',
          linkify: true,
          transformPastedText: true,
          transformCopiedText: true,
        }),
        SlashCommand,
      ],
      content: this.value || '',
      editorProps: {
        attributes: {
          class: 'be-prose',
        },
        // Ctrl+V / arrastar imagem → sobe pro vault e insere a URL.
        handlePaste: (view, event) => self.handleImagePaste(event),
        handleDrop: (view, event) => self.handleImageDrop(event),
        // Clicar À DIREITA de uma linha põe o caret no fim dela (não pula p/ a
        // linha de baixo). Abaixo de todo o conteúdo é tratado por onSurfaceClick.
        handleClick: (view, pos, event) => self.onEditorClick(view, pos, event),
        // Clique sobre uma imagem → abre expandida (lightbox), não seleciona o nó.
        handleClickOn: (view, pos, node, nodePos, event) => {
          if (node && node.type && node.type.name === 'image') {
            self.openLightbox(node.attrs.src, node.attrs.alt);
            return true;
          }
          return false;
        },
      },
      onUpdate: () => {
        this.$emit('input', this.getMarkdown());
        this.refreshSlash();
      },
      onSelectionUpdate: () => {
        this.refreshMarks();
        this.refreshSlash();
        this.refreshCodeLang();
      },
      onTransaction: () => {
        this.refreshMarks();
        this.refreshCodeLang();
      },
    });

    // Bubble menu: registra o BubbleMenuPlugin do TipTap apontando p/ o ref.
    // shouldShow: só quando há seleção de TEXTO não-vazia (não em nós/imagens).
    this.editor.registerPlugin(
      BubbleMenuPlugin({
        editor: this.editor,
        pluginKey: 'basaltBubble',
        element: this.$refs.bubble,
        tippyOptions: {
          duration: 120,
          placement: 'top',
          maxWidth: 'none',
          onShow: () => { self.bubbleVisible = true; },
          onHidden: () => { self.bubbleVisible = false; self.closeLink(); },
        },
        shouldShow: ({ editor, from, to, state }) => {
          if (self.slash.open) return false;
          if (from === to) return false;
          const text = state.doc.textBetween(from, to, ' ');
          if (!text || !text.trim()) return false;
          // não mostra dentro de code block (markdown puro)
          if (editor.isActive('codeBlock')) return false;
          return true;
        },
      })
    );

    this.refreshMarks();

    // handle de bloco: segue o cursor sobre a superfície de edição
    this._onSurfaceMove = (e) => self.onSurfaceMouseMove(e);
    this._onSurfaceLeave = () => { if (!self.bm.open) self.bh.visible = false; };
    this._onSurfaceClick = (e) => self.onSurfaceClick(e);
    const surf = this.$refs.editor;
    if (surf) {
      surf.addEventListener('mousemove', this._onSurfaceMove);
      surf.addEventListener('mouseleave', this._onSurfaceLeave);
      surf.addEventListener('click', this._onSurfaceClick);
    }
  },
  beforeUnmount() {
    document.removeEventListener('mousedown', this.onDocMouseDown, true);
    document.removeEventListener('mousedown', this.onBlockDocMouseDown, true);
    document.removeEventListener('keydown', this.onLightboxKey, true);
    const surf = this.$refs.editor;
    if (surf) {
      surf.removeEventListener('mousemove', this._onSurfaceMove);
      surf.removeEventListener('mouseleave', this._onSurfaceLeave);
      surf.removeEventListener('click', this._onSurfaceClick);
    }
    this.editor && this.editor.destroy();
    this.editor = null;
  },
  methods: {
    getMarkdown() {
      if (!this.editor) return '';
      try {
        return this.editor.storage.markdown.getMarkdown();
      } catch (e) {
        return '';
      }
    },
    run(cmd) {
      if (!this.editor) return;
      this.editor.chain().focus()[cmd]().run();
      this.refreshMarks();
    },
    toggleLink() {
      if (!this.editor) return;
      const prev = this.editor.getAttributes('link').href || '';
      // posiciona a barrinha logo acima da bubble (que está na seleção)
      const r = this.$refs.bubble.getBoundingClientRect();
      this.linkEditor = { open: true, url: prev, has: !!prev, x: r.left, y: Math.max(8, r.top - 6) };
      this.$nextTick(() => { const el = this.$refs.linkInput; if (el) { el.focus(); el.select(); } });
    },
    applyLink() {
      if (!this.editor) return;
      const url = (this.linkEditor.url || '').trim();
      const chain = this.editor.chain().focus().extendMarkRange('link');
      if (!url) chain.unsetLink().run();
      else chain.setLink({ href: url }).run();
      this.closeLink();
      this.refreshMarks();
    },
    removeLink() {
      if (!this.editor) return;
      this.editor.chain().focus().extendMarkRange('link').unsetLink().run();
      this.closeLink();
      this.refreshMarks();
    },
    closeLink() {
      this.linkEditor.open = false;
    },
    refreshMarks() {
      if (!this.editor) return;
      const e = this.editor;
      this.mark = {
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        strike: e.isActive('strike'),
        code: e.isActive('code'),
        link: e.isActive('link'),
      };
    },

    // ---- menu de blocos (slash) ----
    // Lê o texto do bloco atual; se começa com "/" (e o bloco é "vazio" antes
    // da barra — i.e. parágrafo simples), abre/atualiza o menu. Senão, fecha.
    refreshSlash() {
      if (!this.editor) return;
      const { state } = this.editor;
      const { selection } = state;
      if (!selection.empty) { this.closeSlash(); return; }
      const $from = selection.$from;
      // só em parágrafo (evita slash dentro de heading/lista já existentes)
      if ($from.parent.type.name !== 'paragraph') { this.closeSlash(); return; }
      const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n');
      // exige "/" no começo do bloco e sem espaço depois (Notion abre só no início)
      const startMatch = /^\/([^\s/]*)$/.exec(textBefore);
      if (!startMatch) {
        this.closeSlash();
        return;
      }
      const query = startMatch[1];
      // range absoluto do trecho "/..." p/ deletar ao aplicar
      const to = $from.pos;
      const from = to - (query.length + 1); // +1 pela "/"
      this.slash.query = query;
      this.slash.range = { from, to };
      // reseta índice se o filtro mudou e índice saiu do range
      if (this.slash.index >= this.filteredSlashItems.length) this.slash.index = 0;
      this.openSlashAtCaret();
    },
    openSlashAtCaret() {
      if (!this.editor) return;
      const { from } = this.editor.state.selection;
      let coords;
      try {
        coords = this.editor.view.coordsAtPos(from);
      } catch (e) {
        return;
      }
      const host = this.$el.getBoundingClientRect();
      // guarda a posição do caret (relativa ao host + viewport) p/ decidir a direção
      this.slash.x = coords.left - host.left;
      this.slash.caretTop = coords.top - host.top;
      this.slash.caretBottom = coords.bottom - host.top;
      this.slash.vpTop = coords.top;
      this.slash.vpBottom = coords.bottom;
      // padrão: abre logo abaixo do caret; placeSlashMenu pode inverter p/ cima
      this.slash.y = this.slash.caretBottom + 4;
      if (!this.slash.open) {
        this.slash.open = true;
        this.slash.index = 0;
        document.addEventListener('mousedown', this.onDocMouseDown, true);
      }
      // mede a altura real do menu já renderizado e decide ↓/↑ (como o Notion)
      this.$nextTick(this.placeSlashMenu);
    },
    // Abre pra baixo (padrão) ou pra cima quando falta espaço embaixo e sobra
    // em cima — evita o menu ficar cortado no fim da página.
    placeSlashMenu() {
      const menu = this.$refs.slashMenu;
      if (!menu) return;
      const h = menu.offsetHeight || 0;
      const margin = 8;
      const spaceBelow = window.innerHeight - this.slash.vpBottom;
      const spaceAbove = this.slash.vpTop;
      if (spaceBelow < h + margin && spaceAbove > spaceBelow) {
        this.slash.y = this.slash.caretTop - h - 4; // pra cima
      } else {
        this.slash.y = this.slash.caretBottom + 4; // pra baixo
      }
    },
    closeSlash() {
      if (!this.slash.open && !this.slash.range) return;
      this.slash.open = false;
      this.slash.query = '';
      this.slash.range = null;
      this.slash.index = 0;
      document.removeEventListener('mousedown', this.onDocMouseDown, true);
    },
    moveSlash(dir) {
      const n = this.filteredSlashItems.length;
      if (!n) return;
      this.slash.index = (this.slash.index + dir + n) % n;
      this.$nextTick(this.scrollSlashIntoView);
    },
    scrollSlashIntoView() {
      const items = this.$refs.slashItem;
      const el = Array.isArray(items) ? items[this.slash.index] : null;
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
    },
    applySlash(item) {
      if (!this.editor || !item) return;
      const range = this.slash.range;
      this.closeSlash();
      const chain = this.editor.chain().focus();
      // remove o trecho "/..." digitado antes de aplicar o bloco
      if (range) chain.deleteRange(range);
      // imagem: só limpa a "/" e abre o seletor de arquivo (upload é assíncrono)
      if (item.id === 'image') {
        chain.run();
        this.promptImageFile();
        this.refreshMarks();
        return;
      }
      item.action(chain);
      this.refreshMarks();
    },
    onDocMouseDown(e) {
      // clique fora do menu fecha
      const menu = this.$refs.slashMenu;
      if (menu && menu.contains(e.target)) return;
      this.closeSlash();
    },

    // Clique na zona VAZIA abaixo do último bloco → cria/foca um parágrafo final
    // (estilo Notion). Resolve o "preso no code block": dentro do bloco de código
    // o Enter só quebra linha; sem um parágrafo depois, não dava pra sair. Agora
    // basta clicar abaixo pra ganhar (ou focar) a linha fora do bloco.
    onSurfaceClick(e) {
      if (!this.editor || this.slash.open || this.bm.open) return;
      if (e.target && e.target.tagName === 'IMG') return; // imagem → lightbox (handleClickOn)
      const view = this.editor.view;
      const doc = view.state.doc;
      // Fim REAL do conteúdo (fundo da última linha do último bloco), medido pelo
      // ProseMirror — mais confiável que lastElementChild.bottom p/ code block e
      // citação (que têm padding). Clique acima disso → deixa o PM posicionar.
      let endCoords;
      try { endCoords = view.coordsAtPos(doc.content.size); } catch (_) { return; }
      if (e.clientY <= endCoords.bottom) return;
      const lastNode = doc.lastChild;
      const isEmptyPara = lastNode && lastNode.type.name === 'paragraph' && lastNode.content.size === 0;
      if (isEmptyPara) {
        this.editor.chain().focus('end').run(); // já existe linha vazia no fim → só foca
      } else {
        // insere um parágrafo SIMPLES (sem formatação) após o último bloco —
        // destrava code block/citação/heading e vira o "clique abaixo" do Notion
        this.editor.chain().insertContentAt(doc.content.size, { type: 'paragraph' }).focus('end').run();
      }
    },

    // ---- seletor de linguagem do code block (flutuante, fora do ProseMirror) ----
    // Mostra um <select> no canto do bloco de código sob o cursor. Trocar a
    // linguagem usa updateAttributes('codeBlock', ...) — comando padrão do TipTap,
    // que só altera o atributo do nó atual (nada de mexer no DOM/conteúdo à mão).
    refreshCodeLang() {
      if (!this.editor) { this.codeLang.visible = false; return; }
      const { state, view } = this.editor;
      const $from = state.selection.$from;
      // acha um ancestral codeBlock da seleção
      let depth = $from.depth;
      let node = null;
      let pos = -1;
      while (depth > 0) {
        const n = $from.node(depth);
        if (n.type.name === 'codeBlock') { node = n; pos = $from.before(depth); break; }
        depth--;
      }
      if (!node) { this.codeLang.visible = false; return; }
      // posiciona o seletor no canto superior direito do <pre> do bloco
      let dom = null;
      try { dom = view.nodeDOM(pos); } catch (_) { dom = null; }
      const rect = dom && dom.getBoundingClientRect ? dom.getBoundingClientRect() : null;
      if (!rect) { this.codeLang.visible = false; return; }
      const host = this.$el.getBoundingClientRect();
      this.codeLang = {
        visible: true,
        top: rect.top - host.top + 6,
        left: rect.right - host.left - 118, // ~largura do select + respiro
        value: node.attrs.language || 'plaintext',
      };
    },
    onCodeLangChange(e) {
      if (!this.editor) return;
      const v = e.target.value;
      const lang = v === 'plaintext' ? null : v;
      this.editor.chain().focus().updateAttributes('codeBlock', { language: lang }).run();
      this.codeLang.value = v;
    },

    // ---- lightbox (imagem expandida) ----
    openLightbox(src, alt) {
      if (!src) return;
      this.lightbox = { open: true, src, alt: alt || '' };
      document.addEventListener('keydown', this.onLightboxKey, true);
    },
    closeLightbox() {
      this.lightbox.open = false;
      document.removeEventListener('keydown', this.onLightboxKey, true);
    },
    onLightboxKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); this.closeLightbox(); }
    },

    // ---- handle de bloco (6 pontinhos por linha, estilo Notion) ----
    onSurfaceMouseMove(e) {
      if (!this.editor || this.bm.open) return;
      const view = this.editor.view;
      let res;
      try { res = view.posAtCoords({ left: e.clientX, top: e.clientY }); } catch (_) { res = null; }
      if (!res) return;
      let $pos;
      try { $pos = view.state.doc.resolve(res.pos); } catch (_) { return; }
      if ($pos.depth < 1) return;
      const start = $pos.before(1); // limite do bloco top-level
      const end = $pos.after(1);
      let coords;
      try { coords = view.coordsAtPos(start + 1); } catch (_) { return; }
      const host = this.$el.getBoundingClientRect();
      this.bh = { visible: true, top: coords.top - host.top, start, end };
    },
    // id do slash correspondente ao tipo do bloco atual (null = atom: imagem/divisor)
    currentBlockTypeId() {
      if (!this.editor) return null;
      let node;
      try { node = this.editor.state.doc.nodeAt(this.bh.start); } catch (_) { node = null; }
      if (!node) return null;
      const n = node.type.name;
      if (n === 'paragraph') return 'text';
      if (n === 'heading') return 'h' + ((node.attrs && node.attrs.level) || 1);
      if (n === 'bulletList') return 'bullet';
      if (n === 'orderedList') return 'ordered';
      if (n === 'taskList') return 'todo';
      if (n === 'blockquote') return 'quote';
      if (n === 'codeBlock') return 'code';
      return null; // imagem / divisor → sem "transformar em"
    },
    openBlockMenu() {
      const curId = this.currentBlockTypeId();
      // mesmas opções do "/", porém só as APLICÁVEIS: exclui o tipo atual; em
      // bloco não-textual (imagem/divisor) não oferece transformação.
      this.blockItems = curId ? this.turnIntoItems.filter((i) => i.id !== curId) : [];
      this.bm = { open: true, x: 6, y: this.bh.top };
      this.$nextTick(() => { document.addEventListener('mousedown', this.onBlockDocMouseDown, true); });
    },
    closeBlockMenu() {
      this.bm.open = false;
      document.removeEventListener('mousedown', this.onBlockDocMouseDown, true);
    },
    onBlockDocMouseDown(e) {
      const menu = this.$refs.blockMenu;
      if (menu && menu.contains(e.target)) return;
      this.closeBlockMenu();
    },
    turnInto(item) {
      if (!this.editor || !item) return;
      const start = this.bh.start;
      this.closeBlockMenu();
      const chain = this.editor.chain().focus().setTextSelection(start + 1);
      item.action(chain); // a action já chama .run()
      this.refreshMarks();
    },
    deleteBlock() {
      if (!this.editor) return;
      const { start, end } = this.bh;
      this.closeBlockMenu();
      this.bh.visible = false;
      this.editor.chain().focus().deleteRange({ from: start, to: end }).run();
    },
    duplicateBlock() {
      if (!this.editor) return;
      const { start, end } = this.bh;
      this.closeBlockMenu();
      let node;
      try { node = this.editor.state.doc.nodeAt(start); } catch (_) { node = null; }
      if (!node) return;
      this.editor.chain().focus().insertContentAt(end, node.toJSON()).run();
    },

    // ---- clique na área vazia (estilo Notion) ----
    // Resolve dois incômodos:
    //  (3) clicar ABAIXO de todo o conteúdo cria/foca um parágrafo vazio no fim —
    //      essencial quando o último bloco é um code block (senão fica preso nele);
    //  (2) clicar À DIREITA de uma linha já escrita põe o caret no fim daquela
    //      linha visual (em vez de não mover ou pular pra próxima).
    onEditorClick(view, pos, event) {
      // Clique À DIREITA do glifo em `pos`. No fim de uma linha que sofreu wrap,
      // o `pos` do PM é ambíguo (= início da próxima linha) e o default associa
      // pra FRENTE → o caret salta pro começo da linha de baixo. Forçamos a
      // associação pra TRÁS (bias -1) → o caret fica no FIM da linha clicada.
      // (clique abaixo de todo o conteúdo é tratado por onSurfaceClick.)
      try {
        const coords = view.coordsAtPos(pos);
        if (event.clientX > coords.right + 1) {
          const sel = TextSelection.near(view.state.doc.resolve(pos), -1);
          view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
          view.focus();
          return true;
        }
      } catch (_) { /* posição inválida → deixa o default agir */ }
      return false;
    },

    // ---- imagem via "/" (abre o seletor de arquivo) ----
    promptImageFile() {
      const el = this.$refs.imageInput;
      if (el) { el.value = ''; el.click(); }
    },
    onImageFileChange(e) {
      const files = [...(e.target.files || [])].filter((f) => f.type && f.type.startsWith('image/'));
      files.forEach((f) => this.uploadAndInsertImage(f));
      e.target.value = '';
    },

    // ---- colar / arrastar imagem (Ctrl+V, drag-and-drop) ----
    // Sobe a imagem pro vault (<vault>/assets/) e insere <img src=/api/assets/..>.
    // Retorna true só quando há imagem (senão deixa o paste/drop normal seguir).
    handleImagePaste(event) {
      const items = (event.clipboardData && event.clipboardData.items) || [];
      const files = [];
      for (const it of items) {
        if (it.kind === 'file' && it.type && it.type.startsWith('image/')) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length) return false;
      event.preventDefault();
      files.forEach((f) => this.uploadAndInsertImage(f));
      return true;
    },
    handleImageDrop(event) {
      const dt = event.dataTransfer;
      const files = dt && dt.files ? [...dt.files].filter((f) => f.type && f.type.startsWith('image/')) : [];
      if (!files.length) return false;
      event.preventDefault();
      files.forEach((f) => this.uploadAndInsertImage(f));
      return true;
    },
    fileToBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('falha ao ler a imagem'));
        reader.readAsDataURL(file);
      });
    },
    async uploadAndInsertImage(file) {
      if (!this.editor) return;
      try {
        const dataUri = await this.fileToBase64(file);
        const r = await uploadAsset({ data: dataUri, mime: file.type });
        if (r && r.url) {
          this.editor.chain().focus().setImage({ src: r.url }).run();
          if (r.warning) this.$emit('warning', r.warning);
        }
      } catch (e) {
        // best-effort: não trava o editor; sinaliza pro pai mostrar um toast.
        this.$emit('warning', e.message || 'Falha ao colar a imagem.');
      }
    },
  },
};
</script>

<style scoped>
/* ====== superfície de edição ====== */
.body-editor__surface {
  font-size: 14px;
  line-height: 1.6;
  color: #e9e9e7;
}

/* ProseMirror raiz.
   padding lateral = o respiro do card (antes vinha do px-6 do pai, fora do
   contenteditable): agora faz parte da superfície editável, então clicar/
   arrastar na margem ou no fim da linha cai dentro do editor e posiciona o
   cursor pelo ponto mais próximo (comportamento Notion). */
.body-editor__surface :deep(.ProseMirror) {
  outline: none;
  min-height: 120px;
  /* padding-bottom generoso = alvo de clique "abaixo do texto" (onSurfaceClick
     cria/foca um parágrafo final ali, como no Notion). */
  padding: 2px 1.5rem 2.5rem 1.5rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  caret-color: #e9e9e7;
}
.body-editor__surface :deep(.ProseMirror) > * + * {
  margin-top: 0.5em;
}

/* placeholder: SÓ no 1º parágrafo quando o documento está totalmente vazio.
   Em heading/lista vazios (após escolher um tipo pelo "/") NÃO aparece. */
.body-editor__surface :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  color: #6f6f6f;
  pointer-events: none;
  height: 0;
  float: left;
}

/* headings */
.body-editor__surface :deep(.ProseMirror h1) {
  font-size: 1.6em;
  font-weight: 700;
  line-height: 1.25;
  margin-top: 1.1em;
  color: #e9e9e7;
}
.body-editor__surface :deep(.ProseMirror h2) {
  font-size: 1.3em;
  font-weight: 650;
  line-height: 1.3;
  margin-top: 1em;
  color: #e9e9e7;
}
.body-editor__surface :deep(.ProseMirror h3) {
  font-size: 1.1em;
  font-weight: 600;
  line-height: 1.35;
  margin-top: 0.9em;
  color: #e9e9e7;
}

/* parágrafos */
.body-editor__surface :deep(.ProseMirror p) {
  margin: 0;
}

/* listas */
.body-editor__surface :deep(.ProseMirror ul),
.body-editor__surface :deep(.ProseMirror ol) {
  padding-left: 1.4em;
  margin: 0.25em 0;
}
.body-editor__surface :deep(.ProseMirror ul) { list-style: disc; }
.body-editor__surface :deep(.ProseMirror ol) { list-style: decimal; }
.body-editor__surface :deep(.ProseMirror li) { margin: 0.15em 0; }
.body-editor__surface :deep(.ProseMirror li p) { margin: 0; }
.body-editor__surface :deep(.ProseMirror li::marker) { color: #9b9b9b; }

/* task list (checkbox) */
.body-editor__surface :deep(.ProseMirror ul[data-type="taskList"]) {
  list-style: none;
  padding-left: 0.2em;
}
.body-editor__surface :deep(.ProseMirror ul[data-type="taskList"] li) {
  display: flex;
  align-items: flex-start;
  gap: 0.5em;
}
.body-editor__surface :deep(.ProseMirror ul[data-type="taskList"] li > label) {
  flex: 0 0 auto;
  margin-top: 0.28em;
  user-select: none;
}
.body-editor__surface :deep(.ProseMirror ul[data-type="taskList"] li > div) {
  flex: 1 1 auto;
}
.body-editor__surface :deep(.ProseMirror ul[data-type="taskList"] input[type="checkbox"]) {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border: 1.5px solid #4a4a4a;
  border-radius: 4px;
  background: #252525;
  cursor: pointer;
  position: relative;
  transition: background .12s, border-color .12s;
}
.body-editor__surface :deep(.ProseMirror ul[data-type="taskList"] input[type="checkbox"]:checked) {
  background: #d9a01e;
  border-color: #d9a01e;
}
.body-editor__surface :deep(.ProseMirror ul[data-type="taskList"] input[type="checkbox"]:checked::after) {
  content: '';
  position: absolute;
  left: 4.5px;
  top: 1px;
  width: 4px;
  height: 8px;
  border: solid #191919;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.body-editor__surface :deep(.ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div) {
  color: #6f6f6f;
  text-decoration: line-through;
}

/* code inline */
.body-editor__surface :deep(.ProseMirror code) {
  background: #252525;
  border: 1px solid #2f2f2f;
  border-radius: 4px;
  padding: 0.12em 0.36em;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.86em;
  color: #e0566b;
}

/* code block */
.body-editor__surface :deep(.ProseMirror pre) {
  position: relative;
  background: #1d1d1d;
  border: 1px solid #2f2f2f;
  border-radius: 8px;
  padding: 0.8em 1em;
  margin: 0.5em 0;
  overflow-x: auto;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.86em;
  line-height: 1.55;
  color: #e9e9e7;
}
.body-editor__surface :deep(.ProseMirror pre code) {
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}
/* seletor de linguagem flutuante (fora do ProseMirror; posicionado por JS) */
.be-codelang {
  position: absolute;
  z-index: 40;
  height: 22px;
  width: 112px;
  padding: 0 6px;
  border-radius: 5px;
  background: #252525;
  border: 1px solid #373737;
  color: #c8c8c6;
  font-family: system-ui, sans-serif;
  font-size: 11px;
  cursor: pointer;
  outline: none;
}
.be-codelang:hover, .be-codelang:focus { color: #e9e9e7; border-color: #4a4a4a; }
.be-codelang option { background: #252525; color: #e9e9e7; }

/* ===== highlight.js (lowlight) — tema dark alinhado à paleta do app ===== */
.body-editor__surface :deep(.ProseMirror pre code .hljs-comment),
.body-editor__surface :deep(.ProseMirror pre code .hljs-quote) { color: #6f6f6f; font-style: italic; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-keyword),
.body-editor__surface :deep(.ProseMirror pre code .hljs-selector-tag),
.body-editor__surface :deep(.ProseMirror pre code .hljs-literal),
.body-editor__surface :deep(.ProseMirror pre code .hljs-type),
.body-editor__surface :deep(.ProseMirror pre code .hljs-name) { color: #d9a01e; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-string),
.body-editor__surface :deep(.ProseMirror pre code .hljs-meta .hljs-string),
.body-editor__surface :deep(.ProseMirror pre code .hljs-regexp) { color: #7fbf7f; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-number),
.body-editor__surface :deep(.ProseMirror pre code .hljs-symbol),
.body-editor__surface :deep(.ProseMirror pre code .hljs-bullet) { color: #d98a5e; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-title),
.body-editor__surface :deep(.ProseMirror pre code .hljs-title.function_),
.body-editor__surface :deep(.ProseMirror pre code .hljs-section) { color: #6fb3d9; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-attr),
.body-editor__surface :deep(.ProseMirror pre code .hljs-attribute),
.body-editor__surface :deep(.ProseMirror pre code .hljs-variable),
.body-editor__surface :deep(.ProseMirror pre code .hljs-template-variable) { color: #c99fd9; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-built_in),
.body-editor__surface :deep(.ProseMirror pre code .hljs-builtin-name),
.body-editor__surface :deep(.ProseMirror pre code .hljs-class .hljs-title) { color: #6fb3d9; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-meta) { color: #9b9b9b; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-deletion) { color: #e0566b; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-addition) { color: #7fbf7f; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-emphasis) { font-style: italic; }
.body-editor__surface :deep(.ProseMirror pre code .hljs-strong) { font-weight: 600; }

/* blockquote */
.body-editor__surface :deep(.ProseMirror blockquote) {
  border-left: 3px solid #373737;
  padding-left: 0.9em;
  margin: 0.5em 0;
  color: #b9b9b7;
}

/* imagens (coladas/arrastadas → /api/assets/...) */
.body-editor__surface :deep(.ProseMirror img) {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 0.5em 0;
  cursor: zoom-in; /* clique → abre expandida (lightbox) */
}
.body-editor__surface :deep(.ProseMirror img.ProseMirror-selectednode) {
  outline: 2px solid rgba(217, 160, 30, 0.6);
}

/* divisor (hr) */
.body-editor__surface :deep(.ProseMirror hr) {
  border: none;
  border-top: 1px solid #373737;
  margin: 1em 0;
}
.body-editor__surface :deep(.ProseMirror hr.ProseMirror-selectednode) {
  border-top-color: #d9a01e;
}

/* links — usa o accent âmbar da paleta (não indigo/violeta, fora do design system) */
.body-editor__surface :deep(.ProseMirror a) {
  color: #d9a01e;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}

/* marca de seleção dentro do gap-cursor / nó selecionado */
.body-editor__surface :deep(.ProseMirror .ProseMirror-selectednode) {
  outline: 2px solid rgba(217, 160, 30, 0.4);
  border-radius: 4px;
}

/* ====== bubble toolbar ====== */
.be-bubble {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: #252525;
  border: 1px solid #373737;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  z-index: 50;
}
.be-bubble__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 7px;
  border-radius: 5px;
  color: #c8c8c6;
  font-size: 14px;
  line-height: 1;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background .12s, color .12s;
}
.be-bubble__btn:hover { background: #2a2a2a; color: #e9e9e7; }
.be-bubble__btn.is-active { color: #d9a01e; background: rgba(217, 160, 30, 0.12); }
.be-bubble__btn--mono { font-family: Consolas, monospace; font-size: 12px; }
.be-linkbar {
  position: fixed;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 8px;
  background: #252525;
  border: 1px solid #373737;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  transform: translateY(-100%);
}
.be-linkbar__icon { color: #6f6f6f; margin-left: 2px; flex-shrink: 0; }
.be-linkbar__input {
  width: 220px;
  background: #1d1d1d;
  border: 1px solid #373737;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12.5px;
  color: #e9e9e7;
  outline: none;
}
.be-linkbar__input:focus { border-color: #d9a01e; }
.be-bubble__sep {
  width: 1px;
  height: 18px;
  background: #373737;
  margin: 0 3px;
}

/* ====== slash menu ====== */
.be-slash {
  position: absolute;
  z-index: 60;
  width: 280px;
  max-height: 320px;
  overflow-y: auto;
  background: #252525;
  border: 1px solid #373737;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  padding: 6px;
}
.be-slash__list { display: flex; flex-direction: column; gap: 1px; }
.be-slash__item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: #e9e9e7;
}
.be-slash__item:hover,
.be-slash__item.is-active { background: #2a2a2a; }
.be-slash__icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: #1d1d1d;
  border: 1px solid #2f2f2f;
  color: #c8c8c6;
}
.be-slash__icon :deep(svg) { width: 18px; height: 18px; }
.be-slash__text { display: flex; flex-direction: column; line-height: 1.2; }
.be-slash__title { font-size: 13px; color: #e9e9e7; }
.be-slash__desc { font-size: 11px; color: #6f6f6f; margin-top: 1px; }
.be-slash__empty {
  padding: 10px 12px;
  font-size: 12px;
  color: #6f6f6f;
}

/* ====== handle de bloco (6 pontinhos) ====== */
.be-blockhandle {
  position: absolute;
  /* dentro do gutter esquerdo (padding-left do .ProseMirror), coladinho ao
     texto — antes ficava em -22px, espremido na borda do painel e quase
     invisível. Aparece no hover do bloco (onSurfaceMouseMove). */
  left: 2px;
  width: 18px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  color: #6f6f6f;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background .12s, color .12s;
}
.be-blockhandle:hover { background: #2a2a2a; color: #c8c8c6; }
.be-blockhandle svg { width: 13px; height: 13px; }
.be-blockmenu {
  position: absolute;
  z-index: 60;
  width: 196px;
  background: #252525;
  border: 1px solid #373737;
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  padding: 6px;
}
.be-blockmenu__label { font-size: 11px; color: #6f6f6f; padding: 2px 8px 4px; }
.be-blockmenu__sep { height: 1px; background: #373737; margin: 4px 0; }
.be-blockmenu__danger .be-slash__title { color: #e0566b; }

/* ====== lightbox (imagem expandida) ====== */
.be-lightbox {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  background: rgba(0, 0, 0, 0.82);
  cursor: zoom-out;
  animation: be-lightbox-in .12s ease;
}
@keyframes be-lightbox-in { from { opacity: 0; } to { opacity: 1; } }
.be-lightbox__img {
  max-width: 92vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
  cursor: default;
}
.be-lightbox__close {
  position: fixed;
  top: 18px;
  right: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: #e9e9e7;
  background: rgba(37, 37, 37, 0.8);
  border: 1px solid #373737;
  cursor: pointer;
  transition: background .12s;
}
.be-lightbox__close:hover { background: #2a2a2a; }
</style>
