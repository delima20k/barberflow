import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================
// Edge Function: cleanup-story-comments
//
// Remove comentários de stories expirados via RPC.
// O row do story permanece intacto — apenas os comentários
// efêmeros são apagados.
//
// Agendamento sugerido (GitHub Actions cron):
//   schedule: '0 * * * *'   →  a cada hora
//
// Invocação direta:
//   POST https://<project>.supabase.co/functions/v1/cleanup-story-comments
//   Authorization: Bearer <SERVICE_ROLE_KEY>
// =============================================================

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Inicializa cliente com service_role para executar a função SECURITY DEFINER
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Chama a função PostgreSQL que apaga story_comments de stories expirados
  const { data, error } = await supabase.rpc('cleanup_expired_story_comments');

  if (error) {
    console.error('[cleanup-story-comments] Erro RPC:', error.message);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      },
    );
  }

  const result = Array.isArray(data) ? data[0] : data;

  console.log(
    `[cleanup-story-comments] ${result?.cleaned_count ?? 0} comentários removidos em ${result?.cleaned_at}`,
  );

  return new Response(
    JSON.stringify({
      ok:            true,
      cleaned_count: result?.cleaned_count ?? 0,
      cleaned_at:    result?.cleaned_at ?? new Date().toISOString(),
    }),
    {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    },
  );
});
