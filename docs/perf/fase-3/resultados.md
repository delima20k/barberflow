# Fase 3 - Vite canario

Data: 2026-05-23.

## Resultado do build

Comando executado:

```powershell
npm.cmd run build:vite
```

Resultado: passou.

Artefatos:

- `dist/vite/` gerado localmente e ignorado pelo Git.
- `docs/perf/fase-3/bundle.html` gerado pelo `rollup-plugin-visualizer`.
- Gzip e Brotli gerados por `vite-plugin-compression`.
- Sourcemaps gerados para os chunks de modulo.

## Bundles vs baseline pre-Fase 1

Baseline de `/docs/scripts-audit.md`: 2.517,8 KB de JS total se ambos HTMLs carregassem tudo; gzip estimado 692,2 KB.

| Chunk/artefato Vite | Tamanho | Gzip | Brotli | Observacao |
|---|---:|---:|---:|---|
| `assets/chunks/app-*.js` | 58,35 KB | 16,82 KB | 14,6 KB | Chunk module atual do app profissional/MinhaBarbearia. |
| `section-agenda-*` | 4,79 KB | 1,57 KB | 1,4 KB | Section estatica. |
| `section-notification-*` | 2,06 KB | 0,90 KB | 0,8 KB | Section estatica. |
| `section-queue-*` | 1,98 KB | 0,83 KB | 0,7 KB | Section estatica. |
| `section-story-*` | 1,79 KB | 0,81 KB | 0,7 KB | Lazy por `import()`. |
| `section-settings-*` | 1,64 KB | 0,76 KB | 0,7 KB | Section estatica. |
| `section-analytics-*` | 1,48 KB | 0,75 KB | 0,7 KB | Section estatica. |
| `section-portfolio-*` | 1,46 KB | 0,69 KB | 0,6 KB | Lazy por `import()`. |
| `map-panel-*.css` | 176,61 KB | 31,88 KB | n/a | CSS pesado ainda compartilhado. |

O ganho real ainda e parcial: o Vite empacota a ilha ES module criada nas Fases 2/3, mas muitos scripts classicos continuam no HTML como fallback. A promocao total depende de converter services/pages legados para imports explicitos.

## Web vitals

| Ambiente | TBT | LCP | INP | Status |
|---|---:|---:|---:|---|
| Baseline local | n/a | n/a | n/a | Chrome/Lighthouse nao disponiveis no PATH local. |
| Vite preview local | n/a | n/a | n/a | Build passou; Lighthouse local nao executado. |
| CI PR | alvo < 500 ms | alvo < 2,5 s | alvo < 200 ms | `lighthouse-ci` configurado para PR quando Chrome estiver disponivel no runner. |

## Compatibilidade e rollout

O plugin legacy nao foi instalado nesta fase: a base ja usa recursos modernos de JS nas sections extraidas e o deploy sera promovido como canario paralelo, com fallback para os scripts classicos atuais. Se a matriz real de browsers exigir `nomodule`, a decisao deve entrar antes da promocao total do Vite.

`modulepreload` fica ativo pelo padrao do Vite; Story e Portfolio ja sao os primeiros candidatos a `import()` lazy, enquanto vendor pesado ainda depende da conversao dos services legados.

## Debitos remanescentes

- Scripts classicos sem `type="module"` continuam fora do bundle e o Vite emite avisos para eles.
- Supabase local ainda carrega por `/shared/js/supabase.min.js`; `@supabase/supabase-js` ja existe via npm, mas a troca requer converter `SupabaseService`.
- Leaflet foi adicionado via npm, mas o HTML ainda usa CDN porque `MapWidget`/GPS ainda dependem de globals.
- App cliente permanece em canario reservado: `src/vite/cliente-entry.js` valida env, mas nao importa `assets/js/app.js` ate o app cliente deixar de depender de `App` global.
- CSS `map-panel.css` e imagens grandes de splash/header ainda dominam bytes iniciais.

## Monitoramento primeira semana

- Comparar erros JS por release/canario vs legado.
- Monitorar queda de sucesso no boot (`DOMContentLoaded` -> `AppBootstrap.init`).
- Medir TBT/LCP/INP por app e por rede movel.
- Promover apenas se taxa de erro JS nao subir e TBT/LCP ficarem dentro dos limites por 48h.
