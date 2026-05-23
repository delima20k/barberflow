# Auditoria de Migrations — BarberFlow
**Data:** 2026-05-23  
**Escopo:** 83 arquivos em `supabase/migrations/` — somente leitura, nenhum dado alterado.  
**Autor único:** Alan Lima (todos os commits de migration identificados via `git log`).  
**Metodologia:** Leitura direta de cada migration + `git log` + análise de cobertura de testes.

---

## 1. Mapa cronológico completo

> Legenda de tipos: `CT` CREATE TABLE · `AT` ALTER TABLE · `DR` DROP · `RPC` CREATE/REPLACE FUNCTION · `TRG` Trigger · `IDX` Index · `POL` Policy · `SD` Seed/Backfill · `RLS` Row Level Security

| # | Arquivo | Data | Tipos | Tabelas afetadas | Tem rollback? |
|---|---|---|---|---|---|
| 01 | `20260406000001_initial_schema.sql` | 2026-04-06 | CT, IDX, RLS | profiles, barbershops, professionals, appointments, services, queue_entries, subscriptions, transactions | ❌ |
| 02 | `20260406000002_media_schema.sql` | 2026-04-06 | CT, IDX, RLS | stories, story_views, portfolio_images, portfolio_likes, likes, notifications | ❌ |
| 03 | `20260406000003_rls_policies.sql` | 2026-04-06 | POL | barbershops, professionals, appointments, services, queue_entries, profiles | ❌ |
| 04 | `20260406000004_storage_buckets.sql` | 2026-04-06 | SD | — (Supabase Storage config) | ❌ |
| 05 | `20260411000006_notifications_rls.sql` ⚠️ | 2026-04-11 | POL, RLS | notifications | ❌ |
| 06 | `20260411000006_subscriptions.sql` ⚠️ | 2026-04-11 | CT, IDX, POL | subscriptions | ❌ |
| 07 | `20260413000005_location_and_legal.sql` | 2026-04-13 | AT | barbershops, profiles | ❌ |
| 08 | `20260414000006_pro_type.sql` | 2026-04-14 | AT, TRG | profiles | ❌ |
| 09 | `20260414000007_fix_barbershops_rls.sql` 🔧 | 2026-04-14 | POL | barbershops | ❌ |
| 10 | `20260414000008_profiles_trigger.sql` | 2026-04-14 | RPC, TRG | profiles, barbershops | ❌ |
| 11 | `20260414000009_cascade_on_delete.sql` | 2026-04-14 | AT | appointments, queue_entries | ❌ |
| 12 | `20260414000010_barbershops_anon_select.sql` | 2026-04-14 | POL | barbershops | ❌ |
| 13 | `20260414000011_fix_rls_anon_all_tables.sql` 🔧 | 2026-04-14 | POL | profiles, services, professionals | ❌ |
| 14 | `20260414000012_trigger_auto_barbershop.sql` | 2026-04-14 | RPC, TRG | barbershops, professional_shop_links | ❌ |
| 15 | `20260416000001_direct_messages.sql` | 2026-04-16 | CT, IDX, POL | direct_messages | ❌ |
| 16 | `20260416000002_story_comments.sql` | 2026-04-16 | CT, IDX, POL | story_comments | ❌ |
| 17 | `20260416000003_messages_rls.sql` | 2026-04-16 | POL | direct_messages | ❌ |
| 18 | `20260416000004_story_cleanup_function.sql` | 2026-04-16 | RPC | stories | ❌ |
| 19 | `20260417000001_profiles_personal_data.sql` | 2026-04-17 | AT | profiles | ❌ |
| 20 | `20260417000002_fix_notifications_rls.sql` 🔧 | 2026-04-17 | POL | notifications | ❌ |
| 21 | `20260417000003_subscriptions_unique_token.sql` | 2026-04-17 | IDX | subscriptions | ❌ |
| 22 | `20260417000004_profiles_private_columns.sql` | 2026-04-17 | AT, POL | profiles | ❌ |
| 23 | `20260417000005_prevent_role_escalation.sql` | 2026-04-17 | TRG, RPC | profiles | ❌ |
| 24 | `20260417000006_fix_trial_race_condition.sql` 🔧 | 2026-04-17 | RPC | subscriptions | ❌ |
| 25 | `20260417000007_missing_rls_policies.sql` 🔧 | 2026-04-17 | POL, RLS | story_views, portfolio_images, portfolio_likes, story_comments | ❌ |
| 26 | `20260418000001_barbershop_interactions.sql` ⚠️ | 2026-04-18 | CT, AT, IDX, POL, TRG, RPC | barbershop_interactions, barbershops | ❌ |
| 27 | `20260418000001_rls_security_hardening.sql` ⚠️🔧 | 2026-04-18 | POL, DR | notifications, story_views, appointments, queue_entries, professional_shop_links | ❌ |
| 28 | `20260418000002_fix_transactions_rls.sql` 🔧 | 2026-04-18 | POL | transactions | ❌ |
| 29 | `20260418000003_barbershops_role_check.sql` | 2026-04-18 | TRG, RPC | barbershops | ❌ |
| 30 | `20260419000001_lgpd_compliance.sql` | 2026-04-19 | RPC | profiles, barbershops, transactions, notifications | ❌ |
| 31 | `20260420000001_profiles_public_rating.sql` | 2026-04-20 | AT | profiles | ❌ |
| 32 | `20260420000002_storage_avatar_update.sql` | 2026-04-20 | POL | storage.objects | ❌ |
| 33 | `20260420000003_favorite_professionals.sql` | 2026-04-20 | CT, IDX, POL | favorite_professionals | ❌ |
| 34 | `20260420000004_professional_likes.sql` | 2026-04-20 | CT, IDX, POL, AT, TRG, RPC | professional_likes, professionals | ❌ |
| 35 | `20260421000001_favorite_professionals_ensure.sql` 🔧 | 2026-04-21 | IDX | favorite_professionals | ❌ |
| 36 | `20260421000002_ensure_professionals_row.sql` 🔧 | 2026-04-21 | RPC, TRG | professionals, profiles | ❌ |
| 37 | `20260421000004_bayesian_rating_formula.sql` 🔴 | 2026-04-21 | RPC, SD | barbershops (UPDATE rating_score) | ❌ |
| 38 | `20260421000005_public_interaction_counts.sql` 🔴🔧 | 2026-04-21 | POL, RPC, SD | barbershop_interactions, professional_likes, barbershops, professionals | ❌ |
| 39 | `20260422000001_owner_pro_link.sql` | 2026-04-22 | RPC | professional_shop_links | ❌ |
| 40 | `20260423000001_barbershops_extra_fields.sql` | 2026-04-23 | AT | barbershops | ❌ |
| 41 | `20260423000002_barbershops_font_key.sql` | 2026-04-23 | AT | barbershops | ❌ |
| 42 | `20260424000001_storage_barbershops_fix.sql` 🔧 | 2026-04-24 | POL | storage.objects | ❌ |
| 43 | `20260424000002_storage_barbershops_secdef.sql` | 2026-04-24 | RPC | storage.objects | ❌ |
| 44 | `20260427000001_create_refresh_tokens.sql` | 2026-04-27 | CT, IDX, POL | refresh_tokens | ❌ |
| 45 | `20260427000002_file_download_events.sql` | 2026-04-27 | CT, IDX, POL | file_download_events | ❌ |
| 46 | `20260428000001_services_image_path.sql` | 2026-04-28 | AT | services | ❌ |
| 47 | `20260428000002_media_metadata.sql` | 2026-04-28 | AT | portfolio_images | ❌ |
| 48 | `20260428121847_create_storage_buckets.sql` | 2026-04-28 | SD | — (Storage) | ❌ |
| 49 | `20260428130605_create_barbershop_bucket.sql` | 2026-04-28 | SD | — (Storage) | ❌ |
| 50 | `20260428130606_create_p2p_peers.sql` | 2026-04-28 | CT, IDX, POL | p2p_peers | ❌ |
| 51 | `20260430000001_barbershop_close_reason.sql` | 2026-04-30 | AT | barbershops | ❌ |
| 52 | `20260501000001_barbershops_realtime.sql` | 2026-05-01 | AT | barbershops (Realtime enable) | ❌ |
| 53 | `20260503000001_profiles_email.sql` | 2026-05-03 | AT, POL | profiles | ❌ |
| 54 | `20260503000002_modal_rpc_functions.sql` | 2026-05-03 | RPC | profiles, barbershop_interactions, favorite_professionals | ❌ |
| 55 | `20260503000003_search_indexes_and_rpc.sql` | 2026-05-03 | IDX, RPC | profiles | ❌ |
| 56 | `20260503000004_allow_pro_type_promotion.sql` | 2026-05-03 | POL | profiles | ❌ |
| 57 | `20260503000005_fix_handle_new_user_pro_type.sql` 🔧 | 2026-05-03 | RPC, SD | profiles | ❌ |
| 58 | `20260503000006_subscriptions_price.sql` | 2026-05-03 | AT | subscriptions | ❌ |
| 59 | `20260505000001_queue_entries_guest_name.sql` | 2026-05-05 | AT | queue_entries | ❌ |
| 60 | `20260505000002_fix_clientes_favoritos_modal.sql` 🔧🔴 | 2026-05-05 | RPC | profiles, favorite_professionals | ❌ |
| 61 | `20260505000003_indexes_ordering.sql` | 2026-05-05 | IDX | barbershops, professionals, queue_entries | ❌ |
| 62 | `20260505000005_notify_all_queue_on_done.sql` | 2026-05-05 | RPC, TRG | queue_entries, notifications | ❌ |
| 63 | `20260505000006_fix_rpc_clientes_favoritos_sql.sql` 🔧 | 2026-05-05 | RPC | profiles, favorite_professionals | ❌ |
| 64 | `20260506000001_queue_entry_services.sql` | 2026-05-06 | CT, IDX, POL, AT | queue_entry_services, queue_entries | ❌ |
| 65 | `20260507000001_fix_profiles_rls_queue_access.sql` 🔧 | 2026-05-07 | POL | profiles | ❌ |
| 66 | `20260507000002_restaurar_favoritos_barbearia_modal.sql` 🔧 | 2026-05-07 | RPC | profiles, barbershop_interactions, favorite_professionals | ❌ |
| 67 | `20260507000003_queue_client_confirmation.sql` | 2026-05-07 | AT, RPC | queue_entries, notifications | ❌ |
| 68 | `20260507000004_notify_barber_on_first_no.sql` | 2026-05-07 | RPC | notifications, queue_entries | ❌ |
| 69 | `20260507000005_notifications_realtime.sql` | 2026-05-07 | AT | notifications (Realtime enable) | ❌ |
| 70 | `20260509000001_push_v2.sql` | 2026-05-09 | AT, CT, IDX, POL | subscriptions, profiles | ❌ |
| 71 | `20260511000001_push_expiration.sql` | 2026-05-11 | AT | subscriptions | ❌ |
| 72 | `20260511000002_transactions_financeiro.sql` | 2026-05-11 | CT, AT, IDX, POL | transactions | ❌ |
| 73 | `20260512000001_client_at_shop_presenca.sql` ⚠️ | 2026-05-12 | RPC | queue_entries, notifications | ❌ |
| 74 | `20260512000001_transactions_gross_amount.sql` ⚠️ | 2026-05-12 | AT, SD | transactions | ❌ |
| 75 | `20260513000001_notificar_barbeiro_rpc.sql` 🔴 | 2026-05-13 | POL, RPC | notifications | ❌ |
| 76 | `20260513000002_block_queue_closed_barbershop.sql` | 2026-05-13 | RPC | queue_entries, barbershops | ❌ |
| 77 | `20260516000001_check_constraints.sql` | 2026-05-16 | AT | queue_entries, appointments, subscriptions | ❌ |
| 78 | `20260516000002_cleanup_functions.sql` | 2026-05-16 | RPC | queue_entries, notifications | ❌ |
| 79 | `20260516000003_atomic_appointment_rpc.sql` | 2026-05-16 | RPC | appointments | ❌ |
| 80 | `20260516_notify_professional_queue_done.sql` 🔴 | 2026-05-16 | RPC, TRG | queue_entries, notifications | ❌ |
| 81 | `20260517000001_drop_direct_messages.sql` ⚠️ | 2026-05-17 | DR | direct_messages, story_comments | ❌ |
| 82 | `20260517000001_postgis_barbershops.sql` ⚠️ | 2026-05-17 | AT, IDX, RPC, TRG, SD | barbershops | ❌ |
| 83 | `20260517000002_refresh_tokens_family_id.sql` | 2026-05-17 | AT, IDX | refresh_tokens | ❌ |
| 84 | `20260517000003_unify_portfolio_likes.sql` | 2026-05-17 | SD, DR | portfolio_images, portfolio_likes, likes | ❌ |
| 85 | `20260517000004_barbershops_missing_columns.sql` | 2026-05-17 | AT | barbershops | ❌ |
| 86 | `20260519000001_queue_client_confirmed_arriving_check.sql` | 2026-05-19 | RPC | queue_entries | ❌ |
| 87 | `20260519000002_fix_barbershop_storage_rls.sql` 🔧 | 2026-05-19 | POL | storage.objects | ❌ |
| 88 | `20260519000003_barbershop_mensalistas.sql` | 2026-05-19 | CT, IDX, POL | barbershop_mensalistas | ❌ |
| 89 | `20260520000001_get_clientes_favoritos_barbearia.sql` | 2026-05-20 | RPC | barbershop_interactions, favorite_professionals, professional_shop_links | ❌ |
| 90 | `20260521000001_add_monthly_fee_mensalistas.sql` ⚠️ | 2026-05-21 | AT | barbershop_mensalistas | ❌ |
| 91 | `20260521000001_geo_bounded_context.sql` ⚠️ | 2026-05-21 | CT, AT, IDX, POL, RPC, TRG | geofences, profiles, barbershops | ❌ |
| 92 | `20260521000002_add_haircuts_count_mensalistas.sql` | 2026-05-21 | AT | barbershop_mensalistas | ❌ |
| 93 | `20260522000001_media_pipeline.sql` | 2026-05-22 | CT, IDX, POL | media_files, media_file_variants | ❌ |
| 94 | `20260522000002_feed_bounded_context.sql` | 2026-05-22 | CT, IDX, POL | feed_items, feed_follows, feed_blocks, feed_inbox | ❌ |
| 95 | `20260522000003_chat_bounded_context.sql` | 2026-05-22 | CT, IDX, POL | chat_conversations, chat_participants, chat_messages, chat_message_attachments, chat_message_statuses, chat_read_receipts, chat_blocks, chat_mute_rules | ❌ |
| 96 | `20260522000004_notifications_rls_security_fix.sql` | 2026-05-22 | CT, AT, RPC, TRG, POL, DR, IDX | notifications, notification_rate_limits, notification_audit | ⚠️ parcial |
| 97 | `20260523000001_notifications_fix_alto_vector.sql` | 2026-05-23 | CT, RPC | notification_sender_limits | ⚠️ step1 em rollback.sql |
| 98 | `20260524000001_rebuild_counters_with_atomic_triggers.sql` | 2026-05-24 | CT, AT, RPC, TRG, SD | counter_drift_log, stories, portfolio_images, feed_items, stories, barbershops | ⚠️ DOWN comentado |

