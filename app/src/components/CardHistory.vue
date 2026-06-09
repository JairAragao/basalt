<template>
  <transition :name="inline ? 'histfade' : 'hist'">
    <aside
      v-if="open"
      :class="inline
        ? 'relative flex w-[520px] max-w-[44vw] flex-shrink-0 flex-col border-l border-ink-500 bg-ink-850'
        : 'fixed inset-y-0 z-40 flex w-[520px] max-w-[94vw] flex-col border-l border-ink-500 bg-ink-850 shadow-2xl'"
      :style="inline ? null : { right: offsetRight + 'px' }"
    >
      <!-- header -->
      <header class="flex h-11 flex-shrink-0 items-center gap-2 border-b border-ink-500 px-3">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 text-muted"><circle cx="10" cy="10" r="7" /><path d="M10 6v4l2.5 1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span class="text-[13px] font-medium text-txt">Histórico</span>
        <div class="flex-1"></div>
        <button v-if="selected" class="icon-btn h-7 px-2 text-[12px]" title="Voltar à lista" @click="selected = null">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M12 5l-5 5 5 5" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <button class="icon-btn h-7 w-7" title="Fechar" @click="$emit('close')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M13 7l-6 6M7 7l6 6" stroke-linecap="round" /></svg>
        </button>
      </header>

      <!-- corpo -->
      <div class="flex-1 overflow-y-auto">
        <!-- estados de carregamento / erro -->
        <div v-if="loading && !entries.length" class="grid h-32 place-items-center text-[12px] text-muted">Carregando histórico…</div>
        <div v-else-if="error" class="m-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-300">{{ error }}</div>

        <!-- LISTA de versões -->
        <ul v-else-if="!selected" class="divide-y divide-ink-500/60">
          <li v-if="!entries.length" class="px-4 py-6 text-center text-[12px] text-faint">Sem histórico para esta tarefa.</li>
          <li
            v-for="(c, i) in entries"
            :key="c.hash"
            class="cursor-pointer px-3.5 py-2.5 transition-colors hover:bg-ink-700"
            @click="openDiff(c)"
          >
            <div class="flex items-center gap-2">
              <span class="pill flex-shrink-0 border border-ink-500 bg-ink-700 font-mono text-[10px] text-muted">{{ c.shortHash }}</span>
              <span class="truncate text-[13px] text-txt">{{ firstLine(c.message) }}</span>
              <span v-if="i === 0" class="pill flex-shrink-0 border border-accent/40 bg-accent/15 text-[10px] text-accent">atual</span>
            </div>
            <div class="mt-1 flex items-center gap-2 text-[11px] text-faint">
              <span class="truncate">{{ c.author }}</span>
              <span>·</span>
              <span class="flex-shrink-0">{{ formatDate(c.date) }}</span>
            </div>
          </li>
        </ul>

        <!-- DETALHE: diff de uma versão -->
        <div v-else class="flex h-full flex-col">
          <!-- meta do commit -->
          <div class="flex-shrink-0 border-b border-ink-500 px-3.5 py-3">
            <div class="text-[13px] text-txt">{{ firstLine(selected.message) }}</div>
            <div class="mt-1 flex items-center gap-2 text-[11px] text-faint">
              <span class="font-mono">{{ selected.shortHash }}</span>
              <span>·</span>
              <span class="truncate">{{ selected.author }}</span>
              <span>·</span>
              <span>{{ formatDate(selected.date) }}</span>
            </div>

            <!-- alternar modo: lado-a-lado | unificado -->
            <div class="mt-2.5 flex items-center rounded-md border border-ink-500 p-0.5 text-[12px]">
              <button
                class="flex-1 rounded px-2 py-1 transition-colors"
                :class="diffMode === 'split' ? 'bg-ink-600 text-txt' : 'text-faint hover:text-muted'"
                @click="diffMode = 'split'"
              >Antes | Depois</button>
              <button
                class="flex-1 rounded px-2 py-1 transition-colors"
                :class="diffMode === 'unified' ? 'bg-ink-600 text-txt' : 'text-faint hover:text-muted'"
                @click="diffMode = 'unified'"
              >Unificado</button>
            </div>
          </div>

          <div class="flex-1 overflow-auto">
            <div v-if="diffLoading" class="grid h-32 place-items-center text-[12px] text-muted">Carregando diff…</div>
            <div v-else-if="diffError" class="m-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-300">{{ diffError }}</div>

            <!-- lado a lado (vermelho = removido · verde = adicionado) -->
            <div v-else-if="diffMode === 'split'" class="grid grid-cols-2 gap-px bg-ink-500 text-[11px] leading-relaxed">
              <div class="bg-ink-900">
                <div class="sticky top-0 border-b border-ink-500 bg-ink-850 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-faint">Antes</div>
                <pre class="overflow-x-auto px-2 py-1.5 font-mono"><code><span
                      v-for="(ln, i) in splitRows.before"
                      :key="i"
                      class="block whitespace-pre-wrap break-words px-1"
                      :class="ln.cls"
                    >{{ ln.text || ' ' }}</span></code></pre>
              </div>
              <div class="bg-ink-900">
                <div class="sticky top-0 border-b border-ink-500 bg-ink-850 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-faint">Depois</div>
                <pre class="overflow-x-auto px-2 py-1.5 font-mono"><code><span
                      v-for="(ln, i) in splitRows.after"
                      :key="i"
                      class="block whitespace-pre-wrap break-words px-1"
                      :class="ln.cls"
                    >{{ ln.text || ' ' }}</span></code></pre>
              </div>
            </div>

            <!-- diff unificado colorido -->
            <pre v-else class="overflow-x-auto px-2 py-1.5 font-mono text-[11px] leading-relaxed"><code><span
                  v-for="(ln, li) in diffLines"
                  :key="li"
                  class="block whitespace-pre-wrap break-words px-1"
                  :class="ln.cls"
                >{{ ln.text || ' ' }}</span></code></pre>
          </div>
        </div>
      </div>
    </aside>
  </transition>
