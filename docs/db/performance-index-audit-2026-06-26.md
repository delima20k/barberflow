# Auditoria de performance de consultas e indices - 2026-06-26

## Escopo

Esta auditoria cobre somente performance, indices e consultas leves no BarberFlow. Ela nao substitui nem mistura achados do Supabase Advisor de seguranca, RLS, grants ou policies.

Areas revisadas: barbearias proximas/ranking, fila/cadeiras, agendamentos, chat, stories, financeiro e presenca.

## Limites da execucao

- `SUPABASE_DB_URL` nao estava disponivel nesta sessao.
- Nao foi possivel rodar `EXPLAIN`/`EXPLAIN ANALYZE` no Postgres de producao.
- Por seguranca, nenhum indice novo foi criado como migration nesta execucao.
- `CREATE INDEX CONCURRENTLY` nao foi colocado em migration, porque pode falhar se o runner executar dentro de transacao.
- Nenhum `select('*')` foi alterado sem contrato confirmado de consumidores.

## Achados por area

| Area | Consulta revisada | Indices existentes | Achado | Acao nesta execucao |
|---|---|---|---|---|
| Barbearias proximas | RPC `get_barbershops_nearby` por PostGIS | `idx_barbershops_geom` GIST, ranking publico | Adequado para busca por raio quando RPC existe. Fallback bounding-box usa lat/lng e ranking. | Sem indice novo. |
| Ranking/listas de barbearias | `is_active=true` com `ORDER BY rating_score/rating_avg/likes_count` | `idx_barbershops_public_all_ranking`, `idx_barbershops_public_featured_ranking` | Ja otimizado por migrations recentes. | Sem indice novo. |
| Fila/cadeiras | `queue_entries` por `barbershop_id`, status ativo, `ORDER BY position` | `idx_queue_barbershop`, `idx_queue_position`, `idx_queue_active_order` | Indices cobrem o front atual. BFF novo usa `posicao`, mas schema usa `position`; isso e contrato/schema, nao apenas indice. | Sem alteracao para nao mudar regra/contrato. |
| Agendamentos | conflito por `professional_id`, status e janela de `scheduled_at` | `idx_appointments_professional`, `idx_appointments_status`, RPC otimizada em `20260614000002` | Provavelmente suficiente; precisa `EXPLAIN` real para confirmar uso em conflito atomico. | Sem indice novo. |
| Chat | mensagens por conversa/latest, idempotencia e rate limit por sender recente | `idx_chat_messages_client_id`, `idx_chat_messages_conv_latest`, `idx_chat_messages_sender_recent` | Cobertura boa. Consulta de duplicidade por body poderia ter indice, mas indexar `body` aumenta custo de escrita e tamanho. | Nao recomendado sem evidencia de gargalo. |
| Stories | feed global: `expires_at > now()` e `ORDER BY created_at DESC`; por barbearia: `barbershop_id`, `expires_at`, `created_at DESC` | `idx_stories_expires`, `idx_stories_barbershop`, `idx_stories_media_id` | Candidato a indice por `created_at DESC` para reduzir sort/scan no feed, mas precisa planner real. | Candidato documentado, sem migration. |
| Likes | toggle/listagem por user/content e contagem por content | `idx_likes_content`, `idx_likes_user`, `idx_likes_unique_user_content` | Suficiente para igualdade e unicidade. | Sem indice novo. |
| Financeiro | `transactions` por `barbershop_id`, `type`, `status`, periodo `paid_at`, opcional `professional_id` | `idx_transactions_barbershop` em `created_at`, `idx_transactions_status` | Candidato mais forte: consultas usam `paid_at`, nao `created_at`. | Candidato documentado, sem migration. |
| Presenca | `professional_barbershop_presence` por `barbershop_id`, `is_available` | `idx_pbp_barbershop_available` | Adequado. | Sem indice novo. |
| Vinculo profissional/barbearia | `professional_shop_links` por `barbershop_id`, `professional_id`, `is_active` | unique `(professional_id, barbershop_id)`, `idx_psl_professional`, `idx_psl_barbershop` | Candidato parcial para links ativos por barbearia, usado em listagens/RLS/RPC. Precisa planner real. | Candidato documentado, sem migration. |
| Mensalistas | `barbershop_mensalistas` por `barbershop_id` e `ends_at >= now()` | sem indice especifico identificado | Candidato leve se tabela crescer. | Candidato documentado, sem migration. |

