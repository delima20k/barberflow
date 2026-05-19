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
| **Realtime** | Restrito a fila e status — nunca para feeds ou vídeos |

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

## 5. CHECKLIST DE PERFORMANCE AO ENTREGAR

- [ ] Queries usam índices existentes
- [ ] Nenhuma query N+1 introduzida
- [ ] Paginação implementada em listagens
- [ ] Blob URLs revogados após uso
- [ ] Timers cancelados ao destruir componentes
- [ ] Listeners removidos ao destruir componentes
- [ ] Eventos de alta frequência com debounce/throttle
- [ ] Assets comprimidos e com lazy loading
