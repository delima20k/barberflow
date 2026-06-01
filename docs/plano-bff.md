# Plano de Migração — Arquitetura BFF Canônica
> Agente: DELIMA | Estratégia: Strangler Pattern | Princípio: zero quebra de produção

---

## Visão Geral

O BarberFlow possui dois backends paralelos (`src/` e `barberflow-bff-api/`) e ~46 arquivos de frontend que acessam Supabase diretamente. O objetivo é consolidar tudo em uma **BFF Canônica única** que atua como único ponto de entrada para os dois apps, enquanto o `src/` é migrado gradualmente para domínios puros.

**Estratégia:** Strangler Pattern — cada domínio novo é implementado na BFF. O `src/` vai sendo esvaziado conforme os domínios migram. O frontend para de acessar Supabase diretamente conforme os endpoints BFF ficam prontos.

---

## 1. Estrutura de Pastas Alvo

```
barberflow/
│
├── barberflow-bff-api/           ← BFF Canônica (único ponto de entrada frontend)
│   ├── api/
│   │   └── index.js              ← Vercel serverless entry
│   ├── app.js                    ← Factory: criarApp(db)
│   ├── server.js                 ← Local / Docker
│   │
│   ├── config/                   ← Configuração por ambiente
│   │   └── environments/
│   │       ├── development.js
│   │       ├── staging.js
│   │       └── production.js
│   │
│   ├── domain/                   ← ★ NOVA — Entidades e regras de negócio puras
│   │   ├── agendamento/
│   │   │   ├── Agendamento.js    ← Entidade com validações e invariantes
│   │   │   └── AgendamentoStatus.js  ← Máquina de estados
│   │   ├── fila/
│   │   │   ├── FilaEntrada.js
│   │   │   └── FilaStatus.js
│   │   ├── barbearia/
│   │   │   └── Barbearia.js
│   │   ├── mensalista/
│   │   │   └── Mensalista.js
│   │   ├── notificacao/
│   │   │   └── Notificacao.js
│   │   └── usuario/
│   │       └── Perfil.js
│   │
│   ├── application/              ← ★ NOVA — Casos de uso (orquestração)
│   │   ├── agendamento/
│   │   │   ├── CriarAgendamentoUseCase.js
│   │   │   ├── AtualizarStatusAgendamentoUseCase.js
│   │   │   └── ListarAgendamentosUseCase.js
│   │   ├── fila/
│   │   │   ├── EntrarNaFilaUseCase.js
│   │   │   ├── AtualizarStatusFilaUseCase.js
│   │   │   └── ConfirmarPresencaUseCase.js
│   │   ├── barbearia/
│   │   │   ├── BuscarBarbeariasProximasUseCase.js
│   │   │   └── SalvarImagemBarbeariaUseCase.js
│   │   ├── notificacao/
│   │   │   └── EnviarPushUseCase.js
│   │   └── mensalista/
│   │       └── GerenciarMensalistasUseCase.js
│   │
│   ├── infrastructure/           ← Implementações de repositórios (Supabase)
│   │   ├── supabase/
│   │   │   └── SupabaseClient.js ← Singleton service_role
│   │   ├── repositories/         ← Renomear pasta atual
│   │   │   ├── BaseRepository.js
│   │   │   ├── AgendamentoRepository.js
│   │   │   ├── BarbeariaRepository.js
│   │   │   ├── FilaRepository.js        ← NOVO (migrar de src/)
│   │   │   ├── FilaRepository.js
│   │   │   ├── GeoRepository.js
│   │   │   ├── MensalistaRepository.js
│   │   │   ├── NotificacaoRepository.js ← NOVO
│   │   │   ├── ComunicacaoRepository.js ← NOVO (migrar de src/)
│   │   │   ├── SocialRepository.js      ← NOVO (migrar de src/)
│   │   │   ├── LgpdRepository.js        ← NOVO (migrar de src/)
│   │   │   ├── PerfilRepository.js      ← NOVO (migrar de src/)
│   │   │   └── AuthRepository.js
│   │   ├── storage/
│   │   │   └── SupabaseStorageClient.js ← Mover de src/infra/
│   │   ├── media/
│   │   │   ├── BarbeariaMediaService.js ← Já existe
│   │   │   └── ImageProcessor.js        ← NOVO (migrar de src/services/)
│   │   └── push/
│   │       └── PushClient.js            ← Extrair de PushService
│   │
│   ├── interfaces/               ← HTTP layer (Controllers + Routes)
│   │   ├── http/
│   │   │   ├── controllers/      ← Renomear pasta atual
│   │   │   │   ├── BaseController.js
│   │   │   │   ├── AuthController.js
│   │   │   │   ├── AgendamentoController.js
│   │   │   │   ├── BarbeariaController.js
│   │   │   │   ├── FilaController.js        ← NOVO
│   │   │   │   ├── GeoController.js
│   │   │   │   ├── MensalistaController.js
│   │   │   │   ├── NotificacaoController.js ← NOVO
│   │   │   │   ├── ComunicacaoController.js ← NOVO
│   │   │   │   ├── SocialController.js      ← NOVO
│   │   │   │   ├── LgpdController.js        ← NOVO
│   │   │   │   ├── MediaController.js       ← NOVO (migrar de src/)
│   │   │   │   ├── AdminController.js       ← NOVO (migrar de src/)
│   │   │   │   └── HealthController.js
│   │   │   └── routes/           ← Renomear pasta atual
│   │   │       ├── auth.js
│   │   │       ├── agendamentos.js
│   │   │       ├── barbearias.js
│   │   │       ├── clientes.js
│   │   │       ├── fila.js         ← NOVO
│   │   │       ├── mensalistas.js
│   │   │       ├── notificacoes.js ← NOVO
│   │   │       ├── comunicacao.js  ← NOVO
│   │   │       ├── social.js       ← NOVO
│   │   │       ├── lgpd.js         ← NOVO
│   │   │       ├── media.js        ← NOVO
│   │   │       ├── admin.js        ← NOVO
│   │   │       └── health.js
│   │   └── websocket/            ← ★ NOVO (WebRTC signaling desacoplado)
│   │       └── P2PSignalingServer.js
│   │
│   ├── middlewares/              ← Já existe
│   │   ├── auth.js
│   │   ├── cors.js
│   │   ├── errorHandler.js
│   │   ├── logger.js
│   │   ├── rateLimiter.js
│   │   ├── timeout.js
│   │   ├── roleGuard.js          ← NOVO (admin, owner, professional)
│   │   └── validateBody.js       ← NOVO (extrair parseCoord, parseLimit)
│   │
│   ├── services/                 ← Regras de negócio (camada application)
│   │   ├── BaseService.js
│   │   ├── AuthBffService.js
│   │   ├── AgendamentoBffService.js
│   │   ├── BarbeariaService.js
│   │   ├── BarbeariaMediaService.js
│   │   ├── FilaBffService.js     ← NOVO
│   │   ├── GeoService.js
│   │   ├── MensalistaService.js
│   │   ├── NotificacaoBffService.js ← NOVO
│   │   ├── ComunicacaoBffService.js ← NOVO
│   │   ├── SocialBffService.js   ← NOVO
│   │   ├── LgpdBffService.js     ← NOVO
│   │   ├── PushService.js        ← Mover lógica de push para cá
│   │   └── AdminBffService.js    ← NOVO
│   │
│   ├── utils/                    ← Já existe
│   │   ├── AppError.js
│   │   ├── ApiResponse.js
│   │   ├── RetryHelper.js
│   │   └── SupabaseClient.js
│   │
│   ├── validators/               ← Expandir
│   │   ├── BaseValidator.js
│   │   ├── AgendamentoValidator.js ← NOVO
│   │   ├── FilaValidator.js        ← NOVO
│   │   └── RequestValidator.js     ← NOVO (extrair parseCoord, parseLimit)
│   │
│   └── tests/                    ← Expandir suite
│       ├── unit/                 ← Testes unitários (domínio puro)
│       ├── integration/          ← Testes de integração (repository + DB)
│       └── e2e/                  ← Testes end-to-end (HTTP)
│
├── src/                          ← Backend legado — esvaziado fase por fase
│   └── (mantido como fallback durante migração)
│
├── apps/
│   ├── cliente/
│   └── profissional/
│
└── shared/                       ← Código compartilhado entre os dois apps
    ├── js/
    │   ├── BffApiService.js      ← Único ponto de acesso à BFF (expandir namespaces)
    │   ├── SupabaseService.js    ← Manter apenas para Auth (signIn/signOut/getSession)
    │   └── (remover acesso direto Supabase dos repositories compartilhados)
    └── css/
```

