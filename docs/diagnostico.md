# Diagnóstico Técnico — BarberFlow
> Gerado em: 2026-05-21 | Agente: DELIMA | Versão: 1.0

---

## 1. Stack, Runtime, Frameworks e Infraestrutura

### Runtime e Linguagem
| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| **Runtime** | Node.js | >=18.0.0 (CI roda Node 22) |
| **Frontend** | Vanilla JS OOP (sem framework) | ES2022+ (private `#fields`) |
| **Backend BFF** | Express | ^5.2.1 (Vercel serverless) |
| **Backend Monolito** | Express | (versão não especificada) |
| **PWA** | Service Worker Cache API | SW multi-tier (static / shell / images) |

### Banco de Dados
| Componente | Tecnologia | Detalhes |
|-----------|-----------|---------|
| **RDBMS** | PostgreSQL (Supabase hosted) | 89 migrations, PostGIS habilitado |
| **ORM / Query Builder** | Supabase JS SDK (anon) + PostgREST nativo | `@supabase/supabase-js ^2.104.1` |
| **Spatial** | PostGIS `GEOMETRY(Point, 4326)` | RPC `get_barbershops_nearby()` com `ST_DWithin` + índice GIST |
| **Full-Text Search** | `to_tsvector('portuguese', ...)` | Índice GIN, RPC `search_users()` |
| **RLS** | Row Level Security em 16 tabelas | 27 políticas definidas |

### Cache
| Camada | Tecnologia | TTL | Escopo |
|--------|-----------|-----|--------|
| **Memory (BFF)** | Não implementado | — | Sem cache server-side |
| **Rate Limit** | Upstash Redis (REST serverless) | 1–15 min | Contadores de requisição |
| **Memory (frontend)** | `CacheManager` (Map JS) | 5 min padrão | Profiles, barbershops, favoritos |
| **IndexedDB (frontend)** | `MediaCacheService` | 24h imagens / 1h vídeos | ArrayBuffers de mídia |
| **SessionStorage** | `SessionCache` + localStorage | Session lifetime | Usuário logado, contexto ativo |
| **HTTP ETag** | `BaseController.etag()` | 60s `Cache-Control public` | Endpoints BFF de listagem |
| **SW Cache** | Cache Storage API | Indefinido (stale-while-revalidate) | JS, CSS, imagens estáticas |

### Storage e Mídia
| Componente | Tecnologia | Buckets |
|-----------|-----------|---------|
| **Object Storage** | Supabase Storage (S3-compatible) | `avatars`, `barbershops`, `stories`, `portfolio` |
| **CDN de Vídeo** | Cloudflare R2 (quando configurado) | Vídeos grandes (stories) |
| **P2P** | WebRTC DataChannel via `MediaP2P.js` | Upload direto browser→CDN sem servidor |
| **Processamento** | Sharp 0.33.5 | WebP 256x256 (logo), 1280xN (cover), EXIF rotate |

### Filas e Realtime
| Componente | Tecnologia | Uso |
|-----------|-----------|-----|
| **Fila ao Vivo** | Supabase Realtime (`postgres_changes`) | `queue_entries` — escuta UPDATEs de cadeira |
| **Notificações** | Supabase Realtime + Web Push (VAPID) | INSERT em `notifications` + push remoto |
| **Offline Sync** | `OfflineSyncQueue` (localStorage) | Replay de requisições falhas |
| **Background Sync** | Service Worker `bg-sync` | `bf-sync-queue`, `bf-sync-cleanup` |
| **Job Queue** | Não implementado | Sem fila de jobs assíncrona |

### Gateways e Integrações Externas
| Componente | Tecnologia | Detalhe |
|-----------|-----------|---------|
| **Auth** | Supabase Auth (JWT HS256/RS256) | Dual: local `SUPABASE_JWT_SECRET` + fallback rede |
| **Push** | Web Push / VAPID (biblioteca `web-push`) | `PushService.js` no BFF |
| **Maps** | Leaflet 1.9.4 (CDN) | `MapWidget.js` — mapa interativo |
| **Redis** | Upstash REST | Rate limiting distribuído (serverless-compatible) |
| **Deploy** | Vercel (região `gru1` / São Paulo) | Serverless com `maxDuration: 30s` |
| **CI/CD** | GitHub Actions | 4 jobs: validate, lint-sql, test, lint-functions |

---

## 2. Acoplamentos Indevidos entre Camadas

### 2.1 Críticos (violações Hard de Clean Architecture)

**Frontend acessa Supabase diretamente em ~46 arquivos `shared/js/`**
Segundo o princípio "Backend controla regra de negócio; frontend apenas consome dados" (skill-01-base), o frontend não deveria acessar o Supabase SDK diretamente para operações além de autenticação básica.

