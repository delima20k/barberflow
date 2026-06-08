# Contrato: `get_professional_unpaid_transactions`

**Migration:** `20260608000001_professional_financial_cycle_summary.sql`  
**Camada:** `public` (PostgreSQL RPC via BFF)  
**Seguranca:** `SECURITY DEFINER`, `GRANT TO authenticated, service_role`

## Assinatura

```sql
CREATE OR REPLACE FUNCTION public.get_professional_unpaid_transactions(
  p_barbershop_id uuid,
  p_professional_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS TABLE (
  id uuid,
  barbershop_id uuid,
  professional_id uuid,
  amount numeric,
  gross_amount numeric,
  payment_method text,
  status text,
  type text,
  paid_at timestamptz,
  created_at timestamptz
)
```

## Objetivo

Retornar as transacoes pagas que ainda nao fazem parte de um payout confirmado,
formando o ciclo financeiro aberto do barbeiro.

## Regras

- Considera somente transacoes da barbearia com `type = revenue` e
  `status = paid`.
- Usa `NOT EXISTS` em `professional_payout_items.transaction_id` para excluir
  transacoes ja vinculadas a qualquer payout.
- Quando `p_professional_id` for informado, retorna apenas esse profissional.
- O limite e normalizado entre 1 e 5000 para preservar custo e performance.
- Chamadas diretas autenticadas so retornam dados quando `auth.uid()` e dono da
  barbearia ou profissional vinculado ativo; chamadas internas via `service_role`
  continuam liberadas para a BFF.
- O BFF continua recalculando valores e validando `displayed_amount` antes de
  chamar `confirmar_professional_payout_atomic`.

## Snapshot

`db/contracts/snapshots/get_professional_unpaid_transactions.json`
