# Basalt — instruções do projeto (handoff)

> Este arquivo é carregado automaticamente pelo Claude Code. É o contexto pra
> continuar o desenvolvimento do **Basalt** em qualquer máquina/sessão.

## O que é

**Basalt** = gestor de tarefas **kanban git-native**, **AI-first**, **local-first**, dark.
- Tarefas = arquivos `.md` (frontmatter + corpo markdown) versionados em git — **files-as-DB**, sem banco.
- Engine **genérico**: nada é específico de um cliente. Dados (config + tarefas) vivem num **vault** separado.
- Projeto/IP pessoal de Jair (JairAragao). Repo: `github.com/JairAragao/basalt`.
- Por que "Basalt": a rocha se forma em **colunas retas** (junção colunar) = colunas do kanban; e é escura (tema dark).

## Três repositórios (separados)

- **basalt** (este) — o engine/app. Vai **vazio**, só o necessário pra instalar + configurar. Default mínimo (`título` + `status` + auditoria).
- **basalt-vault** — o **vault de dados** (`config/` + `tasks/`). Versionado à parte; é onde as tarefas vivem.
- **basalt-lp** — landing page (HTML estático) com downloads Win/Mac/Linux.

## Stack

- **Front:** Vue **3** + **Tailwind** + **Vite**. Libs: `vuedraggable@4`, `@tiptap/*` (editor, TipTap v2), `tippy.js`.
- **Back:** Node + **Express** (CommonJS). Libs: `gray-matter`, `chokidar`, `simple-git`, `expr-eval-fork`.
- **Desktop:** **Electron** (`electron/main.js` reusa o backend; diálogo nativo de pasta via IPC).
- Sem banco. Sem auth (local-first).

## Como rodar

```bash
npm install
npm run dev      # back :4317  +  front :5173 (Vite, proxy /api → :4317)
# abrir http://localhost:5173
npm run build    # gera app/dist
npm start        # serve app/dist + API
npm test         # Vitest (server/: gute/formula + watcher anti-loop)

# desktop (Electron)
npm run electron:dev    # builda o front e abre o app desktop
npm run electron:build  # instalável em release/ (Win .exe / Mac .dmg / Linux .AppImage)
```

- **Node ≥ 18 obrigatório** (Vite 5 quebra no Node 16 com `crypto.getRandomValues`). Há `.nvmrc`=20.
- **git instalado** é necessário (commit/push/pull via `simple-git`).
- Nota: na máquina de origem havia um hook que reescrevia `npx`→`npm`; lá usava-se `rtk proxy npx vite build ...`. **Em outra máquina, use `npx`/`npm` normal.**

## Estrutura

```
defaults/      schema.json + board.json = TEMPLATE de seed do engine (DEFAULT MÍNIMO, copiado em vaults novos).
               engine NÃO versiona config/ nem tasks/ (criados em runtime); os dados vivem no basalt-vault.
electron/      main.js (sobe o backend em porta livre + janela + IPC) · preload.js (bridge)
server/        index.js boot+watcher (auto-listen só via `node`; Electron controla o listen)
               config.js (vault+reload+derive+isDefault) · routes.js (API, inclui /fs/list)
               tasks-repo.js (CRUD+auditoria) · validate.js (validação+genId)
               formula.js (motor de fórmula genérico) · gute.js (shim→formula, p/ testes)
               watcher.js (chokidar recompute) · git.js (commit/push/pull/history/diff/identity)
               commit-msg.js (describeChanges = mensagem automática)
app/           index.html · vite.config.js · tailwind/postcss.config.js · public/basalt.png
app/src/       main.js (createApp) · index.css (Tailwind) · api.js · App.vue · palette.js
app/src/components/  Board (edição inline de etapas) · TableView · TaskCard · TaskPeek ·
               BodyEditor (TipTap) · CardHistory · Dropdown · Settings · StatusEditor ·
               PropertyEditor · FiltersEditor · CardEditor · SetupWizard (stepper) · FolderPicker
```
> `landing/` e `tasks/` saíram deste repo (→ `basalt-lp` e `basalt-vault`).

## Conceitos-chave

