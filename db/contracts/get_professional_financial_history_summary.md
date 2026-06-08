# Contrato: `get_professional_financial_history_summary`

**Migration:** `20260608000001_professional_financial_cycle_summary.sql`  
**Camada:** `public` (PostgreSQL RPC via BFF)  
**Seguranca:** `SECURITY DEFINER`, `GRANT TO authenticated, service_role`

## Assinatura

```sql
CREATE OR REPLACE FUNCTION public.get_professional_financial_history_summary(
  p_barbershop_id uuid,
  p_professional_id uuid DEFAULT NULL
)
RETURNS TABLE (
  professional_id uuid,
  faturamento_historico numeric,
  total_recebido numeric,
  payouts_count integer,
  last_payout_at timestamptz
)
```

## Objetivo

Retornar o resumo historico agregado por profissional sem carregar todo o
historico de transacoes no Node.

## Regras

- `faturamento_historico` soma `transactions.gross_amount` com fallback para
  `transactions.amount`.
- Considera somente transacoes da barbearia com `type = revenue` e
  `status = paid`.
- `total_recebido`, `payouts_count` e `last_payout_at` consideram somente
  `professional_payouts.status = confirmed`.
- Quando `p_professional_id` for informado, retorna apenas esse profissional.
- O escopo de profissionais vem do dono da barbearia e dos links ativos em
  `professional_shop_links`.
- Chamadas diretas autenticadas so retornam dados quando `auth.uid()` e dono da
  barbearia ou profissional vinculado ativo; chamadas internas via `service_role`
  continuam liberadas para a BFF.

## Snapshot

`db/contracts/snapshots/get_professional_financial_history_summary.json`
