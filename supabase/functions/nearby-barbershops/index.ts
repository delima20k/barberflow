// =============================================================
// Edge Function: nearby-barbershops
// Responsabilidade: buscar barbearias dentro de um raio (km)
// Rota: POST /functions/v1/nearby-barbershops
// Body: { latitude, longitude, radius_km? }
// =============================================================
// Deploy: supabase functions deploy nearby-barbershops
// =============================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─── Tipos ───────────────────────────────────────────────────
interface RequestBody {
  latitude: number
  longitude: number
  radius_km?: number
}

interface BarbershopResult {
  id: string
  name: string
  slug: string
  address: string
  city: string
  latitude: number
  longitude: number
  logo_path: string | null
  is_open: boolean
  rating_avg: number
  rating_count: number
  distance_km: number
}

// ─── Validação de entrada ─────────────────────────────────────
function validateBody(body: unknown): body is RequestBody {
  if (!body || typeof body !== 'object') return false
  const b = body as Record<string, unknown>
  return (
    typeof b.latitude  === 'number' &&
    typeof b.longitude === 'number' &&
    b.latitude  >= -90  && b.latitude  <= 90 &&
    b.longitude >= -180 && b.longitude <= 180
  )
}

// ─── Fórmula de Haversine em SQL (via função RPC) ─────────────
// Alternativa sem PostGIS: cálculo aproximado por bounding box
function buildBoundingBox(lat: number, lon: number, radiusKm: number) {
  const latDelta = radiusKm / 111.0          // ~111 km por grau lat
  const lonDelta = radiusKm / (111.0 * Math.cos(lat * Math.PI / 180))
  return {
    minLat: lat - latDelta, maxLat: lat + latDelta,
    minLon: lon - lonDelta, maxLon: lon + lonDelta,
  }
}

// Distância Haversine em JS (para ordenar resultados)
function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Handler principal ────────────────────────────────────────
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Parse body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!validateBody(body)) {
    return new Response(
      JSON.stringify({ error: 'latitude e longitude são obrigatórios e devem ser números válidos' }),
      { status: 422, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { latitude, longitude, radius_km = 2 } = body
  const safeRadius = Math.min(Math.max(radius_km, 0.1), 50) // entre 100m e 50km

  // Cliente Supabase — usa ANON_KEY (RLS já protege os dados)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { auth: { persistSession: false } }
  )

  const { minLat, maxLat, minLon, maxLon } = buildBoundingBox(latitude, longitude, safeRadius)

  const { data, error } = await supabase
    .from('barbershops')
    .select('id, name, slug, address, city, latitude, longitude, logo_path, is_open, rating_avg, rating_count')
    .eq('is_active', true)
    .gte('latitude',  minLat).lte('latitude',  maxLat)
    .gte('longitude', minLon).lte('longitude', maxLon)
    .limit(30)

  if (error) {
    console.error('[nearby-barbershops] DB error:', error.message)
    return new Response(
      JSON.stringify({ error: 'Erro interno ao buscar barbearias' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Calcular distância real + filtrar pelo raio + ordenar
  const results: BarbershopResult[] = (data ?? [])
    .map(shop => ({
      ...shop,
      distance_km: parseFloat(
        haversineKm(latitude, longitude, shop.latitude, shop.longitude).toFixed(2)
      ),
    }))
    .filter(shop => shop.distance_km <= safeRadius)
    .sort((a, b) => a.distance_km - b.distance_km)

  return new Response(
    JSON.stringify({ data: results, total: results.length }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Cache-Control': 'public, max-age=30',
      },
    }
  )
})
