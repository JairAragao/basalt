<template>
  <div ref="root" class="relative">
    <!-- gatilho: valor + X de limpar (quando clearable e há valor) + chevron -->
    <div class="field flex min-h-[34px] cursor-pointer items-center gap-1.5 !py-0 !pl-0 !pr-2" :class="{ 'border-accent': open }">
      <button type="button" class="flex min-h-[32px] min-w-0 flex-1 flex-wrap items-center gap-1 py-1 pl-2.5 text-left" @click="toggle">
        <template v-if="type === 'multiselect'">
          <span v-if="!selectedValues.length" class="text-faint">{{ placeholder }}</span>
          <span v-for="v in selectedValues" :key="v" class="pill" :style="chipStyle(v)">{{ labelOf(v) }}</span>
        </template>
        <template v-else>
          <span v-if="hasValue && editable" class="pill min-w-0 truncate" :style="chipStyle(value)">{{ labelOf(value) }}</span>
          <span v-else class="truncate" :class="{ 'text-faint': !hasValue }">{{ hasValue ? labelOf(value) : placeholder }}</span>
        </template>
      </button>
      <button
        v-if="showClear"
        type="button"
        class="grid h-4 w-4 flex-shrink-0 place-items-center text-faint transition-colors hover:text-txt"
        aria-label="Limpar"
        @click.stop="clear"
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
      </button>
      <svg viewBox="0 0 20 20" class="h-4 w-4 flex-shrink-0 text-faint" fill="none" stroke="currentColor" stroke-width="1.5" @click="toggle"><path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </div>

    <transition name="dd">
      <div v-if="open" class="absolute z-50 mt-1 w-full min-w-[13rem] rounded-lg border border-ink-line bg-ink-700 p-1 shadow-xl">
        <!-- buscar / criar (só enum/multiselect) -->
        <input
          v-if="editable"
          ref="search"
          v-model="query"
          class="field mb-1 !py-1 text-[12px]"
          placeholder="Buscar ou criar…"
          @click.stop
          @keydown.enter.prevent="onEnter"
        />
        <div class="max-h-60 overflow-auto">
          <div v-for="opt in filteredOptions" :key="opt.value" class="group/o flex items-center gap-0.5">
            <button type="button" class="dd-opt min-w-0 flex-1" :class="{ 'bg-ink-600': isSel(opt.value) }" @click="pick(opt.value)">
              <span v-if="editable" class="pill min-w-0 truncate" :style="chipStyle(opt.value)">{{ opt.label }}</span>
              <span v-else class="min-w-0 truncate">{{ opt.label }}</span>
              <span class="flex-1"></span>
              <svg v-if="isSel(opt.value)" viewBox="0 0 20 20" class="h-3.5 w-3.5 flex-shrink-0 text-txt" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
            <!-- kebab (hover): renomear / cor / excluir no OptionMenu -->
            <button
              v-if="editable"
              type="button"
              class="icon-btn h-6 w-6 flex-shrink-0 opacity-0 group-hover/o:opacity-100"
              title="Editar opção"
              @click.stop="openOptMenu(opt.value, $event)"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" class="h-3.5 w-3.5"><circle cx="10" cy="5" r="1.4" /><circle cx="10" cy="10" r="1.4" /><circle cx="10" cy="15" r="1.4" /></svg>
            </button>
          </div>

          <button v-if="canCreate" type="button" class="dd-opt text-accent" @click="create">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="h-3.5 w-3.5"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
            <span class="truncate">Criar “{{ query.trim() }}”</span>
          </button>
          <div v-if="!filteredOptions.length && !canCreate" class="px-2 py-1.5 text-[12px] text-faint">sem opções</div>
        </div>
      </div>
    </transition>

    <!-- menu da opção (Teleport → body) -->
    <OptionMenu
      v-if="optMenu.open"
      :option="optMenu.value"
      :color="(optionMeta[optMenu.value] && optionMeta[optMenu.value].color) || null"
      :prop-key="propKey"
      :prop-type="type"
      :anchor="optMenu.anchor"
      @rename="onMenuRename"
      @recolor="onMenuRecolor"
      @delete="onMenuDelete"
      @close="optMenu.open = false"
    />
  </div>
</template>

<script>
// Select editável (estilo Notion) para enum / multiselect / user.
// - enum: single (troca ao escolher outro). multiselect: vários (valor = "a;b;c").
// - user: read-only (opções vêm do roster; sem editar/criar aqui).
// - enum/multiselect: kebab por opção abre OptionMenu (renomear/cor/excluir —
//   o pai persiste no schema e migra tarefas) e criar opção ao digitar nova.
import OptionMenu from './OptionMenu.vue';
import { colorFor } from '../palette';

