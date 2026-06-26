# Auditoria Supabase Advisor: spatial_ref_sys e profiles_public

Data: 2026-06-26

Escopo: somente os alertas do Supabase Advisor para `public.spatial_ref_sys` e
`public.profiles_public`. Esta auditoria e independente da auditoria de
performance, indices e consultas leves.

## Resumo executivo

| Objeto | Alerta | Decisao |
| --- | --- | --- |
| `public.spatial_ref_sys` | Tabela em schema exposto sem RLS | Nao alterar. O objeto e catalogo/metadado do PostGIS, nao tabela de negocio do BarberFlow. Nao ha uso direto no codigo local e nao foi comprovado beneficio em aplicar RLS/grants customizados. |
| `public.profiles_public` | View executando com permissao do owner | Nao alterar nesta etapa. O alerta e real em tese, mas a troca segura para `security_invoker=true` conflita com leituras diretas atuais de campos privados do proprio perfil em `public.profiles`. |

Nenhuma migration foi criada nesta tarefa, porque as duas correcoes poderiam
trazer risco sem ganho comprovado dentro do escopo autorizado.

## Referencias oficiais consultadas

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
  - A documentacao recomenda RLS em tabelas de schemas expostos, como `public`.
  - Tambem documenta que, apos habilitar RLS, a API nao acessa dados com chave publicavel ate haver policies compativeis.
- PostgreSQL `CREATE VIEW`: https://www.postgresql.org/docs/current/sql-createview.html
  - `security_invoker=true` faz as relacoes base serem checadas com permissoes e RLS do usuario invocador.
  - Por padrao, views usam permissoes do owner da view para as relacoes base.
- PostGIS `spatial_ref_sys`: https://postgis.net/docs/using_postgis_dbmanagement.html
  - `spatial_ref_sys` e a tabela OGC usada pelo PostGIS para catalogar SRIDs e sistemas de referencia.
  - Operacoes de geometria/geografia usam SRIDs e podem depender dos registros desse catalogo.

## Evidencias locais

### `public.spatial_ref_sys`

Busca local por `spatial_ref_sys` nao encontrou uso em BFF, frontend, migrations
do BarberFlow ou testes de aplicacao. O objeto entra por PostGIS, nao por uma
tabela de dominio do produto.

O BarberFlow usa dados geograficos em rotas/repositories de barbearias proximas,
mas o codigo nao acessa `spatial_ref_sys` diretamente. O risco principal de mexer
em RLS/grants desse objeto e criar regressao em funcoes PostGIS, validacao de
SRID, transformacoes ou consultas espaciais, sem proteger dados de usuario.

Decisao: documentar como alerta generico do Advisor para objeto de extensao.
Nao aplicar `ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY`,
nao revogar grants e nao modificar policies nesta etapa.

Risco residual: o objeto continua em `public` porque e parte do contrato usual da
extensao PostGIS. Como ele contem definicoes publicas de sistemas de referencia,
o impacto de confidencialidade e baixo.

### `public.profiles_public`

Migrations relevantes:

- `supabase/migrations/20260417000004_profiles_private_columns.sql`
  - removeu policy publica direta de `public.profiles`;
  - criou `public.profiles_public` expondo somente colunas consideradas publicas;
  - manteve `profiles_select_own` para o proprio usuario ler seus dados.
- `supabase/migrations/20260420000001_profiles_public_rating.sql`
  - recriou a view adicionando `rating_avg` e `rating_count` via `professionals`.
- `supabase/migrations/20260507000001_fix_profiles_rls_queue_access.sql`
  - adicionou policy `profiles_select_active_for_queue` para usuarios
    autenticados lerem perfis ativos em joins de fila.

Contrato atual de colunas publicas da view:

```sql
id,
full_name,
phone,
avatar_path,
role,
pro_type,
is_active,
created_at,
updated_at,
rating_avg,
rating_count
```

Consumidores locais de `profiles_public` incluem:

- `shared/js/BarbershopRepository.js`
- `shared/js/SearchWidget.js`
- `shared/js/ProfileRepository.js`
- `shared/js/SupabaseService.js`
- `src/repositories/AuthRepository.js`
- `src/repositories/ClienteRepository.js`
- `tests/repositories.test.js`

Leituras privadas diretas ainda existentes:

