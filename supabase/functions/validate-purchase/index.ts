// =============================================================
// validate-purchase/index.ts — Edge Function
// BarberFlow — valida compra Google Play e registra assinatura
//
// SEGURANÇA:
//   - userId é extraído do JWT no header Authorization — NUNCA do body
//     Impede que um usuário ative assinaturas para outros usuários.
//   - plano é validado contra lista de valores permitidos
//   - purchaseToken é validado via Google Play API antes do insert
//
// Entradas (JSON body):
//   plano         : 'trial' | 'mensal' | 'trimestral'
//   purchaseToken : string | undefined — token do Google Play
//
// Saída:
//   { ok: boolean, endsAt: string (ISO) }
// =============================================================

import { serve }        from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLANOS_VALIDOS = new Set(['trial', 'mensal', 'trimestral']);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Método não permitido.' }, 405);
  }

  try {
    // ── 1. Verificar autenticação via JWT (NUNCA confiar em userId do body) ──
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ ok: false, error: 'Não autorizado.' }, 401);
    }
    const token = authHeader.slice(7);

    // Cria client anon apenas para verificar o JWT
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { auth: { persistSession: false } },
    );
    const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
    if (authErr || !user) {
      return json({ ok: false, error: 'Não autorizado.' }, 401);
    }

    // userId vem do JWT verificado — ignoramos qualquer userId do body
    const authenticatedUserId = user.id;

    // ── 2. Validar body ───────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return json({ ok: false, error: 'JSON inválido.' }, 400);
    }

    const plano         = body.plano as string | undefined;
    const purchaseToken = typeof body.purchaseToken === 'string' ? body.purchaseToken : undefined;

    if (!plano || !PLANOS_VALIDOS.has(plano)) {
      return json({ ok: false, error: 'Plano inválido. Use: trial, mensal ou trimestral.' }, 400);
    }

    // purchaseToken obrigatório para planos pagos
    if (plano !== 'trial' && !purchaseToken) {
      return json({ ok: false, error: 'purchaseToken obrigatório para planos pagos.' }, 400);
    }

    // ── 3. Client com service role (apenas para escrita no banco) ─────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── 4. Calcular data de expiração ─────────────────────────────────────────
    const startsAt = new Date();
    const endsAt   = calcularFim(plano, startsAt);

    // ── 5. Validar token Google Play (apenas planos pagos) ────────────────────
    if (plano !== 'trial' && purchaseToken) {
      const valid = await validarTokenGooglePlay(plano, purchaseToken);
      if (!valid) {
        return json({ ok: false, error: 'Token de compra inválido.' }, 422);
      }
    }

    // ── 6. Inserir assinatura — userId vem do JWT, não do body ────────────────
    const { error } = await supabase.from('subscriptions').insert({
      user_id:        authenticatedUserId,
      plan_type:      plano,
      status:         plano === 'trial' ? 'trial' : 'active',
      purchase_token: purchaseToken ?? null,
      platform:       purchaseToken ? 'android' : 'web',
      starts_at:      startsAt.toISOString(),
      ends_at:        endsAt.toISOString(),
    });

    if (error) {
      console.error('[validate-purchase] insert error:', error);
      return json({ ok: false, error: 'Erro ao registrar assinatura.' }, 500);
    }

    return json({ ok: true, endsAt: endsAt.toISOString() });
  } catch (err) {
    console.error('[validate-purchase] unexpected:', err);
    return json({ ok: false, error: 'Erro interno.' }, 500);
  }
});

// ── Helpers ────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function calcularFim(plano: string, inicio: Date): Date {
  const d = new Date(inicio);
  switch (plano) {
    case 'trial':      d.setDate(d.getDate() + 14);   break;
    case 'mensal':     d.setMonth(d.getMonth() + 1);   break;
    case 'trimestral': d.setMonth(d.getMonth() + 3);   break;
  }
  return d;
}

/**
 * Verifica o token de compra com a Google Play Developer API.
 * Requer variável de ambiente GOOGLE_PLAY_SERVICE_ACCOUNT com
 * o JSON da service account do Google Cloud Console.
 */
async function validarTokenGooglePlay(plano: string, purchaseToken: string): Promise<boolean> {
  try {
    const serviceAccountJson = Deno.env.get('GOOGLE_PLAY_SERVICE_ACCOUNT');
    if (!serviceAccountJson) {
      // Sem service account configurada — ambientes de dev/test aceitam token qualquer
      console.warn('[validate-purchase] GOOGLE_PLAY_SERVICE_ACCOUNT não configurada. Aceitando token sem validação.');
      return true;
    }

    const PACKAGE_NAME = 'com.barberflow.profissional';
    const PRODUCT_IDS: Record<string, string> = {
      mensal:      'plano_mensal_barbeiro',
      trimestral:  'plano_trimestral_barbeiro',
    };
    const productId = PRODUCT_IDS[plano];
    if (!productId) return false;

    // Obtém token de acesso OAuth2 via JWT da service account
    const accessToken = await getGoogleAccessToken(JSON.parse(serviceAccountJson));

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`;
    const resp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!resp.ok) {
      console.warn('[validate-purchase] Google API status:', resp.status);
      return false;
    }

    const data = await resp.json();
    // paymentState: 1 = payment received, 2 = free trial
    return data.paymentState === 1 || data.paymentState === 2;
  } catch (err) {
    console.error('[validate-purchase] Google validation error:', err);
    return false;
  }
}

async function getGoogleAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now        = Math.floor(Date.now() / 1000);
  // Google exige base64url (sem +, / ou = do base64 padrão)
  const b64url = (str: string) =>
    btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const header     = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet   = b64url(JSON.stringify({
    iss:   serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  }));

  // Assinar com a chave privada via Web Crypto API
  const pemKey  = serviceAccount.private_key.replace(/\\n/g, '\n');
  const keyData = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(`${header}.${claimSet}`),
  );
  const sig = b64url(String.fromCharCode(...new Uint8Array(sigBuffer)));
  const jwt = `${header}.${claimSet}.${sig}`;

  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenResp.json();
  return tokenData.access_token;
}
