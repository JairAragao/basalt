<template>
  <div>
  <transition :name="'peek-' + mode">
    <div v-if="open" class="no-drag-region fixed inset-0 z-30" :class="wrapperClass">
      <div class="absolute inset-0 bg-black/40" @click="requestClose"></div>

      <!-- par grudado: dialog + histórico (se aberto) à DIREITA -->
      <div class="relative flex items-stretch overflow-hidden shadow-2xl" :class="unitClass">
        <aside class="peek-panel relative flex min-w-0 flex-col overflow-hidden bg-ink-800" :class="panelClass">
        <!-- toolbar -->
        <header class="flex h-11 flex-shrink-0 items-center gap-1 border-b border-ink-500 px-3">
          <!-- excluir à ESQUERDA (no lugar antes ocupado pelo fechar) -->
          <button v-if="isEdit" class="icon-btn h-7 w-7 hover:!text-red-300" title="Excluir" @click="$emit('delete', task)">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><path d="M4 6h12M8 6V4.5h4V6M6.5 6l.6 9h5.8l.6-9" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
          <span class="text-[12px] text-faint">{{ isEdit ? 'Tarefa' : 'Nova tarefa' }}</span>

          <div class="flex-1"></div>

          <!-- modos de abertura (side / center / full) -->
          <div class="mr-1 flex items-center rounded-md border border-ink-500 p-0.5">
            <button
              v-for="m in modes"
              :key="m.id"
              class="grid h-6 w-6 place-items-center rounded transition-colors"
              :class="mode === m.id ? 'bg-ink-600 text-txt' : 'text-faint hover:text-muted'"
              :title="m.label"
              @click="setMode(m.id)"
            >
              <!-- side peek -->
              <svg v-if="m.id === 'side'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5"><rect x="3" y="4" width="14" height="12" rx="2" /><line x1="12" y1="4" x2="12" y2="16" /></svg>
              <!-- center peek -->
              <svg v-else-if="m.id === 'center'" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5"><rect x="5" y="5.5" width="10" height="9" rx="2" /></svg>
              <!-- fullscreen -->
              <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5"><path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </div>

          <button
            v-if="isEdit"
            class="icon-btn h-7 w-7"
            :class="{ '!bg-ink-600 !text-txt': historyOpen }"
            title="Histórico"
            @click="toggleHistory"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>

          <!-- fechar à DIREITA -->
          <button class="icon-btn h-7 w-7" title="Fechar" @click="requestClose">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M13 7l-6 6M7 7l6 6" stroke-linecap="round" /></svg>
          </button>
        </header>

        <!-- corpo rolável -->
        <div class="flex-1 overflow-y-auto">
          <!-- capa full-bleed (estilo Notion) -->
          <div v-if="model.cover" class="group/cover relative h-40 w-full overflow-hidden bg-ink-700">
            <img :src="model.cover" alt="capa" class="h-full w-full object-cover" />
            <div class="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover/cover:opacity-100">
              <button type="button" class="rounded-md bg-black/50 px-2 py-1 text-[12px] text-white backdrop-blur hover:bg-black/70" @click="triggerUpload('cover')">Trocar capa</button>
              <button type="button" class="rounded-md bg-black/50 px-2 py-1 text-[12px] text-white backdrop-blur hover:bg-black/70" @click="model.cover = ''">Remover</button>
            </div>
          </div>

          <div class="px-6 pb-5" :class="model.cover ? 'pt-0' : 'pt-5'">
          <div :class="contentClass">
            <!-- ícone (sobrepõe a capa quando houver) -->
            <div v-if="model.icon" class="relative" :class="model.cover ? '-mt-10' : ''">
              <button type="button" class="inline-flex rounded-lg p-1 transition-colors hover:bg-ink-700" title="Alterar ícone" @click="openIconMenu($event)">
                <img v-if="isImg(model.icon)" :src="model.icon" alt="ícone" class="h-16 w-16 rounded-lg object-cover shadow-lg" />
                <span v-else class="grid h-16 w-16 place-items-center text-5xl leading-none">{{ model.icon }}</span>
              </button>
            </div>

            <!-- ações: adicionar ícone / capa (aparecem quando faltam) -->
            <div v-if="!model.icon || !model.cover" class="mb-1 mt-1 flex flex-wrap gap-3">
              <button v-if="!model.icon" type="button" class="flex items-center gap-1.5 text-[12px] text-faint transition-colors hover:text-muted" @click="openIconMenu($event)">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><circle cx="10" cy="10" r="7" /><path d="M7.4 12c.7.8 1.6 1.2 2.6 1.2s1.9-.4 2.6-1.2" stroke-linecap="round" /><circle cx="7.6" cy="8.4" r=".8" fill="currentColor" stroke="none" /><circle cx="12.4" cy="8.4" r=".8" fill="currentColor" stroke="none" /></svg>
                Adicionar ícone
              </button>
              <button v-if="!model.cover" type="button" class="flex items-center gap-1.5 text-[12px] text-faint transition-colors hover:text-muted" @click="triggerUpload('cover')">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><rect x="3" y="5" width="14" height="10" rx="2" /><path d="M3 13l4-4 3 3 3-3 4 4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                Adicionar capa
              </button>
            </div>

            <!-- título grande -->
            <textarea
              ref="title"
              v-model="model[titleKey]"
              rows="1"
              placeholder="Sem título"
              class="w-full resize-none bg-transparent text-2xl font-semibold leading-tight text-txt outline-none placeholder-ink-500"
              @input="autoGrow"
            ></textarea>

            <!-- propriedades -->
            <div class="mt-4">
              <!-- mostrar/ocultar propriedades vazias (estilo Notion) -->
              <div v-if="emptyCount > 0" class="mb-1 flex justify-end">
                <button class="rounded px-1.5 py-0.5 text-[12px] text-faint transition-colors hover:bg-ink-700 hover:text-muted" @click="toggleHideEmpty">
                  {{ hideEmpty ? 'Mostrar' : 'Ocultar' }} {{ emptyCount }} {{ emptyCount === 1 ? 'propriedade vazia' : 'propriedades vazias' }}
                </button>
              </div>

              <div class="space-y-0.5">
                <div v-for="field in visibleRowFields" :key="field.name" class="prop-row">
                  <div class="prop-label">{{ field.label || field.name }}<span v-if="field.required" class="text-red-400">*</span></div>
                  <div class="flex-1">
                    <Dropdown
                      v-if="field.type === 'enum'"
                      :value="model[field.name]"
                      :options="optionsFor(field)"
                      :placeholder="field.label || field.name"
                      :clearable="!field.required"
                      @input="(v) => (model[field.name] = v == null ? '' : v)"
                    />
                    <input
                      v-else-if="field.type === 'int'"
                      v-model.number="model[field.name]"
                      type="number"
                      :min="field.min"
                      :max="field.max"
                      class="field !w-24"
                      placeholder="—"
                    />
                    <input
                      v-else-if="field.type === 'datetime'"
                      type="datetime-local"
                      :value="toLocal(model[field.name])"
                      class="field"
                      @input="(e) => setDate(field.name, e.target.value)"
                    />
                    <input v-else v-model="model[field.name]" class="field" :placeholder="field.label || field.name" />
                  </div>
                </div>

                <!-- derivados (read-only): fórmulas calculadas AO VIVO + auditoria -->
                <div v-for="d in visibleDerived" :key="d.name" class="prop-row">
                  <div class="prop-label">{{ d.label }}</div>
                  <div class="flex-1 pt-1.5 text-[13px] text-faint">
                    <span v-if="d.value !== null && d.value !== undefined && d.value !== ''">{{ d.value }}</span>
                    <span v-else class="italic">{{ d.placeholder }}</span>
                  </div>
                </div>
              </div>
            </div>

            <hr class="my-5 border-ink-500" />

            <!-- corpo / descrição: editor rich-text Notion-like (round-trip markdown) -->
            <BodyEditor
              :value="model.body"
              placeholder="Escreva algo…  ( / para comandos )"
              @input="onBodyInput"
              @warning="(m) => (errorMsg = m)"
            />
          </div>
          </div>
        </div>

        <!-- input escondido p/ upload de ícone/capa -->
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFilePicked" />

        <!-- seletor de ícone: popover flutuante ACIMA de tudo (Teleport → body) -->
        <Teleport to="body">
          <template v-if="iconMenuOpen">
            <div class="fixed inset-0 z-[90]" @click="closeIconMenu"></div>
            <div
              class="icon-pop fixed z-[100] overflow-hidden rounded-xl border border-ink-500 bg-ink-850 shadow-2xl"
              :style="{ left: iconMenuPos.x + 'px', top: iconMenuPos.y + 'px' }"
            >
              <!-- picker de biblioteca: busca + categorias + todos os emojis (offline) -->
              <EmojiPicker
                :native="true"
                theme="dark"
                :disable-skin-tones="false"
                @select="onEmojiSelect"
              />
              <!-- ações: enviar imagem / remover -->
              <div class="flex items-center gap-2 border-t border-ink-500 bg-ink-850 px-3 py-2">
                <button type="button" class="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-muted transition-colors hover:bg-ink-700 disabled:opacity-50" :disabled="uploading" @click="triggerUpload('icon')">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><rect x="3" y="5" width="14" height="10" rx="2" /><path d="M3 13l4-4 3 3 3-3 4 4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  {{ uploading ? 'Enviando…' : 'Enviar imagem' }}
                </button>
                <div class="flex-1"></div>
                <button v-if="model.icon" type="button" class="rounded-md px-2 py-1 text-[12px] text-faint transition-colors hover:bg-ink-700 hover:text-red-300" @click="removeIcon">Remover</button>
              </div>
            </div>
          </template>
        </Teleport>

        <!-- footer -->
        <footer class="flex flex-shrink-0 items-center gap-2 border-t border-ink-500 px-4 py-3">
          <span v-if="errorMsg" class="flex-1 truncate text-[12px] text-red-300" :title="errorMsg">{{ errorMsg }}</span>
          <span v-else class="flex-1"></span>
          <button class="rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700" :disabled="saving" @click="requestClose">Cancelar</button>
          <button
            class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
            :disabled="saving"
            @click="save"
          >{{ saving ? 'Salvando…' : 'Salvar' }}</button>
        </footer>
      </aside>
        <CardHistory
          v-if="isEdit"
          inline
          :open="open && historyOpen"
          :task-id="task && task.id ? String(task.id) : ''"
          @close="historyOpen = false"
        />
      </div>
    </div>
  </transition>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { getTask, createTask, updateTask, uploadAsset } from '../api';
