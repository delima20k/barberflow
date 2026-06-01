# Feed canonico na BFF

## Decisao de fanout

O feed usa **modelo hibrido por perfil de autor**.

- Autores abaixo de `FEED_WRITE_FANOUT_LIMIT` (default 5.000 followers) usam fanout-on-write: o post grava `feed_items`, outbox e um job de `bf:queue:feed` materializa `feed_inbox` em background.
- Heavy publishers acima do limite usam fanout-on-read: o item fica com `fanout_mode=pull` e a RPC da timeline busca esses autores seguidos na leitura.
- Fanout-on-write puro barateia leituras comuns, mas explode escrita e invalida cache quando um autor muito grande publica.
- Fanout-on-read puro evita inboxes gigantes, mas cobra join/ranking em toda leitura para autores pequenos. O hibrido segura os dois piores casos.

## Modelo e fluxo

`FeedItem` referencia a fonte (`story`, `portfolio_image` ou `post`) sem duplicar bytes nem payload social completo. `FeedQuery` valida limite e cursor. `FeedAssembler` aplica filtro de bloqueio, dedupe, ranking, throttle de autor viral e os ports de patrocinados/sugestoes.

Rotas BFF: `GET /api/v1/feed`, `POST /api/v1/feed/posts`, `POST /api/v1/feed/authors/:authorId/block` e `DELETE /api/v1/feed/authors/:authorId/follow`.

O cursor canonico e o par `(created_at, id)` ordenado em ordem decrescente. Insercoes concorrentes mais novas ficam antes da janela ja paginada; empates no mesmo timestamp usam `id`, portanto uma pagina seguinte nao depende de `OFFSET`.

## Ranking e cache

O dominio expõe `RankingStrategy`, `ChronologicalStrategy`, `EngagementScoreStrategy` e `PersonalizedStrategy`. A rota inicia com `PersonalizedStrategy`; os ports do assembler deixam adicionar afinidade, patrocinados e sugestoes sem reescrever repository ou cursor.

Timeline cacheada usa chave por usuario em Redis via `FeedCache` e TTL curto de 45s. O subscriber invalida por eventos:

- `NewPost`: invalida timeline feed para evitar stale após publicacao.
- `Block` e `Unfollow`: invalidam apenas o usuario que alterou sua relacao.

Se Redis nao estiver configurado no desenvolvimento/teste, `FeedCacheProvider` usa cache em memoria com a mesma interface.

## Anti-spam

- `content_hash` bloqueia reenvio recente pelo mesmo autor antes do outbox.
- Rate limit de publicacao usa janela configuravel (`FEED_POST_RATE_LIMIT` e `FEED_POST_RATE_WINDOW_SECONDS`) sobre indice `(author_id, created_at)`.
- O assembler limita itens organicos consecutivos por autor com `FEED_VIRAL_THROTTLE_PER_PAGE`.

## Custo, latencia e evolucao

**Redis por usuario ativo:** uma entrada de pagina quente contem no maximo 50 itens serializados. Com uma estimativa conservadora de 1 a 3 KB/item e duas paginas quentes por usuario, planejar cerca de 100 a 300 KB por usuario ativo no TTL; cursors frios expiram em 45s e nao viram historico permanente.

**Timeline p95:** o caminho quente deve ser Redis + serializacao. O alvo operacional e p95 abaixo de 120 ms para cache hit e abaixo de 350 ms no miss com pagina de 20 itens; acompanhar RPC `get_feed_page`, hit ratio, backlog da fila e tempo do fanout antes de elevar limites.

**Personalizacao futura:** trocar pesos da `PersonalizedStrategy`, alimentar `affinity_score` na RPC, criar providers reais de patrocinados/sugestoes e experimentar cohort/cache version sem mexer em `FeedItem`, cursor ou inbox. Um ranking global que reordene entre paginas deve carregar snapshot/version no cursor antes de ser ativado.
