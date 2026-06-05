-- ============================================================
-- Chaves públicas ECDH de longo prazo por usuário.
-- Usadas para derivar a chave de conversa E2E sem servidor.
-- A chave PRIVADA nunca sai do browser — apenas a pública é armazenada aqui.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_keys (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key text NOT NULL,         -- SPKI base64 da chave ECDH P-256
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler a chave pública de outro (é pública por definição)
DROP POLICY IF EXISTS "user_keys_select_authenticated" ON public.user_keys;
CREATE POLICY "user_keys_select_authenticated"
  ON public.user_keys
  FOR SELECT
  TO authenticated
  USING (true);

-- Apenas o próprio usuário pode registrar/atualizar sua chave
DROP POLICY IF EXISTS "user_keys_insert_own" ON public.user_keys;
CREATE POLICY "user_keys_insert_own"
  ON public.user_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_keys_update_own" ON public.user_keys;
CREATE POLICY "user_keys_update_own"
  ON public.user_keys
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.user_keys IS
  'Chaves públicas ECDH P-256 de longo prazo dos usuários para E2E do chat. Chave privada permanece no browser.';

-- rollback: DROP TABLE IF EXISTS public.user_keys;