| Arquivo | Operação | Problema | Camada Correta |
|---------|---------|---------|----------------|
| `QueueRepository.js` | `.update({ status })` | Transição de status de fila no frontend | BFF |
| `NotificationService.js` | `.update({ is_read: true })` | Mutação de dado no cliente | BFF |
| `AppointmentRepository.js` | `.insert()`, `.update()` | Criação/edição de agendamento no frontend | BFF (já existe `/api/agendamentos`) |
| `BarbershopRepository.js` | `.select()` com filtros complexos | Queries de negócio no cliente | BFF |
| `FinanceiroRepository.js` | `.from('financial_records')` | Dados financeiros lidos sem BFF | BFF |
| `LgpdService.js` | `.from('legal_consents').insert()` | Consentimento LGPD sem camada backend | BFF + `src/` |
| `GeoService.js` | `.profiles().select('last_lat, last_lng')` | Fallback direto ao Supabase | Já coberto pelo BFF (`/api/v1/clientes/localizacao`) — remover fallback |
| `ProfileRepository.js` | `.update()` | Mutação de perfil sem BFF | BFF |

**Em `src/` — dois backends paralelos sem separação clara de responsabilidade**

O projeto mantém dois backends distintos (`src/` e `barberflow-bff-api/`) com funcionalidade duplicada:

| Domínio | Em `src/` | Em `barberflow-bff-api/` | Problema |
|---------|----------|--------------------------|---------|
| Auth | `AuthService.js` + `AuthController.js` | `AuthBffService.js` + `AuthController.js` | Lógica duplicada |
| Barbearia | `BarbeariaService.js` + `BarbeariaController.js` | `BarbeariaService.js` + `BarbeariaController.js` | Duplicação total |
| Agendamento | `AgendamentoService.js` | `AgendamentoBffService.js` | Máquinas de estado diferentes? |
| Fila | `FilaService.js` + `FilaController.js` | Não existe | Fila só está em `src/` — frontend acessa Supabase direto |
| Social | `SocialService.js` + `SocialController.js` | Não existe | Sem passagem pela BFF |
| Comunicação | `ComunicacaoService.js` | Não existe | Mensagens sem BFF |
| LGPD | `LgpdService.js` | Não existe | Compliance sem BFF |
| Admin | `AdminService.js` | Não existe | Admin sem BFF |
| WebRTC | `WebRTCController.js` + `TurnConfig.js` | Não existe | TURN/signaling direto em `src/` |

### 2.2 Moderados (violações Soft)

**`MensalistaService` contém query de ownership inline**
```js
// barberflow-bff-api/services/MensalistaService.js
// Usa this.#db.from() para verificar ownership — deveria estar em Repository
```

**Validação inline em controllers**
```js
// BarbeariaController.js: parseCoord(), parseLimit()
// Deveria estar em RequestValidator / BaseValidator
```

**Logs com `console.warn` em vez de logger centralizado (Pino)**
```js
// BarbeariaService.js linha 46: console.warn('[BarbeariaService] ...')
// Todos os services deveriam usar LoggerService
```

**`ApiService.js` é um query builder PostgREST nativo que mistura abstração de transporte com lógica de query**
- Equivalente ao SDK Supabase mas implementado à mão
- Mantido para casos sem SDK, mas cria dois caminhos de acesso ao banco

### 2.3 Estruturais (arquitetura)

**Ordem de carregamento de scripts via `<script>` sequencial no HTML**
```html
<!-- apps/cliente/index.html: 130+ tags <script> em ordem manual -->
<!-- Sem module bundler (webpack/vite) — dependências implícitas pela ordem -->
```
- Risco: uma tag fora de ordem quebra silenciosamente
- Sem tree-shaking — todos os ~112 arquivos JS são sempre carregados

**Fallbacks de RPC no Repository (não no Service)**
```js
// BarbeariaRepository.getNearby(): tenta RPC PostGIS → fallback bbox manual
// MensalistaRepository.listarFavoritosElegiveis(): RPC → UNION manual
// A lógica de resiliência pertence ao Service Layer
```

---

## 3. Funcionalidades por Domínio — Mapa de Localização

