-- Adiciona coluna font_key na tabela barbershops
-- Armazena a chave da fonte personalizada escolhida pelo dono da barbearia
-- Valores possíveis: 'rye' | 'cinzel' | 'abril' | 'oswald' | 'teko' | NULL

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS font_key TEXT;
