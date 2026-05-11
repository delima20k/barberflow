// =============================================================
// Edge Function: send-push
// Responsabilidade: enviar Web Push Notification via VAPID
//
// Rota: POST /functions/v1/send-push
// Body: { clientId, barbershopId, entradaId, appId? }
//
// Autenticação: Bearer JWT do barbeiro (profissional autenticado)
// Secrets necessários:
//   VAPID_PUBLIC_KEY   — chave pública VAPID (base64url)
//   VAPID_PRIVATE_KEY  — chave privada VAPID (base64url raw EC 32 bytes)
//   VAPID_SUBJECT      — mailto: ou URL do responsável
//
// Implementação: RFC 8291 (payload encryption) + RFC 8292 (VAPID)
//   usando SubtleCrypto nativo do Deno — sem dependências externas.
//
// Deploy: supabase functions deploy send-push
// =============================================================

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── CORS ────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  })
}

// =============================================================
// WebPushCrypto — RFC 8291 + RFC 8188 + RFC 8292 (VAPID)
// Implementação manual via SubtleCrypto (100% Deno-compatible)
// =============================================================

class WebPushCrypto {

  // ── Codecs base64url ──────────────────────────────────────

  static fromB64U(s: string): Uint8Array {
    const pad = '='.repeat((4 - (s.length % 4)) % 4)
    const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/')
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  }

  static toB64U(buf: Uint8Array): string {
    return btoa(String.fromCharCode(...buf))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }

  static strToB64U(s: string): string {
    return WebPushCrypto.toB64U(new TextEncoder().encode(s))
  }

  // ── HKDF-SHA-256 ─────────────────────────────────────────
  // Realiza extract + expand completo via SubtleCrypto.

