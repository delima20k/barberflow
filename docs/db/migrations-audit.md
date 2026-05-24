# Auditoria de migrations

Data da auditoria: 2026-05-24. Escopo: leitura estatica de 85 migrations em `supabase/migrations`, contratos em `db/contracts`, workflows e uso de RPC no codigo.

## Limitacoes

- `pg_dump` nao esta instalado neste ambiente e `DATABASE_URL` nao esta definido; por isso `docs/db/schema-snapshot.sql` foi preenchido com o snapshot versionado existente em `db/snapshots/schema-current.sql`, nao com dump ao vivo.
- O historico Git local contem apenas um commit para migrations; `git blame` aponta `Seu Nome` em 2026-05-19 para os arquivos auditados. Nao ha PRs locais para inferir motivacao alem de nomes/comentarios das migrations.
- Objetos orfaos e indices sem uso foram inferidos por busca estatica; a conclusao definitiva exige `pg_stat_user_indexes`, `pg_depend`, `pg_trigger` e plano de queries no banco real.

## 1. Migrations em ordem cronologica

| # | Migration | Data | Autor (git blame) | Descricao | Tipo |
|---:|---|---|---|---|---|
| 1 | `20260406000001_initial_schema.sql` | 2026-04-06 | Seu Nome (2026-05-19) | initial schema | CREATE, RPC, trigger, index |
| 2 | `20260406000002_media_schema.sql` | 2026-04-06 | Seu Nome (2026-05-19) | media schema | CREATE, trigger, index |
| 3 | `20260406000003_rls_policies.sql` | 2026-04-06 | Seu Nome (2026-05-19) | rls policies | ALTER, trigger, policy |
| 4 | `20260406000004_storage_buckets.sql` | 2026-04-06 | Seu Nome (2026-05-19) | storage buckets | policy, seed/data |
| 5 | `20260411000006_notifications_rls.sql` | 2026-04-11 | Seu Nome (2026-05-19) | notifications rls | CREATE, ALTER, RPC, trigger, index, policy |
| 6 | `20260411000006_subscriptions.sql` | 2026-04-11 | Seu Nome (2026-05-19) | subscriptions | CREATE, ALTER, index, policy |
| 7 | `20260413000005_location_and_legal.sql` | 2026-04-13 | Seu Nome (2026-05-19) | location and legal | CREATE, ALTER, DROP, index, policy |
| 8 | `20260414000006_pro_type.sql` | 2026-04-14 | Seu Nome (2026-05-19) | pro type | ALTER, index |
| 9 | `20260414000007_fix_barbershops_rls.sql` | 2026-04-14 | Seu Nome (2026-05-19) | fix barbershops rls | DROP, policy |
| 10 | `20260414000008_profiles_trigger.sql` | 2026-04-14 | Seu Nome (2026-05-19) | profiles trigger | DROP, RPC, trigger, seed/data |
| 11 | `20260414000009_cascade_on_delete.sql` | 2026-04-14 | Seu Nome (2026-05-19) | cascade on delete | ALTER |
| 12 | `20260414000010_barbershops_anon_select.sql` | 2026-04-14 | Seu Nome (2026-05-19) | barbershops anon select | DROP, policy |
| 13 | `20260414000011_fix_rls_anon_all_tables.sql` | 2026-04-14 | Seu Nome (2026-05-19) | fix rls anon all tables | DROP, policy, seed/data |
| 14 | `20260414000012_trigger_auto_barbershop.sql` | 2026-04-14 | Seu Nome (2026-05-19) | trigger auto barbershop | DROP, RPC, trigger, policy, seed/data |
| 15 | `20260416000001_direct_messages.sql` | 2026-04-16 | Seu Nome (2026-05-19) | direct messages | CREATE, ALTER, index, policy |
| 16 | `20260416000002_story_comments.sql` | 2026-04-16 | Seu Nome (2026-05-19) | story comments | CREATE, ALTER, index, policy |
| 17 | `20260416000003_messages_rls.sql` | 2026-04-16 | Seu Nome (2026-05-19) | messages rls | policy |
| 18 | `20260416000004_story_cleanup_function.sql` | 2026-04-16 | Seu Nome (2026-05-19) | story cleanup function | RPC, seed/data |
| 19 | `20260417000001_profiles_personal_data.sql` | 2026-04-17 | Seu Nome (2026-05-19) | profiles personal data | ALTER |
| 20 | `20260417000002_fix_notifications_rls.sql` | 2026-04-17 | Seu Nome (2026-05-19) | fix notifications rls | DROP, trigger, policy |
| 21 | `20260417000003_subscriptions_unique_token.sql` | 2026-04-17 | Seu Nome (2026-05-19) | subscriptions unique token | ALTER |
| 22 | `20260417000004_profiles_private_columns.sql` | 2026-04-17 | Seu Nome (2026-05-19) | profiles private columns | DROP, policy |
| 23 | `20260417000005_prevent_role_escalation.sql` | 2026-04-17 | Seu Nome (2026-05-19) | prevent role escalation | DROP, RPC, trigger, policy |
| 24 | `20260417000006_fix_trial_race_condition.sql` | 2026-04-17 | Seu Nome (2026-05-19) | fix trial race condition | ALTER, DROP, index, policy |
| 25 | `20260417000007_missing_rls_policies.sql` | 2026-04-17 | Seu Nome (2026-05-19) | missing rls policies | policy |
| 26 | `20260418000001_barbershop_interactions.sql` | 2026-04-18 | Seu Nome (2026-05-19) | barbershop interactions | CREATE, ALTER, DROP, RPC, trigger, index, policy |
| 27 | `20260418000001_rls_security_hardening.sql` | 2026-04-18 | Seu Nome (2026-05-19) | rls security hardening | DROP, trigger, policy |
| 28 | `20260418000002_fix_transactions_rls.sql` | 2026-04-18 | Seu Nome (2026-05-19) | fix transactions rls | DROP, policy |
| 29 | `20260418000003_barbershops_role_check.sql` | 2026-04-18 | Seu Nome (2026-05-19) | barbershops role check | DROP, policy |
| 30 | `20260419000001_lgpd_compliance.sql` | 2026-04-19 | Seu Nome (2026-05-19) | lgpd compliance | CREATE, ALTER, RPC, index, policy |
| 31 | `20260420000001_profiles_public_rating.sql` | 2026-04-20 | Seu Nome (2026-05-19) | profiles public rating | other |
| 32 | `20260420000002_storage_avatar_update.sql` | 2026-04-20 | Seu Nome (2026-05-19) | storage avatar update | policy |
| 33 | `20260420000003_favorite_professionals.sql` | 2026-04-20 | Seu Nome (2026-05-19) | favorite professionals | CREATE, ALTER, index, policy |
| 34 | `20260420000004_professional_likes.sql` | 2026-04-20 | Seu Nome (2026-05-19) | professional likes | CREATE, ALTER, DROP, RPC, trigger, index, policy |
| 35 | `20260421000001_favorite_professionals_ensure.sql` | 2026-04-21 | Seu Nome (2026-05-19) | favorite professionals ensure | CREATE, ALTER, DROP, index, policy |
| 36 | `20260421000002_ensure_professionals_row.sql` | 2026-04-21 | Seu Nome (2026-05-19) | ensure professionals row | DROP, RPC, trigger, seed/data |
| 37 | `20260421000004_bayesian_rating_formula.sql` | 2026-04-21 | Seu Nome (2026-05-19) | bayesian rating formula | RPC, trigger |
| 38 | `20260421000005_public_interaction_counts.sql` | 2026-04-21 | Seu Nome (2026-05-19) | public interaction counts | DROP, RPC, trigger, policy |
| 39 | `20260422000001_owner_pro_link.sql` | 2026-04-22 | Seu Nome (2026-05-19) | owner pro link | DROP, RPC, trigger, seed/data |
| 40 | `20260423000001_barbershops_extra_fields.sql` | 2026-04-23 | Seu Nome (2026-05-19) | barbershops extra fields | ALTER |
| 41 | `20260423000002_barbershops_font_key.sql` | 2026-04-23 | Seu Nome (2026-05-19) | barbershops font key | ALTER |
| 42 | `20260424000001_storage_barbershops_fix.sql` | 2026-04-24 | Seu Nome (2026-05-19) | storage barbershops fix | DROP, policy |
| 43 | `20260424000002_storage_barbershops_secdef.sql` | 2026-04-24 | Seu Nome (2026-05-19) | storage barbershops secdef | DROP, RPC, policy |
| 44 | `20260427000001_create_refresh_tokens.sql` | 2026-04-27 | Seu Nome (2026-05-19) | create refresh tokens | CREATE, ALTER, RPC, index, policy, seed/data |
| 45 | `20260427000002_file_download_events.sql` | 2026-04-27 | Seu Nome (2026-05-19) | file download events | CREATE, ALTER, index, policy, seed/data |
| 46 | `20260428000001_services_image_path.sql` | 2026-04-28 | Seu Nome (2026-05-19) | services image path | ALTER, policy |
| 47 | `20260428000002_media_metadata.sql` | 2026-04-28 | Seu Nome (2026-05-19) | media metadata | CREATE, ALTER, index, policy |
| 48 | `20260428121847_create_storage_buckets.sql` | 2026-04-28 | Seu Nome (2026-05-19) | create storage buckets | policy, seed/data |
| 49 | `20260428130605_create_barbershop_bucket.sql` | 2026-04-28 | Seu Nome (2026-05-19) | create barbershop bucket | policy, seed/data |
| 50 | `20260428130606_create_p2p_peers.sql` | 2026-04-28 | Seu Nome (2026-05-19) | create p2p peers | CREATE, ALTER, index, policy |
| 51 | `20260430000001_barbershop_close_reason.sql` | 2026-04-30 | Seu Nome (2026-05-19) | barbershop close reason | ALTER, DROP, RPC, trigger |
| 52 | `20260501000001_barbershops_realtime.sql` | 2026-05-01 | Seu Nome (2026-05-19) | barbershops realtime | other |
| 53 | `20260503000001_profiles_email.sql` | 2026-05-03 | Seu Nome (2026-05-19) | profiles email | ALTER, DROP, RPC, trigger, index, seed/data |
| 54 | `20260503000002_modal_rpc_functions.sql` | 2026-05-03 | Seu Nome (2026-05-19) | modal rpc functions | RPC |
| 55 | `20260503000003_search_indexes_and_rpc.sql` | 2026-05-03 | Seu Nome (2026-05-19) | search indexes and rpc | RPC, index |
| 56 | `20260503000004_allow_pro_type_promotion.sql` | 2026-05-03 | Seu Nome (2026-05-19) | allow pro type promotion | RPC, trigger |
| 57 | `20260503000005_fix_handle_new_user_pro_type.sql` | 2026-05-03 | Seu Nome (2026-05-19) | fix handle new user pro type | RPC, trigger, seed/data |
| 58 | `20260503000006_subscriptions_price.sql` | 2026-05-03 | Seu Nome (2026-05-19) | subscriptions price | ALTER |
| 59 | `20260505000001_queue_entries_guest_name.sql` | 2026-05-05 | Seu Nome (2026-05-19) | queue entries guest name | ALTER |
| 60 | `20260505000002_fix_clientes_favoritos_modal.sql` | 2026-05-05 | Seu Nome (2026-05-19) | fix clientes favoritos modal | RPC |
| 61 | `20260505000003_indexes_ordering.sql` | 2026-05-05 | Seu Nome (2026-05-19) | indexes ordering | index |
| 62 | `20260505000005_notify_all_queue_on_done.sql` | 2026-05-05 | Seu Nome (2026-05-19) | notify all queue on done | DROP, RPC, trigger, index, seed/data |
| 63 | `20260505000006_fix_rpc_clientes_favoritos_sql.sql` | 2026-05-05 | Seu Nome (2026-05-19) | fix rpc clientes favoritos sql | RPC |
| 64 | `20260506000001_queue_entry_services.sql` | 2026-05-06 | Seu Nome (2026-05-19) | queue entry services | CREATE, ALTER, index, policy |
| 65 | `20260507000001_fix_profiles_rls_queue_access.sql` | 2026-05-07 | Seu Nome (2026-05-19) | fix profiles rls queue access | policy |
| 66 | `20260507000002_restaurar_favoritos_barbearia_modal.sql` | 2026-05-07 | Seu Nome (2026-05-19) | restaurar favoritos barbearia modal | RPC |
| 67 | `20260507000003_queue_client_confirmation.sql` | 2026-05-07 | Seu Nome (2026-05-19) | queue client confirmation | ALTER, RPC, seed/data |
| 68 | `20260507000004_notify_barber_on_first_no.sql` | 2026-05-07 | Seu Nome (2026-05-19) | notify barber on first no | RPC, seed/data |
| 69 | `20260507000005_notifications_realtime.sql` | 2026-05-07 | Seu Nome (2026-05-19) | notifications realtime | ALTER |
| 70 | `20260509000001_push_v2.sql` | 2026-05-09 | Seu Nome (2026-05-19) | push v2 | ALTER, index, policy |
| 71 | `20260511000001_push_expiration.sql` | 2026-05-11 | Seu Nome (2026-05-19) | push expiration | ALTER, index |
| 72 | `20260511000002_transactions_financeiro.sql` | 2026-05-11 | Seu Nome (2026-05-19) | transactions financeiro | ALTER, DROP, index, policy |
| 73 | `20260512000001_client_at_shop_presenca.sql` | 2026-05-12 | Seu Nome (2026-05-19) | client at shop presenca | ALTER |
| 74 | `20260512000001_transactions_gross_amount.sql` | 2026-05-12 | Seu Nome (2026-05-19) | transactions gross amount | ALTER, DROP, RPC, trigger |
| 75 | `20260513000001_notificar_barbeiro_rpc.sql` | 2026-05-13 | Seu Nome (2026-05-19) | notificar barbeiro rpc | DROP, RPC, policy, seed/data |
| 76 | `20260513000002_block_queue_closed_barbershop.sql` | 2026-05-13 | Seu Nome (2026-05-19) | block queue closed barbershop | DROP, RPC, trigger |
| 77 | `20260516000001_check_constraints.sql` | 2026-05-16 | Seu Nome (2026-05-19) | check constraints | ALTER |
| 78 | `20260516000002_cleanup_functions.sql` | 2026-05-16 | Seu Nome (2026-05-19) | cleanup functions | RPC, seed/data |
| 79 | `20260516000003_atomic_appointment_rpc.sql` | 2026-05-16 | Seu Nome (2026-05-19) | atomic appointment rpc | RPC, seed/data |
| 80 | `20260516_notify_professional_queue_done.sql` | 2026-05-16 | Seu Nome (2026-05-19) | 20260516 notify professional queue done | RPC, trigger, seed/data |
| 81 | `20260517000001_drop_direct_messages.sql` | 2026-05-17 | Seu Nome (2026-05-19) | drop direct messages | DROP, policy |
| 82 | `20260517000001_postgis_barbershops.sql` | 2026-05-17 | Seu Nome (2026-05-19) | postgis barbershops | ALTER, DROP, RPC, trigger, index |
| 83 | `20260517000002_refresh_tokens_family_id.sql` | 2026-05-17 | Seu Nome (2026-05-19) | refresh tokens family id | ALTER, index |
| 84 | `20260517000003_unify_portfolio_likes.sql` | 2026-05-17 | Seu Nome (2026-05-19) | unify portfolio likes | DROP, seed/data |
| 85 | `20260517000004_barbershops_missing_columns.sql` | 2026-05-17 | Seu Nome (2026-05-19) | barbershops missing columns | ALTER, policy |

