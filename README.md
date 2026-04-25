# BarberFlow

Sistema de barbearia com agendamento, fila ao vivo, portfólio e stories.  
Dois PWAs independentes (cliente e profissional), arquitetura em camadas DDD, servidor Node.js local e banco PostgreSQL gerenciado pelo Supabase.

---

## Visão geral da arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                     FRONTEND (Browser / TWA)                  │
│                                                               │
│  apps/cliente/          apps/profissional/                    │
│  ├─ Router (SPA)        ├─ Router (SPA)                       │
│  ├─ Pages / Widgets     ├─ Pages / Widgets                    │
│  └─ Controllers         └─ Controllers                        │
│                                                               │
│         shared/js/ — camada de serviços e repositórios        │
│  ┌─────────────────────────────────────────────────┐          │
│  │  ApiService (infra)   ← CRUD via PostgREST REST  │          │
│  │  SupabaseService (infra) ← Auth / Realtime / Storage │     │
│  │  *Repository (infra)  ← acesso a dados por domínio   │     │
│  │  *Service (application) ← regras de negócio          │     │
│  │  Entidades domain: Barbearia, Profissional, Servico… │     │
│  └─────────────────────────────────────────────────┘          │
└──────────────────────────────────────────────────────────────┘
                              │  fetch (HTTPS)
                              ▼
┌──────────────────────────────────────────────────────────────┐
│                  SUPABASE CLOUD / LOCAL                        │
│  PostgreSQL (PostgREST REST API)  ← ApiService               │
│  Auth (JWT + refresh tokens)      ← SupabaseService           │
│  Storage (avatares, mídias)       ← SupabaseService           │
│  Realtime (fila ao vivo)          ← SupabaseService           │
│  Edge Functions (Deno)            ← chamadas diretas           │
└──────────────────────────────────────────────────────────────┘

Ambiente de desenvolvimento:
  node server.js  →  http://localhost:3000  (serve arquivos estáticos)
  supabase start  →  stack local via Docker (PostgreSQL, Auth, Studio)
```

---

## Estrutura do projeto

```
barberflow/
├── apps/
│   ├── cliente/                ← PWA app cliente (TWA APK)
│   │   ├── index.html
│   │   ├── manifest.json
│   │   ├── sw.js               ← Service Worker (cache v107+)
│   │   ├── vercel.json
│   │   └── assets/
│   │       └── js/             ← classes do app cliente (Router, Pages, Controllers)
│   └── profissional/           ← PWA app profissional (TWA APK)
│       ├── index.html
│       ├── manifest.json
│       ├── sw.js               ← Service Worker (cache v90+)
│       ├── vercel.json
│       └── assets/
│           └── js/             ← classes do app profissional
├── shared/
│   ├── css/                    ← Design system compartilhado (tokens, components)
│   ├── js/                     ← Camadas domain / application / infra / interfaces
│   │   ├── ApiService.js       ← Query builder + cliente HTTP PostgREST (infra)
│   │   ├── SupabaseService.js  ← Auth, Realtime, Storage via SDK (infra)
│   │   ├── AppState.js         ← Estado global compartilhado (infra)
│   │   ├── Router.js           ← SPA base com animações padronizadas (infra)
│   │   ├── InputValidator.js   ← Validação e sanitização centralizada (infra)
│   │   ├── Barbearia.js        ← Entidade de domínio (domain)
│   │   ├── Profissional.js     ← Entidade de domínio (domain)
│   │   ├── Servico.js          ← Entidade de domínio (domain)
│   │   ├── Agendamento.js      ← Entidade de domínio (domain)
│   │   ├── Cliente.js          ← Entidade de domínio (domain)
│   │   ├── *Repository.js      ← Acesso a dados por domínio (infra)
│   │   ├── *Service.js         ← Regras de negócio (application)
│   │   └── ...
│   ├── fonts/
│   └── img/
├── supabase/
│   ├── config.toml             ← Configuração local do Supabase CLI
│   ├── migrations/             ← SQL versionado (aplicar em ordem)
│   ├── seeds/                  ← Dados de desenvolvimento
│   └── functions/              ← Edge Functions Deno/TypeScript
├── tests/                      ← Testes automatizados (node:test + node:assert)
│   ├── _helpers.js             ← fn() spy + carregar() sandbox VM
│   ├── architecture.test.js
│   ├── domain.test.js
│   ├── entities.test.js
│   └── *.test.js
├── .github/
│   └── workflows/              ← CI/CD automático
├── CLASS_REGISTRY.md           ← Catálogo de todas as classes com camada DDD
├── .env.example
├── .gitignore
├── server.js                   ← Servidor Node.js de desenvolvimento (zero deps)
├── vercel.json                 ← Configuração de deploy (Vercel)
└── README.md
```

---

## Backend — Node.js (`server.js`)

O `server.js` é o servidor de desenvolvimento local. Escrito em Node.js puro (zero dependências externas), serve todos os arquivos estáticos com segurança OWASP e rate limiting por IP.

### Arquitetura em camadas

O servidor foi refatorado em quatro classes com responsabilidade única:

| Classe | Responsabilidade |
|---|---|
| `RateLimiter` | Controla requisições por IP (2.000 req/min). Assets estáticos (`.js`, `.css`, `.svg`…) são isentos. Limpeza periódica evita leak de memória. |
| `SecurityMiddleware` | Aplica headers de segurança OWASP (CSP, HSTS, X-Frame-Options…), valida MIME types e impede path traversal (acesso fora da raiz do projeto). |
| `StaticFileHandler` | Normaliza URLs, resolve `index.html` em rotas SPA e lê arquivos com MIME type e cache-control corretos. |
| `DevServer` | Ponto de entrada (`DevServer.iniciar()`). Orquestra os três middlewares, define a porta (`3000`) e exibe o banner de inicialização. |

### Responsabilidades que **não** são do servidor Node.js

Em produção, `server.js` é substituído pela Vercel (configurada em `vercel.json`). A lógica de dados, autenticação e regras de negócio vivem inteiramente nas camadas `shared/js/` e no Supabase — o servidor não faz proxy nem detém nenhum estado da aplicação.

### Rodar o servidor local

```bash
node server.js
# → http://localhost:3000
```

---

## Frontend

### Organização

Dois PWAs completamente independentes, cada um com seu próprio `index.html`, `manifest.json`, `sw.js` e pasta `assets/js/`. Ambos compartilham o mesmo design system e a mesma camada de dados via `shared/`.

```
apps/cliente/assets/js/
├── app.js                    ← BarberFlowCliente extends Router
├── AppBootstrap.js           ← inicialização (auth, SW, splash)
├── ClienteController.js      ← binding de formulários (interfaces)
├── ClienteRepository.js      ← dados do cliente (infra)
├── ClienteService.js         ← regras de negócio do cliente (application)
└── pages/                    ← uma classe por tela (interfaces)