---

## 2. Bounded Contexts e Contratos Públicos do BFF

### Bounded Contexts

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BFF Canônica — Bounded Contexts                   │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│   IDENTITY   │   DISCOVERY  │    QUEUE     │    SCHEDULING         │
│              │              │              │                        │
│ /api/auth    │ /api/v1/     │ /api/v1/     │ /api/agendamentos      │
│ /api/v1/     │ barbearias   │ fila         │                        │
│ perfis       │ /api/v1/     │              │                        │
│              │ busca        │              │                        │
├──────────────┼──────────────┼──────────────┼───────────────────────┤
│    MEDIA     │    SOCIAL    │    COMMS     │    ADMIN               │
│              │              │              │                        │
│ /api/v1/     │ /api/v1/     │ /api/v1/     │ /api/admin             │
│ media        │ social       │ comunicacao  │                        │
│              │              │ /api/v1/     │                        │
│              │              │ push         │                        │
├──────────────┼──────────────┼──────────────┼───────────────────────┤
│  GEO/MAPS    │  MENSALISTAS │  LGPD        │    FINANCEIRO          │
│              │              │              │                        │
│ /api/v1/     │ /api/v1/     │ /api/v1/     │ /api/v1/               │
│ clientes/    │ mensalistas  │ lgpd         │ financeiro             │
│ localizacao  │              │              │                        │
└──────────────┴──────────────┴──────────────┴───────────────────────┘
```

### Contratos Públicos (contrato = interface HTTP estável)

```
IDENTITY
  POST   /api/auth/login             { email, password } → { access_token, refresh_token, profile }
  POST   /api/auth/refresh            { refresh_token } → { access_token }
  POST   /api/auth/logout
  GET    /api/auth/me                 → { id, email, role, profile }
  PATCH  /api/v1/perfis/meu          { full_name, phone, avatar_path } → { updated }