## 2. Padroes problematicos

- Objetos repetidos em migrations: 76. Maiores recorrencias: `table:barbershops` (11x), `policy:barbershops_select_active on barbershops` (7x), `policy:notifications_insert_service on notifications` (6x), `policy:profiles_select_public on profiles` (6x), `table:profiles` (6x), `table:queue_entries` (6x), `table:subscriptions` (6x), `policy:barbershops_owner_delete on storage` (5x), `policy:barbershops_owner_write on storage` (5x), `table:transactions` (5x), `policy:barbershops_owner_update on storage` (4x), `policy:barbershops_owner_write on barbershops` (4x).
- DROP + CREATE/recreate no mesmo fluxo: 29 migrations: `20260413000005_location_and_legal.sql`, `20260414000007_fix_barbershops_rls.sql`, `20260414000008_profiles_trigger.sql`, `20260414000010_barbershops_anon_select.sql`, `20260414000011_fix_rls_anon_all_tables.sql`, `20260414000012_trigger_auto_barbershop.sql`, `20260417000002_fix_notifications_rls.sql`, `20260417000004_profiles_private_columns.sql`, `20260417000005_prevent_role_escalation.sql`, `20260417000006_fix_trial_race_condition.sql`, `20260418000001_barbershop_interactions.sql`, `20260418000001_rls_security_hardening.sql`, `20260418000002_fix_transactions_rls.sql`, `20260418000003_barbershops_role_check.sql`, `20260420000004_professional_likes.sql`, `20260421000001_favorite_professionals_ensure.sql`, `20260421000002_ensure_professionals_row.sql`, `20260421000005_public_interaction_counts.sql`, `20260422000001_owner_pro_link.sql`, `20260424000001_storage_barbershops_fix.sql`, `20260424000002_storage_barbershops_secdef.sql`, `20260430000001_barbershop_close_reason.sql`, `20260503000001_profiles_email.sql`, `20260505000005_notify_all_queue_on_done.sql`, `20260511000002_transactions_financeiro.sql`, `20260512000001_transactions_gross_amount.sql`, `20260513000001_notificar_barbeiro_rpc.sql`, `20260513000002_block_queue_closed_barbershop.sql`, `20260517000001_postgis_barbershops.sql`.
- Rollback dedicado: nenhum arquivo de rollback/revert/down identificado.
- Modificam dados diretamente: 21 migrations: `20260406000004_storage_buckets.sql`, `20260414000008_profiles_trigger.sql`, `20260414000011_fix_rls_anon_all_tables.sql`, `20260414000012_trigger_auto_barbershop.sql`, `20260416000004_story_cleanup_function.sql`, `20260421000002_ensure_professionals_row.sql`, `20260422000001_owner_pro_link.sql`, `20260427000001_create_refresh_tokens.sql`, `20260427000002_file_download_events.sql`, `20260428121847_create_storage_buckets.sql`, `20260428130605_create_barbershop_bucket.sql`, `20260503000001_profiles_email.sql`, `20260503000005_fix_handle_new_user_pro_type.sql`, `20260505000005_notify_all_queue_on_done.sql`, `20260507000003_queue_client_confirmation.sql`, `20260507000004_notify_barber_on_first_no.sql`, `20260513000001_notificar_barbeiro_rpc.sql`, `20260516000002_cleanup_functions.sql`, `20260516000003_atomic_appointment_rpc.sql`, `20260516_notify_professional_queue_done.sql`, `20260517000003_unify_portfolio_likes.sql`. Inclui seeds de buckets/storage e updates/deletes operacionais.
- Migrations de fix/restauracao/ensure/missing/hardening logo apos outra migration no mesmo dia: 13. Exemplos: 20260414000007_fix_barbershops_rls.sql logo apos 20260414000006_pro_type.sql; 20260414000011_fix_rls_anon_all_tables.sql logo apos 20260414000010_barbershops_anon_select.sql; 20260417000002_fix_notifications_rls.sql logo apos 20260417000001_profiles_personal_data.sql; 20260417000006_fix_trial_race_condition.sql logo apos 20260417000005_prevent_role_escalation.sql; 20260417000007_missing_rls_policies.sql logo apos 20260417000006_fix_trial_race_condition.sql; 20260418000001_rls_security_hardening.sql logo apos 20260418000001_barbershop_interactions.sql; 20260418000002_fix_transactions_rls.sql logo apos 20260418000001_rls_security_hardening.sql; 20260421000002_ensure_professionals_row.sql logo apos 20260421000001_favorite_professionals_ensure.sql; 20260503000005_fix_handle_new_user_pro_type.sql logo apos 20260503000004_allow_pro_type_promotion.sql; 20260505000002_fix_clientes_favoritos_modal.sql logo apos 20260505000001_queue_entries_guest_name.sql; 20260505000006_fix_rpc_clientes_favoritos_sql.sql logo apos 20260505000005_notify_all_queue_on_done.sql; 20260507000002_restaurar_favoritos_barbearia_modal.sql logo apos 20260507000001_fix_profiles_rls_queue_access.sql; 20260517000004_barbershops_missing_columns.sql logo apos 20260517000003_unify_portfolio_likes.sql.
- Ha timestamps duplicados: `20260411000006_*`, `20260418000001_*`, `20260512000001_*` e `20260517000001_*`; isso reduz previsibilidade de ordenacao quando ferramentas ordenam por timestamp e nome.