apps/profissional/assets/js/
├── app.js                    ← BarberFlowProfissional extends Router
├── AppBootstrap.js
├── MonetizationGuard.js      ← guard de plano/monetização (infra)
├── PlanosService.js          ← seleção e ativação de planos (application)
├── LegalConsentService.js    ← LGPD + termos (application)
├── controllers/              ← binding DOM (interfaces)
└── pages/                    ← uma classe por tela (interfaces)
```

### Navegação e animações (Router SPA)

Todo app herda de `shared/js/Router.js`. A navegação segue um contrato único:

| Método | Comportamento |
|---|---|
| `App.nav('tela')` | Carrossel: tela atual sai pela direita, nova entra pela esquerda |
| `App.push('tela')` | Mesmo carrossel — usado para fluxos de auth (login → cadastro) |
| `App.voltar()` | Fecha a tela atual pela esquerda e retorna ao home (histórico limpo) |

O `home` permanece sempre por baixo de todas as abas para evitar recarregamento.

### Service Workers

Cada app possui um SW independente com versionamento explícito:

| App | Versão atual do cache |
|---|---|
| `apps/cliente/sw.js` | `barberflow-cliente-v107` |
| `apps/profissional/sw.js` | `barberflow-profissional-v90` |

> **Regra:** bumpar a versão sempre que qualquer arquivo em `shared/` for modificado.

### Camada de domínio (`shared/js/`)

Entidades puras de domínio (sem dependências externas). Cada uma expõe `static fromRow(row)`, `validar()` e `toJSON()`:

| Entidade | Arquivo | Descrição |
|---|---|---|
| `Barbearia` | `shared/js/Barbearia.js` | Barbearia com validação de nome, cidade e coordenadas |
| `Profissional` | `shared/js/Profissional.js` | Profissional com roles: `barber`, `owner`, `manager` |
| `Servico` | `shared/js/Servico.js` | Serviço/tratamento com validação de preço e duração |
| `Agendamento` | `shared/js/Agendamento.js` | Agendamento com estados (pendente/confirmado/cancelado/concluído) |
| `Cliente` | `shared/js/Cliente.js` | Perfil do cliente com validação e localização |

---

## Integração Supabase

O Supabase fornece quatro serviços usados pelo projeto:

### 1. PostgreSQL — via `ApiService` (CRUD)

`shared/js/ApiService.js` substitui o Supabase JS SDK para todas as operações de leitura e escrita. Implementa um query builder fluente sobre `fetch` nativo — sem dependência de pacote externo.

```js
// Exemplo de uso (em qualquer *Repository.js)
const { data, error } = await ApiService.from('barbershops')
  .select('id, name, city, lat, lng')
  .eq('is_active', true)
  .order('rating_score', { ascending: false })
  .limit(10);
