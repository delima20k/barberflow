'use strict';

// =============================================================
// SupabaseClient.js — Singleton do cliente Supabase para o backend.
//
// Usa a service_role key para operações privilegiadas no servidor.
// NUNCA expor esta chave para o frontend.
//
// Variáveis de ambiente obrigatórias:
//   SUPABASE_URL              — URL do projeto Supabase
//   SUPABASE_SERVICE_ROLE_KEY — chave de serviço (privilegiada)
// =============================================================

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SRK      = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SRK) {
  throw new Error(
    '[SupabaseClient] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.\n' +
    'Crie um arquivo .env a partir de .env.example e preencha as variáveis.'
  );
}

/** @type {import('@supabase/supabase-js').SupabaseClient} */
const supabase = createClient(SUPABASE_URL, SUPABASE_SRK, {
  auth: {
    persistSession:   false,
    autoRefreshToken: false,
  },
});

module.exports = supabase;
