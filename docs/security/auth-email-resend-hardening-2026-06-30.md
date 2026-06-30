# Revisao de seguranca: emails de auth via Resend

Data: 2026-06-30

## Resultado curto

- **Fallback BFF -> Supabase:** risco real confirmado. Antes, `AuthService.recuperarSenha()` chamava `BffApiService.auth.solicitarRecuperacaoSenha()` e, em qualquer erro de rede/resposta, acionava `SupabaseService.resetPassword(email)`. Se a BFF tivesse enviado pelo Resend mas a resposta falhasse no navegador, o usuario poderia receber dois links de reset. Correcao: fallback automatico removido; o usuario recebe resposta generica e pode tentar de novo manualmente.
- **Rate limiting:** as rotas novas passam pelo `RateLimiterMiddleware.auth` em `app.js`, mas agora tambem recebem limitadores especificos: 5/h por IP e 3/h por email para rotas publicas de email. A rota autenticada de alerta de senha alterada recebe limite de 5/h por IP.
- **Serverless:** rate limit global depende de `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`. Sem Upstash em producao, o fallback MemoryStore nao compartilha estado entre instancias serverless. O codigo agora loga aviso explicito nesse caso.
- **Falhas Resend:** falhas 4xx, 5xx e timeout sao tratadas sem quebrar o fluxo principal. Logs usam email mascarado e nao incluem `RESEND_API_KEY`.
- **Caminho de recuperacao apos falha:** foi mantida a opcao A como solucao principal porque o `ResendEmailService` ja executa retry curto com backoff em 5xx/timeout antes de desistir. A mensagem do front tambem foi ajustada para orientar nova tentativa manual sem revelar se o email existe. Fila/outbox fica como evolucao futura porque exigiria processo separado de reenvio.
- **MemoryStore em producao:** para rotas publicas de email auth, ausencia de Upstash agora gera log `error` critico e ativa fallback distribuido via Supabase/RPC por hash de email. Se a RPC/tabela nao estiver aplicada, a BFF loga erro critico e permite a request para nao derrubar auth.
- **Hash de email:** a primeira versao usava SHA-256 simples. Isso foi corrigido para HMAC-SHA256 na BFF com `AUTH_EMAIL_HASH_SECRET`, porque email tem baixa entropia e SHA-256 puro permitiria ataque de dicionario em caso de leitura/vazamento da tabela.
- **Segredo HMAC:** `AUTH_EMAIL_HASH_SECRET` foi configurada em producao na Vercel da BFF. O codigo nao possui fallback hardcoded: se a env estiver ausente ou tiver menos de 32 caracteres, o fallback distribuido falha de forma visivel e loga erro critico, sem usar chave fraca silenciosamente.

## Evidencias

- `shared/js/AuthService.js`: fallback automatico Supabase removido do caminho de `recuperarSenha()`.
- `barberflow-bff-api/app.js`: `/api/v1/auth` e `/api/auth` continuam usando `RateLimiterMiddleware.auth`.
- `barberflow-bff-api/routes/auth.js`: `signup-confirmation` e `forgot-password` usam `authEmailIp` + `authEmailConta`; `password-changed-notification` usa `authEmailIp`.
- `barberflow-bff-api/infrastructure/email/ResendEmailService.js`: erros sao capturados e retornam `{ ok: false }`, sem throw para o fluxo principal.
- `barberflow-bff-api/middlewares/rateLimiter.js`: `authEmailDbFallback` usa `consume_auth_email_attempt` somente em producao sem Redis/Upstash; gera `email_hash` com HMAC-SHA256 via `AUTH_EMAIL_HASH_SECRET`.
- `supabase/migrations/20260630000002_auth_email_attempts_rate_limit.sql`: cria tabela/RPC service_role-only para limitar por `email_hash + purpose`, sem armazenar email em claro nem SHA-256 puro.

## Migration solta fora do escopo

O arquivo `supabase/migrations/20260630000001_fix_profiles_select_authenticated.sql` estava solto antes desta etapa e nao pertence ao hardening de email/auth. Ele faz `GRANT SELECT ON public.profiles TO authenticated` para corrigir uma regressao de `profiles`.

Tentativa de verificacao em producao:

```text
supabase migration list
```

Resultado local: o CLI retornou `Access token not provided`, pedindo `supabase login` ou `SUPABASE_ACCESS_TOKEN`. Portanto, nao foi possivel confirmar deste ambiente se essa migration ja foi aplicada em producao.

Conclusao final: essa migration foi propositalmente deixada fora do commit de email/auth. Se ela ja foi aplicada manualmente em producao, deve ser commitada em um commit proprio para manter historico consistente; se nao foi aplicada, tratar como residuo de outra tarefa.

## Tokens de reset

Supabase pode aceitar mais de um link/token de recuperacao gerado em janelas proximas. Esta revisao nao altera a politica interna de tokens do Supabase nem implementa invalidacao manual. A mitigacao escolhida e impedir o duplo disparo automatico no cliente, que era a origem pratica do risco.

## Testes cobertos

- Resend sem API key nao chama provider e nao quebra.
- Resend 4xx falha sem retry e com log seguro.
- Resend 5xx faz retry e falha de forma controlada.
- Timeout/AbortError faz retry e falha de forma controlada.
- `AuthBffService.solicitarRecuperacaoSenha()` continua retornando resposta generica mesmo quando o envio falha, com log mascarado.
- Fallback distribuido de rate limit bloqueia com 429 quando a RPC indica excesso.
- Fallback distribuido permite a request quando a RPC indica limite disponivel.
- Teste do fallback distribuido valida que `p_email_hash` e HMAC-SHA256 com `AUTH_EMAIL_HASH_SECRET` e difere de SHA-256 puro.

## Resumo final do hardening

- Fallback automatico Supabase removido do fluxo de recuperacao de senha no front.
- Resposta e mensagem de recuperacao mantidas neutras para evitar enumeracao de usuarios.
- Resend mantem retry curto com backoff para 5xx, 429 e timeout.
- Rotas publicas de email auth recebem rate limit por IP e por email.
- Producao sem Upstash gera log critico nas rotas de email auth.
- Fallback distribuido via Supabase RPC limita por HMAC-SHA256 de email + finalidade.
- HMAC usa somente `AUTH_EMAIL_HASH_SECRET`, sem fallback hardcoded.
- Logs mascaram email e nao incluem API key, token de reset ou email completo.

## Validacao final

Comandos finais executados antes do commit:

- `node --check shared\js\AuthService.js`
- `node --check barberflow-bff-api\middlewares\rateLimiter.js`
- `node --check barberflow-bff-api\routes\auth.js`
- `node --check barberflow-bff-api\infrastructure\email\ResendEmailService.js`
- `node --test barberflow-bff-api\tests\resend-email-service.test.js`
- `node --test barberflow-bff-api\tests\auth.test.js`
- `node --test barberflow-bff-api\tests\auth-email-hardening.test.js`
- `node --test barberflow-bff-api\tests\auth-email-rate-limit-fallback.test.js`
- `git diff --check`

Resultado final: todos passaram.