**Total:** 98 arquivos (83 únicos por timestamp, 5 pares com timestamp duplicado).

---

## 2. Padrões problemáticos identificados

### 2.1 Timestamps duplicados ⚠️ CRÍTICO

Cinco pares de arquivos compartilham o mesmo prefixo de timestamp. O Supabase CLI aplica migrations em ordem lexicográfica dentro do mesmo timestamp — a ordem de execução é determinada pelo sufixo do nome, não documentada e sujeita a regressão.

| Timestamp | Arquivo A | Arquivo B | Risco |
|---|---|---|---|
| `20260411000006` | `notifications_rls.sql` | `subscriptions.sql` | Médio — contextos independentes, mas ambos criam policies |
| `20260418000001` | `barbershop_interactions.sql` | `rls_security_hardening.sql` | **Alto** — `rls_security_hardening` corrigi policies criadas em `barbershop_interactions`; se aplicada na ordem errada, a correção não funciona |
| `20260512000001` | `client_at_shop_presenca.sql` | `transactions_gross_amount.sql` | Baixo — tabelas independentes |
| `20260517000001` | `drop_direct_messages.sql` | `postgis_barbershops.sql` | Médio — DROP + criação de extensão; se invertidos, extension pode ser adicionada antes de contexto necessário |
| `20260521000001` | `add_monthly_fee_mensalistas.sql` | `geo_bounded_context.sql` | Baixo — contextos completamente independentes |

