<template>
  <div class="flex h-full flex-col">
    <p class="mb-2 px-1 text-[12px] leading-relaxed text-faint">
      Todos os commits do vault (tarefas, config, assets), do mais recente ao mais antigo.
      Clique num commit de tarefa para abri-la no diff daquele commit.
    </p>

    <div class="thin-scroll flex-1 overflow-y-auto pr-1">
      <div v-if="error" class="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-300">
        {{ error }}
      </div>

      <div v-else-if="!commits.length && !loading" class="grid place-items-center py-16 text-center text-[13px] text-faint">
        Sem commits ainda.
      </div>

      <ol v-else class="space-y-1">
        <li
          v-for="c in decorated"
          :key="c.hash"
          class="rounded-lg border border-ink-500 bg-ink-850"
        >
          <div
            class="flex items-start gap-2 px-3 py-2"
            :class="c.taskFiles.length ? 'cursor-pointer transition-colors hover:bg-ink-700' : ''"
            @click="onCommitClick(c)"
          >
            <div class="min-w-0 flex-1">
              <div class="truncate text-[13px] text-txt" :title="c.message">{{ c.message || '(sem mensagem)' }}</div>
              <div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-faint">
                <span>{{ formatDateTime(c.date) }}</span>
                <span class="text-ink-line">·</span>
                <span class="text-muted">{{ c.authorName || '—' }}</span>
                <span class="text-ink-line">·</span>
                <span>{{ c.filesCount }} {{ c.filesCount === 1 ? 'arquivo' : 'arquivos' }}</span>
                <span
                  v-if="c.taskFiles.length"
                  class="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent"
                >{{ c.taskFiles.length }} {{ c.taskFiles.length === 1 ? 'tarefa' : 'tarefas' }}</span>
              </div>
            </div>
            <code class="flex-shrink-0 rounded bg-ink-700 px-1.5 py-0.5 text-[11px] text-muted">{{ c.shortHash }}</code>
            <svg
              v-if="c.taskFiles.length"
              viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"
              class="mt-0.5 h-4 w-4 flex-shrink-0 text-faint"
              :class="{ 'rotate-90': c.taskFiles.length > 1 && expanded === c.hash }"
            ><path d="M8 6l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </div>

          <div v-if="c.taskFiles.length > 1 && expanded === c.hash" class="border-t border-ink-500/60 p-1">
            <button
              v-for="tf in c.taskFiles"
              :key="tf.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-txt transition-colors hover:bg-ink-700"
              @click.stop="openTask(tf.id, c.hash)"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5 flex-shrink-0 text-faint"><path d="M6 4h8v12H6zM8 8h4M8 11h4" stroke-linecap="round"/></svg>
              <span class="min-w-0 flex-1 truncate">{{ tf.label }}</span>
              <span class="flex-shrink-0 font-mono text-[10px] text-faint">{{ tf.id }}</span>
            </button>
          </div>
        </li>
      </ol>

      <div v-if="loading" class="py-4 text-center text-[12px] text-faint">Carregando…</div>

      <button
        v-if="hasMore && !loading"
        class="mt-2 w-full rounded-md border border-ink-500 py-2 text-[12px] text-muted transition-colors hover:bg-ink-700"
        @click="loadMore"
      >Carregar mais</button>
    </div>

    <div class="flex-shrink-0 border-t border-ink-500 pt-2 text-[11px] text-faint">
      {{ commits.length }} commit(s) carregado(s)
    </div>
  </div>
</template>

<script>
import { getGlobalHistory } from '../api';
import { formatDateTime } from '../format';

const PAGE = 50;
const TASK_RE = /^tasks\/(.+)\.md$/;

export default {
  name: 'GitHistory',
  props: {
    // roster de tarefas atuais (App) — resolve id → título no seletor
    tasks: { type: Array, default: () => [] },
  },
  emits: ['open-task'],
  data() {
    return {
      commits: [],
      hasMore: false,
      loading: false,
      error: '',
      expanded: null, // hash do commit com seletor de tarefas aberto
    };
  },
  computed: {
    titleMap() {
      const m = {};
      for (const t of this.tasks) if (t && t.id) m[String(t.id)] = t.titulo || t.id;
      return m;
    },
    // anexa taskFiles (só arquivos de tarefa) a cada commit
    decorated() {
      return this.commits.map((c) => {
        const taskFiles = [];
        const seen = new Set();
        for (const f of c.files || []) {
          const mt = TASK_RE.exec(f);
          if (!mt) continue;
          const id = mt[1];
          if (seen.has(id)) continue;
          seen.add(id);
          taskFiles.push({ id, label: this.titleMap[id] || id });
        }
        return { ...c, taskFiles };
      });
    },
  },
  created() {
    this.reset();
  },
  methods: {
    formatDateTime,
    onCommitClick(c) {
      if (!c.taskFiles.length) return; // config/gráfico → não abre nada
      if (c.taskFiles.length === 1) return this.openTask(c.taskFiles[0].id, c.hash);
      this.expanded = this.expanded === c.hash ? null : c.hash; // >1 → alterna seletor
    },
    openTask(taskId, hash) {
      this.$emit('open-task', { taskId, hash });
    },
    async reset() {
      this.commits = [];
      this.hasMore = false;
      this.error = '';
      this.expanded = null;
      await this.fetchPage(0);
    },
    async loadMore() {
      await this.fetchPage(this.commits.length);
    },
    async fetchPage(skip) {
      if (this.loading) return;
      this.loading = true;
      try {
        const r = await getGlobalHistory(skip, PAGE);
        const fresh = (r && r.commits) || [];
        const seen = new Set(this.commits.map((c) => c.hash));
        this.commits.push(...fresh.filter((c) => c.hash && !seen.has(c.hash)));
        this.hasMore = !!(r && r.hasMore);
      } catch (e) {
        this.error = e.message || 'Falha ao carregar o histórico.';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>