## Consultas leves

Foram encontrados `select('*')` em pontos como `shared/js/BarbershopRepository.js`, `shared/js/ProfileRepository.js`, `barberflow-bff-api/infrastructure/shared/BaseRepository.js`, `FilaRepository` e `AgendamentoRepository`.

Nao foram alterados nesta execucao porque:

- o front pode depender de campos nao obvios;
- o reposititorio base e generico;
- `FilaRepository` novo usa `posicao`, enquanto o schema historico usa `position`, entao trocar colunas agora poderia mascarar um bug de contrato;
- `AgendamentoRepository` de dominio tem mapeamento explicito, mas nao ha evidencia de gargalo sem `EXPLAIN`/telemetria.

## SQL candidato para validar com EXPLAIN

Nao aplicar automaticamente. Rodar primeiro `EXPLAIN` em producao, e usar `EXPLAIN ANALYZE` apenas para SELECTs seguros.

```sql
-- Financeiro: consultas por barbearia, tipo, status e periodo pago.
-- Motivo: queries usam paid_at; indice atual principal usa created_at.
CREATE INDEX IF NOT EXISTS idx_transactions_shop_type_status_paid_at
  ON public.transactions (barbershop_id, type, status, paid_at, created_at, professional_id);

-- Stories: feed por stories recentes ainda ativos.
-- Motivo: feed ordena por created_at DESC e filtra expires_at > now().
CREATE INDEX IF NOT EXISTS idx_stories_feed_created_desc
  ON public.stories (created_at DESC, id DESC)
  WHERE barbershop_id IS NOT NULL;

-- Stories por barbearia: lista limitada de stories recentes de uma barbearia.
-- Motivo: consulta filtra barbershop_id e ordena created_at DESC.
CREATE INDEX IF NOT EXISTS idx_stories_shop_created_desc
  ON public.stories (barbershop_id, created_at DESC, id DESC)
  WHERE barbershop_id IS NOT NULL;

-- Vinculos ativos por barbearia: listagens e checks de acesso.
-- Motivo: consultas frequentes filtram barbershop_id + is_active.
CREATE INDEX IF NOT EXISTS idx_psl_active_shop_professional
  ON public.professional_shop_links (barbershop_id, professional_id)
  WHERE is_active = true;

-- Mensalistas ativos por barbearia.
-- Motivo: soma mensal filtra barbershop_id e ends_at >= now().
CREATE INDEX IF NOT EXISTS idx_barbershop_mensalistas_shop_ends_at
  ON public.barbershop_mensalistas (barbershop_id, ends_at);
```

Para tabelas grandes em producao, preferir aplicar fora de transaction com `CREATE INDEX CONCURRENTLY` em janela controlada, ou confirmar que o runner escolhido nao encapsula a migration em transaction. Nao usar `CREATE INDEX CONCURRENTLY` dentro de migration transacional.

## Impacto esperado

- Financeiro: reduzir scan/sort em historico, resumo e transacoes em aberto por periodo.
- Stories: reduzir sort em feed e listagem por barbearia quando houver muitos stories expirados/recentes.
- `professional_shop_links`: reduzir custo de listagens de profissionais ativos e checks de acesso por barbearia.
- Mensalistas: reduzir custo da soma mensal quando a tabela crescer.

## Riscos

- Indices aumentam custo de `INSERT`/`UPDATE` e consumo de storage.
- `transactions` e `stories` podem ser tabelas grandes; aplicar sem `CONCURRENTLY` pode bloquear escrita.
- Sem `EXPLAIN` real, ainda nao ha prova de uso pelo planner.
- Indices de stories podem ser redundantes se a tabela for pequena ou se limpeza de expirados mantiver baixa cardinalidade.

## Proximo passo recomendado

1. Configurar `SUPABASE_DB_URL` em ambiente seguro.
2. Rodar `EXPLAIN` das consultas candidatas.
3. Rodar `EXPLAIN ANALYZE` somente em SELECTs seguros.
4. Criar migration final apenas para os indices cujo plano confirmar uso.
5. Rodar testes e aplicar em janela controlada.

## Resultado desta execucao

- Indices criados: 0.
- Migrations criadas: 0.
- Consultas alteradas: 0.
- Motivo: falta de acesso read-only ao Postgres de producao para validar planner antes de criar indices.
