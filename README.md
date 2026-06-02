# Basalt

Kanban **git-native**, **local-first** e **AI-first**: cada tarefa é um arquivo `.md`
versionado no git. Dark, editável até o último detalhe. Markdown entra, quadro sai.

> **Por que "Basalt":** quando a lava esfria devagar, a rocha racha em colunas retas e
> empilhadas (junção colunar) — a mesma geometria de um kanban. E é uma pedra escura,
> como deve ser uma ferramenta usada o dia inteiro.

> **Princípio:** fonte da verdade = texto plano em git. Sem banco de dados, sem nuvem,
> sem login. O **engine é genérico**; os dados vivem num **vault** separado.

## Três repositórios

| Repo | O que é |
|---|---|
| **basalt** (este) | O engine/app. Vai **vazio**, só com o necessário pra instalar e configurar. |
| **basalt-vault** | O **vault de dados**: `config/` + `tasks/` (suas tarefas), versionado à parte. |
| **basalt-lp** | A landing page (HTML estático) com os downloads. |

## Stack
- **Front:** Vue 3 + Vite + Tailwind (Composition/Options API). Editor TipTap, `vuedraggable`.
- **Back:** Node + Express — camada fina de fs + git (`simple-git`) + watcher (`chokidar`).
- **Desktop:** Electron (reusa o backend; diálogo nativo de pasta).
- **Sem banco.** "Schema" = `config/schema.json`. "Histórico" = git.

## Requisitos
- **Node ≥ 18** (recomendado 20+). Veja `.nvmrc`.
- **git instalado** (o backend commita/push via `simple-git`).

## Rodar
```bash
npm install

# web (dev, com HMR)
npm run dev          # backend :4317 + Vite :5173 (proxy /api)

# desktop (Electron)
npm run electron:dev # builda o front e abre o app desktop
npm run electron:build  # gera instalável em release/ (Win .exe / Mac .dmg / Linux .AppImage)

# prod web
npm run build        # gera app/dist
npm start            # server serve app/dist + API

npm test             # Vitest (motor de fórmula + watcher)
```

Na primeira execução o app abre o **SetupWizard**: escolha a pasta do **vault**
(ou aponte para o `basalt-vault`). É lá que `config/` + `tasks/` são criados/lidos.

## Como funciona

### Tarefa = arquivo `.md`
```markdown
---
titulo: Minha tarefa
status: Em andamento
created_at: 2026-06-01T12:00:00Z   # auditoria — gerenciado pelo sistema
---
Descrição livre em markdown. Pode ter [[wikilinks]].
```
- `id` = nome do arquivo, gerado de `idPrefix + data + slug(titulo)`.
- Escrita **atômica** + path-safe. Todo CRUD **commita** (mensagem automática) e faz push best-effort.

### Vault (engine × dados)
- **Vault** = pasta com `config/` + `tasks/` + git próprio. O engine semeia os defaults
  (`config/*.json`) num vault novo e faz `git init` se faltar.
- Resolução do caminho: `~/.basalt/settings.json {vaultPath}` › env `BASALT_VAULT` › pasta do app (fallback).
  Enquanto estiver no fallback, o wizard sinaliza "primeira run" (`isDefault`) e pede um vault próprio.

### Config declarativa (no vault)
Mudar `config/*.json` muda o comportamento **sem código**:
- `schema.json` → propriedades + tipos (`string`, `enum`, `int`, `formula`, `datetime`). O form de edição é gerado daqui.
- `board.json` → grupos macro, etapas, cores, card, ordenação, filtros.

O **default do engine é mínimo** (`título` + `status` + auditoria). Conjuntos de campos
específicos (ex.: priorização **GUTE** = G·U·T/E) entram como extensão/preset — não vêm hardcoded.

### Campos fórmula + watcher
- Propriedade `{type:'formula', expression}` é recalculada pelo watcher ao salvar (`expr-eval-fork`, sem `eval`).
- **Anti-loop** (só regrava se mudou) e **nunca commita** — o derivado pega carona no próximo commit.

## API REST (`/api`)
`GET /config` · `GET|POST /vault` · `GET /fs/list` · `GET /tasks` · `GET /tasks/:id` ·
`POST /tasks` · `PUT /tasks/:id` · `PATCH /tasks/:id/move` · `DELETE /tasks/:id` ·
`GET /tasks/:id/history` · `GET /tasks/:id/diff` · `GET /health/git` · `POST /sync/pull` ·
`PUT /board/status` · `PUT /board/filters` · `PUT /board/card` · `PUT /schema/properties`.

## Roadmap
- **Plugins** (código): hoje a extensibilidade é a config declarativa; presets/plugins de campos (GUTE, Dev, …) são o próximo passo.
- Auth / multiusuário fora de escopo (local-first por design).
