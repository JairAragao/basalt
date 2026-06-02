<template>
  <div class="relative" ref="root">
    <button
      type="button"
      class="field flex items-center justify-between gap-2 text-left"
      :class="{ 'border-accent': open }"
      @click="toggle"
    >
      <span class="flex min-w-0 items-center gap-2">
        <span v-if="selected && selected.color" class="h-2.5 w-2.5 flex-shrink-0 rounded-full" :style="{ background: selected.color }"></span>
        <span class="truncate" :class="{ 'text-faint': !selected }">{{ selected ? selected.label : placeholder }}</span>
      </span>
      <svg viewBox="0 0 20 20" class="h-4 w-4 flex-shrink-0 text-faint" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>

    <transition name="dd">
      <div v-if="open" class="absolute z-50 mt-1 max-h-64 w-full min-w-[11rem] overflow-auto rounded-lg border border-ink-line bg-ink-700 p-1 shadow-xl">
        <button v-if="clearable" type="button" class="dd-opt text-faint" @click="pick(null)">— limpar —</button>
        <button
          v-for="opt in normalized"
          :key="String(opt.value)"
          type="button"
          class="dd-opt"
          :class="{ 'bg-ink-600': isSelected(opt) }"
          @click="pick(opt.value)"
        >
          <span v-if="opt.color" class="h-2.5 w-2.5 flex-shrink-0 rounded-full" :style="{ background: opt.color }"></span>
          <span class="flex-1 truncate">{{ opt.label }}</span>
          <svg v-if="isSelected(opt)" viewBox="0 0 20 20" class="h-3.5 w-3.5 flex-shrink-0 text-txt" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <div v-if="!normalized.length" class="px-2 py-1.5 text-[12px] text-faint">sem opções</div>
      </div>
    </transition>
  </div>
</template>

<script>
export default {
  name: 'Dropdown',
  props: {
    value: { default: null },
    options: { type: Array, default: () => [] },
    placeholder: { type: String, default: 'Selecionar' },
    clearable: { type: Boolean, default: false },
  },
  data() {
    return { open: false };
  },
  computed: {
    normalized() {
      return (this.options || []).map((o) =>
        o && typeof o === 'object'
          ? { value: o.value, label: o.label != null ? o.label : o.value, color: o.color }
          : { value: o, label: String(o) }
      );
    },
    selected() {
      return this.normalized.find((o) => o.value === this.value) || null;
    },
  },
  methods: {
    toggle() {
      this.open = !this.open;
      if (this.open) {
        this.$nextTick(() => {
          document.addEventListener('mousedown', this.onDoc);
          document.addEventListener('keydown', this.onEsc);
        });
      } else {
        this.unbind();
      }
    },
    pick(v) {
      this.$emit('input', v);
      this.close();
    },
    isSelected(o) {
      return o.value === this.value;
    },
    onDoc(e) {
      if (this.$refs.root && !this.$refs.root.contains(e.target)) this.close();
    },
    onEsc(e) {
      if (e.key === 'Escape') this.close();
    },
    unbind() {
      document.removeEventListener('mousedown', this.onDoc);
      document.removeEventListener('keydown', this.onEsc);
    },
    close() {
      this.open = false;
      this.unbind();
    },
  },
  beforeUnmount() {
    this.unbind();
  },
};
</script>

<style scoped>
.dd-opt {
  @apply flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-txt transition-colors hover:bg-ink-600;
}
.dd-enter-active, .dd-leave-active { transition: opacity .12s ease, transform .12s ease; }
.dd-enter-from, .dd-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
