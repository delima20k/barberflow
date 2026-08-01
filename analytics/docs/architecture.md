# Arquitetura

O Analytics compartilha o projeto Supabase do BarberFlow, mas utiliza schema,
tabelas, políticas, funções e migrations isoladas.

`barberflow.live` envia somente eventos permitidos para a Edge Function
`collect-event` do mesmo projeto Supabase. A função normaliza cabeçalhos,
classifica o user-agent, calcula hash de IP/HMAC e chama
`analytics.collect_analytics_event`. A landing não consulta tabelas diretamente.

O painel em `analistc.barberflow.live` reutiliza o Supabase Auth do BarberFlow e
executa `AnalyticsAdminGuard` antes de chamar RPCs com
`.schema('analytics').rpc(...)`. A autorização definitiva exige uma sessão
válida e uma linha ativa em `analytics.analytics_admins` ligada a
`auth.users.id`.

O schema `analytics` aparece na configuração da Data API para viabilizar as RPCs
do painel. Grants mínimos e RLS negam tabelas a `anon` e a usuários autenticados
comuns. A leitura de eventos usada pelo painel e Realtime também exige a policy
de administrador ativo; sessões e agregados continuam acessíveis somente por
RPC.

Presence continua preparada por `AnalyticsPresencePublisher`, mas desativada até
existirem CAPTCHA, canal privado, encerramento confiável e limpeza periódica.