### Vault (separação engine × dados)
- **Vault** = pasta com `config/` + `tasks/` + **git próprio**. O engine é genérico; cada projeto = um vault.
- Resolução do caminho (config.js, prioridade): `~/.basalt/settings.json {vaultPath}` › env `BASALT_VAULT` › `~/.basalt/default-vault` (fallback gravável — não a raiz do app, que no empacotado é o `app.asar` read-only).
- Vault novo/vazio é **semeado** copiando o template (`<appRoot>/defaults/*.json`); cria `config/`+`tasks/`; `git init` se faltar.
- Endpoints: `GET /api/vault` (status, com flag **`isDefault`** = ainda no fallback da pasta do app), `POST /api/vault {path}` (define/seed/persiste/reload), `GET /api/fs/list` (navegador de pastas do picker). UI: **SetupWizard** (stepper) + **FolderPicker** (web) / diálogo nativo (Electron).
- **`isDefault`**: enquanto o vault for a pasta do app, o wizard trata como "primeira run" e pede um vault próprio (ex.: `basalt-vault`). Resolve a antiga pendência de "tarefas no repo do engine".

### Config declarativa (no vault)
- `config/schema.json`: `idPrefix`, `idFrom`(=titulo), `properties{key:{type,label,...}}`.
  - tipos: `string`, `enum`(options), `int`(min/max), `formula`(expression,round), `datetime`.
  - flags: `system:true` (não-removível) · `auto:true` (gerenciado pelo sistema, read-only).
- `config/board.json`: `groupBy`(status), `statusGroups[{id,label,stages[{id,label,color}]}]`, `fallbackColumn`, `card{title,subtitle,badge,fields[]}`, `sort{by,dir}`, `filters[]`.
- `schema.derived` é **DERIVADO em runtime** por config.js = `[chaves de props type formula] + 'computed_at'` (não confie num array fixo).

### Campos fórmula (genérico, estilo Notion)
- Propriedade `{type:'formula', expression, round?}`. O **watcher** computa todas via `formula.compute(data, schema)`.
- `expr-eval-fork` com **`parser.consts={}`** (senão `E` vira Euler e `PI` vira π — colidem com nomes de campo!). Faltante/divisão-por-zero/Inf/NaN → `null`.
- **GUTE saiu do default** do engine (default mínimo = `título`+`status`+auditoria). G/U/T/E + fórmulas `GUT`/`prioridade_gute` agora vivem só no `basalt-vault` (dados do usuário) ou virarão preset/plugin. O motor de fórmula é genérico — qualquer prop `formula` funciona.

### Campos de sistema / auditoria
- **Só `status` é `system`** (trava o kanban). `titulo` e demais campos são propriedades normais (removíveis/editáveis).
- Auditoria (`system`+`auto`, read-only, não-removível): `created_at`, `created_by`, `updated_at`, `updated_by`.
  - Carimbados pelo **tasks-repo** no create/update. **Autor = usuário do git** (`git.getIdentity().name`) — local-first, sem login. `created_*` preservado na edição.

### Watcher
- chokidar observa `tasks/*.md`; recalcula campos fórmula; **anti-loop** (só grava se mudou); stamp `computed_at`; **NUNCA commita**. Re-observa o vault novo ao trocar.

### Git automático
- Todo CRUD de tarefa (e edições de board/schema/asset) **commita** (mensagem automática via `describeChanges`) + **push** best-effort. Identidade = git user do repo do vault. `created_*/updated_*/computed_at` ignorados na mensagem.
- **Serialização:** toda escrita git passa por uma fila única (`gitSerial`) **e** o `simple-git` usa `maxConcurrentProcesses:1` → nunca há 2 processos git ao mesmo tempo (sem colisão de `index.lock`); commits usam pathspec (`commit -- <paths>`).
- **Commit é aguardado** (rápido, local) → erro de commit (ex.: identidade ausente) volta no `warning` da resposta na hora. **Push roda em background, coalescido** (resposta instantânea); falha de push é logada e surfaciada no `warning` da **próxima** resposta (1 op de atraso) — e em `GET /health/git` / botão de sync.
- **Pull** (`/sync/pull`) é `--ff-only --autostash`; se o pop do autostash conflitar, o working tree é restaurado pro remoto (`reset --hard HEAD`) e a resposta vem `ok:false` — as mudanças locais ficam no stash (`git stash list`), **nunca corrompe o `.md`**.
- ⚠️ Edges conhecidos (BAIXA, single-user): um `git` morto pelo timeout de 8s pode deixar `index.lock` stale; trocar de vault com um commit em voo pode não versionar aquele save (fica salvo no disco). Recuperação: novo save / `git status`.

