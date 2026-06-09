<template>
  <div ref="root" class="relative">
    <!-- gatilho -->
    <button
      type="button"
      class="field flex min-h-[34px] items-center justify-between gap-2 text-left"
      :class="{ 'border-accent': open }"
      @click="toggle"
    >
      <span class="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        <template v-if="type === 'multiselect'">
          <span v-if="!selectedValues.length" class="text-faint">{{ placeholder }}</span>
          <span v-for="v in selectedValues" :key="v" class="pill border border-ink-500 bg-ink-600 text-muted">{{ labelOf(v) }}</span>
        </template>
        <template v-else>
          <span class="truncate" :class="{ 'text-faint': !hasValue }">{{ hasValue ? labelOf(value) : placeholder }}</span>
        </template>
      </span>
      <svg viewBox="0 0 20 20" class="h-4 w-4 flex-shrink-0 text-faint" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>

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
          <button v-if="clearable && hasValue && type !== 'multiselect'" type="button" class="dd-opt text-faint" @click="pick(null)">— limpar —</button>

          <div v-for="opt in filteredOptions" :key="opt.value" class="group/o flex items-center gap-0.5">
            <template v-if="editingOpt === opt.value">
              <input
                ref="editInput"
                v-model="editVal"
                class="field !py-0.5 flex-1 text-[12px]"
                @click.stop
                @keydown.enter.prevent="commitEdit(opt.value)"
                @keydown.esc.prevent="cancelEdit"
              />
              <button type="button" class="icon-btn h-6 w-6 flex-shrink-0" title="Confirmar" @click.stop="commitEdit(opt.value)">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </button>
            </template>
            <template v-else>
              <button type="button" class="dd-opt flex-1" :class="{ 'bg-ink-600': isSel(opt.value) }" @click="pick(opt.value)">
                <span class="flex-1 truncate">{{ opt.label }}</span>
                <svg v-if="isSel(opt.value)" viewBox="0 0 20 20" class="h-3.5 w-3.5 flex-shrink-0 text-txt" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
              </button>
              <template v-if="editable">
                <button type="button" class="icon-btn h-6 w-6 flex-shrink-0 opacity-0 group-hover/o:opacity-100" title="Renomear opção" @click.stop="startEdit(opt.value)">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5"><path d="M13 4l3 3-8 8H5v-3z" stroke-linejoin="round" /></svg>
                </button>
                <button type="button" class="icon-btn h-6 w-6 flex-shrink-0 opacity-0 hover:!text-red-300 group-hover/o:opacity-100" title="Excluir opção" @click.stop="$emit('delete-option', opt.value)">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
                </button>
              </template>
            </template>
          </div>

          <button v-if="canCreate" type="button" class="dd-opt text-accent" @click="create">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" class="h-3.5 w-3.5"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
            <span class="truncate">Criar “{{ query.trim() }}”</span>
          </button>
          <div v-if="!filteredOptions.length && !canCreate" class="px-2 py-1.5 text-[12px] text-faint">sem opções</div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
// Select editável (estilo Notion) para enum / multiselect / user.
// - enum: single (troca ao escolher outro). multiselect: vários (valor = "a;b;c").
// - user: read-only (opções vêm do roster; sem editar/criar aqui).
// - enum/multiselect: renomear/excluir opção (o pai migra todas as tarefas) e
//   criar opção ao digitar uma que não existe.
export default {
  name: 'PropSelect',
  props: {
    value: { default: '' },
    type: { type: String, default: 'enum' }, // enum | multiselect | user
    options: { type: Array, default: () => [] }, // strings (enum/multi) ou {value,label} (user)
    placeholder: { type: String, default: 'Selecionar' },
    clearable: { type: Boolean, default: false },
  },
  data() {
    return { open: false, query: '', editingOpt: null, editVal: '' };
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
    isSel(v) {
      return this.type === 'multiselect' ? this.selectedValues.includes(v) : v === this.value;
    },
    toggle() {
      this.open = !this.open;
      if (this.open) {
        this.query = '';
        this.cancelEdit();
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
    startEdit(v) {
      this.editingOpt = v;
      this.editVal = this.labelOf(v);
      this.$nextTick(() => {
        const el = this.$refs.editInput;
        const node = Array.isArray(el) ? el[0] : el;
        if (node) { node.focus(); node.select(); }
      });
    },
    commitEdit(from) {
      const to = (this.editVal || '').trim();
      this.cancelEdit();
      if (to && to !== from) this.$emit('rename-option', { from, to });
    },
    cancelEdit() { this.editingOpt = null; this.editVal = ''; },
    onDoc(e) { if (this.$refs.root && !this.$refs.root.contains(e.target)) this.close(); },
    onEsc(e) { if (e.key === 'Escape') { if (this.editingOpt) this.cancelEdit(); else this.close(); } },
    unbind() {
      document.removeEventListener('mousedown', this.onDoc);
      document.removeEventListener('keydown', this.onEsc);
    },
    close() { this.open = false; this.cancelEdit(); this.query = ''; this.unbind(); },
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
