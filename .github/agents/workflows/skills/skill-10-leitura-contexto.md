# SKILL 10 — PROTOCOLO DE LEITURA DE CONTEXTO

> Leia este arquivo no início de TODA sessão ou tarefa nova.
> Contém: ordem obrigatória de leitura, checklist de identificação do projeto, regra de banco, paridade entre apps.

---

## 1. ORDEM OBRIGATÓRIA DE LEITURA

Antes de qualquer alteração, leitura ou implementação:

```
1. README.md              ← contexto completo do projeto
2. skill-mapping.md       ← mapear intenção → skills de segurança
3. skill.md               ← regras globais do agente DELIMA
4. skill-index.md         ← índice geral; identificar skills relevantes
5. CLASS_REGISTRY.md      ← verificar classes reutilizáveis antes de criar
```

Leia somente os arquivos de skill necessários para a tarefa — não carregue tudo.

---

## 2. CHECKLIST DE IDENTIFICAÇÃO DO PROJETO

Ao ler o README.md, identificar obrigatoriamente:

| Categoria | O que identificar |
|---|---|
| **Arquitetura** | DDD, Clean Architecture, camadas (domain/application/infra/interfaces) |
| **Front-end** | Framework, SPA, PWA, TWA, Router, animações |
| **Back-end** | Node.js, BFF, server.js, Vercel, Edge Functions |
| **Linguagem principal** | JavaScript OOP puro (sem framework) |
| **Stack** | HTML5, CSS3, JS, Node.js, Supabase, PostgreSQL |
| **Padrão de classes** | 100% OOP — sem funções soltas |
| **Estrutura de pastas** | `apps/`, `shared/`, `supabase/`, `barberflow-bff-api/` |
| **Serviços ativos** | BFF, Supabase Auth, PostgREST, Storage, Realtime |
| **APIs** | `ApiService` (PostgREST), `BffApiService` (BFF), Edge Functions |
| **BFF** | `barberflow-bff-api` — porta 3002 dev / `bff.barberflow.app` prod |
| **Banco de dados** | Supabase (PostgreSQL) — SEMPRE; nunca Firebase ou MySQL |
| **Integrações** | Supabase Auth, Storage, Realtime; PostGIS (geo); BullMQ (filas) |
| **Cache** | `CacheManager`, `TtlCache`, `ETag` em endpoints públicos |
| **Service Worker** | `apps/cliente/sw.js` (v107+), `apps/profissional/sw.js` (v90+) |
| **WebSocket/Realtime** | Supabase Realtime — fila, status agendamento, chat textual |
| **Firebase** | ❌ NUNCA usar — stack é exclusivamente Supabase |
| **Supabase** | ✅ SEMPRE usar — banco, auth, storage, realtime |
| **MySQL** | ❌ Não existe neste projeto |
| **Tabelas / schemas** | Ver `supabase/migrations/` — profiles, barbershops, appointments… |
| **Infraestrutura** | Vercel (frontend), Supabase Cloud (banco), BFF (Node.js) |
| **App cliente** | `apps/cliente/` — PWA / TWA `com.barberflow.cliente` |
| **App profissional** | `apps/profissional/` — PWA / TWA `com.barberflow.profissional` |

---

## 3. REGRA DE BANCO DE DADOS

```
Se o projeto usa Supabase  → usar Supabase sempre
Se o projeto usa Firebase  → usar Firebase sempre  (não se aplica ao BarberFlow)
Se o projeto usa MySQL     → usar MySQL sempre     (não se aplica ao BarberFlow)
Se não identificar         → PERGUNTAR antes de implementar
```

**Nunca assumir banco sem validar no README.md ou nos arquivos de infra.**

Para este projeto: **Supabase (PostgreSQL) é o único banco autorizado.**

---

## 4. REGRA DE BANCO DE DADOS — DETALHES

Antes de mexer em qualquer fluxo de dados, verificar:

- `supabase/migrations/` — schema SQL versionado
- `supabase/config.toml` — configuração local
- `shared/js/ApiService.js` — acesso PostgREST (CRUD)
- `shared/js/SupabaseService.js` — Auth, Storage, Realtime
- `barberflow-bff-api/repositories/` — repositórios do BFF

Ver `skill-05-banco.md` para regras completas de queries, migrations e RLS.

---

## 5. PARIDADE ENTRE APPS

Toda alteração deve ser verificada para **ambos os apps**:

| Ponto de verificação | Ação |
|---|---|
| `apps/cliente/index.html` | `<script>` adicionado? |
| `apps/profissional/index.html` | `<script>` adicionado? |
| DOM / refs | Existem nos dois? |
| `Router` / `app.js` | Rota registrada nos dois? |
| Instância + `bind()` | Feito nos dois? |
| `shared/js/` foi modificado? | Bumpar versão dos dois `sw.js` |

**Exceção:** usuário definiu explicitamente "somente app profissional" ou "somente app cliente".

---

## 6. FLUXO BFF OBRIGATÓRIO

Todo acesso a dados deve seguir:

```
Front-end
    ↓
BffApiService (shared/js/BffApiService.js)
    ↓
barberflow-bff-api (Node.js, porta 3002)
    ↓
BarbeariaRepository / *Repository (Supabase service_role)
    ↓
Supabase PostgreSQL
    ↓
Retorno BFF → Front-end
```

Nunca pular o BFF quando o padrão atual exigir isso.
Sempre reutilizar o BFF existente antes de criar novo endpoint.

---

## 7. RESTRIÇÕES ABSOLUTAS

```
❌ Alterar arquivos fora do escopo da tarefa
❌ Duplicar lógica existente (DRY sempre)
❌ Quebrar BFF ou contratos de API
❌ Mudar arquitetura sem necessidade real
❌ Recriar serviço que já existe
❌ Criar classe redundante (verificar CLASS_REGISTRY.md primeiro)
❌ Pular leitura do README.md
❌ Assumir banco sem validar
❌ Implementar sem carregar skills correspondentes à intenção
❌ Usar Firebase — stack é Supabase + PostgreSQL
❌ Salvar mídia no banco — usar Storage
❌ SELECT * — selecionar apenas colunas necessárias
❌ Usar Realtime para vídeos ou feeds pesados
```
