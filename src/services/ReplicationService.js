'use strict';

// =============================================================
// ReplicationService.js — Sistema de replicação inteligente.
// Camada: application
//
// RESPONSABILIDADE:
//   Decidir a estratégia de armazenamento/distribuição de cada
//   arquivo com base no volume de downloads em uma janela de tempo.
//   Registrar eventos de download para alimentar essa decisão.
//
// ESTRATÉGIAS:
//   'R2'   — Baixa demanda: arquivo centralizado no Cloudflare R2.
//             Custo mínimo de armazenamento; egress pago por download.
//             Adequado quando downloads < LOW_THRESHOLD / janela.
//
//   'P2P'  — Média demanda: distribuição peer-to-peer.
//             Zero egress R2; custo transferido para os peers.
//             Adequado quando LOW_THRESHOLD ≤ downloads < HIGH_THRESHOLD.
//
//   'BOTH' — Alta demanda: P2P com backup R2.
//             Máxima disponibilidade; P2P absorve a maioria dos downloads.
//             R2 garante acesso mesmo quando poucos peers estão online.
//             Custo justificado: o R2 seria mais caro sem P2P neste nível.
//             Adequado quando downloads ≥ HIGH_THRESHOLD.
//
// CUSTO × DISPONIBILIDADE:
//   R2   → estável, pago, baixa latência de cdn
//   P2P  → gratuito em egress, variável em disponibilidade
//   BOTH → melhor custo-efetividade em alta demanda:
//          P2P reduz egress R2 enquanto R2 garante fallback
//
// JANELA DE TEMPO:
//   Conta apenas downloads nos últimos WINDOW_DAYS dias.
//   Evita que arquivos populares no passado mantenham overhead eterno.
//   Configurable via REPLICATION_WINDOW_DAYS (default: 7).
//
// THRESHOLDS:
//   REPLICATION_LOW_THRESHOLD  (default: 10) — fronteira R2  ↔ P2P
//   REPLICATION_HIGH_THRESHOLD (default: 50) — fronteira P2P ↔ BOTH
//
// PERSISTÊNCIA:
//   Cada download é registrado em `file_download_events` no Supabase.
//   Sem FK para media_files — suporta arquivos puramente P2P.
//
// USO:
//   const svc = new ReplicationService(supabase);
//
//   // Registrar download (chamar sempre que um arquivo for baixado):
//   await svc.registerDownload(fileId);
//
//   // Decidir estratégia antes de servir/distribuir um arquivo:
//   const strategy = await svc.decideStrategy(fileId); // 'R2' | 'P2P' | 'BOTH'
//
// Dependências: BaseService, Supabase client (service_role)
// =============================================================

const BaseService = require('../infra/BaseService');

// ── Configuração via env (aplicada no load do módulo) ────────
const WINDOW_DAYS     = Math.max(1, parseInt(process.env.REPLICATION_WINDOW_DAYS     ?? '7',  10));
const LOW_THRESHOLD   = Math.max(1, parseInt(process.env.REPLICATION_LOW_THRESHOLD   ?? '10', 10));
const HIGH_THRESHOLD  = Math.max(
  LOW_THRESHOLD + 1,
  parseInt(process.env.REPLICATION_HIGH_THRESHOLD ?? '50', 10),
);

// ── Tabela Supabase ───────────────────────────────────────────
const TABLE = 'file_download_events';

class ReplicationService extends BaseService {

  /** @type {import('@supabase/supabase-js').SupabaseClient} */
  #supabase;

  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   *   Cliente Supabase com service_role key (necessário para bypassar RLS).
   */
  constructor(supabase) {
    super('ReplicationService');
    this.#supabase = supabase;
  }

  // ══════════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════════

  /**
   * Registra um evento de download para o arquivo informado.
   * Deve ser chamado sempre que um arquivo for servido ao cliente.
   *
   * @param {string} fileId — UUID ou path do arquivo (P2P ou media_files.id)
   * @returns {Promise<void>}
   * @throws {Error{status:400}} fileId inválido (não-UUID)
   * @throws {Error{status:500}} falha ao persistir no Supabase
   */
  async registerDownload(fileId) {
    this._uuid('fileId', fileId);

    const { error } = await this.#supabase
      .from(TABLE)
      .insert({ file_id: fileId, downloaded_at: new Date().toISOString() });

    if (error) {
      throw Object.assign(
        new Error(`[ReplicationService] Falha ao registrar download: ${error.message}`),
        { status: 500 },
      );
    }
  }

  /**
   * Decide a estratégia de replicação com base no volume de downloads
   * nos últimos WINDOW_DAYS dias.
   *
   * Tabela de decisão:
   *   downloads < LOW_THRESHOLD                       → 'R2'
   *   LOW_THRESHOLD ≤ downloads < HIGH_THRESHOLD      → 'P2P'
   *   downloads ≥ HIGH_THRESHOLD                      → 'BOTH'
   *
   * @param {string} fileId — UUID ou path do arquivo
   * @returns {Promise<'R2' | 'P2P' | 'BOTH'>}
   * @throws {Error{status:400}} fileId inválido
   * @throws {Error{status:500}} falha ao consultar o Supabase
   */
  async decideStrategy(fileId) {
    this._uuid('fileId', fileId);

    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - WINDOW_DAYS);

    const { count, error } = await this.#supabase
      .from(TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('file_id', fileId)
      .gte('downloaded_at', windowStart.toISOString());

    if (error) {
      throw Object.assign(
        new Error(`[ReplicationService] Falha ao consultar downloads: ${error.message}`),
        { status: 500 },
      );
    }

    return ReplicationService.#classificar(count ?? 0);
  }

  // ── Getters estáticos (úteis para testes e integração externa) ──

  /** Número mínimo de downloads para ativar P2P (fronteira R2 ↔ P2P). */
  static get LOW_THRESHOLD()  { return LOW_THRESHOLD; }

  /** Número mínimo de downloads para ativar BOTH (fronteira P2P ↔ BOTH). */
  static get HIGH_THRESHOLD() { return HIGH_THRESHOLD; }

  /** Janela de tempo em dias para contagem de downloads. */
  static get WINDOW_DAYS()    { return WINDOW_DAYS; }

  // ══════════════════════════════════════════════════════════════
  // PRIVADO
  // ══════════════════════════════════════════════════════════════

  /**
   * Mapeia contagem de downloads para a estratégia correspondente.
   * Centraliza a lógica de decisão — testável sem I/O.
   *
   * @param {number} downloads
   * @returns {'R2' | 'P2P' | 'BOTH'}
   */
  static #classificar(downloads) {
    if (downloads >= HIGH_THRESHOLD) return 'BOTH';
    if (downloads >= LOW_THRESHOLD)  return 'P2P';
    return 'R2';
  }
}

module.exports = ReplicationService;