  static async hkdf(
    ikm:    Uint8Array,  // input key material
    salt:   Uint8Array,  // HKDF salt (extract step)
    info:   Uint8Array,  // context info (expand step)
    length: number,      // output bytes
  ): Promise<Uint8Array> {
    const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
    const bits    = await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      baseKey,
      length * 8,
    )
    return new Uint8Array(bits)
  }

  // ── VAPID JWT (ES256 / RFC 8292) ──────────────────────────
  // Gera o token JWT para autenticar a requisição no push service.
  //
  // VAPID keys geradas por `web-push generate-vapid-keys`:
  //   publicKey  → base64url-encoded uncompressed EC point (65 bytes: 0x04 || x || y)
  //   privateKey → base64url-encoded raw EC scalar (32 bytes)
  //
  // SubtleCrypto só aceita EC privada em formato JWK → montamos o JWK
  // com x e y extraídos da chave pública (que já vem junto).

  static async createJwt(
    audience:   string,  // origin do endpoint (ex: https://fcm.googleapis.com)
    subject:    string,  // VAPID_SUBJECT (mailto: ou URL)
    pubB64:     string,  // VAPID_PUBLIC_KEY
    privB64:    string,  // VAPID_PRIVATE_KEY
  ): Promise<string> {
    const now     = Math.floor(Date.now() / 1000)
    const header  = WebPushCrypto.strToB64U(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
    const payload = WebPushCrypto.strToB64U(JSON.stringify({ aud: audience, exp: now + 43200, sub: subject }))
    const message = `${header}.${payload}`

    const pub  = WebPushCrypto.fromB64U(pubB64)   // 65 bytes
    const priv = WebPushCrypto.fromB64U(privB64)   // 32 bytes

    const jwk: JsonWebKey = {
      kty:      'EC',
      crv:      'P-256',
      x:        WebPushCrypto.toB64U(pub.slice(1, 33)),
      y:        WebPushCrypto.toB64U(pub.slice(33, 65)),
      d:        WebPushCrypto.toB64U(priv),
      key_ops:  ['sign'],
    }

    const key = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
    )
    const sig = new Uint8Array(
      await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(message)),
    )
    return `${message}.${WebPushCrypto.toB64U(sig)}`
  }

  // ── RFC 8291 — Payload Encryption ────────────────────────
  // Esquema: ECDH efêmero + HKDF-SHA-256 + AES-128-GCM
  //
  // 1. Gera par de chaves ECDH efêmero (server-side)
  // 2. ECDH com a chave pública do cliente (p256dh)
  // 3. HKDF em dois estágios:
  //    a. ikm  = HKDF(ecdhSecret, authSecret, ikm_info, 32)
  //    b. cek  = HKDF(ikm, salt, cek_info, 16)   — chave AES-128
  //    c. nonce = HKDF(ikm, salt, nonce_info, 12)
  // 4. AES-128-GCM: encrypt(padded_plaintext)
  // 5. Header RFC 8188: salt || rs || idlen || serverPub
  //
  // Referências: RFC 8291, RFC 8188

  static async encryptPayload(
    clientPubB64: string,  // p256dh da subscription (base64url, 65 bytes uncompressed)
    authB64:      string,  // auth da subscription (base64url, 16 bytes)
    plaintext:    string,
  ): Promise<Uint8Array> {
    const enc           = new TextEncoder()
    const clientPubRaw  = WebPushCrypto.fromB64U(clientPubB64)  // 65 bytes
    const authSecret    = WebPushCrypto.fromB64U(authB64)        // 16 bytes
    const salt          = crypto.getRandomValues(new Uint8Array(16))

    // Par de chaves ECDH efêmero (servidor)
    const serverEphemeral = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
    )
    const serverPubRaw = new Uint8Array(
      await crypto.subtle.exportKey('raw', serverEphemeral.publicKey),
    )  // 65 bytes

    // Importa a chave pública do cliente para o ECDH
    const clientPubKey = await crypto.subtle.importKey(
      'raw', clientPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
    )

    // ECDH: segredo compartilhado (32 bytes)
    const ecdhBits   = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPubKey }, serverEphemeral.privateKey, 256,
    )
    const ecdhSecret = new Uint8Array(ecdhBits)

    // RFC 8291 §3.3 — IKM info
    const ikmInfo = new Uint8Array([
      ...enc.encode('WebPush: info\x00'),
      ...clientPubRaw,
      ...serverPubRaw,
    ])

    // Estágio 1: derivar IKM (32 bytes)
    const ikm = await WebPushCrypto.hkdf(ecdhSecret, authSecret, ikmInfo, 32)

    // Estágio 2: derivar CEK (16 bytes) e Nonce (12 bytes)
    const [cek, nonce] = await Promise.all([
      WebPushCrypto.hkdf(ikm, salt, enc.encode('Content-Encoding: aes128gcm\x00'), 16),
      WebPushCrypto.hkdf(ikm, salt, enc.encode('Content-Encoding: nonce\x00'),     12),
    ])

    // Importa CEK para AES-128-GCM
    const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])

    // Padding RFC 8188 §2.1: plaintext + \x02 (delimiter de record único)
    const data   = enc.encode(plaintext)
    const padded = new Uint8Array(data.length + 1)
    padded.set(data)
    padded[data.length] = 0x02

    // AES-128-GCM encrypt (adiciona tag de 16 bytes)
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded),
    )

    // Header RFC 8188: salt(16) + rs(4 big-endian) + idlen(1=65) + keyid(65)
    const rs     = 4096  // record size máximo
    const header = new Uint8Array(16 + 4 + 1 + 65)
    header.set(salt, 0)
    new DataView(header.buffer).setUint32(16, rs, false)
    header[20] = 65
    header.set(serverPubRaw, 21)

    // Resultado final: header + ciphertext
    const result = new Uint8Array(header.length + ciphertext.length)
    result.set(header)
    result.set(ciphertext, header.length)
    return result
  }

  // ── Envio completo via HTTP ───────────────────────────────

  static async send(
    endpoint: string,
    p256dh:   string,
    auth:     string,
    payload:  string,
    vapid:    { pub: string; priv: string; sub: string },
  ): Promise<{ status: number; ok: boolean }> {
    const audience  = new URL(endpoint).origin
    const jwt       = await WebPushCrypto.createJwt(audience, vapid.sub, vapid.pub, vapid.priv)
    const encrypted = await WebPushCrypto.encryptPayload(p256dh, auth, payload)

    const res = await fetch(endpoint, {
      method:  'POST',
      headers: {
        'Authorization':    `vapid t=${jwt},k=${vapid.pub}`,
        'Content-Type':     'application/octet-stream',
        'Content-Encoding': 'aes128gcm',
        'TTL':              '86400',
      },
      body: encrypted,
    })
    return { status: res.status, ok: res.ok || res.status === 201 }
  }
}