**Caso mais grave:** `20260418000001_rls_security_hardening.sql` corrige `WITH CHECK (true)` permissivo criado em `20260418000001_barbershop_interactions.sql`. Se o hardening for aplicado ANTES de `barbershop_interactions`, o DROP das policies falha silenciosamente e as políticas vulneráveis ficam ativas.

### 2.2 Arquivo com naming incorreto 🔴

`20260516_notify_professional_queue_done.sql` — falta o zero-pad `000001`. Supabase CLI ordena lexicograficamente: este arquivo é aplicado **antes** de `20260516000001_check_constraints.sql`, o que é provavelmente a intenção, mas a inconsistência pode causar confusão e quebrar scripts que assumem o padrão `YYYYMMDDNNNNNN_name.sql`.

### 2.3 Migrations "fix" pós-deploy — 14 identificadas 🔧

Indica problema que chegou a produção sem teste prévio suficiente.

| Arquivo | Dia(s) após migration original | O que corrigiu |
|---|---|---|
| `20260414000007_fix_barbershops_rls` | Mesmo dia (04/14) | RLS de UPDATE/DELETE ausente para owner |
| `20260414000011_fix_rls_anon_all_tables` | Mesmo dia | Anon não conseguia ler profiles/services |
| `20260417000002_fix_notifications_rls` | 3 dias após notifications_rls | UPDATE ausente em notifications |
| `20260417000006_fix_trial_race_condition` | 6 dias após subscriptions | Trial sobrescrito por concorrência |
| `20260417000007_missing_rls_policies` | 3 dias após rls_policies | Sete tabelas sem policies (story_views, portfolio_images, etc.) |
| `20260418000001_rls_security_hardening` | Mesmo dia | 11 policies com `WITH CHECK (true)` — segurança crítica |
| `20260418000002_fix_transactions_rls` | Mesmo dia | Policy de SELECT ausente em transactions |
| `20260421000001_favorite_professionals_ensure` | 1 dia | Constraint UNIQUE ausente → duplicatas possíveis |
| `20260421000002_ensure_professionals_row` | 1 dia | Profissional sem row na tabela professionals |
| `20260421000005_public_interaction_counts` | 3 dias após barbershop_interactions | Trigger sem SECURITY DEFINER → contadores corrompidos |
| `20260503000005_fix_handle_new_user_pro_type` | Mesmo dia (05/03) | handle_new_user() não setava pro_type |
| `20260505000002_fix_clientes_favoritos_modal` | 2 dias após modal_rpc_functions | Remove UNION (introduz novo bug) |
| `20260507000001_fix_profiles_rls_queue_access` | 4 dias após queue_entry_services | Profissional não via profiles na fila |
| `20260519000002_fix_barbershop_storage_rls` | Mesmo dia | Storage RLS de logo/capa incorreta |