## 3. RPCs/funcoes recriadas multiplas vezes

| Funcao | Recriadas | Contrato | Versoes e mudancas | Lacuna de teste provavel |
|---|---:|---|---|---|
| `get_clientes_favoritos_modal` | 4 | sim | 1. 20260503000002_modal_rpc_functions.sql: (p_barbershop_id UUID, p_professional_id UUID) -> TABLE ( id UUID, full_name TEXT, email TEXT, avatar_path TEXT, updated_at TIMESTAMPTZ )<br>2. 20260505000002_fix_clientes_favoritos_modal.sql: (p_barbershop_id UUID, p_professional_id UUID) -> TABLE ( id UUID, full_name TEXT, email TEXT, avatar_path TEXT, updated_at TIMESTAMPTZ )<br>3. 20260505000006_fix_rpc_clientes_favoritos_sql.sql: (p_barbershop_id UUID, p_professional_id UUID) -> TABLE ( id UUID, full_name TEXT, email TEXT, avatar_path TEXT, updated_at TIMESTAMPTZ )<br>4. 20260507000002_restaurar_favoritos_barbearia_modal.sql: (p_barbershop_id UUID, p_professional_id UUID) -> TABLE ( id UUID, full_name TEXT, email TEXT, avatar_path TEXT, updated_at TIMESTAMPTZ ) | Faltou contrato cobrindo diferenca entre favorito da barbearia e favorito do profissional, alem de teste para conflito de OUT param `id` em PL/pgSQL. |
| `handle_new_user` | 4 | nao | 1. 20260414000008_profiles_trigger.sql: (sem args) -> trigger<br>2. 20260414000012_trigger_auto_barbershop.sql: (sem args) -> trigger<br>3. 20260503000001_profiles_email.sql: (sem args) -> trigger<br>4. 20260503000005_fix_handle_new_user_pro_type.sql: (sem args) -> trigger | Faltou teste de trigger para signup com roles client/barbershop/professional e sincronizacao de email/pro_type. |
| `fn_update_barbershop_rating` | 3 | nao | 1. 20260418000001_barbershop_interactions.sql: (sem args) -> TRIGGER<br>2. 20260421000004_bayesian_rating_formula.sql: (sem args) -> TRIGGER<br>3. 20260421000005_public_interaction_counts.sql: (sem args) -> TRIGGER | Teste de contrato/comportamento historico antes da migration; validar assinatura, retorno, efeitos colaterais e casos negativos. |
| `confirmar_presenca_cliente` | 2 | sim | 1. 20260507000003_queue_client_confirmation.sql: (p_entry_id UUID, p_confirmado BOOLEAN, p_grace_used BOOLEAN) -> void<br>2. 20260507000004_notify_barber_on_first_no.sql: (p_entry_id UUID, p_confirmado BOOLEAN, p_grace_used BOOLEAN) -> void | Faltou contrato de efeitos colaterais em notifications para primeiro e segundo `Nao`, nao apenas formato de entrada/saida void. |
| `fn_notify_queue_clients` | 2 | nao | 1. 20260505000005_notify_all_queue_on_done.sql: (sem args) -> trigger<br>2. 20260516_notify_professional_queue_done.sql: (sem args) -> trigger | Teste de contrato/comportamento historico antes da migration; validar assinatura, retorno, efeitos colaterais e casos negativos. |
| `fn_update_professional_likes_count` | 2 | nao | 1. 20260420000004_professional_likes.sql: (sem args) -> TRIGGER<br>2. 20260421000005_public_interaction_counts.sql: (sem args) -> TRIGGER | Teste de contrato/comportamento historico antes da migration; validar assinatura, retorno, efeitos colaterais e casos negativos. |
| `handle_profile_barbearia` | 2 | nao | 1. 20260414000012_trigger_auto_barbershop.sql: (sem args) -> trigger<br>2. 20260422000001_owner_pro_link.sql: (sem args) -> trigger | Teste de contrato/comportamento historico antes da migration; validar assinatura, retorno, efeitos colaterais e casos negativos. |
| `prevent_role_escalation` | 2 | nao | 1. 20260417000005_prevent_role_escalation.sql: (sem args) -> trigger<br>2. 20260503000004_allow_pro_type_promotion.sql: (sem args) -> trigger | Teste de contrato/comportamento historico antes da migration; validar assinatura, retorno, efeitos colaterais e casos negativos. |

