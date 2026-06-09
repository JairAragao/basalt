<template>
  <div :class="embedded ? 'h-full w-full grid place-items-center overflow-auto bg-ink-900 p-4' : 'fixed inset-0 z-50 grid place-items-center bg-black/60 p-4'">
    <div class="flex max-h-[90vh] min-h-[620px] w-[840px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-ink-500 bg-ink-800 shadow-2xl">
      <!-- header com stepper -->
      <header class="flex-shrink-0 border-b border-ink-500 px-5 py-4">
        <div class="flex items-center gap-2">
          <span class="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4"><path d="M4 15.5 9 4l2 5 3-2 2 8.5z" stroke-linejoin="round" /></svg>
          </span>
          <div class="text-[15px] font-medium text-txt">Configuração do Basalt</div>
          <div class="flex-1"></div>
          <button class="rounded-md px-2 py-1 text-[12px] text-faint hover:bg-ink-700 hover:text-muted" @click="$emit('dismiss')">Pular</button>
        </div>

        <!-- trilha de etapas -->
        <ol class="mt-3.5 flex items-center gap-1.5">
          <li v-for="(s, i) in steps" :key="s.id" class="flex flex-1 items-center gap-1.5">
            <span
              class="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[10px] font-semibold transition-colors"
              :class="i < idx ? 'bg-green-500/20 text-green-400'
                : i === idx ? 'bg-accent text-white'
                : 'bg-ink-600 text-faint'"
            >
              <svg v-if="i < idx" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" class="h-3 w-3"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
              <template v-else>{{ i + 1 }}</template>
            </span>
            <span class="truncate text-[11px]" :class="i === idx ? 'text-txt' : 'text-faint'">{{ s.label }}</span>
            <span v-if="i < steps.length - 1" class="h-px flex-1 bg-ink-500"></span>
          </li>
        </ol>
      </header>

      <!-- corpo da etapa -->
      <div class="flex-1 overflow-y-auto px-5 py-4">
        <!-- ETAPA: BOAS-VINDAS -->
        <section v-if="step.id === 'welcome'" class="space-y-4">
          <div>
            <h2 class="text-[15px] font-medium text-txt">Bem-vindo ao Basalt</h2>
            <p class="mt-1 text-[13px] leading-relaxed text-muted">
              Um kanban <strong class="text-txt">git-native</strong> e <strong class="text-txt">local-first</strong>: cada tarefa é
              um arquivo <code class="font-mono text-amber-200">.md</code> versionado no git. Sem banco, sem nuvem obrigatória — seus dados ficam com você.
            </p>
          </div>
          <div class="grid gap-2.5">
            <div v-for="f in welcomeFacts" :key="f.t" class="flex items-start gap-3 rounded-lg border border-ink-500 bg-ink-850 p-3">
              <span class="mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-md bg-accent/15 text-amber-300" v-html="f.icon"></span>
              <div>
                <div class="text-[13px] text-txt">{{ f.t }}</div>
                <div class="mt-0.5 text-[12px] leading-relaxed text-muted">{{ f.d }}</div>
              </div>
            </div>
          </div>
          <p class="text-[12px] text-faint">
            No próximo passo você escolhe a <strong class="text-muted">pasta do vault</strong> — onde o Basalt guarda
            <code class="font-mono">config/</code> + <code class="font-mono">tasks/</code> com um repositório git próprio.
          </p>
        </section>

        <!-- ETAPA: PASTA (FolderPicker) -->
        <section v-else-if="step.id === 'folder'" class="space-y-3">
          <div>
            <h2 class="text-[15px] font-medium text-txt">Escolha a pasta do vault</h2>
            <p class="mt-1 text-[13px] leading-relaxed text-muted">
              Navegue até a pasta onde quer guardar as tarefas. Se ela não tiver <code class="font-mono">config/</code>/<code class="font-mono">tasks/</code> ou git,
              o Basalt cria — <strong class="text-txt">sem apagar nada existente</strong>. Pode também digitar um nome no fim pra criar uma subpasta nova.
            </p>
          </div>

          <FolderPicker :start="(vault && vault.path) || ''" @select="defineVault" />

          <div v-if="vaultSaving" class="flex items-center gap-2 text-[12px] text-muted">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4 animate-spin"><path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" /></svg>
            Definindo vault…
          </div>
          <div v-else-if="vaultMsg" class="rounded-md border px-3 py-2 text-[12px]"
            :class="vaultMsgType === 'error' ? 'border-red-500/40 bg-red-500/5 text-red-300' : 'border-green-500/30 bg-green-500/5 text-green-300'">
            {{ vaultMsg }}
          </div>

          <!-- status do vault corrente -->
          <div v-if="vault && vault.path" class="flex flex-wrap items-center gap-1.5 rounded-md border border-ink-500 bg-ink-850 px-3 py-2">
            <span class="mr-1 truncate font-mono text-[11px] text-muted" :title="vault.path">{{ vault.path }}</span>
            <span class="pill border" :class="badge(vault.hasConfig)">config/</span>
            <span class="pill border" :class="badge(vault.hasTasks)">tasks/</span>
            <span class="pill border" :class="badge(vault.hasGit)">git</span>
          </div>
        </section>

        <!-- ETAPA: GIT -->
        <section v-else-if="step.id === 'git'" class="space-y-3">
          <div>
            <h2 class="text-[15px] font-medium text-txt">Sincronização git</h2>
            <p class="mt-1 text-[13px] leading-relaxed text-muted">
              O Basalt grava cada mudança como um commit. Pra ter histórico e backup remoto (push/pull),
              o repositório precisa de identidade e, opcionalmente, um remote. Resolva os itens abaixo — ou siga só com histórico local.
            </p>
          </div>

          <div v-if="health" class="flex flex-wrap gap-x-5 gap-y-1 rounded-md border border-ink-500 bg-ink-850 px-3 py-2 text-[11px] text-faint">
            <span>branch: <span class="text-muted">{{ health.branch || '—' }}</span></span>
            <span>user: <span class="text-muted">{{ health.user ? (health.user.name + ' <' + health.user.email + '>') : '— não configurado' }}</span></span>
            <span>remote: <span class="text-muted">{{ health.remoteUrl || '— nenhum' }}</span></span>
          </div>

          <ul class="space-y-2.5">
            <li
              v-for="c in checks"
              :key="c.id"
              class="flex items-start gap-3 rounded-lg border p-3"
              :class="c.ok ? 'border-ink-500 bg-ink-850' : 'border-red-500/30 bg-red-500/5'"
            >
              <span class="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full" :class="c.ok ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'">
                <svg v-if="c.ok" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" class="h-3.5 w-3.5"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
                <svg v-else viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" class="h-3.5 w-3.5"><path d="M6 6l8 8M14 6l-8 8" stroke-linecap="round" /></svg>
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-[13px] text-txt">{{ c.label }}</div>
                <div v-if="c.detail" class="mt-0.5 text-[12px] text-muted">{{ c.detail }}</div>
                <div v-if="!c.ok && c.fix" class="mt-1.5 flex items-center gap-2">
                  <code class="min-w-0 flex-1 truncate rounded border border-ink-500 bg-ink-900 px-2 py-1 font-mono text-[11px] text-amber-200" :title="c.fix">{{ c.fix }}</code>
                  <button class="icon-btn h-6 w-6 flex-shrink-0" title="Copiar correção" @click="copyFix(c.fix)">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-3.5 w-3.5"><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M4 13V5a1 1 0 0 1 1-1h8" /></svg>
                  </button>
                </div>
              </div>
            </li>
            <li v-if="!checks.length && !loading" class="px-1 py-4 text-center text-[12px] text-faint">{{ error || 'Nenhum check retornado pelo servidor.' }}</li>
          </ul>
          <span v-if="copied" class="text-[12px] text-green-400">Copiado!</span>
        </section>

        <!-- ETAPA: VOCÊ (identidade local vinculada ao git) -->
        <section v-else-if="step.id === 'voce'" class="space-y-3">
          <div>
            <h2 class="text-[15px] font-medium text-txt">Você</h2>
            <p class="mt-1 text-[13px] leading-relaxed text-muted">
              O Basalt identifica quem fez cada mudança pela <strong class="text-txt">identidade do git</strong>.
              Confirme como você quer aparecer pro time — esse nome vai pro roster (<code class="font-mono">config/users.json</code>)
              e é usado em campos do tipo <strong class="text-txt">Usuário</strong> e nas notificações. Dá pra editar depois.
            </p>
          </div>

          <div class="rounded-md border border-ink-500 bg-ink-850 px-3 py-2 text-[11px] text-faint">
            git: <span class="text-muted">{{ (me && me.gitName) || '—' }} &lt;{{ (me && me.gitEmail) || '—' }}&gt;</span>
            <span v-if="me && me.userId"> · id: <span class="font-mono text-muted">{{ me.userId }}</span></span>
          </div>

          <label class="block">
            <span class="mb-1 block text-[12px] text-faint">Nome visível</span>
            <input v-model="myName" class="field" placeholder="Como você aparece pro time" @keydown.enter.prevent="registerMe" />
          </label>

          <div class="flex items-center gap-2">
            <button
              class="rounded-md bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
              :disabled="savingMe || !myName.trim()"
              @click="registerMe"
            >{{ savingMe ? 'Salvando…' : (me && me.entry ? 'Atualizar meu nome' : 'Cadastrar-me') }}</button>
            <span v-if="meMsg" class="text-[12px]" :class="meMsgType === 'error' ? 'text-red-300' : 'text-green-400'">{{ meMsg }}</span>
          </div>
        </section>

        <!-- ETAPA: PRONTO -->
        <section v-else-if="step.id === 'done'" class="grid place-items-center gap-3 py-8 text-center">
          <span class="grid h-12 w-12 place-items-center rounded-full bg-green-500/15 text-green-400">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" class="h-6 w-6"><path d="M5 10l3 3 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <h2 class="text-[15px] font-medium text-txt">Tudo pronto!</h2>
          <p class="max-w-[420px] text-[13px] leading-relaxed text-muted">
            Seu vault está configurado com etapas, campos e filtros padrão. Você pode personalizar
            tudo <strong class="text-txt">direto no board</strong> — clique no nome de uma coluna pra renomear,
            no círculo pra mudar a cor, ou arraste pra reordenar.
          </p>
        </section>
      </div>

      <!-- footer de navegação -->
      <footer class="flex flex-shrink-0 items-center gap-2 border-t border-ink-500 px-5 py-3">
        <button
          v-if="idx > 0"
          class="rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700"
          @click="back"
        >Voltar</button>
        <span v-if="error && step.id === 'git'" class="truncate text-[12px] text-red-300" :title="error">{{ error }}</span>
        <div class="flex-1"></div>

        <button
          v-if="step.id === 'git'"
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] text-muted hover:bg-ink-700 disabled:opacity-50"
          :disabled="loading"
          @click="revalidate(false)"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" class="h-4 w-4" :class="{ 'animate-spin': loading }"><path d="M16 10a6 6 0 1 1-1.8-4.3" stroke-linecap="round" /><path d="M15 3v3h-3" stroke-linecap="round" stroke-linejoin="round" /></svg>
          Revalidar
        </button>

        <button
          v-if="step.id === 'done'"
          class="rounded-md bg-accent px-4 py-1.5 text-[13px] font-medium text-white hover:brightness-110"
          @click="$emit('dismiss')"
        >Ir pro board</button>
        <button
          v-else
          class="rounded-md bg-accent px-4 py-1.5 text-[13px] font-medium text-white hover:brightness-110 disabled:opacity-50"
          :disabled="!canNext"
          @click="next"
        >{{ nextLabel }}</button>
      </footer>
    </div>
  </div>
