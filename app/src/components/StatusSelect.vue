<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="field flex min-h-[34px] items-center justify-between gap-2 text-left"
      :class="{ 'border-accent': open }"
      @click="toggle"
    >
      <span class="flex min-w-0 items-center gap-2">
        <span v-if="currentColor" class="h-2.5 w-2.5 flex-shrink-0 rounded-full" :style="{ background: currentColor }"></span>
        <span class="truncate" :class="{ 'text-faint': !value }">{{ value || placeholder }}</span>
      </span>
      <svg viewBox="0 0 20 20" class="h-4 w-4 flex-shrink-0 text-faint" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 8l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>

    <transition name="dd">
      <div v-if="open" class="absolute z-50 mt-1 w-72 rounded-lg border border-ink-line bg-ink-700 p-1 shadow-xl">
        <input
          v-if="showSearch"
          v-model="query"
          type="text"
          class="field mb-1 !py-1 text-[12px]"
          placeholder="Buscar etapa…"
          @click.stop
        />
        <div class="max-h-80 overflow-auto">
          <template v-for="(g, gi) in groupsLocal" :key="g.id || gi">
            <!-- separador da etapa macro (some quando o filtro esconde o grupo) -->
            <div v-show="groupHasMatch(g)" class="flex items-center gap-1.5 px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-faint">
              <span class="truncate">{{ g.label }}</span>
              <span class="h-px flex-1 bg-ink-500"></span>
            </div>

            <div v-show="matchesQuery(s)" v-for="(s, si) in g.stages" :key="s.id" class="group/st flex items-center gap-0.5">
              <template v-if="editing && editing.gi === gi && editing.si === si">
                <span class="ml-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" :style="{ background: s.color }"></span>
                <input
                  ref="editInput"
                  v-model="editVal"
                  class="field !py-0.5 flex-1 text-[12px]"
                  @click.stop
                  @keydown.enter.prevent="commitRename(gi, si)"
                  @keydown.esc.prevent="cancelEdit"
                />
                <button type="button" class="icon-btn h-6 w-6 flex-shrink-0" title="Confirmar" @click.stop="commitRename(gi, si)">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" class="h-3.5 w-3.5"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
              </template>
              <template v-else>
                <button type="button" class="dd-opt flex-1" :class="{ 'bg-ink-600': s.id === value }" @click="pick(s.id)">
                  <span class="h-2.5 w-2.5 flex-shrink-0 rounded-full" :style="{ background: s.color }"></span>
                  <span class="flex-1 truncate">{{ s.label }}</span>
                  <svg v-if="s.id === value" viewBox="0 0 20 20" class="h-3.5 w-3.5 flex-shrink-0 text-txt" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
                <!-- ações da etapa (hover) -->
                <button type="button" class="icon-btn h-6 w-6 flex-shrink-0 opacity-0 group-hover/st:opacity-100" title="Cor" @click.stop="toggleColor(s.id)">
                  <span class="h-3 w-3 rounded-full ring-1 ring-ink-400" :style="{ background: s.color }"></span>
                </button>
                <button type="button" class="icon-btn h-6 w-6 flex-shrink-0 opacity-0 group-hover/st:opacity-100" title="Renomear" @click.stop="startRename(gi, si)">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5"><path d="M13 4l3 3-8 8H5v-3z" stroke-linejoin="round" /></svg>
                </button>
                <button type="button" class="icon-btn h-6 w-6 flex-shrink-0 opacity-0 group-hover/st:opacity-100" title="Mover ↑" @click.stop="moveStage(gi, si, -1)">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M10 15V5M6 9l4-4 4 4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
                <button type="button" class="icon-btn h-6 w-6 flex-shrink-0 opacity-0 group-hover/st:opacity-100" title="Mover ↓" @click.stop="moveStage(gi, si, 1)">
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M10 5v10M6 11l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </button>
                <button
                  type="button"
                  class="icon-btn h-6 w-6 flex-shrink-0 opacity-0 hover:!text-red-300 group-hover/st:opacity-100"
                  :class="{ '!bg-red-500/20 !text-red-300 !opacity-100': confirmingDelete === gi + ':' + si }"
                  :title="confirmingDelete === gi + ':' + si ? 'Clique de novo para excluir' : 'Excluir etapa'"
                  :disabled="g.stages.length <= 1"
                  @click.stop="deleteStage(gi, si)"
                >
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
                </button>
              </template>

              <div v-if="colorFor === s.id" class="st-palette absolute right-1 z-50 mt-1 flex flex-wrap gap-1 rounded-md border border-ink-500 bg-ink-800 p-1.5 shadow-xl" @click.stop>
                <button
                  v-for="c in palette"
                  :key="c"
                  type="button"
                  class="h-5 w-5 rounded-full ring-1 ring-ink-400 transition-transform hover:scale-110"
                  :style="{ background: c }"
                  @click="setColor(gi, si, c)"
                ></button>
              </div>
            </div>
          </template>
        </div>
        <div v-if="deleteBlocked" class="mx-1 mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] leading-snug text-amber-300">
          “{{ deleteBlocked }}” tem tarefas. Exclua em Configurações &gt; Status pra escolher pra onde movê-las.
        </div>
        <!-- adicionar etapa por grupo -->
        <div class="mt-1 border-t border-ink-500 pt-1">
          <input
            v-model="newStage.label"
            class="field !py-1 text-[12px]"
            placeholder="+ nova etapa (Enter)"
            @click.stop
            @keydown.enter.prevent="addStage"
          />
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
// Select de STATUS estilo Notion: etapas agrupadas pela etapa macro (separador),
// com edição inline (cor, renomear, mover, excluir, adicionar). Persiste via o pai
// (emit 'save-status' { statusGroups, renames }), que chama PUT /board/status.
const PALETTE = ['#9b9b9b', '#7d828c', '#4b4b4b', '#d9a01e', '#d9730d', '#4a8fe0', '#4caf72', '#2f9e58', '#e0566b', '#a855f7', '#0891b2'];