**Densidade de fixes:** 14 de 98 migrations (14.3%) são correções pós-deploy. A maioria no período 2026-04-14 a 2026-04-18 (bootstrap do projeto) e 2026-05-03 a 2026-05-07 (sprint de modal/fila).

### 2.4 Migrations que modificam dados de produção diretamente 📊

| Arquivo | Operação | Tabela | Justificativa |
|---|---|---|---|
| `20260421000004_bayesian_rating_formula` | UPDATE rating_score | barbershops | Backfill de nova fórmula — necessário |
| `20260421000005_public_interaction_counts` | UPDATE likes_count, dislikes_count, rating_count | barbershops, professionals | Backfill de correção de bug crítico (SECURITY DEFINER) |
| `20260503000005_fix_handle_new_user_pro_type` | UPDATE pro_type | profiles | Preenche NULL via ON CONFLICT DO UPDATE |
| `20260512000001_transactions_gross_amount` | UPDATE gross_amount | transactions | Backfill de coluna nova |
| `20260517000001_postgis_barbershops` | UPDATE geom | barbershops | Popula geometria de lat/lng existente |
| `20260517000003_unify_portfolio_likes` | INSERT + DROP | likes, portfolio_likes | Migração de dados entre tabelas |
| `20260521000001_geo_bounded_context` | UPDATE geom | profiles | Popula geometria de lat/lng |
| `20260524000001_rebuild_counters_with_atomic_triggers` | UPDATE múltiplas colunas | barbershops, portfolio_images, stories, feed_items | Rebuild de contadores — rollback documentado |

Todos os backfills acima são idempotentes exceto o de `20260517000003` (DROP de tabela é irreversível).

### 2.5 Migrations sem rollback documentado — 95 de 98

Apenas `20260522000004`, `20260523000001` e `20260524000001` têm documentação de rollback (parcial). As 95 restantes não têm nenhum bloco DOWN, comentário de rollback, ou arquivo correspondente em `docs/db/`.

O impacto prático é baixo para migrations de **adição** (DROP é trivial). O impacto é **alto** para:
- `20260517000001_drop_direct_messages.sql` — dados de `direct_messages` dropados sem backup
- `20260521000001_geo_bounded_context.sql` — extensão PostGIS + novo tipo de dado
- `20260522000002_feed_bounded_context.sql` — 4 novas tabelas de feed sem plano de rollback
- `20260522000003_chat_bounded_context.sql` — 8 novas tabelas de chat sem plano de rollback

---