export default {
  name: 'PropSelect',
  components: { OptionMenu },
  props: {
    value: { default: '' },
    type: { type: String, default: 'enum' }, // enum | multiselect | user
    options: { type: Array, default: () => [] }, // strings (enum/multi) ou {value,label} (user)
    optionMeta: { type: Object, default: () => ({}) }, // { [valor]: { color } } do schema
    propKey: { type: String, default: '' }, // chave da prop (contagem de uso no OptionMenu)
    placeholder: { type: String, default: 'Selecionar' },
    clearable: { type: Boolean, default: false },
  },
  emits: ['input', 'create-option', 'rename-option', 'recolor-option', 'delete-option'],
  data() {
    return {
      open: false,
      query: '',
      optMenu: { open: false, value: '', anchor: { left: 0, top: 0, bottom: 0 } },
    };
  },
  computed: {
    editable() { return this.type === 'enum' || this.type === 'multiselect'; },
    normOptions() {
      return (this.options || []).map((o) =>
        o && typeof o === 'object' ? { value: o.value, label: o.label != null ? o.label : o.value } : { value: o, label: String(o) }
      );
    },
    filteredOptions() {
      const q = this.query.trim().toLowerCase();
      if (!q) return this.normOptions;
      return this.normOptions.filter((o) => String(o.label).toLowerCase().includes(q));
    },
    selectedValues() {
      return String(this.value || '').split(';').map((s) => s.trim()).filter(Boolean);
    },
    hasValue() { return this.value !== null && this.value !== undefined && this.value !== ''; },
    showClear() { return this.clearable && this.hasValue; },
    canCreate() {
      const q = this.query.trim();
      return this.editable && !!q && !this.normOptions.some((o) => o.value === q);
    },
  },
  methods: {
    labelOf(v) {
      const o = this.normOptions.find((x) => x.value === v);
      return o ? o.label : v;
    },
    chipStyle(v) {
      const c = colorFor(v, this.optionMeta);
      return { backgroundColor: c + '26', color: c };
    },
    isSel(v) {
      return this.type === 'multiselect' ? this.selectedValues.includes(v) : v === this.value;
    },
    toggle() {
      this.open = !this.open;
      if (this.open) {
        this.query = '';
        this.$nextTick(() => {
          if (this.$refs.search) this.$refs.search.focus();
          document.addEventListener('mousedown', this.onDoc);
          document.addEventListener('keydown', this.onEsc);
        });
      } else { this.unbind(); }
    },
    pick(v) {
      if (this.type === 'multiselect') {
        const set = this.selectedValues;
        const i = set.indexOf(v);
        if (i === -1) set.push(v); else set.splice(i, 1);
        this.$emit('input', set.join(';'));
        // multiselect: mantém aberto p/ escolher vários
      } else {
        this.$emit('input', v);
        this.close();
      }
    },
    // X do trigger: single → null; multiselect → limpa o array todo
    clear() {
      this.$emit('input', this.type === 'multiselect' ? '' : null);
    },
    onEnter() {
      if (this.canCreate) { this.create(); return; }
      if (this.filteredOptions.length) this.pick(this.filteredOptions[0].value);
    },
    create() {
      const v = this.query.trim();
      if (!v) return;
      this.$emit('create-option', v); // pai adiciona ao schema + seleciona
      this.query = '';
      if (this.type !== 'multiselect') this.close();
    },
    // ── OptionMenu (kebab por opção) ──
    openOptMenu(v, e) {
      const el = e && e.currentTarget;
      const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 80, top: 80, bottom: 100 };
      this.optMenu = { open: true, value: v, anchor: { left: r.left, top: r.top, bottom: r.bottom } };
    },
    onMenuRename(to) {
      const from = this.optMenu.value;
      this.optMenu.open = false;
      if (to && to !== from) this.$emit('rename-option', { from, to });
    },
    onMenuRecolor(color) {
      const value = this.optMenu.value;
      this.optMenu.open = false;
      this.$emit('recolor-option', { value, color });
    },
    onMenuDelete() {
      const value = this.optMenu.value;
      this.optMenu.open = false;
      this.$emit('delete-option', value);
    },
    onDoc(e) {
      if (this.optMenu.open) return; // OptionMenu aberto: o backdrop dele resolve
      if (this.$refs.root && !this.$refs.root.contains(e.target)) this.close();
    },
    onEsc(e) {
      if (e.key !== 'Escape') return;
      if (this.optMenu.open) return; // OptionMenu trata o próprio Esc
      this.close();
    },
    unbind() {
      document.removeEventListener('mousedown', this.onDoc);
      document.removeEventListener('keydown', this.onEsc);
    },
    close() { this.open = false; this.query = ''; this.optMenu.open = false; this.unbind(); },
  },
  beforeUnmount() { this.unbind(); },
};
</script>

<style scoped>
.dd-opt {
  @apply flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-txt transition-colors hover:bg-ink-600;
}
.dd-enter-active, .dd-leave-active { transition: opacity .12s ease, transform .12s ease; }
.dd-enter-from, .dd-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
