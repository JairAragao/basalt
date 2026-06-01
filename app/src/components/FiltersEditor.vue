<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 space-y-1.5 overflow-y-auto p-1">
      <p class="mb-2 px-1 text-[12px] leading-relaxed text-faint">
        Escolha quais propriedades aparecem como filtro na barra superior.
        Arraste para reordenar — a ordem aqui é a ordem na topbar.
      </p>

      <div
        v-for="(item, i) in items"
        :key="item.name"
        class="flex items-center gap-2 rounded-lg border border-ink-500 bg-ink-850 p-2.5"
        :class="{ 'opacity-100': item.active, 'opacity-70': !item.active }"
        draggable="true"
        @dragstart="onDragStart(i)"
        @dragover.prevent="onDragOver(i)"
        @drop.prevent="onDrop(i)"
        @dragend="onDragEnd"
      >
        <!-- alça de arraste -->
        <span class="cursor-grab text-faint hover:text-muted" title="Arraste para reordenar">
          <svg viewBox="0 0 20 20" fill="currentColor" class="h-4 w-4"><circle cx="7" cy="5" r="1.3" /><circle cx="7" cy="10" r="1.3" /><circle cx="7" cy="15" r="1.3" /><circle cx="13" cy="5" r="1.3" /><circle cx="13" cy="10" r="1.3" /><circle cx="13" cy="15" r="1.3" /></svg>
        </span>

        <!-- checkbox de ativação -->
        <button
          type="button"
          class="grid h-5 w-5 flex-shrink-0 place-items-center rounded border transition-colors"
          :class="item.active ? 'border-accent bg-accent text-white' : 'border-ink-line bg-ink-700 text-transparent hover:border-ink-line'"
          @click="toggle(item)"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" class="h-3.5 w-3.5"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>

        <span class="flex-1 truncate text-[13px] text-txt">{{ item.label }}</span>
        <span class="pill flex-shrink-0 border border-ink-500 bg-ink-700 text-faint">{{ typeLabel(item.type) }}</span>
      </div>

      <div v-if="!items.length" class="px-1 py-2 text-[12px] text-faint">
        Nenhuma propriedade no schema. Crie propriedades na aba “Propriedades”.
      </div>
    </div>

    <!-- footer -->
    <div class="flex flex-shrink-0 items-center gap-3 border-t border-ink-500 pt-3">
      <span v-if="error" class="flex-1 truncate text-[12px] text-red-300" :title="error">{{ error }}</span>
      <span v-else class="flex-1 truncate text-[12px] text-faint">{{ activeCount }} filtro(s) selecionado(s)</span>
      <button
        class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >{{ saving ? 'Salvando…' : 'Salvar filtros' }}</button>
    </div>
  </div>
</template>

<script>
import { saveFilters } from '../api';

const TYPE_LABELS = { string: 'Texto', enum: 'Lista', int: 'Número' };

export default {
  name: 'FiltersEditor',
  props: {
    config: { type: Object, required: true },
  },
  data() {
    return {
      items: [],
      saving: false,
      error: '',
      dragFrom: null,
    };
  },
  computed: {
    activeCount() { return this.items.filter((i) => i.active).length; },
  },
  created() {
    this.load();
  },
  methods: {
    load() {
      const props = (this.config.schema && this.config.schema.properties) || {};
      const current = (this.config.board && this.config.board.filters) || [];
      // primeiro, na ordem dos filtros já configurados; depois o resto do schema.
      const ordered = [];
      const seen = new Set();
      current.forEach((name) => {
        if (props[name] && !seen.has(name)) { ordered.push(name); seen.add(name); }
      });
      Object.keys(props).forEach((name) => {
        if (!seen.has(name)) { ordered.push(name); seen.add(name); }
      });
      this.items = ordered.map((name) => {
        const spec = props[name] || {};
        return {
          name,
          label: spec.label || name,
          type: spec.type || 'string',
          active: current.includes(name),
        };
      });
    },
    typeLabel(t) { return TYPE_LABELS[t] || t; },
    toggle(item) { item.active = !item.active; },
    onDragStart(i) { this.dragFrom = i; },
    onDragOver(i) {
      if (this.dragFrom === null || this.dragFrom === i) return;
      const moved = this.items.splice(this.dragFrom, 1)[0];
      this.items.splice(i, 0, moved);
      this.dragFrom = i;
    },
    onDrop() { this.dragFrom = null; },
    onDragEnd() { this.dragFrom = null; },
    save() {
      this.error = '';
      const filters = this.items.filter((i) => i.active).map((i) => i.name);
      this.saving = true;
      saveFilters(filters)
        .then((updated) => { this.$emit('saved', updated); })
        .catch((e) => { this.error = e.message || 'Falha ao salvar.'; })
        .finally(() => { this.saving = false; });
    },
  },
};
</script>
