<template>
  <transition :name="inline ? 'cmtfade' : 'cmt'">
    <aside
      v-if="open"
      :class="inline
        ? 'relative flex min-h-0 w-[380px] max-w-[34vw] flex-shrink-0 flex-col overflow-hidden border-l border-ink-500 bg-ink-850'
        : 'fixed inset-y-0 right-0 z-40 flex w-[420px] max-w-[94vw] flex-col overflow-hidden border-l border-ink-500 bg-ink-850 shadow-2xl'"
    >
      <header class="flex h-11 flex-shrink-0 items-center gap-2 border-b border-ink-500 px-3">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4 text-muted"><path d="M4 5.5h12a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H8l-3.5 3v-3H4A1.5 1.5 0 0 1 2.5 12V7A1.5 1.5 0 0 1 4 5.5Z" stroke-linejoin="round" /></svg>
        <span class="text-[13px] font-medium text-txt">Comentários</span>
        <span v-if="comments.length" class="pill border border-ink-500 bg-ink-700 text-[10px] text-muted">{{ comments.length }}</span>
        <div class="flex-1"></div>
        <button class="icon-btn h-7 w-7" title="Fechar" @click="$emit('close')">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M13 7l-6 6M7 7l6 6" stroke-linecap="round" /></svg>
        </button>
      </header>

      <div class="flex-1 overflow-y-auto">
        <div v-if="loading && !comments.length" class="grid h-24 place-items-center text-[12px] text-muted">Carregando…</div>
        <div v-else-if="error" class="m-3 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-[12px] text-red-300">{{ error }}</div>
        <div v-else-if="!comments.length" class="px-4 py-8 text-center text-[12px] text-faint">Nenhum comentário ainda.<br />Seja o primeiro a comentar.</div>

        <ul v-else class="flex flex-col gap-2 p-3">
          <li v-for="(c, i) in comments" :key="i" class="group/c rounded-lg border border-ink-500/70 bg-ink-800 p-2.5">
            <div class="flex items-center gap-2">
              <span class="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-ink-600 text-[9px] font-semibold uppercase text-muted">{{ initials(c.author) }}</span>
              <span class="truncate text-[12.5px] font-medium text-txt">{{ nameOf(c.author) }}</span>
              <span class="flex-1"></span>
              <span class="flex-shrink-0 text-[10.5px] text-faint">{{ formatDate(c.at) }}</span>
              <button
                class="icon-btn h-5 w-5 flex-shrink-0 opacity-0 transition-opacity group-hover/c:opacity-100 hover:!text-red-300"
                :class="{ '!bg-red-500/20 !text-red-300 !opacity-100': confirmingDelete === i }"
                :title="confirmingDelete === i ? 'Clique de novo para excluir' : 'Excluir comentário'"
                @click="onDelete(i)"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
              </button>
            </div>
            <div class="mt-1.5 whitespace-pre-wrap break-words pl-7 text-[13px] leading-relaxed text-muted">{{ c.text }}</div>
          </li>
        </ul>
      </div>

      <div class="flex-shrink-0 border-t border-ink-500 p-2.5">
        <textarea
          ref="input"
          v-model="draft"
          rows="2"
          class="field w-full resize-none text-[13px]"
          placeholder="Escreva um comentário… (Ctrl+Enter envia)"
          @keydown.enter.exact.prevent="onEnter"
          @keydown.ctrl.enter.prevent="submit"
          @keydown.meta.enter.prevent="submit"
        ></textarea>
        <div class="mt-2 flex items-center justify-end gap-2">
          <span v-if="saving" class="mr-auto text-[11px] text-faint">Enviando…</span>
          <button
            class="rounded-md bg-accent px-3 py-1.5 text-[12.5px] font-medium text-ink-900 hover:brightness-110 disabled:opacity-40"
            :disabled="saving || !draft.trim()"
            @click="submit"
          >Comentar</button>
        </div>
      </div>
    </aside>
  </transition>
</template>

<script>
import { getComments, addComment, removeComment } from '../api';

export default {
  name: 'CardComments',
  props: {
    open: { type: Boolean, default: false },
    taskId: { type: String, default: '' },
    users: { type: Array, default: () => [] },
    inline: { type: Boolean, default: false },
  },
  emits: ['close', 'count', 'error'],
  data() {
    return { comments: [], loading: false, error: '', draft: '', saving: false, confirmingDelete: null };
  },
  watch: {
    open(v) { if (v) this.load(); },
    taskId() { if (this.open) this.load(); },
  },
  created() { if (this.open) this.load(); },
  methods: {
    async load() {
      this.error = '';
      if (!this.taskId) { this.comments = []; return; }
      this.loading = true;
      try {
        const r = await getComments(this.taskId);
        this.comments = (r && Array.isArray(r.comments)) ? r.comments : [];
        this.$emit('count', this.comments.length);
      } catch (e) {
        this.error = e.message || 'Falha ao carregar comentários.';
      } finally {
        this.loading = false;
      }
    },
    async submit() {
      const text = this.draft.trim();
      if (!text || this.saving) return;
      this.saving = true;
      try {
        const r = await addComment(this.taskId, text);
        this.comments = (r && Array.isArray(r.comments)) ? r.comments : this.comments;
        this.$emit('count', this.comments.length);
        if (r && r.warning) this.$emit('error', r.warning);
        this.draft = '';
        this.$nextTick(() => { if (this.$refs.input) this.$refs.input.focus(); });
      } catch (e) {
        this.$emit('error', e.message || 'Falha ao comentar.');
      } finally {
        this.saving = false;
      }
    },
    async onDelete(i) {
      if (this.confirmingDelete !== i) {
        this.confirmingDelete = i;
        clearTimeout(this._confirmTimer);
        this._confirmTimer = setTimeout(() => { this.confirmingDelete = null; }, 3000);
        return;
      }
      clearTimeout(this._confirmTimer);
      this.confirmingDelete = null;
      try {
        const r = await removeComment(this.taskId, i);
        this.comments = (r && Array.isArray(r.comments)) ? r.comments : this.comments;
        this.$emit('count', this.comments.length);
        if (r && r.warning) this.$emit('error', r.warning);
      } catch (e) {
        this.$emit('error', e.message || 'Falha ao excluir o comentário.');
      }
    },
    onEnter() { this.draft += '\n'; },
    nameOf(author) {
      const a = String(author || '').trim();
      if (!a) return 'Alguém';
      const u = (this.users || []).find((x) => (x.gitNames || []).includes(a) || x.nome === a);
      return (u && u.nome) || a;
    },
    initials(author) {
      const n = this.nameOf(author);
      const parts = String(n).trim().split(/\s+/);
      return ((parts[0] || '')[0] || '') + ((parts[1] || '')[0] || '') || (n[0] || '?');
    },
    formatDate(iso) {
      if (!iso) return '';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    },
  },
};
</script>

<style scoped>
.cmt-enter-active, .cmt-leave-active { transition: transform .22s ease, opacity .22s ease; }
.cmt-enter-from, .cmt-leave-to { transform: translateX(100%); opacity: 0; }
.cmtfade-enter-active, .cmtfade-leave-active { transition: opacity .18s ease; }
.cmtfade-enter-from, .cmtfade-leave-to { opacity: 0; }
</style>
