# Security Policy

Basalt is a **local-first desktop app**: no remote server, no accounts, no telemetry.
The API binds to `127.0.0.1` only. Still, some vulnerability classes matter here:

- **Path traversal** — task/asset paths escaping the vault (`tasks/`, `assets/`).
- **Stored XSS** — via markdown rendering or uploaded assets (SVG uploads are already
  rejected for this reason; raster only).
- **Command injection** — user input reaching git invocations (`simple-git`).
- **Electron hardening regressions** — `contextIsolation`, `nodeIntegration`, CSP, IPC surface.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

1. Preferred: [GitHub Security Advisories](https://github.com/JairAragao/basalt/security/advisories/new)
   (private report).
2. Fallback: e-mail **jairaragao33@gmail.com** with steps to reproduce.

This is a personal open-source project — response is best-effort, but security reports
are taken seriously and prioritized over regular issues.