```

O `ApiService` lê automaticamente o JWT da sessão persistida pelo SDK Supabase no `localStorage` e o injeta como `Authorization: Bearer <token>` em toda requisição.

### 2. Auth — via `SupabaseService`

`shared/js/SupabaseService.js` encapsula o Supabase JS SDK para autenticação (login, cadastro, logout, refresh de sessão). O JWT gerado é consumido pelo `ApiService` para autorizar as chamadas PostgREST.

### 3. Storage — via `SupabaseService`

Upload e geração de URLs públicas de avatares, capas, portfólio e stories. URLs são geradas por `ApiService.getAvatarUrl()`, `getLogoUrl()` e `getPortfolioThumbUrl()`.

### 4. Realtime — via `SupabaseService`

Fila de atendimento ao vivo (`QueueRepository`) e notificações em tempo real (`NotificationService`) via Supabase Realtime subscriptions.

### Row Level Security (RLS)

Todo acesso ao banco é controlado por políticas RLS definidas na migration `20260406000003_rls_policies.sql`. O cliente nunca acessa dados de outros usuários — o banco rejeita a requisição na camada de banco de dados antes de chegar à aplicação.

### Edge Functions (Deno)

Lógica server-side que não pode ser executada no browser:

| Function | Rota | Descrição |
|---|---|---|
| `nearby-barbershops` | `POST /functions/v1/nearby-barbershops` | Barbearias num raio por coordenadas (PostGIS) |
| `queue-status` | `GET /functions/v1/queue-status?barbershop_id=` | Status da fila ao vivo |

```js
// Chamada de Edge Function a partir do frontend
const res = await fetch(`${SUPABASE_URL}/functions/v1/nearby-barbershops`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
  body: JSON.stringify({ latitude: -23.5613, longitude: -46.6570, radius_km: 2 })
});
const { data } = await res.json();
```

---

## Banco de dados — Migrations

| Arquivo | Descrição |
|---|---|
| `20260406000001_initial_schema.sql` | Tabelas core: profiles, barbershops, professionals, services, appointments, queue |
| `20260406000002_media_schema.sql` | Stories, portfólio, likes, notificações |
| `20260406000003_rls_policies.sql` | Row Level Security — controle de acesso |
| `20260406000004_storage_buckets.sql` | Buckets do Storage + políticas de upload |

---

## Pré-requisitos

- Node.js 18+
- Supabase CLI
- Docker Desktop (para rodar Supabase local)
- Conta no [supabase.com](https://supabase.com)

---

## 1. Instalar Supabase CLI

```bash
npm install -g supabase
```

Verificar instalação:

```bash
supabase --version
```

---

## 2. Rodar ambiente local

### Iniciar Docker + Supabase local

```bash
supabase start
```

O comando sobe PostgreSQL, Auth, Storage, Studio e Realtime localmente.  
Acesse o Studio em: **http://127.0.0.1:54323**

### Aplicar as migrations localmente

```bash
supabase db reset
```

Isso aplica todas as migrations em ordem + o `seeds/seed.sql` automaticamente.

### Rodar o servidor de dev do frontend

```bash
node server.js
```

Acesse em: **http://localhost:3000**

---

## 3. Login e link com projeto remoto

### Autenticar na CLI

```bash
supabase login
```

### Linkar com seu projeto no Supabase Cloud

```bash
supabase link --project-ref SEU_PROJECT_REF
```

O `PROJECT_REF` está na URL do seu projeto: `https://app.supabase.com/project/SEU_PROJECT_REF`

---

## 4. Criar uma nova migration

```bash
supabase migration new nome_descritivo_da_migration
```

Isso cria um arquivo em `supabase/migrations/` com timestamp automático.  
Edite o arquivo gerado, depois aplique:

```bash
# Aplicar localmente
supabase db reset

# Aplicar no projeto remoto
supabase db push
```

---

## 5. Deploy das Edge Functions

### Criar nova function

```bash
supabase functions new nome-da-function
```

### Deploy de uma function

```bash
supabase functions deploy nome-da-function
```

### Deploy de todas as functions

```bash
for dir in supabase/functions/*/; do
  supabase functions deploy "$(basename $dir)"
done
```

---

