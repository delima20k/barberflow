-- ============================================================
-- Migration: P1 security — CPF/CNPJ sai do user_metadata
-- Autor: segurança OWASP API3/API6:2023
-- ============================================================
-- CPF/CNPJ estava em raw_user_meta_data (user_metadata no JWT):
--   • Exposto em cada JWT decodificado e no localStorage
--   • Qualquer usuário podia sobrescrever via updateUser({ data })
--   • Violava LGPD Art. 46 (salvaguardas técnicas para PII)
--
-- Solução: coluna cpf_cnpj_enc na tabela profiles
--   • AES-256-GCM cifrado pela BFF (chave DOC_ENCRYPT_KEY no env)
--   • Só o dono lê, via BFF /api/v1/auth/me (service_role)
--   • updateUser({ data }) já não tem o campo para alterar
-- ============================================================

-- 1. Coluna de documento cifrado
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cpf_cnpj_enc TEXT;

-- Notas de acesso:
--   SELECT em profiles está revogado para anon e authenticated
--   (migration 20260628000001). A BFF usa service_role para ler
--   cpf_cnpj_enc, decifra server-side e retorna apenas para o
--   próprio dono — controlado pelo AuthMiddleware (JWT.sub = id).

-- ============================================================
-- 2. BACKFILL — executar após deploy da BFF
-- ============================================================
-- O backfill usa cifra AES-256-GCM com DOC_ENCRYPT_KEY do env,
-- que não está disponível em tempo de migração SQL. Execute:
--
--   POST /api/v1/admin/backfill-documentos
--   Authorization: Bearer <token-admin>
--
-- O endpoint:
--   a) lista auth.users com cpf/cnpj em raw_user_meta_data
--   b) cifra cada documento com DocumentCipher (AES-256-GCM)
--   c) persiste em profiles.cpf_cnpj_enc
--   (a limpeza do metadata é passo separado abaixo)

-- ============================================================
-- 3. Função de limpeza do user_metadata
-- ============================================================
-- ATENÇÃO: chame APENAS após confirmar que o backfill foi
-- bem-sucedido para TODOS os usuários:
--
--   SELECT * FROM public.limpar_cpf_cnpj_user_metadata();
--
CREATE OR REPLACE FUNCTION public.limpar_cpf_cnpj_user_metadata()
RETURNS TABLE(usuarios_atualizados bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v bigint := 0;
BEGIN
  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data - 'cpf' - 'cnpj' - 'cpf_cnpj'
  WHERE raw_user_meta_data ? 'cpf'
     OR raw_user_meta_data ? 'cnpj'
     OR raw_user_meta_data ? 'cpf_cnpj';

  GET DIAGNOSTICS v = ROW_COUNT;
  RETURN QUERY SELECT v;
END;
$$;

-- Apenas service_role pode executar (BFF chama via RPC após validar backfill)
REVOKE EXECUTE ON FUNCTION public.limpar_cpf_cnpj_user_metadata() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.limpar_cpf_cnpj_user_metadata() TO service_role;

-- ============================================================
-- rollback:
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS cpf_cnpj_enc;
--   DROP FUNCTION IF EXISTS public.limpar_cpf_cnpj_user_metadata();
-- ============================================================
