<template>
  <!-- menu de opção de select (estilo Notion): renomear · cor · excluir.
       Popover flutuante (Teleport → body, fixed) com flip perto da borda. -->
  <Teleport to="body">
    <div class="fixed inset-0 z-[90]" @mousedown.stop @click.stop="$emit('close')"></div>
    <div
      ref="panel"
      class="fixed z-[100] w-60 rounded-xl border border-ink-500 bg-ink-850 p-1.5 shadow-2xl"
      :style="{ left: pos.x + 'px', top: pos.y + 'px' }"
      @mousedown.stop
    >
      <!-- renomear (Enter salva) -->
      <input
        ref="name"
        v-model="name"
        class="field !py-1 text-[13px]"
        placeholder="Nome da opção"
        @keydown.enter.prevent="commitRename"
        @click.stop
      />

      <!-- cor: "Automática" (hash da paleta) + grade das 13 cores -->
      <div class="mb-1 mt-2 px-1 text-[11px] text-faint">Cor</div>
      <button
        type="button"
        class="menu-row"
        :class="{ 'bg-ink-700': !color }"
        @click="$emit('recolor', null)"
      >
        <span class="h-3 w-3 flex-shrink-0 rounded-full" :style="{ background: autoColor }"></span>
        <span class="flex-1 text-left">Automática</span>
        <svg v-if="!color" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5 flex-shrink-0 text-txt"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
      <div class="mt-1.5 grid grid-cols-7 gap-1.5 px-1.5 pb-1">
        <button
          v-for="p in palette"
          :key="p.value"
          type="button"
          class="h-5 w-5 rounded-full hover:ring-2 hover:ring-ink-line"
          :class="{ 'ring-2 ring-accent': color === p.value }"
          :style="{ background: p.value }"
          :title="p.name"
          @click="$emit('recolor', p.value)"
        ></button>
      </div>

      <div class="my-1.5 h-px bg-ink-500"></div>

      <!-- excluir com confirmação inline (mostra contagem de uso) -->
      <button v-if="!confirming" type="button" class="menu-row menu-row--danger" @click="confirming = true">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 flex-shrink-0"><path d="M4 6h12M8 6V4.5h4V6M6.5 6l.6 9h5.8l.6-9" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span>Excluir opção</span>
      </button>
      <template v-else>
        <div class="px-2 py-1 text-[12px] text-muted">
          {{ usageCount }} tarefa(s) usam esta opção.
        </div>
        <div class="flex gap-1.5 px-1 pb-0.5 pt-0.5">
          <button type="button" class="flex-1 rounded-md bg-red-600 px-2 py-1 text-[12px] font-medium text-white hover:brightness-110" @click="$emit('delete')">Excluir</button>
          <button type="button" class="flex-1 rounded-md px-2 py-1 text-[12px] text-muted hover:bg-ink-700" @click="confirming = false">Cancelar</button>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script>
import { PALETTE, colorFor } from '../palette';

const W = 240; // largura do painel (w-60)

export default {
  name: 'OptionMenu',
  inject: { injectedTasks: { from: 'basaltTasks', default: null } },
  props: {
    option: { type: String, required: true }, // valor/rótulo atual da opção
    color: { type: String, default: null }, // cor explícita do optionMeta (null = automática)
    propKey: { type: String, default: '' }, // chave da prop nas tarefas (p/ contagem)
    propType: { type: String, default: 'enum' }, // enum | multiselect
    // valor como está GRAVADO nas tarefas (PropertyEditor passa o original
    // pré-rename não-salvo); default = option
    countValue: { type: String, default: null },
    anchor: { type: Object, required: true }, // rect do gatilho: { left, top, bottom }
  },
  emits: ['rename', 'recolor', 'delete', 'close'],
  data() {
    return {
      name: this.option,
      confirming: false,
      palette: PALETTE,
      pos: this.initialPos(),
    };
  },
  computed: {
    autoColor() { return colorFor(this.option); },
    usageCount() {
      const tasks = (this.injectedTasks && this.injectedTasks.value) || [];
      const key = this.propKey;
      if (!key) return 0;
      const target = this.countValue != null ? this.countValue : this.option;
      let n = 0;
      for (const t of tasks) {
        const v = t ? t[key] : undefined;
        if (v === null || v === undefined || v === '') continue;
        if (this.propType === 'multiselect') {
          if (String(v).split(';').map((s) => s.trim()).includes(target)) n += 1;
        } else if (v === target) n += 1;
      }
      return n;
    },
  },
  mounted() {
    document.addEventListener('keydown', this.onEsc, true);
    // flip: depois de medir a altura real, abre pra cima se estourar a borda
    this.$nextTick(() => {
      const el = this.$refs.panel;
      if (!el) return;
      const h = el.offsetHeight;
      let y = this.anchor.bottom + 6;
      if (y + h > window.innerHeight - 8) y = Math.max(8, this.anchor.top - h - 6);
      this.pos = { ...this.pos, y };
      const inp = this.$refs.name;
      if (inp) { inp.focus(); inp.select(); }
    });
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.onEsc, true);
  },
  methods: {
    initialPos() {
      let x = this.anchor.left;
      if (x + W > window.innerWidth - 8) x = window.innerWidth - W - 8;
      if (x < 8) x = 8;
      return { x, y: this.anchor.bottom + 6 };
    },
    commitRename() {
      const to = (this.name || '').trim();
      if (to && to !== this.option) this.$emit('rename', to);
      else this.$emit('close');
    },
    onEsc(e) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (this.confirming) this.confirming = false;
      else this.$emit('close');
    },
  },
};
</script>

<style scoped>
.menu-row {
  @apply flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-ink-700;
}
.menu-row--danger:hover {
  @apply bg-red-500/10 text-red-300;
}
</style>