## 6. Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável | Onde encontrar |
|---|---|
| `SUPABASE_URL` | Settings > API do seu projeto |
| `SUPABASE_ANON_KEY` | Settings > API do seu projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings > API (nunca expor no frontend) |
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_PROJECT_REF` | URL do projeto: `app.supabase.com/project/REF` |
| `SUPABASE_DB_PASSWORD` | Settings > Database do projeto |

---

## 7. GitHub Actions (CI/CD)

### Secrets obrigatórios

Em **Settings > Secrets and variables > Actions** do repositório, adicione:

| Secret | Descrição |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Token pessoal do Supabase CLI |
| `SUPABASE_PROJECT_REF` | Referência do projeto remoto |
| `SUPABASE_DB_PASSWORD` | Senha do banco de dados |

### Workflows disponíveis

| Arquivo | Gatilho | O que faz |
|---|---|---|
| `validate.yml` | Todo push/PR | Valida estrutura, SQL lint, Deno type-check |
| `deploy-supabase.yml` | Push na `main` | Aplica migrations + deploy das functions |

---

## 8. Edge Functions disponíveis

| Function | Rota | Descrição |
|---|---|---|
| `nearby-barbershops` | `POST /functions/v1/nearby-barbershops` | Barbearias num raio por coordenadas |
| `queue-status` | `GET /functions/v1/queue-status?barbershop_id=` | Status da fila ao vivo |

### Exemplo de chamada (frontend)

```js
// Barbearias próximas
const res = await fetch(`${SUPABASE_URL}/functions/v1/nearby-barbershops`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
  body: JSON.stringify({ latitude: -23.5613, longitude: -46.6570, radius_km: 2 })
})
const { data } = await res.json()
```

---

## 9. Boas práticas

**Banco de dados:**
- **Nunca** salvar vídeos ou imagens no banco — use Supabase Storage
- **Sempre** criar migrations com timestamp no nome (`supabase migration new`)
- **Nunca** commitar `.env` — apenas `.env.example`
- Toda tabela nova deve ter `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- Índices: criar apenas onde há filtros frequentes (`WHERE`, `JOIN`, `ORDER BY`)
- Colunas `jsonb`: usar apenas para dados sem schema fixo (ex: notificações)
- Contadores (`likes_count`, `views_count`): manter desnormalizados para evitar `COUNT(*)`

**Arquitetura e código:**
- Toda nova classe deve ser registrada em `CLASS_REGISTRY.md` com a camada DDD correta
- Entidades de domínio (`domain`) não devem ter dependências de `ApiService`, `fetch` ou DOM
- `ApiService` é o único ponto de acesso ao PostgREST — nunca usar `fetch` diretamente em Services ou Pages
- `SupabaseService` é exclusivo para Auth, Storage e Realtime
- `sanitizar()` somente em `innerHTML`, nunca em `textContent`
- Bumpar a versão do SW sempre que arquivos em `shared/` forem modificados

**Testes:**
- TDD obrigatório: escrever o teste antes da implementação
- Usar apenas `node:test` + `node:assert/strict` — nenhuma biblioteca de teste externa
- Isolar cada teste em `vm.createContext` separado (sem estado compartilhado)
- Commitar apenas com 0 falhas: `node --test tests/**/*.test.js`

---

## 10. Comandos de referência rápida

```bash
# Ambiente local
supabase start          # inicia Docker + Supabase local
supabase stop           # para o ambiente local
supabase db reset       # reseta banco + aplica migrations + seed
supabase status         # mostra URLs e chaves locais

# Migrations
supabase migration new NOME   # cria migration
supabase db push              # aplica migrations no remoto

# Functions
supabase functions new NOME        # cria function
supabase functions deploy NOME     # faz deploy de uma function
supabase functions serve           # serve functions localmente

# Autenticação
supabase login                      # autentica CLI
supabase link --project-ref REF     # linka projeto remoto
supabase projects list              # lista seus projetos
```

---

## 11. Apps TWA (Android APK)

Cada app é um PWA independente com `manifest.json` próprio:

```bash
npm install -g @bubblewrap/cli

# App Cliente
mkdir build-cliente && cd build-cliente
bubblewrap init --manifest https://seudominio.com/apps/cliente/manifest.json
bubblewrap build
# package: com.barberflow.cliente

cd ..

# App Profissional
mkdir build-profissional && cd build-profissional
bubblewrap init --manifest https://seudominio.com/apps/profissional/manifest.json
bubblewrap build
# package: com.barberflow.profissional
```

Após gerar o keystore, atualize `.well-known/assetlinks.json` com o SHA-256:

```bash
keytool -list -v -keystore android.keystore
```
