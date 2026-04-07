# BarberFlow — Backend Supabase

Sistema de barbearia com agendamento, fila ao vivo, portfólio e stories.  
Backend 100% Supabase — banco PostgreSQL, Auth, Storage e Edge Functions.

---

## Estrutura do projeto

```
barbeFow-TWAapk/
├── apps/
│   ├── cliente/          ← PWA app cliente (TWA APK)
│   └── profissional/     ← PWA app profissional (TWA APK)
├── shared/
│   ├── css/              ← Design system compartilhado
│   ├── js/               ← Router base POO
│   └── img/              ← Imagens compartilhadas
├── supabase/
│   ├── config.toml       ← Configuração local do Supabase CLI
│   ├── migrations/       ← SQL versionado (aplicar em ordem)
│   ├── seeds/            ← Dados de desenvolvimento
│   └── functions/        ← Edge Functions Deno/TypeScript
├── .github/
│   └── workflows/        ← CI/CD automático
├── .env.example          ← Variáveis de ambiente (não commitar o .env!)
├── .gitignore
├── server.js             ← Servidor de dev local (Node.js, zero deps)
└── README.md
```

---

## Migrations

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

- **Nunca** salvar vídeos ou imagens no banco — use Supabase Storage
- **Sempre** criar migrations com timestamp no nome (`supabase migration new`)
- **Nunca** commitar `.env` — apenas `.env.example`
- Para RLS: toda tabela nova deve ter `alter table ... enable row level security`
- Índices: criar apenas onde há filtros frequentes (`where`, `join`, `order by`)
- Colunas `jsonb`: usar apenas para dados variáveis sem schema fixo (ex: notificações)
- Contadores (`likes_count`, `views_count`): manter desnormalizados para evitar `COUNT(*)`

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
