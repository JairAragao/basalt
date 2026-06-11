# Basalt — Arquitetura

[English](ARCHITECTURE.md) · **Português (Brasil)**

Como o Basalt funciona de verdade, pra quem quer contribuir. Última auditoria completa:
2026-06-10 (v0.5.0).

## Visão geral

Três repositórios, uma fronteira:

| Repo | Papel |
|---|---|
| **basalt** (este) | O **engine** genérico: server, SPA, shell Electron. Vai vazio. |
| **basalt-vault** | Um **vault**: `config/` + `tasks/` + git próprio. Seus dados. |
| **basalt-lp** | Landing page estática com downloads. |

```
┌─ Electron main ── sobe o server numa porta livre 127.0.0.1, IPC pro picker de pasta
│
│  ┌─ SPA Vue 3 (app/src) ── board / tabela / peek / dashboard / settings
│  │        │ fetch /api
│  ▼        ▼
│  Server Express (server/) ── camada fina de fs + git sobre o vault
│        │
│        ▼
│  VAULT (pasta separada, git próprio)
│    config/schema.json   ← propriedades (string, enum, int, formula, datetime, user)
│    config/board.json    ← grupos, etapas, cores, card, sort, filtros, doneGroupId
│    config/users.json    ← roster (opcional)
│    tasks/*.md           ← 1 tarefa = 1 arquivo markdown (frontmatter + corpo)
│    assets/*             ← imagens enviadas (só raster)
└──────
```

**O engine é genérico.** Nenhum nome de propriedade/regra de cliente existe no código; o
comportamento vem do `schema.json`/`board.json` do vault, lidos em runtime. O que é
específico de um fluxo vive na config do vault (ou num futuro preset) — isso é cobrado em review.

## Fluxo canônico de um save

```
UI (auto-save) → PUT /api/tasks/:id
  → tasks-repo: valida (schema) → remove campos gerenciados/derivados do input
    → preserva chaves estrangeiras + resultados de fórmula → carimba updated_at/by
    → escrita ATÔMICA (.tmp + rename, path-safe)
  → commit-msg.describeChanges(antes, depois) gera a mensagem humana
  → gitChain (fila única) commita — aguardado, local, rápido
  → push roda em background, coalescido; falha vira `warning` na PRÓXIMA resposta
  → watcher (chokidar) vê a mudança → recalcula fórmulas → só regrava se mudou
    (anti-loop) → carimba computed_at → NUNCA commita
```

## Invariantes (o que mantém isso seguro)

1. **Escrita atômica + path-safe** — todo write passa por `.tmp` + rename; ids validados
   por regex e o path resolvido precisa ficar dentro de `tasks/`/`assets/`.
2. **Git serializado** — fila única (`gitChain`) + `simple-git` com
   `maxConcurrentProcesses: 1`: zero corrida de `index.lock`. Commit aguardado; push em
   background best-effort (offline nunca quebra um save — vira `warning`).
3. **Watcher mudo e idempotente** — recalcula fórmulas, só regrava se mudou, nunca
   commita (o derivado pega carona no próximo commit do usuário).
4. **Self-heal em vez de erro** — ref órfã de config (prop removida ainda usada em
   card/filtros/sort/`doneGroupId`) é podada no load; `validate.js` tolera chaves
   desconhecidas (`icon`/`cover` passam transparentes).
5. **Electron hardened** — `contextIsolation: true`, `nodeIntegration: false`, CSP
   restritiva, IPC mínimo, server em `127.0.0.1` em porta livre.
6. **Engine genérico** — auditoria de 2026-06 achou zero hardcode de cliente (o shim
   `gute.js` é legado de teste, não é semeado em vault novo).

## Módulos do server (`server/`, ~3,2k linhas)

| Arquivo | ~Linhas | Responsabilidade |
|---|---|---|
| `index.js` | 45 | boot: express + `/api` + estático (prod) + watcher; auto-listen só via `node` (o Electron controla o listen) |
| `config.js` | 520 | resolução de vault (settings › env › default), seed, reload, validação, derivações (colunas, opções de status, keys de fórmula, `doneStageIds`), normalização de auditoria, roster e notificações |
| `routes.js` | 1030 | a API REST (31 endpoints), serialização git, mensagens automáticas, GC de assets, identidade, notificações por pull |
| `tasks-repo.js` | 200 | CRUD de tarefas em `.md`: validação, escrita atômica, carimbos de auditoria e de conclusão (ADR-001), preservação de chaves estrangeiras |
| `git.js` | 476 | commit/push/pull, identidade (+ `basalt.userid` estável), history/diff, health check; não-interativo, timeout 8s |
| `commit-msg.js` | 120 | puro: diff antes/depois do frontmatter → mensagem humana (auditoria/carimbos ignorados) |
| `validate.js` | 223 | puro: validação por schema (tolerante a chaves/tipos desconhecidos), geração de id |
| `formula.js` | 130 | motor de fórmula genérico (`expr-eval-fork`, `parser.consts = {}`, faltante/div-zero → `null`) |
| `watcher.js` | 148 | chokidar em `tasks/*.md`: recompute, anti-loop, `computed_at`, re-observa na troca de vault |
| `gute.js` | 25 | shim legado → `formula.js` (compat de testes antigos; não semeado) |

## Notas de features

- **Abas multi-vault** — abas são UI; o backend é **singleton de um vault**. Trocar de
  aba = `POST /api/vaults/switch` → reload da config → watcher re-observa. A lista vive
  em `~/.basalt/settings.json`.
- **Roster** — `config/users.json` (versionado): id estável ↔ nome ↔ identidades git.
  O auto-cadastro grava `basalt.userid` no git config **global** (a identidade viaja
  entre vaults). Sem login — identidade vem do git.
- **Notificações por pull** — pós `POST /sync/pull`, commits de outros autores em
  tarefas onde você é o responsável viram notificações locais
  (`~/.basalt/notifications.json`, cap 200, não versionadas).
- **GC de assets** — trocar/remover `icon`/`cover` apaga o asset órfão (se ninguém mais
  referencia), best-effort, commitado.
- **Semântica de conclusão (0.5.0)** — `board.json#doneGroupId` marca o grupo "done";
  o `tasks-repo` carimba `completed_at`/`completed_by` **só na transição** pra dentro do
  grupo e limpa na saída. Legado nunca é retro-carimbado. Ver
  [ADR-001](adr/ADR-001-done-semantics.md).
- **Dashboard de relatórios (0.5.0)** — agrega no cliente em `app/src/reports.js` (puro,
  testado) sobre `GET /tasks`; uPlot renderiza a série temporal num chunk lazy. Endpoint
  server-side só se um vault passar de ~5k tarefas. Ver
  [ADR-002](adr/ADR-002-client-side-reports.md).

## Edges conhecidos (aceitos, escala single-user)

- Processo git morto pelo timeout de 8s pode deixar `.git/index.lock` stale no vault
  (recuperação: remover / próximo save).
- Trocar de vault com commit em voo pode deixar aquele save sem versionar (ele ESTÁ no
  disco; recuperação: próximo save ou `git status`).
- PowerShell 5.1 mangla body JSON UTF-8 (stage ids acentuados) — use bytes UTF-8 ao
  scriptar contra a API no Windows; browser/Electron não são afetados.
