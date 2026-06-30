# Checklist de Migração BFF Canônica — Por Fase
> Agente: DELIMA | Estratégia: Strangler Pattern | Cada fase é independente e reversível

---

## Legenda de Status

| Símbolo | Significado |
|---------|------------|
| ⬜ | Não iniciado |
| 🔄 | Em progresso |
| ✅ | Concluído |
| ❌ | Bloqueado (ver dependências) |

---

## FASE 0 — Índices e Segurança do Banco (urgente, zero risco)
> **Duração estimada:** 1 dia | **Risco:** Zero (só adiciona índices e migrations) | **Pré-requisito:** nenhum

### Objetivos
Corrigir os gaps de índices que já causam lentidão em produção. Não altera comportamento.

### Checklist

- [ ] Criar migration `20260521000001_missing_indexes.sql`
  - [ ] `CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments(client_id);`
  - [ ] `CREATE INDEX IF NOT EXISTS idx_queue_entries_client_id ON queue_entries(client_id);`
  - [ ] `CREATE INDEX IF NOT EXISTS idx_transactions_professional_id ON transactions(professional_id, created_at DESC);`
  - [ ] `CREATE INDEX IF NOT EXISTS idx_barbershops_rating ON barbershops(rating_score DESC NULLS LAST, rating_avg DESC NULLS LAST);`
  - [ ] `CREATE INDEX IF NOT EXISTS idx_portfolio_likes_user ON portfolio_likes(user_id, created_at DESC);`
- [ ] Validar migration no ambiente de dev (Supabase local ou staging)
- [ ] Aplicar migration em produção via `supabase db push`
- [ ] Confirmar que `EXPLAIN ANALYZE` nas queries críticas usa os novos índices
- [ ] Configurar `SUPABASE_JWT_SECRET` no Vercel (elimina latência de rede na auth)

### Critério de Done
Índices criados em produção, `EXPLAIN ANALYZE` confirma uso.

---

## FASE 1 — Fila via BFF (domínio mais crítico)
> **Duração estimada:** 3–5 dias | **Risco:** Médio | **Pré-requisito:** Fase 0

### Objetivos
Fila é o hot path do app profissional. Atualmente o frontend acessa Supabase diretamente (`QueueRepository.js`). Criar endpoints BFF para todos os casos de uso da fila.

### Checklist

**BFF — Novos arquivos**
- [ ] Criar `barberflow-bff-api/repositories/FilaRepository.js`
  - [ ] `listar(barbershopId)` → `queue_entries` com JOINs profiles, services, chairs
  - [ ] `getCadeiras(barbershopId)` → `chairs` com status
  - [ ] `entrar(payload)` → INSERT + posição calculada
  - [ ] `atualizarStatus(id, status, userId)` → validar transição antes do UPDATE
  - [ ] `confirmarPresenca(id, confirmed)` → UPDATE client_confirmed
  - [ ] `getById(id)` → para ownership check
- [ ] Criar `barberflow-bff-api/services/FilaBffService.js`
  - [ ] Máquina de estados: waiting → in_service → done / absent
  - [ ] Validar ownership (professional_id OU owner_id)
  - [ ] Validar transições inválidas (throw AppError.badRequest)
- [ ] Criar `barberflow-bff-api/controllers/FilaController.js`
  - [ ] `listar(req, res)`
  - [ ] `entrar(req, res)`
  - [ ] `atualizarStatus(req, res)`
  - [ ] `confirmarPresenca(req, res)`
  - [ ] `sair(req, res)`
- [ ] Criar `barberflow-bff-api/routes/fila.js`
  - [ ] `GET  /api/v1/fila?barbershop_id=X`
  - [ ] `POST /api/v1/fila`
  - [ ] `PATCH /api/v1/fila/:id/status`
  - [ ] `PATCH /api/v1/fila/:id/confirmacao`
  - [ ] `DELETE /api/v1/fila/:id`
- [ ] Registrar rota em `app.js`

**Testes (TDD — escrever antes de implementar)**
- [ ] `tests/fila.test.js`
  - [ ] Listar fila de uma barbearia
  - [ ] Entrar na fila (criação atômica via RPC)
  - [ ] Atualizar status (transições válidas)
  - [ ] Bloquear transição inválida
  - [ ] Confirmar presença
  - [ ] Sair da fila
  - [ ] Tentativa sem ownership (403)