## 3. RPCs recriadas múltiplas vezes

### 3.1 `get_clientes_favoritos_modal` — 4 recriações 🔴

A RPC com maior histórico de retrabalho no projeto. Cada versão é um file diferente.

| Versão | Migration | Data | Mudança | Problema |
|---|---|---|---|---|
| **V1** | `20260503000002_modal_rpc_functions` | 2026-05-03 | Criação: UNION entre `barbershop_interactions` (favorite) + `favorite_professionals` | Correto funcionalmente |
| **V2** | `20260505000002_fix_clientes_favoritos_modal` | 2026-05-05 | Remove UNION — mantém apenas `favorite_professionals` | **Bug introduzido:** clientes que favoritaram a BARBEARIA desaparecem |
| **V3** | `20260505000006_fix_rpc_clientes_favoritos_sql` | 2026-05-05 | Converte LANGUAGE plpgsql → LANGUAGE sql (sem UNION restaurado) | Corrige "column reference ambiguous" mas **mantém o bug** de V2 |
| **V4** | `20260507000002_restaurar_favoritos_barbearia_modal` | 2026-05-07 | Restaura UNION com LANGUAGE sql | ✅ Correto — estado atual |

**Assinatura:** Estável em todas as versões: `get_clientes_favoritos_modal(p_barbershop_id UUID, p_professional_id UUID) RETURNS TABLE(id, full_name, email, avatar_path, updated_at)`.

**Causa raiz:** A mudança em V2 foi motivada por um mal-entendido do requisito — "a modal mostra favoritos **do profissional**" vs. "favoritos **da barbearia** ou **do profissional**". Sem teste de contrato que verificasse ambos os casos, o bug chegou a produção.

**Teste que teria evitado:** Um teste de contrato simples com dois usuários — um que favorita a barbearia e outro que favorita o profissional — verificando que AMBOS aparecem no resultado. Custo: ~15 linhas de JS.

**Cobertura atual:** `tests/search-repository.test.js` verifica apenas que a RPC é chamada com os UUIDs corretos — não verifica o resultado (mock retorna vazio).

---

### 3.2 `fn_update_barbershop_rating` — 3 recriações 🔴

| Versão | Migration | Data | Mudança | Bug |
|---|---|---|---|---|
| **V1** | `20260418000001_barbershop_interactions` | 2026-04-18 | Criação: fórmula `ratio * 5.0 - dislikes * 0.1`. **Sem SECURITY DEFINER.** | 🔴 Crítico: RLS `bi_select_own` filtrava COUNT(*) para o usuário que disparou o trigger → contadores = 0 ou 1 |
| **V2** | `20260421000004_bayesian_rating_formula` | 2026-04-21 | Nova fórmula Bayesiana (PRIOR_N=5, PRIOR_MEAN=3.0). **Ainda sem SECURITY DEFINER.** | 🔴 Bug mantido |
| **V3** | `20260421000005_public_interaction_counts` | 2026-04-21 | Adiciona `SECURITY DEFINER`. Backfill completo. | ✅ Correto — estado atual |

**O que mudou entre versões:**
- V1 → V2: fórmula de rating (linear → Bayesiana)
- V2 → V3: adição de `SECURITY DEFINER SET search_path = public` — sem mudança de lógica

**Janela de corrupção:** Todos os likes/dislikes entre 2026-04-18 e 2026-04-21 foram armazenados incorretamente. O backfill de V3 recalculou, mas apenas para registros existentes naquela data — qualquer ambiente que não aplicou a migration nesse dia pode ter valores inconsistentes.

**Teste que teria evitado:** Um teste com dois usuários distintos que curtem a mesma barbearia, verificando que `likes_count = 2` (não 1). Exigiria acesso ao banco de staging, mas o padrão de simulação já usado em `tests/contadores-rebuild.test.js` teria detectado o problema.

---

### 3.3 `notificar_barbeiro_chegada` — 3 recriações 🔴

| Versão | Migration | Data | Mudança | Vulnerabilidade |
|---|---|---|---|---|
| **V1** | `20260513000001_notificar_barbeiro_rpc` | 2026-05-13 | Criação: INSERT direto sem validação de ownership. Cria `notifications_insert_service WITH CHECK (true)`. | 🔴 V1: sem verificação de propriedade; V4: INSERT permissivo via policy |
| **V2** | `20260522000004_notifications_rls_security_fix` | 2026-05-22 | Refatoração completa: valida ownership via `queue_entries`, usa `_insert_validated_notification()`. Aceita `p_title`/`p_body` do caller mas sanitiza. | 🟡 V2/V4: caller controla título/corpo → phishing possível |
| **V3** | `20260523000001_notifications_fix_alto_vector` | 2026-05-23 | Ignora `p_title`/`p_body` completamente. Título/corpo derivados de `p_type` + nome do banco. Rate limit global (50/min) adicionado. | ✅ Correto — estado atual |

**Assinatura:** Estável: `notificar_barbeiro_chegada(p_professional_id UUID, p_type TEXT, p_title TEXT, p_body TEXT, p_data JSONB)`. Em V3, `p_title`/`p_body` são aceitos na assinatura por compatibilidade mas **silenciosamente ignorados**.

**Risco atual:** Callers (`FilaPresencaService.js`, `ChegadaProducaoService.js`) continuam passando `p_title` e `p_body`, recebendo confirmação de sucesso, mas o conteúdo é descartado. O comportamento invisível pode causar confusão em debug futuro.