## API REST (`/api`) — 31 endpoints

- **Config/vault**: `GET /config` (inclui `doneStageIds` derivado) · `GET|POST /vault` · `GET /vaults` · `POST /vaults/switch` · `DELETE /vaults` · `GET /fs/list?path=`
- **Tarefas**: `GET /tasks` · `GET|PUT|DELETE /tasks/:id` · `POST /tasks` · `PATCH /tasks/:id/move` · `GET /tasks/:id/history` · `GET /tasks/:id/diff?hash=H`
- **Board/schema**: `GET /board` · `PUT /board/status {statusGroups,renames,doneGroupId}` (400 se doneGroupId inválido) · `PUT /board/filters {filters}` · `PUT /board/card {fields,subtitle,badge}` · `PUT /schema/properties {properties,renames,optionRenames}`
- **Usuários/notificações**: `GET /users` · `GET /me` · `POST /users/register` · `PUT /users/:id` · `GET /notifications` · `POST /notifications/clear`
- **Git/assets**: `GET /health/git` · `POST /sync/pull` · `POST /assets` · `GET /assets/:name`

Doc completa do funcionamento: `docs/ARCHITECTURE.md` (EN) / `docs/ARCHITECTURE.pt-BR.md`.

## Pronto (funcional, build verde)
- Kanban (grupos macro × etapas) + Tabela; sort por qualquer prop ↑↓; filtros editáveis; **colorir colunas** (coluna+header+cards em camadas).
- Peek estilo Notion (3 modos side/center/full, lembra preferência); **editor de corpo TipTap** (`/`=blocos, seleção=toolbar, barra de link custom, round-trip markdown).
- Config do cartão (etiquetas/subtitle/badge); **histórico + diff** por card (antes/depois vermelho/verde + unificado).
- Settings: editores de **Status** (grupos/etapas/cor/paleta), **Propriedades** (add/excluir/renomear + opções enum + **tipo Fórmula** com builder), **Filtros**, **Cartão**. Migração de tarefas em renames.
- **Vault separado** (backend + SetupWizard stepper + FolderPicker; `isDefault` na primeira run). **Auditoria** (6 campos: created/updated/completed at+by). **Git-native**.
- **Vue 3** (migrado do 2.7). **Electron** (app desktop, diálogo nativo de pasta). **Edição direta no board** (renomear/recolorir etapa + adicionar etapa por grupo macro).
- Ícone basalt (logo + favicon). Dark/Notion. Dropdowns custom (sem `<select>` nativo).
- **Multi-vault em ABAS** (TitleBar; backend é singleton — trocar aba = `POST /vaults/switch` + reload + watcher re-observa). **Roster** (`config/users.json`, identidade estável `basalt.userid` no git config global, prop `type:'user'`). **Notificações por pull** (locais, cap 200). **GC de assets órfãos**. **Migração de opções enum**.
- **0.5.0 — Sidebar de navegação** (rail recolhido: Tarefas/Dashboard/Configurações; view lembrada POR vault em `basalt.viewByVault`; Settings agora abre pela sidebar — engrenagem do header saiu; board/tabela extraídos pra `views/TasksView.vue`).
- **0.5.0 — Semântica de conclusão** (`doneGroupId` no board.json com self-heal; `completed_at`/`completed_by` carimbados pelo tasks-repo SÓ na transição; grupo marcável no editor de Status; ver `docs/adr/ADR-001`).
- **0.5.0 — Dashboard de relatórios** (`app/src/reports.js` puro + `views/DashboardView.vue` chunk lazy com uPlot; criadas/finalizadas/abertas/lead time, série temporal, quebras por usuário e por prop enum; ver `docs/adr/ADR-002`).

## Pendente / próximos passos
0. **Pós-run 2026-06-10 (0.5.0 + open source)**: (a) smoke manual de UI do roteiro do QA
   (board pós-extração TasksView, sidebar×wizard, viewByVault entre abas, StatusEditor,
   dashboard) — `qa-report.md` da run do squad; (b) `git push` dos commits da run;
   (c) GitHub Release `v0.5.0` com `release/Basalt Setup 0.5.0.exe` + blockmap + latest.yml;
   (d) tornar o repo público (docs prontos: LICENSE MIT, README/CONTRIBUTING EN+PT,
   CODE_OF_CONDUCT, SECURITY, templates, ARCHITECTURE, ADRs, CHANGELOG); (e) screenshot
   real no README (TODO marcado); (f) atualizar links da basalt-lp.