**Frontend — migrar `QueueRepository.js`**
- [ ] Adicionar namespace `fila` em `shared/js/BffApiService.js`
  ```js
  static fila = {
    listar: (barbershopId) => BffApiService.get('/api/v1/fila', { barbershop_id: barbershopId }),
    entrar: (payload) => BffApiService.post('/api/v1/fila', payload),
    atualizarStatus: (id, status) => BffApiService.patch(`/api/v1/fila/${id}/status`, { status }),
    confirmarPresenca: (id, confirmed) => BffApiService.patch(`/api/v1/fila/${id}/confirmacao`, { confirmed }),
    sair: (id) => BffApiService.delete(`/api/v1/fila/${id}`),
  };
  ```
- [ ] Refatorar `shared/js/QueueRepository.js` para usar `BffApiService.fila.*`
  - [ ] Remover imports de `SupabaseService` e `ApiService`
  - [ ] Substituir chamadas diretas pelos novos namespaces
- [ ] Testar: abrir app profissional → fila aparece normalmente
- [ ] Testar: entrar na fila pelo app cliente → aparece em tempo real no profissional
- [ ] Testar: trocar status (waiting → in_service → done)
- [ ] Testar: confirmação de presença

### Critério de Done
`QueueRepository.js` sem nenhum import de `SupabaseService`. Todos os testes BFF passando. Fila funcional em staging.

---

## FASE 2 — Notificações e Push via BFF
> **Duração estimada:** 2–3 dias | **Risco:** Baixo | **Pré-requisito:** Fase 1

### Objetivos
`NotificationService.js` atualmente acessa Supabase diretamente (Realtime + UPDATE). Criar endpoints para marcar notificações e gerenciar push subscriptions.

### Checklist

**BFF — Novos arquivos**
- [ ] Criar `barberflow-bff-api/repositories/NotificacaoRepository.js`
  - [ ] `listar(userId, limit)` → SELECT não lidas
  - [ ] `marcarLida(id, userId)` → UPDATE is_read = true com ownership check
  - [ ] `marcarTodasLidas(userId)` → UPDATE em batch
- [ ] Criar `barberflow-bff-api/services/NotificacaoBffService.js`
- [ ] Adicionar rotas em `barberflow-bff-api/routes/notificacoes.js`
  - [ ] `GET  /api/v1/notificacoes` — listar não lidas
  - [ ] `PATCH /api/v1/notificacoes/:id/lida`
  - [ ] `PATCH /api/v1/notificacoes/todas-lidas`
  - [ ] `POST /api/v1/push/subscription` — registrar VAPID
  - [ ] `DELETE /api/v1/push/subscription`
- [ ] Adicionar retry queue em `PushService.js` (falhas silenciosas não são aceitáveis)

**Frontend**
- [ ] Adicionar namespace `notificacoes` em `BffApiService.js`
- [ ] Remover `SupabaseService.notifications().update()` de `NotificationService.js`
  - [ ] Substituir por `BffApiService.notificacoes.marcarLida(id)`
- [ ] Manter Realtime para receber notificações novas (INSERT) — acesso read-only OK
- [ ] Testar: receber notificação → aparecer no badge
- [ ] Testar: clicar notificação → marcar lida via BFF

**Testes**
- [ ] `tests/notificacoes.test.js`
  - [ ] Listar não lidas
  - [ ] Marcar uma como lida
  - [ ] Marcar todas como lidas
  - [ ] Tentativa de marcar de outro user (403)

### Critério de Done
`NotificationService.js` sem mutações diretas no Supabase.

---

## FASE 3 — Perfil, Social e LGPD via BFF
> **Duração estimada:** 3–4 dias | **Risco:** Baixo | **Pré-requisito:** Fase 2

### Objetivos
Migrar as últimas mutações de dados pessoais e sociais do frontend para o BFF.

### Checklist

**Perfil**
- [ ] Criar `barberflow-bff-api/routes/perfis.js`
  - [ ] `GET  /api/v1/perfis/meu` — dados do usuário logado
  - [ ] `PATCH /api/v1/perfis/meu` — { full_name, phone, avatar_path }
