# Load Test Summary - Smoke 1 VU BFF Local

Data: 2026-06-08

## Objetivo

Validar o smoke test 1 VU com a BFF local ativa em `http://127.0.0.1:3002`, sem aumentar carga, sem escrita e sem push real.

## Comando Correto da BFF

Diretorio: `barberflow-bff-api/`

```powershell
npm run dev
```

Equivalente:

```powershell
npm start
```

Ambos executam `node server.js` e usam a porta padrao `3002`.

## Variaveis Locais

Arquivos `.env` reais nao encontrados. Foram encontrados apenas:

- `.env.example`
- `barberflow-bff-api/.env.example`

Variaveis obrigatorias ausentes no ambiente local:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

Variaveis opcionais/relevantes tambem ausentes:

- `SUPABASE_JWT_SECRET`
- `REDIS_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## Health Check

Endpoint equivalente identificado:

- `GET http://127.0.0.1:3002/api/health`
- `GET http://127.0.0.1:3002/api/v1/health`

Resultado antes de subir:

- `GET http://127.0.0.1:3002/api/health`: falhou com servidor remoto indisponivel.

Resultado ao tentar subir:

```txt
[BFF] Variaveis obrigatorias ausentes: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
```

## Smoke 1 VU

Nao executado nesta rodada, porque a BFF local nao iniciou e a instrucao exige rodar o smoke somente depois do health manual passar.

## Comparativo

| Estado | BFF | Smoke | Requests | Taxa de erro | p95/p99 |
|---|---|---|---:|---:|---|
| Antes | Indisponivel | Executado na rodada anterior contra alvo inativo | 115 | 100% | Ver `2026-06-08T14-56-40-690Z_smoke_1vu.json` |
| Agora | Nao iniciou por env ausente | Nao executado | 0 | N/A | N/A |

## Conclusao

Smoke 1 VU bloqueado por configuracao local ausente. Nenhuma funcionalidade, layout, regra de negocio, fluxo real ou banco foi alterado.
