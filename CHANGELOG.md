# Changelog

Todas as mudanças relevantes do Basalt estão documentadas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); as versões seguem semver.

## [0.5.0] - 2026-06-10

### Adicionado

- **Sidebar de navegação** — rail lateral recolhido por padrão com **Tarefas**,
  **Dashboard** e **Configurações**; a view ativa é lembrada **por vault** e restaurada
  ao trocar de aba.
- **Dashboard de relatórios** — contagens de criadas / finalizadas / abertas, lead time
  médio, série temporal criadas×finalizadas (uPlot, carregado sob demanda) e quebras por
  usuário do roster e por qualquer propriedade `enum`. Agregação 100% no cliente
  ([ADR-002](docs/adr/ADR-002-client-side-reports.md)).
- **Semântica de conclusão** — marque um grupo de status como grupo de "conclusão" no
  editor de Status; o engine carimba `completed_at`/`completed_by` automaticamente na
  transição (e limpa quando a tarefa sai do grupo). Tarefas legadas nunca são
  retro-carimbadas ([ADR-001](docs/adr/ADR-001-done-semantics.md)).
- **Estrutura open source** — licença MIT, README/CONTRIBUTING bilíngues (pt-BR
  principal + EN), código de conduta, política de segurança, templates de issue/PR,
  `docs/ARCHITECTURE.md` e ADRs.

### Mudado

- Configurações saíram da engrenagem do header e foram pra sidebar.
- Vault novo já nasce com a semântica de conclusão ativa (`doneGroupId` no board padrão).

### Notas

- Instalador não assinado — o SmartScreen do Windows avisa na primeira execução
  ("Mais informações" → "Executar assim mesmo").
- Suite de testes do server cresceu de 40 pra 64 testes (tasks-repo, config e reports
  agora cobertos).

## [0.4.0] - 2026-06-09

Resumo retroativo (era pré-changelog), a partir do histórico git:

- **Abas** multi-vault, **roster** de usuários (`config/users.json`) com identidade git
  estável, **notificações por pull**, GC de assets órfãos e migração de opções de enum.
- Auto-save, selects editáveis inline, chips coloridos nos cards, status/blocos estilo
  Notion.
- Mensagens de commit automáticas descritivas (só o que mudou, ciente do título).
- Instalador assistido dark; histórico do card paginado; badge de versão no header.