export default {
  name: 'StatusSelect',
  inject: { injectedTasks: { from: 'basaltTasks', default: null } },
  props: {
    value: { default: '' },
    config: { type: Object, required: true },
    placeholder: { type: String, default: 'Status' },
  },
  data() {
    return {
      open: false,
      groupsLocal: [],
      editing: null, // { gi, si }
      editVal: '',
      colorFor: null, // stage id com paleta aberta
      query: '', // filtro de etapas (aparece quando há muitas)
      confirmingDelete: null, // "gi:si" armado pro 2º clique de exclusão
      deleteBlocked: null, // stage id cuja exclusão foi bloqueada (em uso)
      newStage: { label: '' },
      palette: PALETTE,
    };
  },
  computed: {
    tasksList() { const i = this.injectedTasks; return (i && i.value) ? i.value : []; },
    stageCount() { return this.groupsLocal.reduce((n, g) => n + g.stages.length, 0); },
    showSearch() { return this.stageCount >= 8; },
    groups() { return (this.config.board && this.config.board.statusGroups) || []; },
    currentColor() {
      const cols = (this.config.board && this.config.board.columns) || [];
      const c = cols.find((x) => x.id === this.value);
      return c ? c.color : null;
    },
  },
  watch: {
    config() { if (!this.editing) this.syncLocal(); },
  },
  methods: {
    syncLocal() {
      this.groupsLocal = JSON.parse(JSON.stringify(this.groups));
    },
    toggle() {
      this.open = !this.open;
      if (this.open) {
        this.syncLocal();
        this.cancelEdit();
        this.colorFor = null;
        this.$nextTick(() => {
          document.addEventListener('mousedown', this.onDoc);
          document.addEventListener('keydown', this.onEsc);
        });
      } else { this.unbind(); }
    },
    pick(id) { this.$emit('input', id); this.close(); },
    // ── edição de etapas ──
    persist(renames) {
      this.$emit('save-status', { statusGroups: this.groupsLocal, renames: renames || [] });
    },
    startRename(gi, si) {
      this.editing = { gi, si };
      this.editVal = this.groupsLocal[gi].stages[si].label;
      this.$nextTick(() => {
        const el = this.$refs.editInput;
        const node = Array.isArray(el) ? el[0] : el;
        if (node) { node.focus(); node.select(); }
      });
    },
    commitRename(gi, si) {
      const to = (this.editVal || '').trim();
      const stage = this.groupsLocal[gi].stages[si];
      const from = stage.id;
      this.cancelEdit();
      if (!to || to === from) return;
      // id === label (o id é o valor gravado nas tarefas); renomeia ambos e migra tarefas
      stage.id = to;
      stage.label = to;
      this.persist([{ from, to }]);
    },
    cancelEdit() { this.editing = null; this.editVal = ''; },
    stageInUse(id) {
      const key = (this.config.board && this.config.board.groupBy) || 'status';
      return this.tasksList.some((t) => t && t[key] === id);
    },
    matchesQuery(s) {
      const q = this.query.trim().toLowerCase();
      if (!q) return true;
      return String(s.label || s.id || '').toLowerCase().includes(q);
    },
    groupHasMatch(g) { return (g.stages || []).some((s) => this.matchesQuery(s)); },
    toggleColor(id) { this.colorFor = this.colorFor === id ? null : id; },
    setColor(gi, si, c) {
      this.groupsLocal[gi].stages[si].color = c;
      this.colorFor = null;
      this.persist();
    },
    deleteStage(gi, si) {
      if (this.groupsLocal[gi].stages.length <= 1) return; // grupo não pode ficar vazio
      const stage = this.groupsLocal[gi].stages[si];
      // etapa em uso: excluir aqui deixaria os cards órfãos. A migração pro
      // destino vive no editor completo (Configurações > Status) — redireciona.
      if (this.stageInUse(stage.id)) {
        this.confirmingDelete = null;
        this.deleteBlocked = stage.id;
        clearTimeout(this._blockTimer);
        this._blockTimer = setTimeout(() => { this.deleteBlocked = null; }, 4000);
        return;
      }
      const key = `${gi}:${si}`;
      if (this.confirmingDelete !== key) {
        this.confirmingDelete = key;
        clearTimeout(this._confirmTimer);
        this._confirmTimer = setTimeout(() => { this.confirmingDelete = null; }, 3000);
        return;
      }
      clearTimeout(this._confirmTimer);
      this.confirmingDelete = null;
      this.groupsLocal[gi].stages.splice(si, 1);
      this.persist();
    },
    // move ↑/↓; ao cruzar a borda do grupo, passa pro grupo vizinho
    moveStage(gi, si, dir) {
      const group = this.groupsLocal[gi];
      const target = si + dir;
      if (target >= 0 && target < group.stages.length) {
        const tmp = group.stages[target];
        group.stages[target] = group.stages[si];
        group.stages[si] = tmp;
        this.persist();
        return;
      }
      // borda: move pro grupo vizinho (não esvazia o grupo de origem)
      if (group.stages.length <= 1) return;
      const ngi = gi + dir;
      if (ngi < 0 || ngi >= this.groupsLocal.length) return;
      const [stage] = group.stages.splice(si, 1);
      if (dir < 0) this.groupsLocal[ngi].stages.push(stage); // sobe → fim do grupo de cima
      else this.groupsLocal[ngi].stages.unshift(stage);      // desce → início do grupo de baixo
      this.persist();
    },
    addStage() {
      const label = (this.newStage.label || '').trim();
      if (!label) return;
      // adiciona na ÚLTIMA etapa macro por padrão (ex.: "Concluído")
      const gi = this.groupsLocal.length - 1;
      if (gi < 0) return;
      if (this.groupsLocal[gi].stages.some((s) => s.id === label)) { this.newStage.label = ''; return; }
      this.groupsLocal[gi].stages.push({ id: label, label, color: '#9b9b9b' });
      this.newStage.label = '';
      this.persist();
    },
    onDoc(e) {
      if (this.colorFor) {
        // fecha a paleta SÓ se o mousedown foi fora dela — antes, o próprio
        // mousedown no swatch fechava a paleta antes do click completar e a
        // cor NUNCA era aplicada.
        if (!(e.target && e.target.closest && e.target.closest('.st-palette'))) this.colorFor = null;
        return;
      }
      if (this.$refs.root && !this.$refs.root.contains(e.target)) this.close();
    },
    onEsc(e) {
      if (e.key !== 'Escape') return;
      if (this.editing) this.cancelEdit();
      else if (this.colorFor) this.colorFor = null;
      else this.close();
    },
    unbind() {
      document.removeEventListener('mousedown', this.onDoc);
      document.removeEventListener('keydown', this.onEsc);
    },
    close() { this.open = false; this.cancelEdit(); this.colorFor = null; this.unbind(); },
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
