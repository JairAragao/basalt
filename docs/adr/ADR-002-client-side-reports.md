# ADR-002 — Reports aggregate client-side over `GET /tasks`

- **Status**: accepted (2026-06-10)
- **Scope**: frontend (dashboard), API surface

## Context

The 0.5.0 reports dashboard needs counts (created/completed/open/lead time), a
created×completed time series, and breakdowns by user and by any enum property.
The question: aggregate on the server (new endpoint) or in the client?

## Decision

Aggregate **entirely client-side**: `app/src/reports.js` is a pure, framework-free
function (`buildReport(input)`) fed by the existing `GET /tasks` (frontmatter already
carries `created_at/by`, `completed_at/by` and all enum props), `GET /config`
(`doneStageIds`) and `GET /users` (roster). It is unit-tested in isolation (Vitest).

Charts: **uPlot** for the time series only, loaded inside the lazy `DashboardView`
chunk (66.35 kB / 28.71 kB gzip — uPlot stays out of the initial bundle); categorical
bars are plain HTML/CSS (uPlot is poor at categorical data).

## Alternatives considered

- **`GET /api/reports` server-side** — rejected as premature: duplicates filter
  semantics on the server, adds API surface and new validation paths, with no gain at
  local-first scale (hundreds to a few thousand `.md` files aggregate trivially in JS,
  offline).
- **Heavier chart libs (ApexCharts, Chart.js)** — rejected: bundle weight and theming
  cost for three simple visuals.

## Revisit trigger

If a vault grows past **~5k tasks** and `GET /tasks` + client aggregation becomes
noticeably slow, introduce a server-side aggregation endpoint then.

## Resumo (pt-BR)

Relatórios agregam 100% no cliente (`reports.js` puro e testável) sobre os endpoints
existentes — zero rota nova. uPlot só na série temporal, em chunk lazy; barras
categóricas em HTML/CSS. Gatilho de revisita: vault com ~5k tarefas.
