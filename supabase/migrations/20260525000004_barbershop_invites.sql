-- ================================================================
-- Migration: 20260525000004_barbershop_invites.sql
-- Descrição: Tabela de convites de barbearia para barbeiros autônomos.
--            Permite ao dono enviar, e ao barbeiro aceitar ou recusar.
-- Tabelas:   barbershop_invites
-- ================================================================

CREATE TABLE IF NOT EXISTS public.barbershop_invites (
  id             uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbershop_id  uuid         NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  barbeiro_id    uuid         NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  commission_pct numeric(8,2) NOT NULL DEFAULT 0,
  message        text,
  status         text         NOT NULL DEFAULT 'pendente'
                               CHECK (status IN ('pendente', 'aceito', 'recusado')),
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.barbershop_invites IS
  'Convites enviados por donos de barbearias a barbeiros autônomos para trabalhar no espaço.';

-- Impede convite pendente duplicado para o mesmo par barbearia+barbeiro
CREATE UNIQUE INDEX barbershop_invites_pendente_unique
  ON public.barbershop_invites (barbershop_id, barbeiro_id)
  WHERE status = 'pendente';

CREATE INDEX idx_barbershop_invites_shop    ON public.barbershop_invites (barbershop_id, status);
CREATE INDEX idx_barbershop_invites_barb    ON public.barbershop_invites (barbeiro_id,   status);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.barbershop_invites ENABLE ROW LEVEL SECURITY;

-- Dono vê todos os convites da sua barbearia
CREATE POLICY "owner_select_convites"
  ON public.barbershop_invites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.barbershops
      WHERE id = barbershop_invites.barbershop_id
        AND owner_id = auth.uid()
    )
  );

-- Dono insere convites apenas para a sua barbearia
CREATE POLICY "owner_insert_convites"
  ON public.barbershop_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barbershops
      WHERE id = barbershop_invites.barbershop_id
        AND owner_id = auth.uid()
    )
  );

-- Barbeiro vê seus próprios convites
CREATE POLICY "barbeiro_select_convites"
  ON public.barbershop_invites FOR SELECT
  USING (barbeiro_id = auth.uid());

-- Barbeiro só pode mudar status para 'aceito' ou 'recusado' nos seus convites
CREATE POLICY "barbeiro_update_convites"
  ON public.barbershop_invites FOR UPDATE
  USING  (barbeiro_id = auth.uid())
  WITH CHECK (
    barbeiro_id = auth.uid()
    AND status IN ('aceito', 'recusado')
  );