### Geolocalização
| Componente | Arquivo | Descrição |
|-----------|---------|---------|
| Captura GPS | `shared/js/GeoService.js:47` | `navigator.geolocation.getCurrentPosition()` + cache 5 min |
| Persistência | `barberflow-bff-api/routes/clientes.js` → `GeoService.js` | `PATCH /api/v1/clientes/localizacao` |
| Busca por raio | `BarbeariaRepository.getNearby()` | PostGIS `ST_DWithin` + fallback bbox |
| Mapa interativo | `shared/js/MapWidget.js` | Leaflet 1.9.4 + `NearbyBarbershopsWidget.js` |
| GPS painel | `apps/profissional/assets/js/pages/GpsPage.js` | Sub-painel com CEP + coordenadas |
| Mapa orientação | `shared/js/MapOrientationModule.js` | Bússola e orientação do mapa |

### Realtime
| Componente | Arquivo | Canal Supabase |
|-----------|---------|----------------|
| Fila ao vivo | `shared/js/QueueRealtimeNotifier.js:42` | `fila-barbershop:{id}` — UPDATEs em `queue_entries` |
| Notificações | `shared/js/NotificationService.js:94` | `notificacoes:{userId}` — INSERTs em `notifications` |
| Status barbearia | `shared/js/BarbeariaStatusSync.js` | `barbershop-status:{id}` |
| Sinalização P2P | `shared/js/WebRTCPeerService.js:30` | `p2p-{mediaId}` — offer/answer/ICE candidate |
| Presença cadeira | `shared/js/CadeiraConfirmacaoService.js` | Realtime confirmação |

### Mídia
| Componente | Arquivo | Fluxo |
|-----------|---------|-------|
| Upload P2P | `shared/js/MediaP2P.js:72` | registrar() → Blob URL → presigned BFF → PUT R2 → confirmar |
| Avatar | `shared/js/AvatarService.js` | BFF POST → Sharp crop 200x200 → Supabase Storage `avatars` |
| Logo/Capa | `barberflow-bff-api/services/BarbeariaMediaService.js` | Sharp WebP → Storage `barbershops` |
| Portfolio | `shared/js/StoriesLayout.js` | Lazy load + IntersectionObserver |
| Stories | `shared/js/StoryViewer.js` | Video `preload="none"` + on-demand |
| Cache mídia | `shared/js/MediaCacheService.js` | IndexedDB TTL 24h / 1h |
| WebRTC stream | `shared/js/WebRTCPeerService.js` | DataChannel 16KB chunks |
| Processamento | `barberflow-bff-api/services/BarbeariaMediaService.js` + `src/services/ImageProcessor.js` | Sharp (BFF) e ImageProcessor (src) — **duplicação** |

### Fila (Queue)
| Componente | Arquivo | Descrição |
|-----------|---------|---------|
| Repositório fila | `shared/js/QueueRepository.js` | CRUD + transições de status |
| Controller fila | `shared/js/FilaController.js` | Orquestração de fila no frontend |
| Realtime | `shared/js/QueueRealtimeNotifier.js` | WebSocket com coalescing |
| Entrada atômica | Migration `20260516000003` | RPC `atomic_sentar_na_cadeira()` — advisory lock |
| Confirmação cliente | `shared/js/QueueConfirmService.js` | client_confirmed: yes/no_waiting/absent/arriving |
| Widget | `apps/profissional/assets/js/pages/QueueWidget.js` | UI de fila ao vivo |
| Backend | `src/services/FilaService.js` + `src/controllers/FilaController.js` | Lógica em `src/` — sem BFF |

### Chat e Mensagens
| Componente | Arquivo | Descrição |
|-----------|---------|---------|
| Service | `shared/js/MessageService.js` | CRUD direct_messages + Realtime |
| Criptografia | `shared/js/MessageCryptoService.js` | E2E encryption |
| Sinalização | `shared/js/MessageSignalingService.js` | Handshake P2P |
| Conexão P2P | `shared/js/P2PMessageConnectionService.js` | DataChannel texto |
| Widget | `shared/js/MessagesWidget.js` | UI de chat |
| Backend | `src/services/ComunicacaoService.js` + `src/controllers/ComunicacaoController.js` | Mensagens em `src/` — sem BFF |

### Notificações
| Componente | Arquivo | Descrição |
|-----------|---------|---------|
| Service | `shared/js/NotificationService.js` | Toast, badge, Realtime, localStorage |
| Push subscription | `shared/js/PushSubscriptionService.js` | VAPID public key, endpoint |
| Push backend | `barberflow-bff-api/services/PushService.js` | `web-push` VAPID send |
| Service Worker | `apps/*/sw.js` | `self.addEventListener('push', ...)` |
| Deep link | `apps/profissional/assets/js/AppBootstrap.js:118` | `?push_barbershop=X&push_entrada=Y` |

