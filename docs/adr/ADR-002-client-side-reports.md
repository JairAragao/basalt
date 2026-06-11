# ADR-002 — Relatórios agregam no cliente sobre `GET /tasks`

- **Status**: aceita (2026-06-10)
- **Escopo**: frontend (dashboard), superfície de API

## Contexto

O dashboard de relatórios do 0.5.0 precisa de contagens (criadas/finalizadas/abertas/
lead time), série temporal criadas×finalizadas e quebras por usuário e por qualquer
propriedade enum. A questão: agregar no server (endpoint novo) ou no cliente?

## Decisão

Agregar **100% no cliente**: `app/src/reports.js` é uma função pura, sem framework
(`buildReport(input)`), alimentada pelo `GET /tasks` existente (o frontmatter já carrega
`created_at/by`, `completed_at/by` e todas as props enum), pelo `GET /config`
(`doneStageIds`) e pelo `GET /users` (roster). Testada isolada no Vitest.

Gráficos: **uPlot** só pra série temporal, carregado dentro do chunk lazy do
`DashboardView` (66.35 kB / 28.71 kB gzip — uPlot fica fora do bundle inicial); barras
categóricas são HTML/CSS puro (uPlot é fraco em dados categóricos).

## Alternativas descartadas

- **`GET /api/reports` server-side** — rejeitada por prematura: duplica a semântica de
  filtro no server, adiciona superfície de API e novos caminhos de validação, sem ganho
  na escala local-first (centenas a poucos milhares de `.md` agregam trivialmente em JS,
  offline).
- **Libs de gráfico pesadas (ApexCharts, Chart.js)** — rejeitadas: peso de bundle e
  custo de tema pra três visuais simples.

## Gatilho de revisita

Se um vault passar de **~5k tarefas** e o `GET /tasks` + agregação no cliente ficarem
perceptivelmente lentos, introduzir um endpoint de agregação server-side.

## Summary (EN)

Reports aggregate entirely client-side (`reports.js`, pure and unit-tested) over the
existing endpoints — zero new routes. uPlot renders only the time series, inside a lazy
chunk; categorical bars are plain HTML/CSS. Revisit trigger: ~5k tasks per vault.
