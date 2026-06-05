# Contrato: `confirmar_professional_payout_atomic`

**Migration:** `20260605000003_professional_payouts.sql`  
**Camada:** `public` (PostgreSQL RPC via BFF)  
**Seguranca:** `SECURITY DEFINER`, `GRANT TO authenticated, service_role`

## Assinatura

```sql
CREATE OR REPLACE FUNCTION public.confirmar_professional_payout_atomic(
  p_barbershop_id uuid,
  p_professional_id uuid,
  p_amount numeric,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_created_by uuid,
  p_transaction_ids uuid[],
  p_item_amounts numeric[]
)
RETURNS TABLE (
  id uuid,
  barbershop_id uuid,
  professional_id uuid,
  amount numeric,
  period_start timestamptz,
  period_end timestamptz,
  status text,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
```

## Objetivo

Registrar o pagamento de barbeiro de forma atomica: cria `professional_payouts`
com `status = confirmed`, insere todos os `professional_payout_items` e retorna
o payout confirmado. Se qualquer insert ou constraint falhar, o Postgres reverte
a operacao inteira.

## Regras

- `paid_at` e preenchido somente para payout `confirmed`.
- `professional_payout_items.transaction_id` e unico para impedir duplicidade.
- A BFF calcula valores e transacoes elegiveis antes de chamar a RPC.
- A RPC rejeita valor nao positivo, periodo invalido e arrays vazios/divergentes.
- A RPC tambem valida dono da barbearia, vinculo do profissional, transacoes
  duplicadas, soma dos itens e elegibilidade basica das transacoes
  (`barbershop_id`, `professional_id`, `type = revenue`, `status = paid`,
  `paid_at` dentro do periodo).
- Chamadas autenticadas diretas precisam ter `auth.uid() = p_created_by`; chamadas
  internas da BFF via `service_role` continuam usando `p_created_by` como dono
  validado da barbearia.

## Snapshot

`db/contracts/snapshots/confirmar_professional_payout_atomic.json`
