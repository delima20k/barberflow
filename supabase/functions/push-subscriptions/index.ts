// =============================================================
// Edge Function: push-subscriptions
// Responsabilidade: gerenciar subscriptions Web Push dos usuários
//
// Rotas:
//   POST   /functions/v1/push-subscriptions — upsert (registrar/renovar)
//   DELETE /functions/v1/push-subscriptions — remover (logout/revogação)
//
// Autenticação: Bearer JWT do usuário (RLS é respeitado via anon key)
// Deploy: supabase functions deploy push-subscriptions
// =============================================================

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Tipos ───────────────────────────────────────────────────

interface SubscribeBody {
  endpoint: string
  p256dh:   string
  auth:     string
  deviceId?:        string
  appId?:           'cliente' | 'profissional'
  expirationTime?:  number | null
}

interface DeleteBody {
  endpoint: string
}

// ─── CORS ────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Helpers ─────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

function parseAppId(value: unknown): 'cliente' | 'profissional' {
  return value === 'profissional' ? 'profissional' : 'cliente'
}

// ─── Handler principal ────────────────────────────────────────

serve(async (req: Request) => {
  // DEBUG — visível em Supabase Dashboard > Functions > Logs
  console.log('[push-subscriptions] METHOD:', req.method)

  // OPTIONS preflight — deve responder ANTES de qualquer validação
  // verify_jwt=false no config.toml garante que o gateway não bloqueie aqui
  if (req.method === 'OPTIONS') {
    console.log('[push-subscriptions] preflight respondido com 200')
    return new Response('ok', { status: 200, headers: CORS })
  }

  // ── Autenticação ──────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return json({ error: 'Sessão inválida' }, 401)

  // ── POST: upsert subscription ─────────────────────────────
  if (req.method === 'POST') {
    let body: SubscribeBody
    try { body = await req.json() } catch { return json({ error: 'Body JSON inválido' }, 422) }

    const { endpoint, p256dh, auth, deviceId, appId, expirationTime } = body
    if (!endpoint || !p256dh || !auth) {
      return json({ error: 'endpoint, p256dh e auth são obrigatórios' }, 422)
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id:         user.id,
        endpoint,
        p256dh,
        auth_key:        auth,
        device_id:       deviceId        ?? null,
        app_id:          parseAppId(appId),
        is_valid:        true,
        last_used_at:    new Date().toISOString(),
        updated_at:      new Date().toISOString(),
        expiration_time: expirationTime ? new Date(expirationTime).toISOString() : null,
      }, { onConflict: 'endpoint' })

    if (error) {
      console.error('[push-subscriptions] upsert error:', error.message)
      return json({ error: 'Erro ao salvar subscription' }, 500)
    }
    console.log('[push-subscriptions] upsert ok, user:', user.id)
    return json({ ok: true })
  }

  // ── DELETE: remover subscription ──────────────────────────
  if (req.method === 'DELETE') {
    let body: DeleteBody
    try { body = await req.json() } catch { return json({ error: 'Body JSON inválido' }, 422) }

    const { endpoint } = body
    if (!endpoint) return json({ error: 'endpoint é obrigatório' }, 422)

    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('endpoint', endpoint)

    if (error) {
      console.error('[push-subscriptions] delete error:', error.message)
      return json({ error: 'Erro ao remover subscription' }, 500)
    }
    return json({ ok: true })
  }

  return json({ error: 'Method not allowed' }, 405)
})
