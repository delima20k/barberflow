# Dedupe de scripts - Fase 1

Data: 2026-05-23.

## Resultado

Nenhuma biblioteca em versoes diferentes foi consolidada nesta fase.

O audit de `/docs/scripts-audit.md` encontrou muitos scripts compartilhados entre `apps/cliente/index.html` e `apps/profissional/index.html`, mas nao confirmou duplicidade de versoes dentro do mesmo carregamento. Os dois vendors externos identificados permanecem na versao atual:

| Biblioteca | Versao atual | Referencias | Acao |
|---|---|---|---|
| Supabase local | `/shared/js/supabase.min.js` | cliente, profissional | Mantido; uma unica copia local. |
| Leaflet | `1.9.4` | cliente, profissional | Mantido; mesma versao nos dois apps. |

## Breaking changes

Nenhum breaking change aplicado.

## Observacoes

- Os duplicados entre apps devem virar chunks compartilhados/cacheaveis na Fase 3 com Vite, nao remocao manual no HTML atual.
- `PortfolioSection/*`, `AnalyticsSection/*` e `AgendaSection/*` continuam carregando no profissional porque o audit classificou como suspeitos/placeholders, nao como mortos confirmados.
- Remover placeholders agora poderia quebrar contratos do shell de `MinhaBarbeariaPage` e testes de Section/EventBus.
