-- Migration: 20260505000003_indexes_ordering
-- Índices para garantir ORDER BY eficiente em buscas de usuários e barbearias.
-- Sem alteração de dados ou estrutura de tabelas.

-- Índice para ORDER BY full_name em profiles (favoritos, listagens)
CREATE INDEX IF NOT EXISTS idx_profiles_full_name
  ON public.profiles (full_name);

-- Índice funcional case-insensitive para ilike + order (fallback de busca)
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower
  ON public.profiles (lower(full_name));

-- Índice para ORDER BY name em barbershops (favoritos de barbearias)
CREATE INDEX IF NOT EXISTS idx_barbershops_name
  ON public.barbershops (name);