</template>

<script>
import { getHistory, getDiff } from '../api';

export default {
  name: 'CardHistory',
  props: {
    open: { type: Boolean, default: false },
    taskId: { type: String, default: '' },
    // deslocamento da direita (px) — usado p/ encostar ao lado do peek lateral (modo fixo legado)
    offsetRight: { type: Number, default: 0 },
    // inline: renderiza como item flex grudado ao dialog (em vez de painel fixo)
    inline: { type: Boolean, default: false },
  },
  data() {
    return {
      entries: [],
      loading: false,
      error: '',
      selected: null,
      detail: null,
      diffLoading: false,
      diffError: '',
      diffMode: 'split',
    };
  },
  computed: {
    diffLines() {
      const raw = (this.detail && this.detail.diff) || '';
      return raw.split('\n').map((text) => {
        let cls = 'text-muted';
        if (/^\+\+\+|^---/.test(text)) cls = 'text-faint';
        else if (/^@@/.test(text)) cls = 'text-accent';
        else if (text.startsWith('+')) cls = 'bg-green-500/10 text-green-300';
        else if (text.startsWith('-')) cls = 'bg-red-500/10 text-red-300';
        else if (text.startsWith('diff ') || text.startsWith('index ')) cls = 'text-faint';
        return { text, cls };
      });
    },
    // Antes|Depois com realce: vermelho = linha removida, verde = adicionada.
    splitRows() {
      const d = this.detail || {};
      const { before, after } = this.lineDiff(d.before || '', d.after || '');
      const cls = (t) => (t === 'del' ? 'bg-red-500/10 text-red-300' : t === 'add' ? 'bg-green-500/10 text-green-300' : 'text-muted');
      return {
        before: before.map((l) => ({ text: l.text, cls: cls(l.type) })),
        after: after.map((l) => ({ text: l.text, cls: cls(l.type) })),
      };
    },
  },
  watch: {
    open(v) { if (v) this.load(); },
    taskId() { if (this.open) this.load(); },
  },
  created() {
    if (this.open) this.load();
  },
  methods: {
    async load() {
      this.selected = null;
      this.detail = null;
      this.error = '';
      if (!this.taskId) { this.entries = []; return; }
      this.loading = true;
      try {
        const list = await getHistory(this.taskId);
        this.entries = Array.isArray(list) ? list : [];
      } catch (e) {
        this.error = e.message || 'Falha ao carregar histórico.';
      } finally {
        this.loading = false;
      }
    },
    async openDiff(commit) {
      this.selected = commit;
      this.detail = null;
      this.diffError = '';
      this.diffLoading = true;
      try {
        this.detail = await getDiff(this.taskId, commit.hash);
      } catch (e) {
        this.diffError = e.message || 'Falha ao carregar o diff.';
      } finally {
        this.diffLoading = false;
      }
    },
    firstLine(msg) {
      return (msg || '').split('\n')[0] || '(sem mensagem)';
    },
    formatDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    },
    // Diff de linhas via LCS → marca removidas (antes) e adicionadas (depois).
    lineDiff(beforeText, afterText) {
      const a = String(beforeText).split('\n');
      const b = String(afterText).split('\n');
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
      for (let i = m - 1; i >= 0; i--)
        for (let j = n - 1; j >= 0; j--)
          dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      const before = [], after = [];
      let i = 0, j = 0;
      while (i < m && j < n) {
        if (a[i] === b[j]) { before.push({ text: a[i], type: 'same' }); after.push({ text: b[j], type: 'same' }); i++; j++; }
        else if (dp[i + 1][j] >= dp[i][j + 1]) { before.push({ text: a[i], type: 'del' }); i++; }
        else { after.push({ text: b[j], type: 'add' }); j++; }
      }
      while (i < m) { before.push({ text: a[i], type: 'del' }); i++; }
      while (j < n) { after.push({ text: b[j], type: 'add' }); j++; }
      return { before, after };
    },
  },
};
</script>

<style scoped>
.hist-enter-active, .hist-leave-active { transition: transform .22s ease, opacity .22s ease; }
.hist-enter-from, .hist-leave-to { transform: translateX(100%); opacity: 0; }
/* inline (grudado): só fade (não desliza, pra não brigar com o layout flex) */
.histfade-enter-active, .histfade-leave-active { transition: opacity .18s ease; }
.histfade-enter-from, .histfade-leave-to { opacity: 0; }
</style>
