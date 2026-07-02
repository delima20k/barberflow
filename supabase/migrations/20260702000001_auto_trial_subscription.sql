-- =============================================================
-- Migration: 20260702000001_auto_trial_subscription.sql
-- Descrição: Cria a assinatura TRIAL (7 dias) automaticamente no
--            servidor quando um PROFISSIONAL se cadastra escolhendo
--            o card "Começar teste grátis" (plan_intent='trial' no
--            metadata do signup).
--
--            Motivação: com email confirmation ligado, o signUp NÃO
--            devolve sessão (session=null). Sem sessão, o frontend
--            não consegue chamar a BFF POST /trial (precisa de JWT),
--            então o trial nunca era criado e o profissional caía na
--            tela de planos. Resolvemos igual à barbearia: trigger
--            SECURITY DEFINER (ignora RLS, não precisa de sessão).
--            Espelha handle_profile_barbearia (20260414000012).
--
--            Planos PAGOS (mensal/trimestral) NÃO recebem trial — só
--            criam assinatura 'active' após o pagamento confirmado
--            (webhook Asaas). Assim, plano pago sem pagamento = acesso
--            restrito, conforme a regra de negócio.
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só profissional que escolheu explicitamente o trial no cadastro
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'client') = 'professional'
     AND NEW.raw_user_meta_data->>'plan_intent' = 'trial' THEN

    -- Idempotente: não duplica se já houver trial/ativo
    IF NOT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = NEW.id AND status IN ('trial', 'active')
    ) THEN
      INSERT INTO public.subscriptions
        (user_id, plan_type, status, platform, starts_at, ends_at)
      VALUES
        (NEW.id, 'trial', 'trial', 'web', now(), now() + interval '7 days');
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

-- O nome "on_auth_user_trial" ordena DEPOIS de "on_auth_user_created"
-- ('c' < 't'), garantindo que handle_new_user já criou o profile antes —
-- subscriptions.user_id referencia profiles(id) (FK).
DROP TRIGGER IF EXISTS on_auth_user_trial ON auth.users;
CREATE TRIGGER on_auth_user_trial
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_trial();
