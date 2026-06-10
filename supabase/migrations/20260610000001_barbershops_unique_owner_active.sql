-- ==============================================================
-- Migration: 20260610000001_barbershops_unique_owner_active.sql
-- Descricao: Remove barbearias ativas duplicadas por owner e
--            adiciona indice unico parcial para prevenir recorrencia.
-- ==============================================================

-- Desativa duplicatas ativas: mantém apenas a mais recente por updated_at
UPDATE public.barbershops
SET is_active = false
WHERE is_active = true
  AND id NOT IN (
    SELECT DISTINCT ON (owner_id) id
    FROM public.barbershops
    WHERE is_active = true
    ORDER BY owner_id, updated_at DESC NULLS LAST
  );

-- Impede múltiplas barbearias ativas por owner no futuro
CREATE UNIQUE INDEX IF NOT EXISTS barbershops_one_active_per_owner
  ON public.barbershops(owner_id)
  WHERE is_active = true;