### RPCs consumidas e cobertura

- Criticas cobertas por contrato: `aplicar_desconto_metodo`, `buscar_perfis_por_nome`, `cleanup_expired_story_comments`, `confirmar_presenca_cliente`, `criar_agendamento_atomico`, `get_barbershops_nearby`, `get_clientes_favoritos_modal`, `notificar_barbeiro_chegada`, `search_users`.
- Candidatas sem contrato segundo `npm run db:coverage`: `anonimizar_perfil`, `cleanup_all_old_data`, `cleanup_notifications_old`, `cleanup_queue_entries_old`, `delete_expired_stories`.
- `npm run db:coverage` passou apos execucao fora do sandbox: `ok=true`, 30 funcoes descobertas, 14 candidatas a RPC, 9 criticas cobertas, 0 criticas sem contrato.

## 4. Estado atual do schema

- Snapshot documental gerado em `docs/db/schema-snapshot.sql` a partir de `db/snapshots/schema-current.sql` por indisponibilidade de `pg_dump` local.
- Tabelas identificadas nas migrations: 33. Tabelas sem RLS habilitada por leitura estatica: nenhuma.
- FK possivelmente sem indice dedicado: `attendance_sessions.appointment_id` aparece sem indice especifico detectado. Validar no banco real porque a busca estatica pode nao inferir indices compostos equivalentes.
- Tabela descontinuada: `direct_messages` foi criada em 20260416000001 e removida em 20260517000001; qualquer trigger/policy/index remanescente deve ser validado no banco real, embora a migration remova policies e indices conhecidos.
- Funcoes sem chamador estatico fora de snapshot/migrations: `cleanup_all_old_data`, `cleanup_notifications_old`, `cleanup_queue_entries_old`, `delete_expired_stories`, `fn_check_barbershop_open_on_queue`, `handle_profile_barbearia`, `limpar_refresh_tokens_expirados`, `set_transaction_gross_amount`, `set_updated_at`, `storage_is_barbershop_owner`, `trg_set_updated_at`. Algumas sao triggers/service_role e nao devem ser removidas sem analise de dependencias.
- Indices sem query que use: nao conclusivo por analise estatica. Priorizar validacao com `pg_stat_user_indexes.idx_scan = 0` em producao/staging e cruzar com queries do BFF.
- Colunas nullable/default: ha varias colunas adicionadas por `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` sem backfill obrigatorio aparente; validar principalmente `queue_entries.client_confirmed`, `first_no_at`, `transactions.gross_amount`, campos de localizacao e metadados de media.

