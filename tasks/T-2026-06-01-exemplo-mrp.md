---
id: T-2026-06-01-exemplo-mrp
titulo: Corrigir cálculo de necessidade no MRP
status: Pausado
responsavel: jair
modulo: Maestro
tipo: bug
branche: fix_mrp_need
G: 4
U: 5
T: 3
E: 2
GUT: 60
prioridade_gute: 30
gute_computed_at: 2026-06-01T09:00:00.000Z
---

Necessidade líquida está somando demanda de OPs já fechadas. Investigar
`plan_item.processed_amount` no recálculo. Relacionado a [[MRP]] no vault.
