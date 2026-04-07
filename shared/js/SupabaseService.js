'use strict';

// =============================================================
// SupabaseService.js — Conexão central com o Supabase
// Compartilhado entre app cliente e app profissional
// Carregue ANTES de qualquer outro script que use o Supabase
// =============================================================
// Dependência (já incluída via CDN no index.html):
//   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>
// =============================================================

class SupabaseService {

  // ── Configuração (substitua pelos valores reais) ──────────
  static #URL     = 'https://jfvjisqnzapxxagkbxcu.supabase.co';
  static #ANON_KEY = 'sb_publishable_WzYaYNc_a7SsSoiyuwftBg_5eplxzQo';

  // Instância única (Singleton)
  static #client = null;

  /**
   * Retorna (ou cria) o cliente Supabase.
   * @returns {import('@supabase/supabase-js').SupabaseClient}
   */
  static get client() {
    if (!SupabaseService.#client) {
      if (!window.supabase) {
        throw new Error('[SupabaseService] SDK não carregado. Verifique o <script> CDN no HTML.');
      }
      SupabaseService.#client = window.supabase.createClient(
        SupabaseService.#URL,
        SupabaseService.#ANON_KEY
      );
    }
    return SupabaseService.#client;
  }

  // ── Auth helpers ──────────────────────────────────────────

  /** Retorna o usuário autenticado atual (ou null) */
  static async getUser() {
    const { data: { user } } = await SupabaseService.client.auth.getUser();
    return user;
  }

  /** Login com email + senha */
  static async signIn(email, password) {
    const { data, error } = await SupabaseService.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  /** Cadastro com email + senha */
  static async signUp(email, password, meta = {}) {
    const { data, error } = await SupabaseService.client.auth.signUp({
      email, password, options: { data: meta }
    });
    if (error) throw error;
    return data;
  }

  /** Logout */
  static async signOut() {
    const { error } = await SupabaseService.client.auth.signOut();
    if (error) throw error;
  }

  /**
   * Escuta mudanças de sessão.
   * @param {(event: string, session: object|null) => void} callback
   */
  static onAuthChange(callback) {
    return SupabaseService.client.auth.onAuthStateChange(callback);
  }
}
