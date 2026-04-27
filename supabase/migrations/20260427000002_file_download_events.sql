-- ==============================================================
-- Migration: 20260427000002_file_download_events.sql
-- Descrição: Tabela de eventos de download para o sistema de
--            replicação inteligente (ReplicationService).
--
-- ESTRATÉGIA DE REPLICAÇÃO:
--   Conta downloads em uma janela de tempo (default: 7 dias).
--   Com base no volume, o ReplicationService decide:
--     - R2   → baixa demanda  (< LOW_THRESHOLD  downloads)
--     - P2P  → média demanda  (< HIGH_THRESHOLD downloads)
--     - BOTH → alta demanda   (>= HIGH_THRESHOLD downloads)
--
-- CUSTO × DISPONIBILIDADE:
--   - R2   → armazenamento central; custo de egress por download
--   - P2P  → distribuído; zero egress no R2; exige peers disponíveis
--   - BOTH → P2P + backup R2; máxima disponibilidade; custo justificado
--             apenas quando P2P handles a maioria dos downloads
--
-- ESCALABILIDADE:
--   - Tabela de eventos (não contador) → permite janela deslizante
--   - Índice composto (file_id, downloaded_at) → count eficiente
--   - Sem FK para media_files → suporta arquivos puramente P2P
--   - Para produção: adicionar pg_cron limpando eventos > 30 dias
--
-- Acesso:
--   INSERT: apenas service_role (BFF registra via AuthMiddleware)
--   SELECT: apenas service_role (nunca exposto diretamente ao cliente)
-- ==============================================================

-- ── Tabela principal ─────────────────────────────────────────
create table if not exists public.file_download_events (
  id            uuid        primary key default uuid_generate_v4(),
  file_id       text        not null,           -- ID do arquivo (media_files.id ou path P2P)
  downloaded_at timestamptz not null default now()
);

comment on table public.file_download_events is
  'Registro de eventos de download por arquivo. '
  'Alimenta o ReplicationService para decisão de estratégia P2P/R2/BOTH.';

comment on column public.file_download_events.file_id is
  'Identificador do arquivo. Pode ser UUID de media_files ou path P2P — sem FK intencional.';

comment on column public.file_download_events.downloaded_at is
  'Timestamp UTC do evento de download. Usado para filtro por janela de tempo.';

-- ── Índices ───────────────────────────────────────────────────
-- Índice composto para a query principal do ReplicationService:
--   WHERE file_id = $1 AND downloaded_at >= $2
create index idx_fde_file_window
  on public.file_download_events(file_id, downloaded_at desc);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.file_download_events enable row level security;

-- Nenhuma política para anon/authenticated:
--   Apenas service_role (BFF) lê e insere — sem exposição direta.
-- service_role bypassa RLS por padrão no Supabase.

-- ── Limpeza automática (opcional — habilitar com pg_cron) ────
-- Execute no dashboard SQL se pg_cron estiver disponível:
--
--   select cron.schedule(
--     'limpar_download_events_antigos',
--     '0 3 * * *',   -- 03:00 UTC diariamente
--     $$
--       delete from public.file_download_events
--       where downloaded_at < now() - interval '30 days';
--     $$
--   );
