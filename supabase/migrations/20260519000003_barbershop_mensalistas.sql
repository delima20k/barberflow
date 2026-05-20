-- ==============================================================
-- Migration: 20260519000003_barbershop_mensalistas.sql
-- Descrição: Tabela de clientes mensalistas por barbearia.
--
-- Um mensalista é um cliente fidelidade com plano mensal ativo.
-- Quando o profissional senta um mensalista na cadeira, o sistema
-- exibe o card "Plano Mensal" no CorteModal sem exigir seleção
-- individual de serviços.
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.barbershop_mensalistas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id uuid        NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  client_id     uuid        NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbershop_id, client_id)
);

ALTER TABLE public.barbershop_mensalistas ENABLE ROW LEVEL SECURITY;

-- Dono da barbearia pode gerenciar todos os mensalistas dela
CREATE POLICY "mensalistas_owner_all"
  ON public.barbershop_mensalistas
  FOR ALL
  USING (
    barbershop_id IN (
      SELECT id FROM public.barbershops WHERE owner_id = auth.uid()
    )
  );

-- Cliente pode ler se ele mesmo é mensalista
CREATE POLICY "mensalistas_client_read"
  ON public.barbershop_mensalistas
  FOR SELECT
  USING (client_id = auth.uid());
