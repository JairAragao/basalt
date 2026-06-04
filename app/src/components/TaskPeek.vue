<template>
  <div>
  <transition :name="'peek-' + mode">
    <div v-if="open" class="no-drag-region fixed inset-0 z-30" :class="wrapperClass">
      <div class="absolute inset-0 bg-black/40" @click="requestClose"></div>

      <aside class="relative flex flex-col overflow-hidden bg-ink-800 shadow-2xl" :class="panelClass">
        <!-- toolbar -->
        <header class="flex h-11 flex-shrink-0 items-center gap-1 border-b border-ink-500 px-3">
          <button class="icon-btn h-7 w-7" title="Fechar" @click="requestClose">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M13 7l-6 6M7 7l6 6" stroke-linecap="round" /></svg>
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

          <button v-if="isEdit" class="icon-btn h-7 w-7 hover:!text-red-300" title="Excluir" @click="$emit('delete', task)">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><path d="M4 6h12M8 6V4.5h4V6M6.5 6l.6 9h5.8l.6-9" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </header>

        <!-- corpo rolável -->
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <div :class="contentClass">
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
            <div class="mt-4 space-y-0.5">
              <div v-for="field in rowFields" :key="field.name" class="prop-row">
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
                  <input v-else v-model="model[field.name]" class="field" :placeholder="field.label || field.name" />
                </div>
              </div>

              <!-- derivados (read-only) -->
              <div v-for="d in derivedDisplay" :key="d.name" class="prop-row">
                <div class="prop-label">{{ d.label }}</div>
                <div class="flex-1 pt-1.5 text-[13px] text-faint">
                  <span v-if="d.value !== null && d.value !== undefined && d.value !== ''">{{ d.value }}</span>
                  <span v-else class="italic">— calculado ao salvar</span>
                </div>
              </div>
            </div>

            <hr class="my-5 border-ink-500" />

            <!-- corpo / descrição: editor rich-text Notion-like (round-trip markdown) -->
            <BodyEditor
              :value="model.body"
              placeholder="Escreva algo…  ( / para comandos )"
              @input="(v) => (model.body = v)"
            />
          </div>
        </div>

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
    </div>
  </transition>

  <!-- Histórico de versões (painel lateral, ao lado do card) -->
  <CardHistory
    v-if="isEdit"
    :open="open && historyOpen"
    :task-id="task && task.id ? String(task.id) : ''"
    :offset-right="historyOffset"
    @close="historyOpen = false"
  />
  </div>
</template>

<script>
import { getTask, createTask, updateTask } from '../api';
import Dropdown from './Dropdown.vue';
import CardHistory from './CardHistory.vue';
import BodyEditor from './BodyEditor.vue';

const MODE_KEY = 'basalt.peekMode';

export default {
  name: 'TaskPeek',
  components: { Dropdown, CardHistory, BodyEditor },
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
    derivedDisplay() {
      // Linhas read-only: fórmulas (derivados com spec) + campos de auditoria (auto).
      const fmtVal = (prop, value) => {
        if (value == null || value === '') return value;
        if (prop && prop.type === 'datetime') {
          const d = new Date(value);
          if (!Number.isNaN(d.getTime())) {
            return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
          }
        }
        return value;
      };
      const out = [];
      this.derivedNames
        .filter((name) => name !== 'computed_at' && this.properties[name])
        .forEach((name) => {
          const prop = this.properties[name] || {};
          out.push({ name, label: prop.label || name, value: fmtVal(prop, this.task ? this.task[name] : null) });
        });
      Object.keys(this.properties)
        .filter((name) => this.properties[name] && this.properties[name].auto)
        .forEach((name) => {
          const prop = this.properties[name];
          out.push({ name, label: prop.label || name, value: fmtVal(prop, this.task ? this.task[name] : null) });
        });
      return out;
    },
    wrapperClass() {
      if (this.mode === 'center') return 'grid place-items-center p-4 sm:p-8';
      return ''; // side e full posicionam o aside diretamente
    },
    panelClass() {
      if (this.mode === 'side') return 'absolute inset-y-0 right-0 w-[480px] max-w-[92vw] border-l border-ink-500';
      if (this.mode === 'center') return 'w-[760px] max-w-[94vw] h-[86vh] rounded-xl border border-ink-500';
      return 'absolute inset-0'; // full
    },
    contentClass() {
      // center/full centralizam a coluna de conteúdo (estilo página do Notion)
      return this.mode === 'side' ? '' : 'mx-auto w-full max-w-2xl';
    },
    // No modo lateral, encosta o histórico à esquerda do peek (largura 480px).
    // Nos demais modos, o histórico desliza da borda direita da tela.
    historyOffset() {
      return this.mode === 'side' ? 480 : 0;
    },
  },
  watch: {
    open(v) {
      if (v) { this.initModel(); }
      else { this.historyOpen = false; }
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
      this.model = m;
      if (this.isEdit) this.loadBody();
      this.$nextTick(() => { this.autoGrow(); });
    },
    async loadBody() {
      try {
        const full = await getTask(this.task.id);
        if (full) {
          this.model.body = full.body || '';
          if (full.data) {
            this.inputFields.forEach((field) => {
              if (full.data[field.name] !== undefined && (this.model[field.name] === '' || this.model[field.name] === null)) {
                this.model[field.name] = full.data[field.name];
              }
            });
          }
          this.$nextTick(() => { this.autoGrow(); });
        }
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
    autoGrow() {
      const el = this.$refs.title;
      if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
    },
  },
};
</script>

<style scoped>
/* side: desliza da direita */
.peek-side-enter-active, .peek-side-leave-active { transition: opacity .22s ease; }
.peek-side-enter-active aside, .peek-side-leave-active aside { transition: transform .22s ease; }
.peek-side-enter-from, .peek-side-leave-to { opacity: 0; }
.peek-side-enter-from aside, .peek-side-leave-to aside { transform: translateX(100%); }

/* center e full: fade + leve scale */
.peek-center-enter-active, .peek-center-leave-active,
.peek-full-enter-active, .peek-full-leave-active { transition: opacity .2s ease; }
.peek-center-enter-active aside, .peek-center-leave-active aside,
.peek-full-enter-active aside, .peek-full-leave-active aside { transition: transform .2s ease; }
.peek-center-enter-from, .peek-center-leave-to,
.peek-full-enter-from, .peek-full-leave-to { opacity: 0; }
.peek-center-enter-from aside, .peek-center-leave-to aside,
.peek-full-enter-from aside, .peek-full-leave-to aside { transform: scale(.97); }
</style>
