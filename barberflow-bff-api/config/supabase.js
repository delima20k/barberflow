'use strict';

const { createClient } = require('@supabase/supabase-js');

let _client = null;

/**
 * Retorna o singleton do cliente Supabase com service_role_key.
 * Nunca exponha a service_role_key ao cliente.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabaseClient() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error('Supabase: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios');

  _client = createClient(url, key, {
    auth: {
      persistSession:     false,
      autoRefreshToken:   false,
      detectSessionInUrl: false,
    },
  });

  return _client;
}

module.exports = { getSupabaseClient };
