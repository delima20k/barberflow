# Contrato: `analytics.get_analytics_sessions`

**Migration:** `20260731000005_create_analytics_rpcs.sql`
**Acesso:** `authenticated`, após `analytics.is_analytics_admin()`
**Limite:** `p_limit` normalizado entre 1 e 100.

Retorna `session_id`, identificador pseudônimo do visitante, timestamps,
duração, status, origem, campanha, dispositivo e a timeline limitada da sessão.
Não retorna IP, user-agent ou HMAC de e-mail. Consulta somente
`analytics.analytics_events`.

Chamada Supabase: `client.schema('analytics').rpc('get_analytics_sessions', params)`.