- [ ] Refatorar `shared/js/ProfileRepository.js`
  - [ ] `.update()` → `BffApiService.perfis.atualizar(dados)`

**Social**
- [ ] Criar `barberflow-bff-api/routes/social.js`
  - [ ] `POST   /api/v1/social/curtir`
  - [ ] `DELETE /api/v1/social/curtir/:id`
  - [ ] `POST   /api/v1/social/favoritar`
  - [ ] `DELETE /api/v1/social/favoritar/:id`
- [ ] Refatorar `shared/js/BarbershopService.js` (curtidas e favoritos)
  - [ ] Remover `barbershop_interactions` insert/delete direto
  - [ ] Substituir por `BffApiService.social.*`

**LGPD**
- [ ] Criar `barberflow-bff-api/routes/lgpd.js`
  - [ ] `POST /api/v1/lgpd/consentimento` — registrar aceite
  - [ ] `POST /api/v1/lgpd/exclusao` — solicitar exclusão de dados
  - [ ] `GET  /api/v1/lgpd/meus-dados` — portabilidade
- [ ] Refatorar `shared/js/LgpdService.js`
  - [ ] Remover `.from('legal_consents').insert()` direto
  - [ ] Substituir por `BffApiService.lgpd.*`

**Testes**
- [ ] `tests/perfis.test.js` — atualizar, ownership check
- [ ] `tests/social.test.js` — curtir, favoritar, remover
- [ ] `tests/lgpd.test.js` — consentimento, exclusão, portabilidade

### Critério de Done
`ProfileRepository.js`, `LgpdService.js` e `BarbershopService.js` (mutations) sem `.from()` direto.

---

## FASE 4 — Comunicação (Chat) via BFF
> **Duração estimada:** 3–5 dias | **Risco:** Médio | **Pré-requisito:** Fase 3

### Objetivos
Chat P2P usa Supabase Realtime para sinalização e `direct_messages` para persistência. Criar camada BFF sem quebrar a criptografia E2E.

### Checklist

**BFF**
- [ ] Criar `barberflow-bff-api/repositories/ComunicacaoRepository.js`
  - [ ] `listarConversas(userId)` — lista de contatos com última mensagem
  - [ ] `listarMensagens(userId, contatoId, cursor)` — paginada
  - [ ] `enviarMensagem(de, para, conteudoCriptografado)` — INSERT
  - [ ] `marcarEntregue(id, userId)` — UPDATE delivered_at
- [ ] Criar `barberflow-bff-api/services/ComunicacaoBffService.js`
  - [ ] Validar que `de === userId` (ownership do remetente)
  - [ ] NÃO descriptografar — conteúdo é opaco (E2E)
- [ ] Criar `barberflow-bff-api/routes/comunicacao.js`
  - [ ] `GET    /api/v1/comunicacao/conversas`
  - [ ] `GET    /api/v1/comunicacao/mensagens?contato_id=X&cursor=Y`
  - [ ] `POST   /api/v1/comunicacao/mensagens`
  - [ ] `PATCH  /api/v1/comunicacao/mensagens/:id/entregue`

**Frontend**
- [ ] Adicionar namespace `comunicacao` em `BffApiService.js`
- [ ] Refatorar `shared/js/MessageService.js`
  - [ ] INSERT direto → `BffApiService.comunicacao.enviarMensagem()`
  - [ ] Manter Realtime para receber mensagens (read-only)

**Testes**
- [ ] `tests/comunicacao.test.js`
  - [ ] Listar conversas
  - [ ] Listar mensagens paginadas
  - [ ] Enviar mensagem
  - [ ] Bloquear envio por outro user (403)

### Critério de Done
`MessageService.js` sem INSERT/UPDATE direto no Supabase.

---

## FASE 5 — Financeiro via BFF
> **Duração estimada:** 2–3 dias | **Risco:** Alto (dados financeiros) | **Pré-requisito:** Fase 4

### Objetivos
`FinanceiroRepository.js` acessa `financial_records` sem BFF. Financeiro requer ownership rigoroso.

### Checklist

**BFF**
- [ ] Criar `barberflow-bff-api/repositories/FinanceiroRepository.js`
  - [ ] `listar(barbershopId, { mes, ano, cursor })` — com paginação
  - [ ] `resumo(barbershopId, { mes, ano })` — totais por status
  - [ ] `criarTransacao(payload, userId)` — ownership check
