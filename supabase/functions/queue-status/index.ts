// =============================================================
// Edge Function: queue-status
// Responsabilidade: retornar status atual da fila de uma barbearia
// Rota: GET /functions/v1/queue-status?barbershop_id=...
// =============================================================
// Deploy: supabase functions deploy queue-status
// =============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    })
  }

  const url = new URL(req.url)
  const barbershopId = url.searchParams.get('barbershop_id')

  if (!barbershopId) {
    return new Response(
      JSON.stringify({ error: 'barbershop_id é obrigatório' }),
      { status: 422, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    )
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false } }
  )

  // Busca cadeiras + fila ativa em paralelo (economiza round-trips)
  const [chairsRes, queueRes] = await Promise.all([
    supabase
      .from('chairs')
      .select('id, label, status, professional_id')
      .eq('barbershop_id', barbershopId)
      .neq('status', 'inativa'),

    supabase
      .from('queue_entries')
      .select('id, position, status, check_in_at')
      .eq('barbershop_id', barbershopId)
      .in('status', ['waiting', 'in_service'])
      .order('position', { ascending: true }),
  ])

  if (chairsRes.error || queueRes.error) {
    const msg = chairsRes.error?.message ?? queueRes.error?.message
    console.error('[queue-status] DB error:', msg)
    return new Response(
      JSON.stringify({ error: 'Erro ao buscar dados da fila' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    )
  }

  const chairs   = chairsRes.data  ?? []
  const queue    = queueRes.data   ?? []
  const waiting  = queue.filter(e => e.status === 'waiting').length
  const occupied = chairs.filter(c => c.status === 'ocupada').length
  const free     = chairs.filter(c => c.status === 'livre').length

  return new Response(
    JSON.stringify({
      barbershop_id: barbershopId,
      chairs: { total: chairs.length, occupied, free, list: chairs },
      queue:  { waiting, in_service: queue.filter(e => e.status === 'in_service').length, list: queue },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store', // fila = sem cache
        ...CORS_HEADERS,
      },
    }
  )
})
