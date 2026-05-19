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

## 5. MIGRATIONS

- Toda alteração de schema via migration versionada (`supabase/migrations/`)
- Nunca alterar tabelas em produção sem migration correspondente
- Migrations devem ser reversíveis quando possível (incluir rollback)
- Nomear migration com timestamp e descrição: `20260517_adicionar_coluna_status_agendamento.sql`