- [ ] Criar `barberflow-bff-api/services/FinanceiroBffService.js`
  - [ ] Verificar que userId é owner OU professional do barbershop
- [ ] Criar `barberflow-bff-api/routes/financeiro.js`
  - [ ] `GET  /api/v1/financeiro?barbershop_id=X&mes=Y&ano=Z`
  - [ ] `GET  /api/v1/financeiro/resumo?barbershop_id=X&mes=Y&ano=Z`
  - [ ] `POST /api/v1/financeiro`

**Frontend**
- [ ] Refatorar `apps/profissional/assets/js/pages/FinancasPage.js`
  - [ ] Remover `FinanceiroRepository` com acesso direto
  - [ ] Substituir por `BffApiService.financeiro.*`

**Testes**
- [ ] `tests/financeiro.test.js`
  - [ ] Listar transações com paginação
  - [ ] Gerar resumo mensal
  - [ ] Bloquear acesso de não-owner (403)

### Critério de Done
`FinanceiroRepository.js` sem acesso direto ao Supabase.

---

## FASE 6 — Admin via BFF e Descomissionamento de `src/`
> **Duração estimada:** 5–7 dias | **Risco:** Médio | **Pré-requisito:** Fases 1–5

### Objetivos
Migrar os módulos finais de `src/` (Admin, WebRTC signaling, Media) para a BFF, e descomissionar o `src/` backend.

### Checklist

**Admin BFF**
- [ ] Criar `barberflow-bff-api/middlewares/roleGuard.js`
  - [ ] `requireRole('admin')`, `requireRole('owner')`, `requireRole('professional')`
- [ ] Criar `barberflow-bff-api/routes/admin.js`
  - [ ] `GET  /api/admin/barbearias`
  - [ ] `PATCH /api/admin/barbearias/:id`
  - [ ] `GET  /api/admin/usuarios`
  - [ ] `DELETE /api/admin/usuarios/:id`
- [ ] Refatorar `apps/profissional/assets/js/admin/AdminApiService.js`
  - [ ] Remover chamadas diretas ao `src/`
  - [ ] Substituir por `BffApiService.admin.*`

**Media BFF**
- [ ] Mover `src/services/ImageProcessor.js` para `barberflow-bff-api/infrastructure/media/`
  - [ ] Wrapper com injeção de `sharp` via construtor (testável)
- [ ] Criar endpoint `POST /api/v1/media/presigned` consolidado (logo + avatar + portfolio)
  - [ ] Unificar lógica de `BarbeariaMediaService` e `src/controllers/MediaController`

**WebRTC BFF**
- [ ] Mover `src/infra/TurnConfig.js` para `barberflow-bff-api/infrastructure/`
- [ ] Criar `GET /api/v1/webrtc/turn-config` (retorna credenciais TURN efêmeras)
- [ ] Refatorar `WebRTCPeerService.js` para buscar config TURN via BFF

**Descomissionamento de `src/`**
- [ ] Listar todos os endpoints de `src/app.js`
- [ ] Confirmar que cada endpoint tem equivalente na BFF (ou foi descontinuado)
- [ ] Migrar variáveis de ambiente de `src/` para BFF
- [ ] Remover `src/` do `vercel.json` (ou manter como legacy por 30 dias)
- [ ] Arquivar `src/` em branch `legacy/src-monolith`

**Testes finais**
- [ ] Smoke test de todos os endpoints BFF em staging
- [ ] Confirmar que 0 chamadas ao `src/` são feitas pelo frontend
- [ ] Confirmar que `shared/js/` não tem nenhum import de `SupabaseService` fora de Auth
- [ ] Load test básico (100 req/s por 60s) nos endpoints críticos (fila, barbearias)

### Critério de Done
`src/` removido ou arquivado. `SupabaseService.js` no frontend usado **apenas** para: `signIn`, `signOut`, `getSession`, `onAuthStateChange`. Zero outros acessos diretos ao Supabase no frontend.

---

## FASE 7 — Qualidade e Observabilidade
> **Duração estimada:** Contínuo | **Risco:** Zero | **Pré-requisito:** Fase 6

### Objetivos
Elevar cobertura de testes e adicionar observabilidade para operar com confiança.

### Checklist