- `shared/js/AuthService.js` carrega o proprio perfil com:
  `address`, `birth_date`, `gender` e `zip_code`.
- `shared/js/SupabaseService.js#getProfile()` tambem le esses campos privados.
- Outros repositories usam `public.profiles` diretamente para fluxos internos ou
  BFF/service-role.

## Analise de `security_invoker=true` para `profiles_public`

O ajuste direto:

```sql
ALTER VIEW public.profiles_public SET (security_invoker = true);
```

nao e seguro de aplicar isoladamente.

Motivo:

1. Uma view `security_invoker=true` exige que `anon`/`authenticated` tenham
   permissoes nas tabelas base (`profiles` e `professionals`) e sejam liberados
   pelas policies de RLS.
2. Para manter o contrato publico anonimo da view, seria necessario permitir que
   `anon` leia linhas ativas de `profiles`.
3. Para manter o app atual, usuarios autenticados ainda precisam ler seus campos
   privados diretamente de `profiles`.
4. PostgreSQL grants sao por coluna/tabela, nao por coluna condicionada a linha.
   Se dermos grants amplos para preservar leitura privada do proprio usuario,
   a policy de perfis ativos pode permitir acesso direto a colunas sensiveis de
   outros usuarios. Se dermos grants restritos, o carregamento do proprio perfil
   pode quebrar.

Conclusao: o alerta de `profiles_public` e tecnicamente valido, mas a correcao
segura precisa de uma etapa previa de arquitetura:

- mover leituras privadas do proprio perfil para BFF ou RPC dedicada;
- manter `profiles_public` apenas para colunas publicas;
- revisar grants de `public.profiles` por coluna;
- depois aplicar `security_invoker=true` e validar anon/authenticated.

Essa mudanca extrapola o escopo desta tarefa, pois altera caminho de acesso a
perfil privado no frontend/BFF.

## Decisoes

### `spatial_ref_sys`

Nao modificar.

Justificativa:

- objeto pertence ao PostGIS;
- nao contem dados de negocio do BarberFlow;
- PostGIS documenta dependencia desse catalogo para SRIDs;
- nao ha uso direto local que justifique customizacao;
- alterar RLS/grants pode causar regressao em consultas espaciais sem ganho de
  seguranca comprovado.

### `profiles_public`

Nao modificar nesta etapa.

Justificativa:

- o contrato publico da view esta restrito a colunas explicitas;
- o alerta sobre view owner/security definer e real em tese;
- a troca segura para `security_invoker=true` nao e isolada, porque o app ainda
  depende de leituras privadas diretas em `public.profiles`;
- aplicar migration agora poderia quebrar login/perfil ou expor campos privados
  por grants amplos.

## Recomendacao de proximo passo

Criar uma tarefa separada para hardening de perfil:

1. Criar endpoint BFF ou RPC para leitura privada do proprio perfil.
2. Migrar `AuthService._carregarPerfil()` e `SupabaseService.getProfile()` para
   esse canal seguro.
3. Reduzir grants diretos em `public.profiles` para colunas publicas quando
   acessadas por `anon`/`authenticated`.
4. Aplicar `ALTER VIEW public.profiles_public SET (security_invoker = true)`.
5. Testar:
   - anon le `profiles_public` com colunas publicas;
   - anon nao le `profiles`;
   - authenticated le `profiles_public`;
   - authenticated le seus campos privados somente pelo canal novo;
   - authenticated nao le campos privados de terceiros.

## Validacao realizada

Comandos executados nesta auditoria:

```powershell
npm.cmd run test:db
node --test tests/rls-policy-report.test.js
git diff --check
```

Resultados:

- `npm.cmd run test:db`: passou, 107/107 testes.
- `node --test tests/rls-policy-report.test.js`: passou, 10/10 testes.
- `git diff --check`: passou. Houve somente aviso de line-ending em
  `shared/js/PortfolioPrismViewer.js`, arquivo ja modificado fora desta tarefa.

## Impacto

- Banco: nenhum objeto alterado.
- Frontend: nenhum arquivo alterado.
- BFF: nenhum arquivo alterado.
- Risco de regressao: baixo, pois a entrega e documental e nao altera runtime.
- Risco residual: o Advisor pode continuar exibindo os dois alertas ate que uma
  correcao segura, separada e validada seja implementada.
