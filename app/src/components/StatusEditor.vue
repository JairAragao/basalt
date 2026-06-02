<template>
  <div class="flex h-full flex-col">
    <div class="flex-1 space-y-6 overflow-y-auto p-1">
      <div
        v-for="(grp, gi) in groups"
        :key="grp.id || gi"
        class="rounded-lg border border-ink-500 bg-ink-850 p-3"
      >
        <!-- rótulo do grupo (editável) -->
        <input
          v-model="grp.label"
          class="field mb-3 !bg-transparent !border-transparent !px-1 text-[12px] font-semibold uppercase tracking-wide text-faint hover:!border-ink-500 focus:!border-accent"
          :placeholder="'Grupo ' + (gi + 1)"
        />

        <!-- etapas -->
        <div class="space-y-1.5">
          <div v-for="(stage, si) in grp.stages" :key="stage._uid" class="flex items-center gap-2">
            <!-- botão de cor + popover de swatches -->
            <div class="relative flex-shrink-0">
              <button
                type="button"
                class="grid h-7 w-7 place-items-center rounded-md border border-ink-500 hover:border-ink-line"
                title="Cor da etapa"
                @click="toggleSwatch(stage._uid)"
              >
                <span class="h-3.5 w-3.5 rounded-full" :style="{ background: stage.color }"></span>
              </button>
              <transition name="dd">
                <div
                  v-if="openSwatch === stage._uid"
                  ref="swatchPop"
                  class="absolute left-0 top-9 z-50 grid w-[156px] grid-cols-5 gap-1.5 rounded-lg border border-ink-line bg-ink-700 p-2 shadow-xl"
                >
                  <button
                    v-for="p in palette"
                    :key="p.value"
                    type="button"
                    class="h-5 w-5 rounded-full ring-offset-2 ring-offset-ink-700 hover:ring-2 hover:ring-ink-line"
                    :class="{ 'ring-2 ring-accent': stage.color === p.value }"
                    :style="{ background: p.value }"
                    :title="p.name"
                    @click="pickColor(stage, p.value)"
                  ></button>
                </div>
              </transition>
            </div>

            <input
              v-model="stage.label"
              class="field flex-1"
              placeholder="Nome da etapa"
            />

            <button
              type="button"
              class="icon-btn h-7 w-7 flex-shrink-0 disabled:opacity-30"
              title="Remover etapa"
              :disabled="grp.stages.length <= 1"
              @click="removeStage(grp, si)"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
            </button>
          </div>
        </div>

        <button
          type="button"
          class="mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-faint hover:bg-ink-700 hover:text-muted"
          @click="addStage(grp)"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M10 4v12M4 10h12" stroke-linecap="round" /></svg>
          etapa
        </button>
      </div>
    </div>

    <!-- footer -->
    <div class="flex flex-shrink-0 items-center gap-3 border-t border-ink-500 pt-3">
      <span v-if="error" class="flex-1 truncate text-[12px] text-red-300" :title="error">{{ error }}</span>
      <span v-else class="flex-1"></span>
      <button
        class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >{{ saving ? 'Salvando…' : 'Salvar status' }}</button>
    </div>
  </div>
</template>

<script>
import { saveStatus } from '../api';
import { PALETTE, DEFAULT_COLOR } from '../palette';

let UID = 0;
const nextUid = () => `s${++UID}`;

export default {
  name: 'StatusEditor',
  props: {
    config: { type: Object, required: true },
  },
  data() {
    return {
      groups: [],
      palette: PALETTE,
      openSwatch: null,
      saving: false,
      error: '',
    };
  },
  created() {
    this.load();
  },
  methods: {
    load() {
      const src = (this.config.board && this.config.board.statusGroups) || [];
      // clone profundo + _uid estável por etapa (p/ casar renames)
      this.groups = src.map((g) => ({
        id: g.id,
        label: g.label || '',
        stages: (g.stages || []).map((s) => ({
          _uid: nextUid(),
          _originalId: s.id, // id antes da edição (p/ rename)
          label: s.label != null ? s.label : s.id,
          color: s.color || DEFAULT_COLOR,
        })),
      }));
    },
    toggleSwatch(uid) {
      this.openSwatch = this.openSwatch === uid ? null : uid;
      if (this.openSwatch) {
        this.$nextTick(() => document.addEventListener('mousedown', this.onDocClick));
      } else {
        document.removeEventListener('mousedown', this.onDocClick);
      }
    },
    onDocClick(e) {
      const pops = this.$refs.swatchPop;
      const arr = Array.isArray(pops) ? pops : pops ? [pops] : [];
      if (arr.some((el) => el && el.contains(e.target))) return;
      // o botão de cor também não fecha (tem seu próprio toggle); fecha o resto
      this.openSwatch = null;
      document.removeEventListener('mousedown', this.onDocClick);
    },
    pickColor(stage, value) {
      stage.color = value;
      this.openSwatch = null;
      document.removeEventListener('mousedown', this.onDocClick);
    },
    addStage(grp) {
      grp.stages.push({ _uid: nextUid(), _originalId: null, label: '', color: DEFAULT_COLOR });
    },
    removeStage(grp, idx) {
      if (grp.stages.length <= 1) return;
      grp.stages.splice(idx, 1);
    },
    validate() {
      const seen = new Set();
      for (const grp of this.groups) {
        for (const stage of grp.stages) {
          const label = (stage.label || '').trim();
          if (!label) return 'Toda etapa precisa de um nome.';
          if (seen.has(label)) return `Etapa duplicada: "${label}".`;
          seen.add(label);
        }
      }
      return '';
    },
    save() {
      const err = this.validate();
      if (err) { this.error = err; return; }
      this.error = '';

      const statusGroups = this.groups.map((g) => ({
        id: g.id,
        label: (g.label || '').trim() || g.id,
        stages: g.stages.map((s) => {
          const label = s.label.trim();
          return { id: label, label, color: s.color };
        }),
      }));

      // renames: etapas existentes cujo id mudou (casadas por _originalId via _uid)
      const renames = [];
      for (const g of this.groups) {
        for (const s of g.stages) {
          if (s._originalId && s.label.trim() && s._originalId !== s.label.trim()) {
            renames.push({ from: s._originalId, to: s.label.trim() });
          }
        }
      }

      this.saving = true;
      saveStatus({ statusGroups, renames })
        .then((updated) => { this.$emit('saved', updated); })
        .catch((e) => { this.error = e.message || 'Falha ao salvar.'; })
        .finally(() => { this.saving = false; });
    },
  },
  beforeUnmount() {
    document.removeEventListener('mousedown', this.onDocClick);
  },
};
</script>

<style scoped>
.dd-enter-active, .dd-leave-active { transition: opacity .12s ease, transform .12s ease; }
.dd-enter-from, .dd-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