### Agendamento
| Componente | Arquivo | Descrição |
|-----------|---------|---------|
| Repositório | `shared/js/AppointmentRepository.js` | CRUD `appointments` direto Supabase |
| Máquina de estados | `barberflow-bff-api/services/AgendamentoBffService.js` | pending→confirmed→in_progress→done/no_show |
| RPC atômica | `AgendamentoRepository.criarAtomico()` | `criar_agendamento_atomico` com advisory lock |
| Backend | `src/services/AgendamentoService.js` + `src/controllers/AgendamentoController.js` | Paralelo ao BFF |
| UI | `apps/profissional/assets/js/pages/AgendaPage.js` | Agenda profissional |

---

## 4. Riscos de Escala

### 4.1 N+1 e Queries

| Risco | Arquivo | Severidade | Detalhe |
|-------|---------|-----------|---------|
| **FK sem índice: `appointments.client_id`** | Migration inicial | 🔴 Alto | `SELECT WHERE client_id = $1` faz table scan em agendamentos |
| **FK sem índice: `queue_entries.client_id`** | Migration inicial | 🔴 Alto | Fila Realtime pode ter múltiplas entradas por cliente |
| **FK sem índice: `transactions.professional_id`** | Migration inicial | 🟠 Médio | Extrato do barbeiro sem índice específico |
| **Sem índice composto em `rating_score, rating_avg`** | — | 🟡 Baixo | `ORDER BY rating_score DESC, rating_avg DESC` faz 2 sorts |
| **`SearchWidget` debounce apenas 300ms** | `shared/js/SearchWidget.js` | 🟡 Baixo | Cada keypress = RPC `search_users()` — aumentar para 500ms |

### 4.2 Ausência de Cache Server-Side

| Hot Path | Frequência | Solução |
|----------|-----------|---------|
| `GET /api/v1/barbearias?lat=X&lng=Y` (busca próximas) | Alta — toda abertura de app | Cache Redis 60s por (lat,lng,raio) hash |
| `GET /api/v1/barbearias/destaque` | Alta — toda abertura | ETag existe, mas sem Redis — regenera na cada miss |
| `GET /api/v1/barbearias/todas` | Média | ETag existe, mas sem Redis |
| Fila ao vivo (snapshot inicial) | Alta — a cada barbeiro que abre o app | Cache Redis 5s da fila (Realtime atualiza, snapshot cacheada) |
| Verificação de mensalista | Alta — a cada entrada na fila | Cache Redis 5 min por (barbershop_id, client_id) |

### 4.3 Chamadas Síncronas a Serviços Externos

| Chamada | Arquivo | Risco | Mitigação Atual |
|---------|---------|-------|-----------------|
| Supabase Auth (verificar JWT) | `AuthMiddleware.js` | Latência 50-200ms por request quando sem `JWT_SECRET` | Fallback local + cache TTL 5min |
| Sharp (processamento imagem) | `BarbeariaMediaService.js` | Bloqueia event loop em tarefas CPU-bound | Síncrono no processo — sem worker thread |
| Web Push (`web-push` lib) | `PushService.js` | Push pode demorar / falhar | Sem retry queue — falha silenciosa |
| `GeoService` fallback Supabase | `GeoService.js:120` | 2 requests extras (localStorage → BFF → Supabase) | Cache 5 min alivia |
| Leaflet CDN | `index.html` | Falha de CDN derruba mapas | Sem fallback local |

### 4.4 Limites Arquiteturais Serverless

| Limite | Valor Atual | Risco |
|--------|------------|-------|
| Vercel `maxDuration` | 30s | Upload de vídeo (stories > 50MB) vai timeout |
| Body parser JSON | 50KB | JSON com metadata de múltiplas imagens pode exceder |
| Rate limit escrita | 60 req/min | Bulk operations (importar serviços) vão ser throttled |
| Sharp no serverless | `@0.33.5` | Imagem nativa — funciona mas aumenta tamanho do bundle cold start |
| Sem job queue assíncrona | — | Push, replicação P2P, processamento de imagem rodam inline |

### 4.5 Frontend sem Module Bundler

| Problema | Impacto |
|---------|---------|
| 130+ `<script>` em ordem manual | Sem tree-shaking — todo o JS carregado em toda tela |
| Sem code-splitting | First load carrega código de telas nunca visitadas |
| Dependências implícitas por ordem | Breaking change silencioso se uma tag mudar de posição |
| Sem TypeScript / JSDoc enforced | Contratos de API implícitos |

---

## 5. Lacunas de Testes e Cobertura

### BFF (`barberflow-bff-api/tests/`) — 17 arquivos de teste