**Cobertura:** `tests/notifications-rls.test.js` testa 22 cenários incluindo RLS-18 que confirma que `p_title` do caller é ignorado. `tests/fila-presenca-service.test.js` e `tests/chegada-producao-service.test.js` verificam que a RPC é chamada — não o conteúdo da notificação resultante.

---

### 3.4 `confirmar_presenca_cliente` — 3 recriações

| Versão | Migration | Data | Mudança |
|---|---|---|---|
| **V1** | `20260507000003_queue_client_confirmation` | 2026-05-07 | Criação: confirma presença + notifica no segundo "Não" |
| **V2** | `20260507000004_notify_barber_on_first_no` | 2026-05-07 | Adiciona notificação também no PRIMEIRO "Não" (`client_not_seated`) |
| **V3** | `20260522000004_notifications_rls_security_fix` | 2026-05-22 | Refatora para usar `_insert_validated_notification()` (nova arquitetura) |

**Assinatura:** Estável entre versões.  
**Causa:** V1→V2 foi evolução de requisito no mesmo dia. V2→V3 foi refatoração arquitetural planejada.

---

### 3.5 `fn_notify_queue_clients` (trigger) — 3 recriações

| Versão | Migration | Data | Mudança |
|---|---|---|---|
| **V1** | `20260505000005_notify_all_queue_on_done` | 2026-05-05 | Notifica todos os clientes em espera quando atendimento é concluído |
| **V2** | `20260516_notify_professional_queue_done` | 2026-05-16 | Adiciona notificação para o profissional sobre próximo cliente |
| **V3** | `20260522000004_notifications_rls_security_fix` | 2026-05-22 | Refatora para `_insert_validated_notification()` |

---

## 4. Estado atual do schema

### 4.1 Tabelas por data de criação

```
Fase 1 — Bootstrap (2026-04-06 a 2026-04-20)
  profiles, barbershops, professionals, appointments, services
  queue_entries, subscriptions, transactions, notifications
  stories, story_views, portfolio_images, portfolio_likes, likes
  barbershop_interactions, professional_likes, favorite_professionals

Fase 2 — Funcionalidades sociais (2026-04-27 a 2026-05-11)
  refresh_tokens, file_download_events, p2p_peers

Fase 3 — Fila e presença (2026-05-03 a 2026-05-16)
  queue_entry_services

Fase 4 — Bounded contexts (2026-05-19 a 2026-05-22)
  barbershop_mensalistas
  geofences                         ← PostGIS
  media_files, media_file_variants  ← pipeline assíncrono
  feed_items, feed_follows, feed_blocks, feed_inbox
  chat_conversations, chat_participants, chat_messages,
  chat_message_attachments, chat_message_statuses,
  chat_read_receipts, chat_blocks, chat_mute_rules

Fase 5 — Segurança e monitoramento (2026-05-22 a 2026-05-24)
  notification_rate_limits, notification_audit, notification_sender_limits
  counter_drift_log
```

**Tabela droppada:** `direct_messages` (dropada em `20260517000001` — substituída pelo chat bounded context).  
**Tabela droppada:** `story_comments` (dropada em `20260517000001` — feature removida).  
**Tabela droppada:** `portfolio_likes` (migrada para `likes` em `20260517000003`).

### 4.2 Objetos órfãos identificados

| Objeto | Tipo | Razão |
|---|---|---|
| `barbershops.rating_avg` (coluna) | Coluna | Criada para star-rating nunca implementado. Sempre 0. Nenhum trigger a atualiza. |
| `barbershops.rating_count` (coluna) | Coluna | Idem. |
| `professionals.rating_avg` (coluna) | Coluna | Idem. |
| `stories.likes_count` | Coluna | Ausente no schema até `20260524000001`. `SocialRepository.js:40` a referenciava — PostgREST retornava `null` silenciosamente. |
| `cleanup_queue_entries_old()` | RPC | Criada em `20260516000002`, não há evidência de agendamento via cron ou edge function no repositório. |
| `cleanup_notifications_old()` | RPC | Idem — cria mas não agenda. |
| `cleanup_all_old_data()` | RPC | Idem. |
| `story_comments` policies | POL | Políticas criadas em `20260417000007` para tabela que foi droppada em `20260517000001`. |
| `fn_delete_expired_stories()` | RPC | Criada em `20260416000004` — não há evidência de agendamento no repositório. |

### 4.3 Inconsistências do schema

| Tabela | Coluna / Objeto | Problema |
|---|---|---|
| `barbershop_mensalistas` | `ends_at` | Plano expirado não é soft-deleted — só filtrado por `ends_at > now()`. Registros históricos acumulam indefinidamente. |
| `likes` | FK para `portfolio_images.id` | Não existe (`content_id` é polimórfico sem FK). Se portfolio_image for deletada sem CASCADE, likes ficam órfãos. |
| `likes` | FK para `stories.id` | Mesmo problema. |
| `feed_items` | `source_id` | Sem FK (polimórfico). source_id pode apontar para story/portfolio_image deletada sem erro. |
| `chat_messages` | Todas as colunas | Sem RLS habilitada verificável no arquivo de migration — `20260522000003` cria a tabela mas policies precisam ser confirmadas. |
| `notification_audit` | `actor_id` | Referencia `profiles.id` mas sem FK constraint — actor pode ser deletado sem ON DELETE CASCADE. |
| `p2p_peers` | `endpoint` | Sem índice em `endpoint` — queries de lookup por endpoint não têm suporte. |
| Múltiplas | `updated_at` | Sem trigger `BEFORE UPDATE SET updated_at = now()` — depende da aplicação atualizar o campo. |

---

## 5. Cobertura de testes das RPCs

