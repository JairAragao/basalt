<template>
  <!-- barras horizontais categóricas em HTML/CSS puro (uPlot é ruim pra categórico) -->
  <ul v-if="rows.length" class="space-y-2" :aria-label="ariaLabel">
    <li v-for="r in rows" :key="r.label" class="flex items-center gap-2 text-[13px]">
      <span class="w-32 flex-shrink-0 truncate text-muted" :title="r.label">{{ r.label }}</span>
      <span class="relative h-4 min-w-0 flex-1 overflow-hidden rounded bg-ink-700" aria-hidden="true">
        <span
          class="absolute inset-y-0 left-0 rounded transition-[width] duration-200"
          :style="{ width: widthOf(r) + '%', background: r.color || color }"
        ></span>
      </span>
      <span class="w-9 flex-shrink-0 text-right font-mono text-[12px] text-txt">{{ r.count }}</span>
    </li>
  </ul>
  <div v-else class="py-4 text-center text-[12px] text-faint">Sem dados no período.</div>
</template>

<script>
export default {
  name: 'BarList',
  props: {
    rows: { type: Array, default: () => [] }, // [{ label, count, color? }] — color da linha vence a default
    color: { type: String, default: '#9b9b9b' },
    ariaLabel: { type: String, default: 'Distribuição por categoria' },
  },
  computed: {
    max() {
      return this.rows.reduce((m, r) => Math.max(m, r.count || 0), 0);
    },
  },
  methods: {
    widthOf(r) {
      // mínimo 2% pra barra de valor baixo não sumir
      return this.max ? Math.max(2, Math.round(((r.count || 0) / this.max) * 100)) : 0;
    },
  },
};
</script>
