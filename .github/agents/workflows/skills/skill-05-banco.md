# SKILL 05 — BANCO DE DADOS E STORAGE: SUPABASE, POSTGRESQL, RLS

> Leia este arquivo para tarefas de banco: queries, migrations, modelagem, RLS, storage, Supabase.

---

## 1. REGRAS DE MODELAGEM

- Apenas **metadados** no banco — mídia sempre no storage
- UUID como identificador padrão em todas as tabelas
- Índices inteligentes — evitar queries lentas em colunas filtradas com frequência
- ❌ NUNCA usar `SELECT *` — selecionar apenas as colunas necessárias
- ❌ NUNCA salvar mídia (imagens, vídeos, áudios) diretamente no banco

---

## 2. SUPABASE — REGRAS OBRIGATÓRIAS

- RLS habilitado em **todas** as tabelas
- Cada role acessa apenas o que a política RLS permite
- ❌ NUNCA usar Firebase — stack é exclusivamente Supabase + PostgreSQL
- Usar Supabase Auth para autenticação — nunca criar sistema de auth próprio
- Usar Supabase Storage para upload de arquivos

---

## 3. QUERIES E PERFORMANCE

- Paginação obrigatória — **nunca** buscar tudo de uma vez
- Usar `.range()` ou `limit`/`offset` em toda listagem
- Evitar queries N+1 — agregar dados em uma única query quando possível
- Criar índices nas colunas usadas em filtros (`WHERE`) e joins frequentes
- Ver `skill-08-performance.md` para regras de cache e memoização

---

## 4. STORAGE — REGRAS OBRIGATÓRIAS

- Thumbnails + compressão obrigatórios para toda imagem enviada
- Lazy loading em toda mídia exibida na UI
- Validar MIME type e tamanho máximo antes de qualquer upload — ver `skill-04-seguranca.md`
- Revogar Blob URLs após uso — ver `skill-08-performance.md`

---

## 4.1 PIPELINE ASSINCRONO DE MIDIA NA BFF

- Upload de midia deve usar URL pre-assinada gerada pela BFF; bytes sobem do cliente direto para object storage.
- A confirmacao do upload volta para a BFF com token vinculado ao owner, contexto, path e expiracao.
- Processamento pesado roda em fila `bf:queue:media`, nao dentro da resposta HTTP.
- O pipeline usa Chain of Responsibility com steps isolados e testaveis: virus scan, MIME real, metadados/pHash, thumbnails, transcode e publicacao CDN.
- Variantes sao versionadas e catalogadas no banco; URL privada deve ser assinada com expiracao curta.
- Reservas `reserved`/`uploaded` antigas e variantes sem dono ativo entram no plano de garbage collection.

## 5. MIGRATIONS

- Toda alteração de schema via migration versionada (`supabase/migrations/`)
- Nunca alterar tabelas em produção sem migration correspondente
- Migrations devem ser reversíveis quando possível (incluir rollback)
- Nomear migration com timestamp e descrição: `20260517_adicionar_coluna_status_agendamento.sql`

## 5.1 Cobertura automatizada de RLS

- Toda tabela criada em `public` deve aparecer no report `node scripts/rls-policy-report.js --fail-on-missing-rls`.
- Tabela sem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` é falha de CI.
- Tabela com RLS habilitado, mas sem policy para alguma operação CRUD, é warning priorizado.
- Tabela sensível deve ter cobertura declarada em `db/rls/coverage.json` com operações `select`, `insert`, `update`, `delete` e colunas sensíveis exercitadas.
- Testes reais de banco devem usar `supabase/tests/rls_crud_suite.sql`, que expõe os helpers `rls_test.as_anon(sql)`, `rls_test.as_user(user_id, sql)` e `rls_test.as_service(sql)`.
- Ao adicionar coluna sensível (`email`, `phone`, `cpf`, `token`, valores financeiros, localização, storage path etc.), atualizar a cobertura RLS no mesmo PR.

## 5.2 Pipeline db-validate antes de deploy

- Todo deploy com migration deve depender do workflow `.github/workflows/db-validate.yml`.
- A ordem obrigatoria e: schema diff, migration dry-run/rollback, contract tests de RPC, RLS tests, counter consistency, performance baseline e data integrity.
- Divergencia entre staging e `db/snapshots/schema-current.sql` falha o pipeline, salvo quando acompanhada de migration e snapshot atualizados.
- Migration nova deve ter rollback documentado com comentario `-- rollback:` ou arquivo `db/rollbacks/<migration>.down.sql`.
- Counter consistency e performance baseline sao warning-only; schema, migration, contrato, RLS e integridade bloqueiam deploy.
- O checklist pre-migration deve ser publicado em PR e o processo deve ficar documentado em `docs/db/processo-migration.md`.
- Antes de abrir PR com migration, rodar `npm run test:db` e `npm run db:validate`.

---

## 6. FAVORITOS DE CLIENTE — REGRA OBRIGATÓRIA

Telas/endpoints que listam usuários "favoritos" de uma barbearia ou de seus barbeiros **devem unir** as duas fontes de favoritos. Consultar uma só vaza ou esconde dados.

- **Tabelas oficiais**
  - `barbershop_interactions` — coluna `type = 'favorite'` indica favorito direto da barbearia
  - `favorite_professionals` — favoritos de cada barbeiro (`professional_id`)
  - `professional_shop_links` — relaciona barbeiro ↔ barbearia (`is_active = true`)

- **RPCs canônicas**
  - `get_clientes_favoritos_modal(p_barbershop_id, p_professional_id)` — favoritos da barbearia OU desse barbeiro específico (modal de cadeira)
  - `get_clientes_favoritos_barbearia(p_barbershop_id)` — favoritos da barbearia OU de qualquer barbeiro vinculado (mensalistas / mslm-card)

- **Fallbacks** (frontend `UserRepository` + backends Express): ao montar a lista localmente, fazer UNION manual entre `barbershop_interactions` (type='favorite') e `favorite_professionals`. Quando o escopo for "barbearia inteira", filtrar `favorite_professionals` pelos `professional_id` ativos em `professional_shop_links`.

- **Proibido**
  - Consultar apenas `favorite_professionals` (omite quem favoritou a barbearia, não o barbeiro)
  - Usar `ilike('full_name', '%${q}%')` em `profiles` para listagem automática — isso é busca textual, NÃO favoritos. Listas automáticas devem sair das tabelas/RPC acima
  - Aceitar `q` vazio em busca textual (`ilike '%%'` retorna todos os perfis do sistema)

- **Centralização**: a regra de favoritos vive em `FavoritosClientesService` (frontend) e na RPC do banco. Toda nova tela que precise "listar quem favoritou X" deve reusar essas fontes — nunca redeclarar o UNION.