import Dropdown from './Dropdown.vue';
import CardHistory from './CardHistory.vue';
import 'vue3-emoji-picker/css';
import { compute as computeFormulas } from '../formula';
import { displayValue, toDateTimeLocal, fromDateTimeLocal, isImageRef } from '../format';

// Lazy: tira o TipTap (BodyEditor) e o emoji picker do bundle inicial — só carregam
// quando o peek/popover abre (melhora o cold start do app desktop).
const BodyEditor = defineAsyncComponent(() => import('./BodyEditor.vue'));
const EmojiPicker = defineAsyncComponent(() => import('vue3-emoji-picker'));

const MODE_KEY = 'basalt.peekMode';
const HIDE_EMPTY_KEY = 'basalt.hideEmptyProps';

export default {
  name: 'TaskPeek',
  components: { Dropdown, CardHistory, BodyEditor, EmojiPicker },
  props: {
    open: { type: Boolean, default: false },
    config: { type: Object, required: true },
    task: { type: Object, default: null }, // null ou {status} → create; {id} → edit
  },
  data() {
    return {
      model: { body: '' },
      saving: false,
      errorMsg: '',
      historyOpen: false,
      bodyEdited: false, // usuário mexeu no corpo? evita o loadBody tardio clobberar o que foi digitado
      hideEmpty: this.loadHideEmpty(),
      // ícone (emoji|URL) + capa (URL) da tarefa — metadados de página
      iconMenuOpen: false,
      iconMenuPos: { x: 0, y: 0 },
      uploadTarget: null,
      uploading: false,
      mode: this.loadMode(),
      modes: [
        { id: 'side', label: 'Painel lateral' },
        { id: 'center', label: 'Janela central' },
        { id: 'full', label: 'Tela cheia' },
      ],
    };
  },
  computed: {
    isEdit() { return !!(this.task && this.task.id); },
    schema() { return this.config.schema || {}; },
    properties() { return this.schema.properties || {}; },
    derivedNames() { return this.schema.derived || []; },
    titleKey() { return (this.config.board && this.config.board.card && this.config.board.card.title) || 'titulo'; },
    statusKey() { return (this.config.board && this.config.board.groupBy) || 'status'; },
    statusColors() {
      const map = {};
      ((this.config.board && this.config.board.columns) || []).forEach((c) => { map[c.id] = c.color; });
      return map;
    },
    inputFields() {
      const derived = new Set(this.derivedNames);
      return Object.keys(this.properties)
        .filter((name) => !derived.has(name) && !(this.properties[name] && this.properties[name].auto))
        .map((name) => ({ name, ...this.properties[name] }));
    },
    rowFields() {
      return this.inputFields.filter((f) => f.name !== this.titleKey);
    },
    // Chaves de propriedades type 'formula' (derivadas, read-only).
    formulaKeys() {
      return Object.keys(this.properties).filter((k) => this.properties[k] && this.properties[k].type === 'formula');
    },
    // Fórmulas recalculadas AO VIVO a partir do model atual (estilo Notion):
    // o resultado aparece assim que os campos usados na expressão são preenchidos.
    liveFormulas() {
      return computeFormulas(this.model, this.schema);
    },
    derivedDisplay() {
      const out = [];
      // fórmulas: valor calculado ao vivo a partir dos campos preenchidos
      this.formulaKeys.forEach((name) => {
        const prop = this.properties[name] || {};
        out.push({
          name,
          label: prop.label || name,
          value: displayValue(prop, this.liveFormulas[name]),
          placeholder: '—',
          kind: 'formula',
        });
      });
      // auditoria (auto): valor vem da task salva
      Object.keys(this.properties)
        .filter((name) => this.properties[name] && this.properties[name].auto)
        .forEach((name) => {
          const prop = this.properties[name];
          out.push({
            name,
            label: prop.label || name,
            value: displayValue(prop, this.task ? this.task[name] : null),
            placeholder: this.isEdit ? '—' : 'definido ao salvar',
            kind: 'auto',
          });
        });
      return out;
    },
    // ── visibilidade de propriedades vazias (toggle estilo Notion) ──
    // Campos de auditoria (kind 'auto') NUNCA contam como "vazios ocultáveis" —
    // sempre serão preenchidos ao salvar; esconder created_at numa tarefa nova confunde.
    emptyCount() {
      const rows = this.rowFields.filter((f) => !f.required && this.isEmptyVal(this.model[f.name])).length;
      const derived = this.derivedDisplay.filter((d) => d.kind === 'formula' && this.isEmptyVal(d.value)).length;
      return rows + derived;
    },
    visibleRowFields() {
      if (!this.hideEmpty) return this.rowFields;
      return this.rowFields.filter((f) => f.required || !this.isEmptyVal(this.model[f.name]));
    },
    visibleDerived() {
      if (!this.hideEmpty) return this.derivedDisplay;
      return this.derivedDisplay.filter((d) => d.kind !== 'formula' || !this.isEmptyVal(d.value));
    },
    wrapperClass() {
      if (this.mode === 'center') return 'grid place-items-center p-4 sm:p-8';
      return ''; // side e full posicionam o par diretamente
    },
    // Posicionamento do PAR (histórico + dialog grudados) por modo.
    unitClass() {
      if (this.mode === 'side') return 'absolute inset-y-0 right-0 border-l border-ink-500';
      if (this.mode === 'center') return 'max-h-[92vh] rounded-xl border border-ink-500';
      return 'absolute inset-0'; // full
    },
    panelClass() {
      if (this.mode === 'side') return 'w-[640px] max-w-[92vw]';
      if (this.mode === 'center') return 'w-[1040px] max-w-[92vw] h-[88vh]';
      return 'flex-1'; // full
    },
    contentClass() {
      // center/full centralizam a coluna de conteúdo (estilo página do Notion)
      return this.mode === 'side' ? '' : 'mx-auto w-full max-w-3xl';
    },
  },
  watch: {
    open(v) {
      if (v) { this.initModel(); }
      else { this.historyOpen = false; this.closeIconMenu(); }
    },
    // troca de tarefa fecha o histórico aberto (evita mostrar histórico antigo)
    task() { this.historyOpen = false; },
  },
  methods: {
    // Opções do Dropdown para um campo enum. Para "status", anexa a cor da etapa.
    optionsFor(field) {
      const opts = field.options || [];
      if (field.name === this.statusKey) {
        return opts.map((o) => ({ value: o, label: o, color: this.statusColors[o] }));
      }
      return opts;
    },
    loadMode() {
      try {
        const m = localStorage.getItem(MODE_KEY);
        if (m === 'side' || m === 'center' || m === 'full') return m;
      } catch (e) { /* ignore */ }
      return 'center';
    },
    setMode(m) {
      this.mode = m;
      try { localStorage.setItem(MODE_KEY, m); } catch (e) { /* ignore */ }
      this.$nextTick(() => { this.autoGrow(); });
    },
    initModel() {
      this.errorMsg = '';
      this.saving = false;
      this.bodyEdited = false;
      this.closeIconMenu();
      const m = { body: '' };
      this.inputFields.forEach((field) => {
        if (this.task && this.task[field.name] !== undefined && this.task[field.name] !== null) {
          m[field.name] = this.task[field.name];
        } else if (field.default !== undefined) {
          m[field.name] = field.default;
        } else {
          m[field.name] = field.type === 'int' ? null : '';
        }
      });
      // metadados de página (não-schema): ícone + capa
      m.icon = (this.task && this.task.icon) || '';
      m.cover = (this.task && this.task.cover) || '';
      this.model = m;
      if (this.isEdit) this.loadBody();
      this.$nextTick(() => { this.autoGrow(); });
    },
    async loadBody() {
      try {
        const full = await getTask(this.task.id);
        if (!full) return;
        // O frontmatter (campos, icon, cover) já veio da lista em initModel — aqui
        // só falta o CORPO. NÃO reescreve campos (evitaria clobberar o que o usuário
        // digitou/esvaziou entre abrir e o GET voltar). E só seta o body se o usuário
        // ainda não o editou (o watcher do BodyEditor já protege a exibição com foco).
        if (!this.bodyEdited) this.model.body = full.body || '';
        this.$nextTick(() => { this.autoGrow(); });
      } catch (e) {
        this.errorMsg = e.message;
      }
    },
    validate() {
      for (const field of this.inputFields) {
        const v = this.model[field.name];
        const empty = v === null || v === undefined || v === '';
        if (field.required && empty) return `"${field.label || field.name}" é obrigatório.`;
        if (field.type === 'int' && !empty) {
          const n = Number(v);
          if (Number.isNaN(n) || !Number.isInteger(n)) return `"${field.label || field.name}" deve ser inteiro.`;
          if (field.min !== undefined && n < field.min) return `"${field.label || field.name}" mínimo ${field.min}.`;
          if (field.max !== undefined && n > field.max) return `"${field.label || field.name}" máximo ${field.max}.`;
        }
      }
      return '';
    },
    buildPayload() {
      const payload = {};
      this.inputFields.forEach((field) => {
        let v = this.model[field.name];
        if (field.type === 'int') v = v === '' || v === null || v === undefined ? null : Number(v);
        if (v !== '' && v !== null && v !== undefined) payload[field.name] = v;
      });
      // metadados de página: só envia quando há valor (omitir = limpar no update)
      if (this.model.icon) payload.icon = this.model.icon;
      if (this.model.cover) payload.cover = this.model.cover;
      payload.body = this.model.body || '';
      return payload;
    },
    async save() {
      const err = this.validate();
      if (err) { this.errorMsg = err; return; }
      this.errorMsg = '';
      this.saving = true;
      try {
        const payload = this.buildPayload();
        const saved = this.isEdit ? await updateTask(this.task.id, payload) : await createTask(payload);
        this.$emit('saved', saved);
      } catch (e) {
        this.errorMsg = e.message;
      } finally {
        this.saving = false;
      }
    },
    toggleHistory() {
      this.historyOpen = !this.historyOpen;
    },
    requestClose() {
      if (!this.saving) this.$emit('close');
    },
    onBodyInput(v) {
      this.model.body = v;
      this.bodyEdited = true; // a partir daqui o loadBody tardio não sobrescreve o corpo
    },
    isEmptyVal(v) {
      return v === null || v === undefined || v === '';
    },
    // ── ícone (emoji|imagem) + capa (imagem) ──
    isImg(v) { return isImageRef(v); },
    // Abre o seletor de ícone como popover flutuante posicionado no gatilho.
    openIconMenu(e) {
      if (this.iconMenuOpen) { this.closeIconMenu(); return; }
      const el = e && e.currentTarget;
      const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 80, top: 80, bottom: 100 };
      const W = 340, H = 450;
      let left = r.left;
      if (left + W > window.innerWidth - 8) left = window.innerWidth - W - 8;
      if (left < 8) left = 8;
      let top = r.bottom + 6;
      if (top + H > window.innerHeight - 8) top = Math.max(8, r.top - H - 6); // abre pra cima
      this.iconMenuPos = { x: left, y: top };
      this.iconMenuOpen = true;
      // popover é position:fixed (Teleport) — fecha em scroll/resize pra não flutuar
      // desalinhado do gatilho (o corpo do peek é rolável). capture pega scroll interno.
      window.addEventListener('scroll', this.closeIconMenu, true);
      window.addEventListener('resize', this.closeIconMenu, true);
    },
    closeIconMenu() {
      if (this.iconMenuOpen) this.iconMenuOpen = false;
      window.removeEventListener('scroll', this.closeIconMenu, true);
      window.removeEventListener('resize', this.closeIconMenu, true);
    },
    // payload do vue3-emoji-picker: { i: '😀', u, n, r, t }. O glifo é `i` no modo
    // native; cai pra `u`/`native` se algum grupo (flag/skin-tone) vier sem `i`.
    onEmojiSelect(emoji) {
      const glyph = emoji && (emoji.i || emoji.u || emoji.native);
      if (glyph) this.model.icon = glyph;
      this.closeIconMenu();
    },
    removeIcon() { this.model.icon = ''; this.closeIconMenu(); },
    triggerUpload(target) {
      this.uploadTarget = target;
      const el = this.$refs.fileInput;
      if (el) { el.value = ''; el.click(); }
    },
    fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('falha ao ler a imagem'));
        reader.readAsDataURL(file);
      });
    },
    async onFilePicked(e) {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      this.uploading = true;
      try {
        const dataUri = await this.fileToDataUrl(file);
        const r = await uploadAsset({ data: dataUri, mime: file.type });
        if (r && r.url) {
          if (this.uploadTarget === 'cover') this.model.cover = r.url;
          else this.model.icon = r.url;
          this.closeIconMenu();
        }
        if (r && r.warning) this.errorMsg = r.warning;
      } catch (err) {
        this.errorMsg = err.message || 'Falha ao enviar a imagem.';
      } finally {
        this.uploading = false;
      }
    },
    // datetime: ISO no model <-> valor local do <input type="datetime-local">
    toLocal(v) {
      return toDateTimeLocal(v);
    },
    setDate(name, localStr) {
      this.model[name] = localStr ? fromDateTimeLocal(localStr) : '';
    },
    loadHideEmpty() {
      try { return localStorage.getItem(HIDE_EMPTY_KEY) === '1'; } catch (e) { return false; }
    },
    toggleHideEmpty() {
      this.hideEmpty = !this.hideEmpty;
      try { localStorage.setItem(HIDE_EMPTY_KEY, this.hideEmpty ? '1' : '0'); } catch (e) { /* ignore */ }
    },
    autoGrow() {
      const el = this.$refs.title;
      if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
    },
  },
  beforeUnmount() {
    // limpa listeners do popover de ícone caso o componente seja destruído aberto
    window.removeEventListener('scroll', this.closeIconMenu, true);
    window.removeEventListener('resize', this.closeIconMenu, true);
  },
};
</script>

