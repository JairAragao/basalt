# Changelog

Todas as mudanças relevantes do Basalt estão documentadas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); as versões seguem semver.

## [0.6.1] - 2026-06-18

### Corrigido

- **Sincronização não trava mais em divergência** — o push em background era um
  `git push` puro: ao ser rejeitado por *non-fast-forward* (remoto à frente, ex.
  outra máquina rodando o Basalt), nada reintegrava o remoto e os commits locais
  iam se acumulando à frente do origin — o `pull --ff-only` deixava de avançar e a
  sincronização ficava presa até intervenção manual. Agora o push se **auto-cura**:
  ao detectar divergência, faz `pull --rebase --autostash` (empilha o working tree,
  rebaseia os commits locais sobre o remoto, devolve o stash) e re-tenta o push (até
  3x). Conflito real de conteúdo aborta o rebase com o working tree intacto (sem
  marcadores que corromperiam o `.md`) e sinaliza `diverged`. Os commits integrados
  pelo push viram notificações, como no pull manual.

### Notas

- Suite de testes: 103 → 107 (integração real de push: divergência limpa, conflito
  real e sem-remote).

## [0.6.0] - 2026-06-11

### Adicionado

- **Opções com cor, editáveis inline** — renomeie, recolora (paleta de 13) e exclua
  opções de enum/multiselect direto do select no card ou nas Configurações, estilo
  Notion. A cor vive no schema do vault (`options` aceita `string | {value, color}`);
  sem cor, vale a cor automática. Renomear preserva a cor e migra as tarefas.
- **Filtros que seguem o tipo do campo** — texto livre (ignora caixa/acentos) pra
  `string`, número exato pra `int`, intervalo de datas pra `datetime` (agora filtrável),
  selects pra enum/usuário. Combinam por E; contagens sempre do conjunto completo.
- **Janela de render incremental** — kanban (50/coluna) e tabela (100 + "Mostrando X de
  Y") carregam mais ao rolar; vaults grandes não travam a tela.
- **Sync configurável** — nova aba "Sync" nas Configurações: intervalo do auto-pull
  (desligado a 15 min) e estratégia em conflito (rebase com abort seguro · só
  fast-forward · perguntar). Falha de pull nunca mais é silenciosa (ícone âmbar + aviso;
  modal no modo perguntar).

### Mudado

- Sidebar no padrão ACM: botão flutuante na borda pra expandir/recolher, **Dashboard
  acima de Tarefas** e Configurações ancorada no rodapé.
- Selects: a pseudo-opção "— limpar —" morreu; limpar agora é um **X** à direita do
  valor. Busca do select indica "Buscar ou criar…".
- Logo do header: sem o quadrado, centralizado, maior e com a luz pulsante do splash.
- Barras do dashboard por enum usam a cor de cada opção.

### Notas

- Documentação principal passou a ser em português (inglês como alternativa `.en.md`).
- Suite de testes: 64 → 103 (options/optionMeta, integração real de pull com conflito,
  filtros).
- Idioma da interface (pt/EN) ficou para a 0.7.0.

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
