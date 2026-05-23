# Fase 1 - Scripts e primeiro paint

Data: 2026-05-23.

## Alteracoes aplicadas

- `apps/cliente/index.html`: 105 scripts externos passaram de blocking para `defer`.
- `apps/profissional/index.html`: 146 scripts externos passaram de blocking para `defer`.
- O script inline administrativo do profissional foi movido para executar apos `load`, usando `requestIdleCallback` quando disponivel.
- Nenhum script recebeu `async`: nao ha analytics/tracker independente confirmado no HTML atual.
- Nenhum script foi removido: o audit marcou suspeitos, mas nao confirmou codigo morto.
- Nenhuma deduplicacao de versao foi feita: Supabase e Leaflet ja aparecem em versao unica/compatível.

## Scripts defer

Todos os scripts externos de `apps/cliente/index.html` e `apps/profissional/index.html` agora usam `defer`. Isso preserva a ordem real documentada no audit:

`G0 vendor base -> G1 infra API -> G2 auth/router -> G3 data clients -> G4 services/controllers -> G5 UI components/sections -> G6 pages -> G7 misc -> G8 app boot`.

## Scripts async

Nenhum.

Motivo: nao foi encontrado tracker/analytics independente com dependencia zero de ordem. O unico trecho classificado como legado inline foi adiado para `load`/idle, nao convertido para `async`, porque script inline nao aceita essa estrategia.

## Scripts blocking mantidos

Nenhum script externo permanece blocking.

O CSS estrutural permanece blocking nesta fase. O CSS critico de boot ja existe inline em `#boot-lock`. A conversao ampla de CSS para preload/media swap ficou fora desta aplicacao inicial por risco de FOUC e regressao visual nas telas de login/home sem Lighthouse real e sem baseline visual automatizada.

## Ganho real vs estimado

| Metrica | Antes auditado | Depois estatico | Observacao |
|---|---:|---:|---|
| Tags externas blocking no cliente | 105 | 0 | Validado por teste estatico. |
| Tags externas blocking no profissional | 146 | 0 | Validado por teste estatico. |
| Tags `defer` no cliente | 0 | 105 | Ordem preservada pelo HTML. |
| Tags `defer` no profissional | 0 | 146 | Ordem preservada pelo HTML. |
| TBT/LCP real | nao medido | nao medido | Lighthouse/Chrome indisponiveis no ambiente atual. |

Ganho estimado: remove o bloqueio de parser causado por 251 scripts externos, mas ainda nao reduz parse/execute total. A reducao real de TBT depende da proxima fase com code splitting/lazy loading.

## Scripts que nao puderam mudar

- CSS compartilhado e CSS de app: mantidos blocking para preservar first paint estilizado.
- Sections placeholders: nao removidas porque nao sao dead code confirmado.
- Leaflet/mapa/mensagens/PWA: receberam `defer`, mas nao foram splitados; isso depende de Fase 2/3 para imports sob demanda.

## Lighthouse

Nao foi possivel executar Lighthouse nesta fase pelo mesmo bloqueio do baseline: `lighthouse` e Chrome/Edge nao estao disponiveis no PATH do ambiente. Foram registrados artefatos `*-not-run.json` em `docs/perf/fase-1/` para deixar a ausencia da medicao explicita, sem inventar metricas.

Metas provisorias ate a baseline real:

| Perfil | TBT alvo | LCP alvo |
|---|---:|---:|
| Mobile | < 500 ms | < 2.5 s |
| Desktop | < 200 ms | < 1.8 s |

## Smoke tests

Validacao automatizada desta fase:

- HTML do cliente e profissional nao contem scripts externos sem `defer`/`async`/`type`.
- Ordem de dependencias criticas preservada: Supabase antes de SupabaseService, Router antes de pages, AppBootstrap antes de `app.js`.
- Inline administrativo do profissional usa `load` + `requestIdleCallback`.

Fluxos que ainda precisam de validacao manual em browser real antes de release:

- login;
- agenda;
- story;
- portfolio;
- notification;
- queue;
- settings.

## Proximos passos - Fase 2

- Transformar `PageSection`, `SectionEventBus`, `events/catalog.js` e Sections em ES modules.
- Criar bundles/chunks por pagina ou dominio: auth, mapa/GPS, fila, mensagens, MinhaBarbearia e financeiro.
- Mover Leaflet, mapa, mensagens/P2P e PWA para carregamento on-demand.
- Definir teste visual/browser automatizado para liberar CSS preload/media swap sem FOUC.
