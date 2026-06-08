# Load Test Summary - Smoke 1 VU

Data: 2026-06-08

## Etapa

- Carga autorizada: 1 VU smoke
- Duracao: 5s
- Escritas: desabilitadas
- Push real: desabilitado
- Prefixo de dados: `loadtest_20260608_smoke`

## Resultado Antes/Depois

| Execucao | Requests | Erros | Taxa de erro | Evidencia |
|---|---:|---:|---:|---|
| Antes do pacing do harness | 7.465 | 7.465 | 100% | `docs/perf/load-results/2026-06-08T14-55-43-751Z_smoke_1vu.json` |
| Depois do pacing do harness | 115 | 115 | 100% | `docs/perf/load-results/2026-06-08T14-56-40-690Z_smoke_1vu.json` |

## Problemas Encontrados

- BFF local indisponivel em `http://127.0.0.1:3002`, resultando em 100% de erro no smoke.
- Harness fazia loop apertado quando o alvo estava indisponivel, produzindo volume artificial de requests.

## Correcao Aplicada

- Adicionado `thinkTimeMs` configuravel no runner, com padrao de 250ms entre iteracoes.
- Nenhuma funcionalidade, layout, regra de negocio ou banco foi alterado.

## Proxima Etapa

Subir a BFF local com variaveis Supabase validas e repetir o smoke 1 VU antes de pedir autorizacao para 7 VUs.