## 5. Diagnostico de cobertura de testes

- Contratos de RPC existentes: documentos Markdown, entradas validas/invalidas e snapshots para 9 RPCs em `db/contracts`.
- Testes automatizados relacionados: `tests/db-contract-system.test.js`, `scripts/db/rpc-contract-tests.js`, `scripts/db/rpc-coverage.js` e snapshots em `db/contracts/snapshots`.
- RLS: existe hook `scripts/db/rls-tests.js`, mas ele apenas imprime que os testes RLS devem ser adicionados; portanto nao ha cobertura RLS automatizada efetiva ainda.
- Pre-deploy: `.github/workflows/validate.yml` tem job `db-tests` com `npm run db:tests` antes do deploy por `workflow_run` em `deploy-supabase.yml`. Isso cobre snapshot, RPC coverage, contratos e hook RLS quando secrets estao configurados.
- Snapshot contra mudancas nao intencionais: existe `db/snapshots/schema-current.sql` e hash; `SchemaSnapshotService` faz diff agrupado, mas depende de `pg_dump`/`DATABASE_URL` no CI para validar schema real.

## 6. Processo recomendado

### Checklist pre-migration

1. Confirmar contrato do objeto: tabela/RPC/policy/trigger afetado, consumidor, assinatura e compatibilidade retroativa.
2. Preferir `ALTER` e `CREATE OR REPLACE FUNCTION` compativel; evitar `DROP` de objeto consumido sem janela de compatibilidade.
3. Adicionar rollback ou plano de reversao documentado na propria migration.
4. Rodar migration em banco limpo e em banco com snapshot de dados representativo.
5. Atualizar `db/snapshots/schema-current.sql` e contratos antes do deploy.

