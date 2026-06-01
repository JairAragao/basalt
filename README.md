# Basalt

Kanban **git-native**: cada tarefa é um arquivo `.md` versionado no git. Local-first,
dark, editável até o último detalhe. Markdown entra, quadro sai.

> **Por que "Basalt":** quando a lava esfria devagar, o basalt racha em colunas retas e
> empilhadas (junção colunar) — a mesma geometria de um kanban. E é uma pedra escura,
> como deve ser uma ferramenta usada o dia inteiro.

> **Princípio:** fonte da verdade = texto plano em git. Sem banco de dados, sem nuvem.

Landing page em `landing/index.html` (estática, self-contained).

## Stack
- **Front:** Vue 2.7 + Vuetify 2 (via Vite + `@vitejs/plugin-vue2`)
- **Back:** Node + Express (camada fina de fs + git + watcher)
- **Sem PostgreSQL.** "Schema" = `config/schema.json`. "Histórico" = git.

## Requisitos
- **Node ≥ 18** (recomendado 20+). Node 16 quebra o Vite (`crypto.getRandomValues`).
  Veja `.nvmrc`.

## Rodar
```bash
npm install
npm run dev        # sobe backend (:3001) + Vite (:5173) com proxy /api
# prod:
npm run build      # gera app/dist
npm start          # server serve app/dist + API
npm test           # Vitest (gute + watcher)
```

## Estrutura
```
config/        schema.json (propriedades) · board.json (Kanban) · gute.json (fórmulas)
tasks/         uma tarefa por .md  ← FONTE DA VERDADE
server/        Express + watcher (config, tasks-repo, gute, watcher, git, routes)
app/           front Vue2/Vuetify (Board, TaskCard, TaskDialog)
```

## Como funciona

### Tarefa = arquivo `.md`
```markdown
---
id: T-2026-06-01-exemplo-mrp
titulo: Corrigir cálculo de necessidade no MRP
status: doing
responsavel: jair
modulo: MRP
tipo: bug
G: 4
U: 5
T: 3
E: 2
GUT: 60                 # derivado — watcher escreve, não editar
prioridade_gute: 30     # derivado
gute_computed_at: ...   # derivado
---
Descrição livre em markdown. Pode ter [[wikilinks]].
```
- `id` = nome do arquivo. Gerado de `idPrefix + data + slug(titulo)`.
- Contrato completo dos campos em [`config/data-contract.md`](config/data-contract.md).

### Priorização GUTE
- `GUT = G × U × T`
- `Prioridade GUTE = (G × U × T) / E`  (E = Esforço; quanto menor o esforço, maior a prioridade)
- `E = 0` (ou ausente) → `prioridade_gute = null` (sem divisão por zero).
- Fórmulas declaradas em `config/gute.json` (avaliadas com `expr-eval`, sem `eval`).

### Watcher (recálculo automático)
- Observa `tasks/*.md`. Ao salvar (pelo app, pela IA ou pelo Obsidian), recalcula os
  derivados e grava de volta no frontmatter.
- **Anti-loop:** só regrava se um derivado mudou (compara antes de escrever).
- **Não commita** — o derivado pega carona no próximo commit.

### Separação de escrita (quem grava o quê)
| Campo | Dono |
|---|---|
| inputs (`status`, `titulo`, `G/U/T/E`, …) | App / IA |
| derivados (`GUT`, `prioridade_gute`, `gute_computed_at`) | **só o watcher** |

O app **nunca** grava derivados (strip em 2 camadas). O `update` preserva os derivados
já no arquivo para não sumirem do commit.

## API REST
| Método | Rota | Ação |
|---|---|---|
| GET | `/api/config` | retorna os 3 config |
| GET | `/api/tasks` | lista tarefas |
| GET | `/api/tasks/:id` | uma tarefa (com corpo) |
| POST | `/api/tasks` | cria + commit |
| PUT | `/api/tasks/:id` | atualiza + commit |
| PATCH | `/api/tasks/:id/move` | muda só `status` + commit |
| DELETE | `/api/tasks/:id` | remove + commit |

- Path-safe (sem traversal), escrita atômica, push best-effort (só se houver remote).

## Config declarativa
Mudar `config/*.json` muda o comportamento **sem alterar código**:
- `schema.json` → propriedades + tipos (o form de edição é gerado daqui).
- `board.json` → colunas do Kanban, ordenação, filtros, layout do card.
- `gute.json` → fórmulas/escala dos derivados.

## Limitações conhecidas (fase 2)
- Migração das tarefas/propriedades reais do Notion (34 props, `ID do Fluxo`).
- Auth / multiusuário / permissões.
- Concorrência app×IA no mesmo `.md` = last-write-wins (ok p/ equipe pequena).
- Ícones (MDI) via CDN — offline não carrega; bundlar `@mdi/font` se necessário.
- `create` rejeita id duplicado (mesmo título/dia) em vez de auto-sufixar.

## Origem
Gerado pelo squad **orchestra-dev** (run `2026-06-01-092435`). Decisões de arquitetura,
requisitos e review em `.claude/squads/orchestra-dev/output/2026-06-01-092435/`.