DISCOVERY
  GET    /api/v1/barbearias           ?lat=X&lng=Y&raio=5 → [Barbearia]
  GET    /api/v1/barbearias/destaque  ?limit=6 → [Barbearia]
  GET    /api/v1/barbearias/todas     ?limit=60 → [Barbearia]
  GET    /api/v1/barbearias/:id       → Barbearia
  GET    /api/v1/busca                ?q=termo → { barbearias, barbeiros }

QUEUE
  GET    /api/v1/fila                 ?barbershop_id=X → [FilaEntrada]
  POST   /api/v1/fila                 { barbershop_id, professional_id, service_id } → FilaEntrada
  PATCH  /api/v1/fila/:id/status      { status: 'in_service'|'done'|'absent' }
  PATCH  /api/v1/fila/:id/confirmacao { confirmed: 'yes'|'arriving'|'no_waiting' }
  DELETE /api/v1/fila/:id

SCHEDULING
  GET    /api/agendamentos            ?cursor=X&limit=20 → [Agendamento]
  POST   /api/agendamentos            { professional_id, service_id, scheduled_at }
  PATCH  /api/agendamentos/:id        { status }
  DELETE /api/agendamentos/:id

GEO
  GET    /api/v1/clientes/localizacao → { lat, lng }
  PATCH  /api/v1/clientes/localizacao { lat, lng }

MENSALISTAS
  GET    /api/v1/mensalistas          ?barbershop_id=X → [Mensalista]
  POST   /api/v1/mensalistas          { barbershop_id, client_id }
  DELETE /api/v1/mensalistas/:id
  GET    /api/v1/mensalistas/verificar?barbershop_id=X&client_id=Y
  GET    /api/v1/mensalistas/clientes-disponiveis?barbershop_id=X&q=nome
  GET    /api/v1/mensalistas/favoritos-elegiveis?barbershop_id=X
  GET    /api/v1/mensalistas/favoritos-modal?barbershop_id=X&professional_id=Y