1. **Plugins (código)** — direção escolhida pra extensibilidade. Por ora a config declarativa cobre; o passo é presets/plugins de campos (ex.: GUTE, Dev) que injetam propriedades + ajustes de board com 1 clique (reusa `PUT /schema/properties`). GUTE é o 1º candidato.
2. **Publicar releases** — rodar `npm run electron:build` e subir os instaladores no GitHub Releases (os botões da `basalt-lp` apontam pra lá). Dívidas de release conhecidas:
   - **Não assinado** — sem certificado → SmartScreen (Win)/Gatekeeper (Mac) avisam. Precisa de cert de code-signing.
   - **Auto-update NÃO fiado** — o electron-builder gera `latest.yml`/`app-update.yml` (provider github), mas **não há `electron-updater` nem `build.publish` ligados** → o app não checa updates. Update é **manual** via basalt-lp. Pra fiar de verdade: add `electron-updater` + `build.publish`.
   - **Ícone** — `basalt.png` é 461×443 (não-quadrado); ideal um `.ico`/`.icns` quadrado ≥256² por plataforma.
   - **Electron** atualizado p/ **42** (electron-builder **26**) em 2026-06-09 (zerou as vulns de toolchain) — **fazer smoke-test do app empacotado** (abre, splash, `/api`, picker de pasta) ao validar um release.
3. ~~Otimizar bundle~~ ✅ feito: BodyEditor (TipTap) e o emoji picker viraram chunks **lazy** (`defineAsyncComponent`) — bundle inicial caiu de ~1.05MB → **~448KB** (chunks sob demanda: BodyEditor ~510KB, emoji ~149KB).
4. (opcional) `computed_at`/derivados: revisar exibição no peek.

> Feito recentemente: migração Vue 3, app Electron, vault separado (`basalt-vault`), split de repos (engine/vault/lp), default mínimo, edição direta de etapas no board.

## Gotchas / convenções
- **Docs públicos são BILÍNGUES**: todo doc da raiz/docs/ tem par EN + pt-BR (README,
  CONTRIBUTING, ARCHITECTURE) — **sempre atualizar os dois juntos** (checkbox no PR template).
  ADRs em EN com "Resumo (pt-BR)" no fim. CHANGELOG em EN (keep-a-changelog).
- **Node ≥18** (Vite). `nvm use 20`/`24`.
- **expr-eval:** sempre `parser.consts={}` no motor de fórmula.
- **tiptap-markdown fixado em `0.8.10`** (0.9+ exige TipTap v3; o projeto é TipTap v2). Não suba sem migrar.
- **`localStorage` keys** padronizadas no prefixo `basalt.` (`basalt.peekMode`, `basalt.colorColumns`). Renomear a key = perde a preferência salva (reseta no default) — aceitável.
- Usar **`Dropdown.vue`** em vez de `<select>` nativo; cores da paleta em **`palette.js`**; tema dark = paleta `ink-*`/`txt`/`muted`/`faint`/`accent`(âmbar #d9a01e) no `tailwind.config.js`.
- Escrita de tarefa é **atômica** (`.tmp` + rename); paths são **path-safe** (regex + confinado a `tasks/`).
- Validação: `validate.js` tolera tipos desconhecidos; `genId` usa `idFrom` com fallback (1ª string → 'tarefa') se titulo for removido.

## Estado do git
- Trabalha direto na `main` (o próprio app commita config/tarefas em commits automáticos).
- Auto-push pode falhar até configurar remote/credenciais — a operação local não quebra (resposta traz `warning`).
- ⚠️ Backend roda em **:4317** no `npm run dev`; **não matar essa porta** (smoke-test de server em porta isolada).

## Como continuar (no novo PC)
1. `git clone https://github.com/JairAragao/basalt.git && cd basalt`
2. `nvm use 20` (ou Node ≥18) · `npm install` · `npm run dev` (web) ou `npm run electron:dev` (desktop)
3. Na 1ª tela (SetupWizard): apontar o **vault** para o `basalt-vault` (ou nova pasta) e validar push/pull.
4. Ler este arquivo + `README.md`. Pegar uma pendência acima.
