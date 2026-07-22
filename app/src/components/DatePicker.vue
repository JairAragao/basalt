<template>
  <div class="relative" ref="root">
    <div class="field flex cursor-pointer items-center gap-1.5 !py-0 !pl-0 !pr-2" :class="{ 'border-accent': open }">
      <button type="button" class="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 pl-2.5 text-left text-[13px]" @click="toggle">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5 flex-shrink-0 text-faint"><rect x="3" y="4.5" width="14" height="12" rx="2" /><path d="M3 8h14M7 3v3M13 3v3" stroke-linecap="round" /></svg>
        <span class="truncate" :class="{ 'text-faint': !value }">{{ triggerLabel }}</span>
      </button>
      <button
        v-if="value"
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
      <div v-if="open" class="absolute left-0 z-50 mt-1 rounded-lg border border-ink-line bg-ink-700 p-3 shadow-xl">
        <CalendarGrid :single="ymdSel" :initial="ymdSel" @pick="onPick" />
        <div v-if="withTime" class="mt-2 flex items-center gap-2 border-t border-ink-500 pt-2">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 flex-shrink-0 text-faint"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l3 2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          <input
            type="time"
            class="field time-dark h-8 !w-28 !py-1 text-[12px]"
            :value="timeStr"
            @input="onTime"
          />
          <div class="flex-1"></div>
          <button type="button" class="rounded-md px-2 py-1 text-[12px] text-faint transition-colors hover:text-txt" @click="clear">Limpar</button>
        </div>
        <div v-else class="mt-2 flex justify-end border-t border-ink-500 pt-2">
          <button type="button" class="rounded-md px-2 py-1 text-[12px] text-faint transition-colors hover:text-txt" @click="clear">Limpar</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import CalendarGrid from './CalendarGrid.vue';
import { ymd, parseYMD, fmtBR } from '../date';
import { formatDateTime } from '../format';

const pad = (n) => String(n).padStart(2, '0');

export default {
  name: 'DatePicker',
  components: { CalendarGrid },
  props: {
    value: { type: String, default: '' }, // ISO (datetime) ou '' — emitido de volta em ISO
    withTime: { type: Boolean, default: true },
    placeholder: { type: String, default: 'Escolher data' },
  },
  emits: ['input'],
  data() {
    return { open: false };
  },
  computed: {
    date() {
      if (!this.value) return null;
      const d = new Date(this.value);
      return Number.isNaN(d.getTime()) ? null : d;
    },
    ymdSel() { return this.date ? ymd(this.date) : ''; },
    timeStr() { return this.date ? `${pad(this.date.getHours())}:${pad(this.date.getMinutes())}` : '00:00'; },
    triggerLabel() {
      if (!this.value) return this.placeholder;
      return this.withTime ? formatDateTime(this.value) : fmtBR(this.value);
    },
  },
  methods: {
    toggle() { this.open ? this.close() : this.openMenu(); },
    openMenu() {
      this.open = true;
      this.$nextTick(() => {
        document.addEventListener('mousedown', this.onDoc);
        document.addEventListener('keydown', this.onEsc);
      });
    },
    // monta o ISO a partir de um YMD + HH:MM (hora local) → UTC
    build(ymdStr, timeStr) {
      const base = parseYMD(ymdStr);
      if (!base) return '';
      const [h, m] = (timeStr || '00:00').split(':').map((x) => Number(x) || 0);
      base.setHours(h, m, 0, 0);
      return base.toISOString();
    },
    onPick(v) {
      const iso = this.build(v, this.withTime ? this.timeStr : '00:00');
      this.$emit('input', iso);
      if (!this.withTime) this.close(); // data pura: escolher já fecha
    },
    onTime(e) {
      const iso = this.build(this.ymdSel || ymd(new Date()), e.target.value);
      this.$emit('input', iso);
    },
    clear() {
      this.$emit('input', '');
      this.close();
    },
    onDoc(e) { if (this.$refs.root && !this.$refs.root.contains(e.target)) this.close(); },
    onEsc(e) { if (e.key === 'Escape') this.close(); },
    close() {
      this.open = false;
      document.removeEventListener('mousedown', this.onDoc);
      document.removeEventListener('keydown', this.onEsc);
    },
  },
  beforeUnmount() {
    document.removeEventListener('mousedown', this.onDoc);
    document.removeEventListener('keydown', this.onEsc);
  },
};
</script>

<style scoped>
.dd-enter-active, .dd-leave-active { transition: opacity .12s ease, transform .12s ease; }
.dd-enter-from, .dd-leave-to { opacity: 0; transform: translateY(-4px); }
/* input de hora nativo em tema dark (só o relógio; o calendário é custom) */
.time-dark { color-scheme: dark; }
</style>