</template>

<script>
import FolderPicker from './FolderPicker.vue';
import { getHealthGit, getVault, setVault, getMe, registerUser } from '../api';

export default {
  name: 'SetupWizard',
  components: { FolderPicker },
  props: {
    health: { type: Object, default: null },
    vault: { type: Object, default: null },
    // embedded: renderiza como conteúdo da aba (não como modal fixo).
    embedded: { type: Boolean, default: false },
    // addMode: configurando um vault NOVO (aba nova) — começa na escolha de pasta,
    // ignora o vault atual e exige escolher/validar um vault do zero.
    addMode: { type: Boolean, default: false },
  },
  data() {
    return {
      idx: 0,
      loading: false,
      error: '',
      copied: false,
      vaultSaving: false,
      vaultMsg: '',
      vaultMsgType: 'success',
      picked: false, // um vault foi escolhido/validado nesta sessão do wizard
      // passo "Você" — identidade local vinculada ao git
      me: null,
      myName: '',
      savingMe: false,
      meMsg: '',
      meMsgType: 'success',
      welcomeFacts: [
        { t: 'Arquivos, não banco', d: 'Cada tarefa é um .md legível, commitado no git. Versionável, portável, à prova de lock-in.', icon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><path d="M5 3h6l4 4v10H5z"/><path d="M11 3v4h4" stroke-linejoin="round"/></svg>' },
        { t: 'Local-first', d: 'Roda na sua máquina. Sem servidor remoto obrigatório, sem login. Você controla os dados.', icon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><rect x="3" y="4" width="14" height="9" rx="1"/><path d="M7 17h6M10 13v4" stroke-linecap="round"/></svg>' },
        { t: 'Histórico nativo', d: 'Cada mudança vira um commit com mensagem automática. Veja o diff de qualquer cartão no tempo.', icon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" class="h-4 w-4"><circle cx="6" cy="6" r="2"/><circle cx="6" cy="14" r="2"/><circle cx="14" cy="10" r="2"/><path d="M6 8v4M8 6h2a2 2 0 0 1 2 2"/></svg>' },
      ],
    };
  },
  computed: {
    // Vault "pronto" = escolhido/validado nesta sessão. No modo "adicionar" SÓ conta
    // o que foi escolhido aqui (ignora o vault atual). Senão, também aceita um vault já ok.
    vaultDone() {
      if (this.addMode) return this.picked;
      return this.picked || !!(this.vault && this.vault.needsSetup === false);
    },
    steps() {
      return [
        { id: 'welcome', label: 'Início' },
        { id: 'folder', label: 'Pasta' },
        { id: 'git', label: 'Git' },
        { id: 'voce', label: 'Você' },
        { id: 'done', label: 'Pronto' },
      ];
    },
    step() {
      return this.steps[this.idx] || this.steps[0];
    },
    checks() {
      return (this.health && Array.isArray(this.health.checks)) ? this.health.checks : [];
    },
    canNext() {
      // Só trava o avanço na etapa de pasta enquanto o vault não estiver pronto.
      if (this.step.id === 'folder') return this.vaultDone;
      return true;
    },
    nextLabel() {
      if (this.step.id === 'voce') return 'Concluir';
      return 'Próximo';
    },
  },
  watch: {
    idx() {
      // ao chegar no passo "Você", carrega a identidade (1ª vez)
      if (this.step.id === 'voce' && !this.me) this.loadMe();
    },
  },
  mounted() {
    // Adicionar vault (aba nova): começa na escolha de pasta, do zero.
    if (this.addMode) { this.idx = 1; return; }
    // Pula direto pra etapa de git só quando já é um vault REAL escolhido (config
    // ok E não é o default app-root). Primeira run / vault default começa no welcome.
    if (this.vaultDone && !(this.vault && this.vault.isDefault)) this.idx = 2;
  },
  methods: {
    badge(ok) {
      return ok
        ? 'border-green-500/30 bg-green-500/10 text-green-300'
        : 'border-ink-500 bg-ink-700 text-faint';
    },
    back() {
      if (this.idx > 0) this.idx -= 1;
    },
    next() {
      if (this.idx < this.steps.length - 1) this.idx += 1;
    },
    async defineVault(p) {
      const path = (p || '').trim();
      if (!path) return;
      this.vaultSaving = true;
      this.vaultMsg = '';
      try {
        const res = await setVault(path);
        // setVault devolve { status, git, schema, board, gute } — os flags estão em .status.
        const st = (res && res.status) ? res.status : (res || {});
        const parts = [];
        if (st.hasConfig) parts.push('config/ pronto');
        if (st.hasTasks) parts.push('tasks/ pronto');
        parts.push(st.hasGit ? 'git ok' : 'git ausente');
        this.vaultMsg = 'Vault definido. ' + parts.join(' · ') + '.';
        const ok = st.needsSetup === false;
        this.vaultMsgType = ok ? 'success' : 'error';
        this.$emit('vault-set', res);
        if (ok) {
          this.picked = true;
          await this.revalidate(true);
          // avança automaticamente pra etapa de git
          this.idx = 2;
        }
      } catch (e) {
        this.vaultMsg = e.message || 'Falha ao definir o vault.';
        this.vaultMsgType = 'error';
      } finally {
        this.vaultSaving = false;
      }
    },
    async revalidate(silent) {
      this.loading = true;
      if (!silent) this.error = '';
      try {
        const [h, v] = await Promise.all([getHealthGit(), getVault()]);
        this.$emit('revalidated', { health: h, vault: v });
      } catch (e) {
        this.error = e.message || 'Falha ao revalidar.';
      } finally {
        this.loading = false;
      }
    },
    copyFix(text) {
      const done = () => { this.copied = true; setTimeout(() => { this.copied = false; }, 1600); };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => {});
        }
      } catch (e) { /* ignore */ }
    },
    // ── passo "Você" ──
    async loadMe() {
      try {
        this.me = await getMe();
        this.myName = (this.me && this.me.entry && this.me.entry.nome) || (this.me && this.me.gitName) || '';
      } catch (e) {
        this.me = null;
      }
    },
    async registerMe() {
      const nome = (this.myName || '').trim();
      if (!nome) return;
      this.savingMe = true;
      this.meMsg = '';
      try {
        const r = await registerUser(nome);
        this.meMsgType = 'success';
        this.meMsg = 'Salvo.';
        if (r && r.entry) this.me = { ...(this.me || {}), userId: r.userId, entry: r.entry };
        this.$emit('registered', r);
      } catch (e) {
        this.meMsgType = 'error';
        this.meMsg = e.message || 'Falha ao salvar.';
      } finally {
        this.savingMe = false;
      }
    },
  },
};
</script>
