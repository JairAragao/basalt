<template>
  <div
    class="group relative cursor-pointer rounded-lg border p-2.5 shadow-sm transition-colors"
    :class="tint ? 'hover:brightness-125' : 'border-ink-500 bg-ink-700 hover:border-ink-line hover:bg-ink-600'"
    :style="tint ? { backgroundColor: tint + '30', borderColor: tint + '60' } : {}"
    @click="$emit('open', task)"
  >
    <!-- excluir (hover) -->
    <button
      class="icon-btn absolute right-1.5 top-1.5 h-6 w-6 opacity-0 group-hover:opacity-100"
      title="Excluir"
      @click.stop="$emit('delete', task)"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5">
        <path d="M4 6h12M8 6V4.5h4V6M6.5 6l.6 9h5.8l.6-9" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    <div class="flex items-start gap-2 pr-5">
      <div class="flex-1 text-[13px] font-medium leading-snug text-txt">
        {{ titleValue || '(sem título)' }}
      </div>
    </div>

    <div v-if="hasMeta" class="mt-2 flex flex-wrap items-center gap-1.5">
      <span
        v-for="chip in extraChips"
        :key="chip.key"
        class="pill border border-ink-500 bg-ink-600 text-muted"
      >{{ chip.value }}</span>

      <span
        v-if="badgeValue !== null && badgeValue !== undefined && badgeValue !== ''"
        class="pill"
        :class="badgeClass"
        :title="'Prioridade GUTE'"
      >⚡ {{ badgeValue }}</span>
    </div>

    <div v-if="subtitleValue" class="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
      <span class="grid h-4 w-4 place-items-center rounded-full bg-ink-500 text-[9px] uppercase text-muted">
        {{ initial }}
      </span>
      {{ subtitleValue }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'TaskCard',
  props: {
    task: { type: Object, required: true },
    config: { type: Object, required: true },
    tint: { type: String, default: null },
  },
  computed: {
    cardCfg() { return (this.config.board && this.config.board.card) || {}; },
    titleValue() { return this.task[this.cardCfg.title || 'titulo']; },
    subtitleValue() { return this.cardCfg.subtitle ? this.task[this.cardCfg.subtitle] : null; },
    initial() { return (this.subtitleValue || '?').toString().charAt(0); },
    badgeValue() { return this.cardCfg.badge ? this.task[this.cardCfg.badge] : null; },
    badgeClass() {
      const n = Number(this.badgeValue);
      if (Number.isNaN(n)) return 'bg-ink-600 text-muted';
      if (n >= 20) return 'bg-red-500/15 text-red-300';
      if (n >= 8) return 'bg-amber-500/15 text-amber-300';
      return 'bg-ink-600 text-muted';
    },
    extraChips() {
      const out = [];
      const used = new Set([this.cardCfg.title, this.cardCfg.subtitle, this.cardCfg.badge, 'status']);
      ['modulo', 'tipo'].forEach((key) => {
        if (used.has(key)) return;
        const v = this.task[key];
        if (v !== null && v !== undefined && v !== '') out.push({ key, value: v });
      });
      return out;
    },
    hasMeta() {
      return this.extraChips.length > 0 || (this.badgeValue !== null && this.badgeValue !== undefined && this.badgeValue !== '');
    },
  },
};
</script>