### 5.1 Matriz de cobertura

| RPC | Arquivo de teste | Tipo de teste | Cobertura |
|---|---|---|---|
| `notificar_barbeiro_chegada` | `tests/notifications-rls.test.js`, `tests/chegada-producao-service.test.js`, `tests/fila-presenca-service.test.js` | Contrato SQL (simulado) + chamada de serviço | ✅ Alta (22 cenários RLS + chamada verificada) |
| `confirmar_presenca_cliente` | `tests/cadeira-confirmacao-service.test.js` | Chamada de serviço | ⚠️ Parcial (verifica chamada, não resultado) |
| `buscar_perfis_por_nome` | `tests/search-repository.test.js` | Chamada de serviço | ⚠️ Parcial |
| `get_clientes_favoritos_modal` | `tests/search-repository.test.js:215` | Verifica apenas que RPC é chamada com UUIDs | 🔴 Mínimo (não verifica resultado) |
| `get_clientes_favoritos_barbearia` | — | Nenhum | ❌ Zero |
| `criar_agendamento_atomico` | — | Nenhum | ❌ Zero |
| `get_barbershops_nearby` | — | Nenhum | ❌ Zero |
| `update_user_geo` | — | Nenhum | ❌ Zero |
| `get_active_geofences_near_user` | — | Nenhum | ❌ Zero |
| `get_feed_page` | — | Nenhum | ❌ Zero |
| `has_chat_block` | — | Nenhum | ❌ Zero |
| `_insert_validated_notification` | `tests/notifications-rls.test.js` | Contrato SQL (simulado) | ✅ Alta |
| `create_notification` | `tests/notifications-rls.test.js` | Contrato SQL (simulado) | ✅ Alta |
| `cleanup_queue_entries_old` | — | Nenhum | ❌ Zero |
| `cleanup_notifications_old` | — | Nenhum | ❌ Zero |
| `rebuild_counter_batch` | `tests/contadores-rebuild.test.js` | Simulação de comportamento | ✅ Alta (22 cenários) |
| `reconcile_counters` | — | Nenhum (lógica testada via simuladores) | ⚠️ Parcial |
| `fn_update_barbershop_rating` | `tests/contadores-rebuild.test.js` (indireto) | Simulação | ⚠️ Parcial |
| `fn_update_professional_likes_count` | — | Nenhum | ❌ Zero |
| `fn_sync_likes_count` | `tests/contadores-rebuild.test.js` | Simulação de trigger | ✅ Alta |
| `criar_agendamento_atomico` | — | Nenhum | ❌ Zero |
| `increment_haircuts_count` | `tests/contadores-rebuild.test.js` (indireto) | — | ⚠️ Parcial |

**Resumo:** ~35% das RPCs têm alguma cobertura. Apenas ~20% têm teste de contrato (input/output verificado). Zero RPCs de geolocalização, feed ou chat têm testes.

### 5.2 Políticas RLS com testes automatizados

| Tabela | Política | Testada em |
|---|---|---|
| `notifications` | Todas (22 cenários) | `tests/notifications-rls.test.js` |
| `barbershop_interactions` | Parcial | `tests/repository-security.test.js` |
| `queue_entries` | Parcial | `tests/queue-repository.test.js` |
| `feed_items`, `feed_*` | ❌ Zero | — |
| `chat_*` (8 tabelas) | ❌ Zero | — |
| `geofences`, `media_files` | ❌ Zero | — |

### 5.3 Snapshot de schema

**Não existe snapshot automático.** Não há script de `pg_dump --schema-only` versionado no repositório, nem CI que compare o schema gerado pelas migrations com um golden file. Mudanças não intencionais (coluna adicionada fora de migration, policy alterada pelo Dashboard) não seriam detectadas automaticamente.

**Comando para gerar snapshot atual:**
```bash
supabase db dump --schema-only > docs/db/schema-snapshot.sql
```

Recomenda-se adicionar ao CI: comparar o dump com o snapshot em `main`. Qualquer diff não esperado quebra a build.

---

## 6. Processo para evitar retrabalho

### 6.1 Checklist pré-migration (obrigatório antes de qualquer PR)

```
[ ] Timestamp é único — verificar com: ls supabase/migrations/ | grep {timestamp}
[ ] Nome segue o padrão: YYYYMMDDNNNNNN_descricao_kebab_case.sql
[ ] Migration está envolvida em BEGIN/COMMIT
[ ] Bloco DOWN documentado (comentado) com DROP correspondente
[ ] Se altera RPC existente: assinatura é compatível com callers existentes?
[ ] Se faz backfill (UPDATE/INSERT): query é idempotente?
[ ] Se dropa tabela/coluna: dados foram migrados ou backupados?
[ ] Se cria trigger: função tem SECURITY DEFINER + SET search_path = public, pg_temp?
[ ] Teste de contrato escrito antes de aplicar a migration (TDD)
[ ] Staging: migration aplicada e validada antes de produção
[ ] Rollback testado em staging (executar o bloco DOWN)
```

### 6.2 Testes mínimos obrigatórios antes de deploy de migration

**Para qualquer nova RPC:**
```js
// 1. Teste de happy path: inputs válidos → output esperado
test('rpc_name retorna resultado correto para inputs válidos', () => { ... });

// 2. Teste de inputs inválidos: UUID nulo, tipo errado, etc.
test('rpc_name rejeita p_professional_id nulo', () => { ... });

// 3. Teste de autorização: usuário não autorizado não vê dados alheios
test('rpc_name não retorna dados de outra barbearia', () => { ... });

// 4. Para RPCs de escrita: idempotência
test('rpc_name executada duas vezes produz resultado idêntico', () => { ... });
```

