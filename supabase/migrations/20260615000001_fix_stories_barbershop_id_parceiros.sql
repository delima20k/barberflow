-- ==============================================================
-- Migration: 20260615000001_fix_stories_barbershop_id_parceiros.sql
-- Descricao: Corrige stories de barbeiros parceiros cujo barbershop_id
--            aponta para uma barbearia INATIVA (geralmente auto-criada
--            pelo trigger handle_profile_barbearia quando pro_type='barbearia').
--
-- Problema:
--   Barbeiros parceiros com pro_type='barbearia' recebem uma barbearia
--   auto-criada pelo trigger. Ao acessar a tela Minha Barbearia sem o
--   sessionStorage.bf_parceria_barbershop_id configurado, o frontend
--   usava a barbearia PROPRIA do parceiro (inativa) como contexto,
--   resultando em stories com barbershop_id errado.
--
-- Correcao:
--   Para cada story cujo barbershop_id aponta para uma barbearia INATIVA
--   e cujo owner tem vinculo ativo com exatamente 1 barbearia ativa,
--   reatribui o barbershop_id para a barbearia vinculada correta.
--
-- Seguranca:
--   - So atualiza se owner tem exatamente 1 vinculo ativo (sem ambiguidade)
--   - Nao altera stories com barbershop_id ja correto (barbearia ativa)
--   - Nao altera stories sem barbershop_id (NULL)
--   - Operacao idempotente: pode ser reaplicada sem dano
--
-- Rollback:
--   Nao ha rollback automatico seguro. Criar snapshot da tabela stories
--   antes de aplicar em producao via: db/snapshots/stories_pre_fix.sql
-- ==============================================================

-- Corrige stories de parceiros com barbershop_id de barbearia inativa
UPDATE public.stories s
SET barbershop_id = (
  SELECT psl.barbershop_id
  FROM public.professional_shop_links psl
  INNER JOIN public.barbershops b ON b.id = psl.barbershop_id
  WHERE psl.professional_id = s.owner_id
    AND psl.is_active = true
    AND b.is_active = true
  GROUP BY psl.barbershop_id
  HAVING COUNT(*) = 1  -- garante vinculo unico (sem ambiguidade)
  LIMIT 1
)
WHERE s.barbershop_id IN (
  -- barbershop_ids que apontam para barbearias INATIVAS
  SELECT id FROM public.barbershops WHERE is_active = false
)
AND (
  -- owner tem exatamente 1 vinculo ativo com barbearia ativa
  SELECT COUNT(DISTINCT psl.barbershop_id)
  FROM public.professional_shop_links psl
  INNER JOIN public.barbershops b ON b.id = psl.barbershop_id
  WHERE psl.professional_id = s.owner_id
    AND psl.is_active = true
    AND b.is_active = true
) = 1;

-- Diagnostico: mostra quantas stories foram corrigidas (deve retornar 0 apos aplicar)
-- SELECT COUNT(*) AS stories_com_barbearia_inativa
-- FROM public.stories s
-- WHERE s.barbershop_id IN (SELECT id FROM public.barbershops WHERE is_active = false);