### Testes minimos antes de deploy

- `npm run db:tests` obrigatorio.
- Para RPC: contrato com input valido, invalidos, shape de retorno, snapshot e efeitos colaterais.
- Para RLS: matriz role x operacao x tabela com casos permitido/negado.
- Para dados: migration deve ser idempotente e ter teste de banco com dados existentes.

### Versionamento de RPC sem DROP

- Manter assinatura antiga enquanto consumidores migram; criar `nome_v2` quando assinatura/retorno mudar de forma incompativel.
- Para mudanca compativel, usar parametros novos com default e `CREATE OR REPLACE FUNCTION`.
- Documentar no contrato: assinatura, permissao, RLS esperado, retorno, efeitos colaterais, erros tipados e plano de deprecacao.
- Evitar overload ambigua no PostgREST; quando houver overload, expor nomes versionados claros.

## Prioridades para testes de contrato

1. `get_clientes_favoritos_modal` - 4 recriacoes; alternou comportamento entre favoritos da barbearia, favoritos do profissional e ambos, alem de trocar PL/pgSQL por SQL para resolver ambiguidade. Deve ter contrato com fixtures para os dois tipos de favorito.
2. `confirmar_presenca_cliente` - 2 recriacoes em sequencia; mesmo input/output, mas comportamento mudou em notificacoes. Deve testar efeitos colaterais nas notificacoes.
3. `handle_new_user` - 4 recriacoes; trigger critica de signup/perfil/barbearia. Mesmo nao sendo RPC publica, precisa de teste de contrato de trigger.
4. `fn_update_barbershop_rating` - 3 recriacoes; afeta ranking publico e contadores. Deve ter teste de agregacao com likes/dislikes/rating bayesiano.