**Testes**
- [ ] Cobertura BFF: atingir ≥80% em Services e Repositories
- [ ] Testes de integração com Supabase local (Docker + Supabase CLI)
- [ ] Testes E2E com supertest para todos os bounded contexts
- [ ] `src/` (arquivado) — não precisa de testes

**Observabilidade**
- [ ] Substituir todos os `console.log/warn` por `LoggerService` (Pino) na BFF
- [ ] Adicionar `requestId` header em todos os logs (rastreabilidade)
- [ ] Configurar alertas no Vercel para p95 latency > 2s
- [ ] Configurar alerta para rate limit hits > 100/min
- [ ] Dashboard básico de métricas (Vercel Analytics ou similar)

**Performance**
- [ ] Cache Redis para `GET /api/v1/barbearias/destaque` (TTL 60s)
- [ ] Cache Redis para `GET /api/v1/barbearias/todas` (TTL 60s)
- [ ] Cache Redis para `GET /api/v1/mensalistas/verificar` (TTL 5 min por par)
- [ ] Worker thread para Sharp (evitar bloquear event loop)

**Frontend**
- [ ] Avaliar introdução de bundler (Vite) para tree-shaking e code-splitting
- [ ] Substituir Leaflet CDN por bundle local (resilência offline)
- [ ] Aumentar debounce de `SearchWidget` de 300ms para 500ms

### Critério de Done
Cobertura ≥80% na BFF. Logs estruturados. Cache Redis nos hot paths.

---

## Resumo de Fases

| Fase | Domínio | Duração | Risco | Pré-req |
|------|---------|---------|-------|---------|
| **0** | Índices de banco + JWT config | 1 dia | 🟢 Zero | — |
| **1** | Fila via BFF | 3–5 dias | 🟠 Médio | 0 |
| **2** | Notificações e Push | 2–3 dias | 🟢 Baixo | 1 |
| **3** | Perfil, Social, LGPD | 3–4 dias | 🟢 Baixo | 2 |
| **4** | Comunicação (Chat) | 3–5 dias | 🟠 Médio | 3 |
| **5** | Financeiro | 2–3 dias | 🔴 Alto | 4 |
| **6** | Admin + Media + Descomissionar `src/` | 5–7 dias | 🟠 Médio | 1–5 |
| **7** | Qualidade e Observabilidade | Contínuo | 🟢 Zero | 6 |
| **Total** | | **~20–30 dias úteis** | | |

---

## Decisões que Precisam do Humano

> Estas questões bloqueiam ou alteram o plano. Precisam ser decididas antes da fase correspondente.

| # | Questão | Bloqueia | Opções |
|---|---------|---------|--------|
| **Q1** | O `src/` está em produção hoje? Qual URL ele serve? | Fase 6 | A) Apenas dev-local → pode ser arquivado mais cedo; B) Em produção (`pro.barberflow.live`) → strangler pattern completo necessário |
| **Q2** | WebRTC TURN server: é auto-hospedado ou SaaS (Twilio, Agora)? | Fase 6 | A) Auto-hospedado → `TurnConfig` precisa mover para BFF; B) SaaS → credenciais efêmeras via BFF |
| **Q3** | `FinanceiroRepository` acessa qual tabela exatamente — `transactions` ou `financial_records`? | Fase 5 | Precisa confirmar nome da tabela para criar o Repository correto |
| **Q4** | Chat (`direct_messages`) é apenas P2P ou tem persistência no banco? | Fase 4 | A) Só P2P → sem repository necessário; B) Persiste no banco → precisa do Repository e BFF |
| **Q5** | O módulo de agendamento do `src/` (`AgendamentoService`) tem comportamento diferente do BFF? | Fase 6 | Precisamos ler os dois para confirmar paridade antes de descomissionar |
| **Q6** | Cloudflare R2 está ativo em produção para stories? | Fase 6 | A) Ativo → Media BFF precisa coordenar com R2; B) Não → apenas Supabase Storage |
| **Q7** | Existe budget para adicionar bundler (Vite) ao frontend? | Fase 7 | Alto impacto na DX, mas mudança estrutural que pode quebrar o fluxo atual de `<script>` |
| **Q8** | O `AdminApiService.js` já aponta para BFF ou para `src/`? | Fase 6 | Precisa inspecionar a URL base usada |