MEDIA
  PATCH  /api/v1/barbearias/minha/imagem?tipo=logo|cover  (binary)
  POST   /api/v1/media/presigned       { contexto, nome } → { url, fields }
  POST   /api/v1/media/confirmar       { mediaId, path, mime, tamanho }

SOCIAL
  POST   /api/v1/social/curtir         { target_type, target_id }
  DELETE /api/v1/social/curtir/:id
  POST   /api/v1/social/favoritar      { barbershop_id }
  DELETE /api/v1/social/favoritar/:id

COMMS / PUSH
  POST   /api/v1/push/subscription     { endpoint, keys, barbershop_id }
  DELETE /api/v1/push/subscription
  POST   /api/v1/push/barbeiro         { barbershop_id, entrada_id }

LGPD
  POST   /api/v1/lgpd/consentimento    { version }
  POST   /api/v1/lgpd/exclusao         { motivo }
  GET    /api/v1/lgpd/meus-dados       → { perfil, agendamentos, interacoes }

ADMIN (autenticado como admin)
  GET    /api/admin/barbearias
  PATCH  /api/admin/barbearias/:id
  GET    /api/admin/usuarios
  DELETE /api/admin/usuarios/:id
```

---

## 3. Módulos — Serviços de Domínio Puro vs. Atrás do BFF

### Fica atrás do BFF (interfaces HTTP)
Qualquer coisa que receba request HTTP, valide autenticação, faça rate limit, ou retorne response.

| Módulo | Endpoints | Auth Necessária |
|--------|---------|----------------|
| Auth | /api/auth/* | Pública (login/refresh) + Privada (me/logout) |
| Discovery | /api/v1/barbearias/* | Pública (listagens) |
| Queue | /api/v1/fila/* | Privada (todas) |
| Scheduling | /api/agendamentos/* | Privada (todas) |
| Geo | /api/v1/clientes/localizacao | Privada |
| Mensalistas | /api/v1/mensalistas/* | Privada (exceto verificar) |
| Media | /api/v1/media/* | Privada |
| Social | /api/v1/social/* | Privada |
| Push/Comms | /api/v1/push/* | Privada |
| LGPD | /api/v1/lgpd/* | Privada |
| Admin | /api/admin/* | Privada + Role admin |
| Financeiro | /api/v1/financeiro/* | Privada + Role owner/professional |

### Vira serviço de domínio puro (sem HTTP)
Classes que encapsulam apenas regras de negócio, sem depender de Express.

| Domínio | Classe | Responsabilidade |
|---------|--------|-----------------|
| Agendamento | `AgendamentoStatus` | Máquina de estados (pending→done) — puro JS, sem deps |
| Fila | `FilaStatus` | Máquina de estados da fila — puro JS |
| Imagem | `ImageProcessor` | Sharp: crop, resize, webp — injeta `sharp` via construtor |
| Criptografia | `EncryptionService` | AES-256-GCM — sem deps HTTP |
| Hash | `HashService` | bcrypt / SHA-256 — sem deps HTTP |
| Chunks | `ChunkService` | Split de buffers — puro JS |
| Validação | `InputValidator` | Sanitização de entrada — puro JS |
| Push | `PushClient` | Wrapper `web-push` — injeta dependência |

### Permanece em `shared/js/` (frontend)
Classes que vivem no browser e não migram para o backend.

| Classe | Justificativa |
|--------|-------------|
| `BffApiService` | Único cliente HTTP — expandir namespaces |
| `SupabaseService` | Apenas para Auth (signIn, signOut, getSession, onAuthStateChange) |
| `GeoService` | `navigator.geolocation` — só existe no browser |
| `MediaP2P` | WebRTC — só existe no browser |
| `WebRTCPeerService` | DataChannel — só existe no browser |
| `NotificationService` | Toast + badge + `Notification.requestPermission()` — browser |
| `Router` / `NavigationViewService` | DOM — browser |
| `CacheManager` / `MediaCacheService` | IndexedDB — browser |
| `ServiceWorker` | sw.js — browser |

### Deve SAIR de `shared/js/` (migrar para BFF)
Classes que estão no frontend mas contêm regra de negócio ou acesso ao banco.

| Classe | Problema | Migração |
|--------|---------|---------|
| `QueueRepository` | Mutações de fila sem BFF | `POST/PATCH /api/v1/fila` |
| `AppointmentRepository` | CRUD de agendamentos sem BFF | Já existe `/api/agendamentos` — usar BffApiService |
| `ProfileRepository` | Mutação de perfil sem BFF | `PATCH /api/v1/perfis/meu` |
| `BarbershopRepository` (queries complexas) | Queries de negócio no cliente | Coberto por `/api/v1/barbearias` |
| `FinanceiroRepository` | Dados financeiros sem BFF | `GET /api/v1/financeiro` |
| `LgpdService` | Compliance sem backend | `POST /api/v1/lgpd/*` |
| `CommunicacaoRepository` (frontend) | Mensagens sem BFF | `GET/POST /api/v1/comunicacao` |
| `SocialRepository` (mutations) | Social sem BFF | `POST /api/v1/social/*` |
| `MessageService` (mutations) | Chat sem BFF | Coordenar via BFF antes de P2P |
| `NotificationService.update()` | Marcar notif lida sem BFF | `PATCH /api/v1/notificacoes/:id/lida` |

---

## 4. Estratégia Incremental — Strangler Pattern

### Princípio do Strangler

```
      ┌────────────────────────────────────────────────┐
      │               Frontend (PWA)                    │
      └────────────────────┬───────────────────────────┘
                           │
                    BffApiService.js
                    (único ponto de saída)
                           │
            ┌──────────────▼──────────────┐
            │         BFF Canônica        │
            │   (novo endpoint ativo)     │
            └──────────────┬──────────────┘
                           │
            ┌──────────────▼──────────────┐
            │       src/ (legado)         │  ← vai sendo esvaziado
            │   (endpoint antigo ativo)   │
            └─────────────────────────────┘
```

**Regra do Strangler:**
1. Novo endpoint é criado na BFF.
2. Frontend passa a chamar a BFF.
3. `src/` retém o endpoint até que a BFF esteja validada em produção.
4. Após N dias sem erros, o endpoint é removido do `src/`.
5. `src/` só é descomissionado quando todos os domínios migrarem.

### Anti-padrões a evitar
- ❌ NÃO migrar BFF e frontend ao mesmo tempo — um por vez
- ❌ NÃO remover `src/` antes de ter 100% dos domínios na BFF
- ❌ NÃO mudar contratos de API durante migração (apenas adicionar)
- ❌ NÃO criar endpoints duplicados com comportamento diferente
- ❌ NÃO mover código sem testes cobrindo o novo caminho

---

## 5. Princípios de Implementação

### SOLID aplicado à BFF Canônica

| Princípio | Aplicação |
|-----------|---------|
| **SRP** | Controller recebe request → Service orquestra → Repository acessa banco. Nada mais. |
| **OCP** | Novos bounded contexts adicionam novas rotas/services sem modificar os existentes. |
| **LSP** | `FilaRepository extends BaseRepository` — substitui corretamente em testes com mock. |
| **ISP** | `BffApiService` no frontend tem namespaces (`barbearias`, `fila`, `mensalistas`) — cliente usa só o que precisa. |
| **DIP** | Services recebem repositories por injeção (`constructor(repo)`) — testáveis com stubs. |

### Dependency Direction

```
interfaces/ (Controllers, Routes)
    ↓ depende de
services/ (regras de negócio)
    ↓ depende de
domain/ (entidades puras)
    ↓ depende de
(nada — domínio puro)

infrastructure/ (Repositories, Storage)
    ↓ implementa interfaces definidas em
domain/ (contratos de repositório)
```

### Testabilidade

- Toda classe recebe dependências pelo construtor (DI manual — sem framework)
- Repositories têm interfaces implícitas — mockáveis em testes
- Services não conhecem Express — recebem dados puros, retornam dados puros
- Domain entities são funções puras — testáveis sem I/O
