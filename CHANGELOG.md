# Changelog

All notable changes to Basalt are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow semver.

## [0.5.0] - 2026-06-10

### Added

- **Navigation sidebar** — collapsed-by-default left rail with **Tasks**, **Dashboard**
  and **Settings**; the active view is remembered **per vault** and restored when
  switching tabs.
- **Reports dashboard** — created / completed / open counts, average lead time, a
  created×completed time series (uPlot, lazy-loaded), and breakdowns by roster user and
  by any `enum` property. Aggregated entirely client-side ([ADR-002](docs/adr/ADR-002-client-side-reports.md)).
- **Completion semantics** — mark one status group as the "done" group in the Status
  editor; the engine stamps `completed_at`/`completed_by` automatically on transition
  (and clears them when a task leaves the group). Legacy tasks are never retro-stamped
  ([ADR-001](docs/adr/ADR-001-done-semantics.md)).
- **Open-source scaffolding** — MIT license, bilingual README/CONTRIBUTING (EN/pt-BR),
  code of conduct, security policy, issue/PR templates, `docs/ARCHITECTURE.md` and ADRs.

### Changed

- Settings moved from the header gear to the sidebar.
- New vaults are seeded with completion semantics enabled (`doneGroupId` in the default board).

### Notes

- Installer is unsigned — Windows SmartScreen warns on first run ("More info" → "Run anyway").
- Server test suite grew from 40 to 64 tests (tasks-repo, config and reports now covered).

## [0.4.0] - 2026-06-09

Retroactive summary (pre-changelog era), from git history:

- Multi-vault **tabs**, user **roster** (`config/users.json`) with stable git identity,
  **pull notifications**, orphan-asset GC and enum option migration.
- Auto-save, inline editable selects, colored chips on cards, Notion-style status/blocks.
- Descriptive automatic commit messages (only what changed, task title aware).
- Dark assisted installer; paginated card history; version badge in the header.