**Para qualquer trigger de contadores:**
```js
// Simular o mesmo padrão de tests/contadores-rebuild.test.js:
// INSERT → contador +1, DELETE → contador -1, soft delete → contador -1
// Dois INSERTs do mesmo usuário → contador = 1 (UNIQUE constraint)
// 50 INSERTs concorrentes → contador = 50
```

**Para policies RLS:**
```js
// Padrão de tests/notifications-rls.test.js:
// role = authenticated + uid = owner → acesso permitido
// role = authenticated + uid ≠ owner → acesso negado
// role = anon → acesso negado (ou permitido se policy USING (true))
// role = service_role → acesso permitido
```

### 6.3 Versionamento de RPCs sem DROP

RPCs não devem ser recriadas com DROP + CREATE quando há callers em produção. O padrão correto:

```sql
-- ✅ CORRETO: CREATE OR REPLACE preserva grants e mantém compatibilidade
CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
  p_barbershop_id   UUID,
  p_professional_id UUID
)
-- assinatura compatível com a versão anterior

-- ❌ ERRADO: DROP + CREATE remove grants e pode criar janela de indisponibilidade
DROP FUNCTION public.get_clientes_favoritos_modal(UUID, UUID);
CREATE FUNCTION ...
```

**Quando a assinatura muda (novo parâmetro obrigatório):**
1. Adicionar o novo parâmetro com `DEFAULT` (compatibilidade retroativa)
2. Após todos os callers migrarem, remover o default em migration subsequente
3. Documentar a janela de transição como comentário na migration

**Quando o comportamento muda silenciosamente** (como `p_title` ignorado em `notificar_barbeiro_chegada`):
1. Documentar no comentário da função: `-- ATENÇÃO: p_title ignorado desde 20260523000001`
2. Deprecar o parâmetro no prazo de uma sprint e remover dos callers
3. Criar versão com assinatura limpa como `notificar_barbeiro_chegada_v2`

---

## 7. RPCs candidatas prioritárias a testes de contrato

Classificação por frequência de recriação × impacto downstream × zero cobertura atual.

| Prioridade | RPC | Recriações | Impacto | Motivo |
|---|---|---|---|---|
| **P0** | `get_clientes_favoritos_modal` | 4 | Alto | 4 recriações em 4 dias; bug em produção que afetou listagem de clientes na cadeirinha; cobertura atual é só "RPC foi chamada" |
| **P0** | `fn_update_barbershop_rating` | 3 | Alto | Bug crítico de SECURITY DEFINER ficou em produção por 3 dias corrompendo todos os ratings; teste de 15 linhas teria detectado |
| **P1** | `criar_agendamento_atomico` | 1 | Alto | Race condition de double-booking resolvida em `20260516000003`; sem nenhum teste; falha silenciosa em pico |
| **P1** | `get_clientes_favoritos_barbearia` | 1 | Alto | UNION crítico entre duas fontes; mesmo padrão que causou o bug de V2 em `get_clientes_favoritos_modal`; zero cobertura |
| **P1** | `get_feed_page` | 1 | Alto | RPC principal do feed com cursor; sem teste de paginação, empty state ou ordenação; feed inoperante se quebrar |
| **P2** | `notificar_barbeiro_chegada` | 3 | Médio | Já bem coberta em `notifications-rls.test.js`; prioridade menor |
| **P2** | `confirmar_presenca_cliente` | 3 | Médio | Testada via serviço mas sem verificação de conteúdo da notificação resultante |
| **P3** | `cleanup_queue_entries_old` | 1 | Baixo | Sem teste e sem agendamento — dados acumulam sem limpeza |
| **P3** | `get_barbershops_nearby` | 1 | Médio | PostGIS — zero teste; erro na query silencioso (retorna [] sem exceção) |

---

## 8. Revisão final — objetos sem chamador e plano de monitoramento

### 8.1 Objetos sem chamador rastreável

| Objeto | Tipo | Ação recomendada |
|---|---|---|
| `cleanup_queue_entries_old()` | RPC | Criar edge function ou GitHub Actions agendado; documentar em `docs/db/crons.md` |
| `cleanup_notifications_old()` | RPC | Idem |
| `fn_delete_expired_stories()` | RPC | Idem — stories expiradas acumulam no Storage se não houver limpeza |
| `barbershops.rating_avg` | Coluna | Decidir: deprecar (ALTER TABLE DROP COLUMN) ou implementar star-rating. Não exibir 0.0 para usuário |
| `barbershops.rating_count` | Coluna | Idem |
| `professionals.rating_avg` | Coluna | Idem |

### 8.2 Indicadores de saúde do processo de migration

Para monitorar regressão de processo, sugere-se rastrear semanalmente:

```sql
-- Drift remanescente pós-rebuild (deve ser 0 linhas)
SELECT * FROM public.reconcile_counters(p_dry_run := true);

-- Migrations aplicadas na última semana (auditoria de deploy)
SELECT version, name, executed_at
FROM supabase_migrations.schema_migrations
WHERE executed_at > now() - interval '7 days'
ORDER BY executed_at;

-- Objetos sem RLS (deve ser 0 tabelas de usuário)
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT DISTINCT tablename FROM pg_policies WHERE schemaname = 'public'
  );
```

---

*Auditoria estática — nenhum dado foi alterado. Todas as evidências citam arquivo e linha de origem. Rastreabilidade: `git log --all -- supabase/migrations/` confirma único autor (Alan Lima) e 12 commits de migration registrados no repositório.*
