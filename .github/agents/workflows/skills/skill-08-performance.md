# SKILL 08 — PERFORMANCE E CUSTO DE INFRA

> Leia este arquivo para tarefas de otimização: cache, paginação, debounce, Blob URLs, N+1, custo de infraestrutura.

---

## 1. PERFORMANCE — REGRAS OBRIGATÓRIAS

- Evitar loops desnecessários e renderização pesada no frontend
- Evitar queries N+1 — agregar dados em uma única query sempre que possível
- Usar índices, cache, memoização e paginação — ver `skill-05-banco.md`
- `debounce` / `throttle` em eventos de alta frequência (scroll, resize, input)
- Cancelar timers (`clearTimeout`, `clearInterval`) ao destruir componentes
- Revogar Blob URLs (`URL.revokeObjectURL`) após uso — evitar vazamento de memória
- Evitar listeners órfãos — remover com `removeEventListener` ao destruir componentes
- Evitar re-renders desnecessários — atualizar apenas o que mudou no DOM

---

## 2. ENGENHARIA DE CUSTO

Toda decisão de implementação deve minimizar:

| Recurso | Como minimizar |
|---|---|
| **Banda** | Comprimir assets, lazy loading, paginação, caching HTTP |
| **CPU** | Evitar loops pesados, delegar processamento para background |
| **Memória** | Revogar Blob URLs, cancelar timers, remover listeners |
| **Storage** | Thumbnails + compressão para toda mídia; metadados no banco |
| **Requests** | Agrupar chamadas, usar cache, evitar polling desnecessário |
| **Realtime** | Usar apenas eventos leves: fila, status e chat textual privado; nunca para feeds, vídeos ou payloads pesados |

---

## 3. REGRA DE OURO

Antes de qualquer implementação, perguntar:

> **"Existe uma forma mais barata, mais inteligente, mais segura e mais escalável de fazer isso?"**

Se existir → **FAZER MELHOR.**

---

## 4. CACHE E MEMOIZAÇÃO

- Cache de queries frequentes com TTL definido
- Memoização de cálculos custosos que não mudam entre renders
- Invalidar cache de forma controlada — nunca deixar dados stale silenciosamente
- Para listas longas: paginação obrigatória — **nunca** buscar tudo de uma vez

---

## 4.1 CACHE DISTRIBUÍDO REDIS — BFF (barberflow-bff-api/)

### Padrões implementados

| Padrão | Classe | Quando usar |
|--------|--------|-------------|
| Cache-Aside | `CacheAsideStrategy` | Leituras frequentes (default para todos os recursos) |
| Write-Through | `WriteThroughStrategy` | Dados críticos onde consistência pós-escrita é imediata |
| Write-Behind | `WriteBehindStrategy` | ⚠ Apenas dados não-críticos (contagens, métricas) |
| Single-Flight | `SingleFlightCache` | Proteger contra burst simultâneo (sempre ativo, transparente) |
| Decorator | `CachedUseCaseDecorator` | Adicionar cache a use cases de leitura sem alterar a classe |
| Event Invalidation | `CacheInvalidationSubscriber` | Invalidar cache por eventos de domínio |
| Idempotência | `IdempotencyMiddleware` | POST/PUT críticos com `Idempotency-Key` header |

### Chave de cache

Formato obrigatório: `bf:<context>:<entity>:<id_ou_params>:<version>`
Usar sempre `CacheKeyBuilder` — **nunca** construir strings de chave inline.

### TTL por contexto (ver `config/cacheTtl.js`)

| Contexto | TTL | Justificativa |
|----------|-----|---------------|
| agendamento_single | 60s | Status muda várias vezes/dia |
| agendamento_list | 30s | Alta frequência de mutação |
| fila_list | 10s | Quasi-realtime |
| fila_count | 5s | Muito volátil |
| barbearia_profile | 300s | Raramente muda |
| servicos_list | 600s | Catálogo estável |

### Regras obrigatórias de cache BFF

- ✅ Todo use case de LEITURA recorrente deve ser decorado com `CachedUseCaseDecorator`
- ✅ Use cases de ESCRITA devem disparar eventos de domínio para invalidação via `CacheInvalidationSubscriber`
- ✅ `WriteBehindStrategy` apenas para dados não-críticos — NUNCA para agendamentos, fila ou pagamentos
- ✅ Bump de version (`v2`, `v3`...) ao mudar schema do dado cacheado — invalida automaticamente todas as chaves antigas
- ❌ NUNCA construir chave de cache inline — usar `CacheKeyBuilder`
- ❌ NUNCA usar `flush()` em produção — invalida por prefix ou chave específica
- ❌ NUNCA cachear dados financeiros sem TTL curto e invalidação explícita

### Riscos documentados

- **R1 Stale read**: mitigado por `CacheInvalidationSubscriber` via eventos de domínio
- **R2 Write-through parcial**: mitigado pela remoção do cache em caso de erro
- **R3 Write-behind perda**: usar apenas para dados tolerantes a perda
- **R4 Multi-instância**: `DomainEventPublisher` é in-process; TTL curto minimiza janela de stale

Ver análise completa em `docs/cache.md`.

---

## 5. CHECKLIST DE PERFORMANCE AO ENTREGAR

- [ ] Queries usam índices existentes
- [ ] Nenhuma query N+1 introduzida
- [ ] Paginação implementada em listagens
- [ ] Blob URLs revogados após uso
- [ ] Timers cancelados ao destruir componentes
- [ ] Listeners removidos ao destruir componentes
- [ ] Eventos de alta frequência com debounce/throttle
- [ ] Assets comprimidos e com lazy loading

## 5.1 PIPELINE VITE / BUNDLER FRONTEND

- Introduzir bundler de forma reversível: build canário primeiro, HTML legado como fallback até remover globals críticos.
- Configurar hashing, sourcemaps, manifest, gzip/brotli e relatório visual de bundle antes de promover para produção.
- Usar `manualChunks` por domínio/section quando ainda não houver roteamento completo por ES modules.
- Validar `import.meta.env` no entry-point do app e documentar variáveis opcionais/obrigatórias.
- CI deve rodar `npm run build:vite`, checar budget de chunks e guardar `docs/perf/fase-*/bundle.html` como artefato.
- Lighthouse CI deve comparar PR contra baseline quando Chrome/Lighthouse estiverem disponíveis; se não estiverem, registrar artefato `not-run` sem inventar métrica.
- Vendor via npm é o destino final; CDN/script solto só permanece em allowlist com justificativa e plano de remoção.
- Promoção para produção exige critérios objetivos de TBT, LCP, INP e taxa de erro JS; rollback deve voltar ao HTML legado ou artefato anterior versionado.

## 6. FEED ESCALAVEL NA BFF

- Feed pesado deve ficar atras da BFF e usar cursor estavel `(created_at, id)`, nunca `OFFSET`.
- Escolher fanout hibrido quando houver autores heavy: autores comuns materializam inbox em fila; heavy publishers entram por pull na leitura.
- Cache da timeline deve ser por usuario em Redis, com TTL curto e invalidacao por eventos `NewPost`, `Block` e `Unfollow`.
- Anti-spam do feed deve combinar dedupe de conteudo, rate limit de posts e throttle de autor viral no assembler.
- Ranking, filtros e injecao de patrocinados/sugestoes ficam em classes/ports desacoplados para evoluir personalizacao sem refazer repository e cursor.
