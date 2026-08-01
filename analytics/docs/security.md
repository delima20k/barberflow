# Segurança

A Edge Function pública usa `verify_jwt=false` somente para coleta. Ela aceita
POST JSON da origem exata `https://barberflow.live`, limita o payload a 16 KiB,
valida allowlists de evento/campo, aplica rate limit por IP, sessão e origem e
usa `idempotency_key` para idempotência. As respostas são genéricas.

O e-mail de evento é aceito apenas em `email_submitted`, normalizado, transformado
em HMAC SHA-256 com `ANALYTICS_HMAC_SECRET` no servidor e removido antes da
persistência. E-mail puro não entra em eventos, logs, Realtime ou respostas.

`SUPABASE_SERVICE_ROLE_KEY` e `ANALYTICS_HMAC_SECRET` existem somente nos secrets
da função. A landing recebe, quando ativada manualmente, apenas a URL do coletor
e a publishable key.

O schema `analytics` revoga acesso de `public` e `anon`. Usuários autenticados
executam RPCs guardadas por `analytics.is_analytics_admin()`; a leitura de
eventos usada pelo painel/Realtime possui a mesma restrição em RLS. A função de
coleta e a limpeza de retenção são executáveis apenas por `service_role`.

Antes de ativar, limite a CSP da landing ao domínio HTTPS exato do mesmo projeto
Supabase e ao endpoint `collect-event`; não use curingas.