| Arquivo | Cobertura | Gaps |
|---------|----------|------|
| `app.test.js` | Inicialização + 404 | ✓ Cobre |
| `auth.test.js` | Login, refresh, logout, me | ✓ Cobre fluxo feliz; falta: token expirado, conta bloqueada |
| `agendamentos.test.js` | CRUD | ✓ Cobre; falta: conflito de horário, race condition |
| `barbearia.test.js` | Listagens + update | ✓ Cobre; falta: fallback sem PostGIS |
| `barbearia-service.test.js` | Service layer | ✓ Cobre |
| `barbearia-repository.test.js` | Repository | ✓ Cobre |
| `geo.test.js` | GPS save/load | ✓ Cobre; falta: TTL expirado, coords inválidas |
| `health.test.js` | Health endpoint | ✓ Cobre |
| `cors*.test.js` | CORS origins | ✓ Cobre incluindo extras |
| `middlewares.test.js` | Auth + rate limit | ✓ Cobre; falta: HS256 vs RS256 fallback |
| `mensalistas*.test.js` | CRUD + favoritos | ✓ Cobre; falta: ownership inválido, RPC ausente (fallback) |
| `push-barbeiro.test.js` | Push notifications | ✓ Existe; cobertura desconhecida |
| `server-export.test.js` | Export serverless | ✓ Cobre |
| `base-repository.test.js` | BaseRepository | ✓ Cobre |
| `cliente-bff.test.js` | Cliente namespace | ✓ Cobre health |

**Gaps críticos no BFF:**
- ❌ Sem teste de integração end-to-end (real Supabase)
- ❌ Sem teste de `BarbeariaMediaService` (Sharp processamento)
- ❌ Sem teste de `PushService` com mock VAPID
- ❌ Sem teste de rate limit com Redis real
- ❌ Sem teste de timeout (30s)
- ❌ `MensalistaService.listarFavoritosModal` sem teste dedicado

### Backend `src/` — Cobertura desconhecida

- **Pasta `tests/` não encontrada em `src/`** — provável ausência total de testes
- Controllers, Services e Repositories em `src/` sem cobertura visível
- `FilaService`, `ComunicacaoService`, `SocialService`, `LgpdService`, `AdminService` — sem testes

### Frontend `apps/*/` — Sem testes

- Nenhuma pasta de testes em `apps/cliente/` ou `apps/profissional/`
- Pages, Widgets, Services compartilhados sem testes unitários
- Testabilidade prejudicada pelo acesso direto ao Supabase (sem injeção de dependência)
- `QueueRepository`, `NotificationService`, `GeoService` — zero cobertura

### Cobertura Estimada Global

| Área | Cobertura Estimada |
|------|-------------------|
| BFF — Controllers | ~60% (caminhos felizes) |
| BFF — Services | ~40% (fluxos principais) |
| BFF — Repositories | ~30% (queries básicas) |
| BFF — Middlewares | ~70% (CORS, auth, rate limit) |
| src/ — todos | ~5% (sem estrutura de testes) |
| Frontend shared/ | 0% |
| Frontend pages/ | 0% |

---

## 6. Sumário de Débitos Técnicos

| Prioridade | Débito | Impacto |
|-----------|--------|---------|
| 🔴 P0 | Frontend acessa Supabase diretamente em ~46 arquivos | Regra de negócio no cliente, RLS contornável |
| 🔴 P0 | Dois backends paralelos (`src/` e BFF) sem separação clara | Duplicação, inconsistência de comportamento |
| 🔴 P0 | Fila e Chat sem passagem pela BFF | Sem rate limit, sem validação server-side |
| 🔴 P0 | FK `appointments.client_id` e `queue_entries.client_id` sem índice | N+1 em produção |
| 🟠 P1 | Sharp rodando síncrono inline no request | CPU-bound bloqueia event loop |
| 🟠 P1 | `src/` sem cobertura de testes | Deploy às cegas |
| 🟠 P1 | Push notifications sem retry queue | Mensagens perdidas silenciosamente |
| 🟠 P1 | 130+ `<script>` sem bundler | Performance de carregamento e manutenção |
| 🟡 P2 | Fallbacks de resiliência em Repository (devem estar no Service) | SRP violado |
| 🟡 P2 | Logs com `console.log` em vez de Pino | Sem structured logging em produção |
| 🟡 P2 | `SUPABASE_JWT_SECRET` opcional gera latência extra | 50-200ms por request |
| 🟡 P2 | Leaflet via CDN sem fallback | Mapas quebram com CDN offline |
| 🟢 P3 | Sem TypeScript | Contratos implícitos |
| 🟢 P3 | Sem índice composto em `rating_score, rating_avg` | Lentidão em grandes datasets |