<style scoped>
/* side: desliza da direita */
.peek-side-enter-active, .peek-side-leave-active { transition: opacity .22s ease; }
.peek-side-enter-active .peek-panel, .peek-side-leave-active .peek-panel { transition: transform .22s ease; }
.peek-side-enter-from, .peek-side-leave-to { opacity: 0; }
.peek-side-enter-from .peek-panel, .peek-side-leave-to .peek-panel { transform: translateX(100%); }

/* center e full: fade + leve scale */
.peek-center-enter-active, .peek-center-leave-active,
.peek-full-enter-active, .peek-full-leave-active { transition: opacity .2s ease; }
.peek-center-enter-active .peek-panel, .peek-center-leave-active .peek-panel,
.peek-full-enter-active .peek-panel, .peek-full-leave-active .peek-panel { transition: transform .2s ease; }
.peek-center-enter-from, .peek-center-leave-to,
.peek-full-enter-from, .peek-full-leave-to { opacity: 0; }
.peek-center-enter-from .peek-panel, .peek-center-leave-to .peek-panel,
.peek-full-enter-from .peek-panel, .peek-full-leave-to .peek-panel { transform: scale(.97); }

/* emoji picker (vue3-emoji-picker) dentro do popover flutuante:
   a borda/sombra/raio vêm do .icon-pop, então neutraliza os do picker. */
.icon-pop :deep(.v3-emoji-picker) {
  border: none;
  box-shadow: none;
  border-radius: 0;
}
</style>
