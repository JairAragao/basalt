---
id: T-2026-06-01-exemplo-mrp
titulo: Corrigir cálculo de necessidade no MRP
status: Em andamento
responsavel: jair
modulo: Maestro
tipo: bug
branche: fix_mrp_need
G: 4
U: 5
T: 3
E: 2
created_at: '2026-06-02T00:29:36.471Z'
created_by: JairAragao
updated_at: '2026-06-02T00:29:36.471Z'
updated_by: JairAragao
gute_computed_at: 2026-06-01T09:00:00.000Z
GUT: 60
prioridade_gute: 30
---

Necessidade líquida está somando demanda de OPs já fechadas. Investigar
`plan_item.processed_amount` no recálculo. Relacionado a [[MRP]] no vault.