// =============================================================
// Handler principal
// =============================================================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  // ── Autenticação do barbeiro ──────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Não autorizado' }, 401)

  // Cria cliente autenticado para verificar o JWT do barbeiro
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  )
  const { data: { user: barber }, error: authErr } = await supabaseAuth.auth.getUser()
  if (authErr || !barber) return json({ error: 'Sessão inválida' }, 401)

  // ── Parse do body ─────────────────────────────────────────
  let body: { clientId?: string; barbershopId?: string; entradaId?: string; appId?: string }
  try { body = await req.json() } catch { return json({ error: 'Body JSON inválido' }, 422) }

  const { clientId, barbershopId, entradaId, appId = 'cliente' } = body
  if (!clientId || !entradaId) {
    return json({ error: 'clientId e entradaId são obrigatórios' }, 422)
  }

  // ── Busca subscriptions do cliente (service_role ignora RLS) ──
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: subs, error: subsErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('user_id', clientId)
    .eq('app_id',  appId)
    .eq('is_valid', true)

  if (subsErr) {
    console.error('[send-push] query error:', subsErr.message)
    return json({ error: 'Erro ao buscar subscriptions' }, 500)
  }

  if (!subs || subs.length === 0) {
    // Sem subscriptions ativas — retorna 204 (não é erro)
    return new Response(null, { status: 204, headers: CORS })
  }

  // ── VAPID keys dos secrets ────────────────────────────────
  const vapid = {
    pub:  Deno.env.get('VAPID_PUBLIC_KEY')  ?? '',
    priv: Deno.env.get('VAPID_PRIVATE_KEY') ?? '',
    sub:  Deno.env.get('VAPID_SUBJECT')     ?? '',
  }
  if (!vapid.pub || !vapid.priv || !vapid.sub) {
    console.error('[send-push] VAPID secrets não configurados')
    return json({ error: 'VAPID não configurado' }, 500)
  }

  // ── Payload da notificação ────────────────────────────────
  const payload = JSON.stringify({
    title:       'Você foi chamado! ✂️',
    body:        'O barbeiro está te esperando na cadeira.',
    icon:        '/shared/img/icon-192-cliente.png',
    badge:       '/shared/img/icon-192-cliente.png',
    tag:         `bf-inservice-${entradaId}`,
    requireInteraction: true,
    data: {
      barbershopId: barbershopId ?? null,
      entradaId,
      url: barbershopId
        ? `/cliente/?push_barbershop=${barbershopId}&push_entrada=${entradaId}`
        : '/cliente/',
    },
  })

  // ── Envio para cada subscription ─────────────────────────
  const invalidIds: string[] = []
  let   enviados = 0

  await Promise.allSettled(subs.map(async sub => {
    try {
      const result = await WebPushCrypto.send(sub.endpoint, sub.p256dh, sub.auth_key, payload, vapid)

      if (result.ok) {
        enviados++
        // Atualiza last_used_at
        await supabaseAdmin
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', sub.id)
      } else if (result.status === 410 || result.status === 404) {
        // Subscription inválida — marcar para desabilitar
        invalidIds.push(sub.id)
      } else {
        console.warn(`[send-push] HTTP ${result.status} para endpoint ${sub.endpoint.slice(0, 40)}...`)
      }
    } catch (err) {
      console.error('[send-push] erro ao enviar:', (err as Error).message)
    }
  }))

  // ── Invalida subscriptions expiradas ──────────────────────
  if (invalidIds.length > 0) {
    await supabaseAdmin
      .from('push_subscriptions')
      .update({ is_valid: false, updated_at: new Date().toISOString() })
      .in('id', invalidIds)
      .catch(err => console.error('[send-push] falha ao invalidar subs:', err.message))
  }

  return json({ ok: true, enviados, invalidas: invalidIds.length })
})
