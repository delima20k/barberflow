# Rollout e rollback - Vite canario

## Estrategia

1. Manter HTML legado como fallback de producao.
2. Publicar artefatos Vite em paralelo (`dist/vite`) com hashing e manifest.
3. Ativar canario por flag operacional (`VITE_ENABLE_VITE_CANARY=true` ou roteamento de CDN).
4. Medir Web Vitals e erros JS por 48h.
5. Promover quando criterios objetivos passarem.

## Criterios de promocao

| Metrica | Limite |
|---|---:|
| TBT mobile | < 500 ms |
| LCP mobile | < 2,5 s |
| INP | < 200 ms |
| Erro JS | nao pode subir vs legado |
| Chunk individual | <= `BF_BUNDLE_MAX_KB` ou aprovado explicitamente |

## Rollback

Rollback imediato:

1. Desativar flag/canario no CDN/hosting.
2. Servir `apps/*/index.html` legado.
3. Invalidar cache apenas de HTML/manifest; assets hashados podem permanecer.
4. Conferir que Service Worker nao fixa asset Vite antigo.

Rollback de codigo:

```powershell
git revert <commit-da-fase-3>
```

## Teste de rollback

Validado conceitualmente nesta fase: a producao legado nao foi substituida pelo Vite; o build canario e paralelo. O teste operacional real depende do ambiente de deploy/CDN.
