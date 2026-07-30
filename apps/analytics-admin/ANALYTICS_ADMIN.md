# Analytics Admin

## Objetivo

O Analytics Admin é um Super Admin externo para monitorar a jornada da landing page do
BarberFlow. Ele fica em `apps/analytics-admin/`, possui deploy, autenticação e banco próprios e não
consulta o banco principal do BarberFlow.

O domínio planejado é `https://superadmin.barberflow.live`. O endereço está preparado como
configuração, mas não é tratado como publicado nesta etapa.

## Estado desta entrega

O frontend funciona em modo demonstrativo com dados locais. Login, Dashboard, Funil, Sessões,
filtros, notificações, exportação e snapshot offline podem ser avaliados sem Supabase.

No modo DEMO, o SDK do Supabase não é carregado e não existe tentativa de conexão externa. URL,
publishable key e collector permanecem vazios.

O tracker da landing está instalado, porém `analyticsEnabled` permanece `false`. Nenhuma coleta
ocorre até a configuração explícita do projeto Supabase Analytics separado.

Eventos ativos no primeiro ciclo:

- `session_started` e `session_ended`
- `landing_view`
- `scroll_25`, `scroll_50`, `scroll_75` e `scroll_100`
- `cta_click`
- `voucher_modal_opened`
- `email_input_started`
- `email_submitted`
- `voucher_generated`

`account_created`, `email_confirmed` e `first_login` estão previstos no catálogo e no funil, mas
não são coletados porque o aplicativo profissional não foi alterado.

## Arquitetura

O aplicativo usa HTML5, CSS3 e JavaScript vanilla. As responsabilidades estão separadas:

- `config/`: configuração pública e catálogo de eventos.
- `components/`: componentes de apresentação e interação.
- `pages/`: coordenação de cada tela.
- `services/`: autenticação, dados, métricas, Realtime, Presence, snapshots e exportação.
- `utils/`: formatação, datas e serializadores.
- `supabase/`: migration e Edge Function exclusivas do futuro projeto Analytics.
- `assets/`: ativos locais, ícones PWA e SDK público do Supabase.
- `tests/`: contratos de estrutura, segurança, métricas, exportação, PWA e integração.

`AnalyticsAdminApp` compõe as dependências. `AnalyticsRepository` alterna entre
`MockAnalyticsDataSource` e Supabase por configuração, sem espalhar condicionais pelas páginas.
Um único filtro global é aplicado ao Dashboard, Funil e Sessões.

## Fluxo dos eventos

1. O tracker cria um `visitor_id` persistente e um `session_id` por navegação.
2. Eventos permitidos recebem uma chave de idempotência e metadados técnicos limitados.
3. O navegador envia o payload para a Edge Function.
4. A função valida origem, método, tamanho, campos e evento.
5. O rate limit durável é reivindicado no banco.
6. E-mail, somente após envio confirmado, e IP são transformados em valores não reversíveis.
7. O evento é inserido com `upsert` por chave de idempotência.
8. O painel autenticado recebe novos registros via Supabase Realtime.

Não são capturadas teclas, palavras ou conteúdo parcial do campo de e-mail. O evento
`email_input_started` registra apenas que o foco ocorreu pela primeira vez. O e-mail completo só
segue no evento `email_submitted`, após a geração de voucher ser confirmada pelo servidor, e deve
ser armazenado somente como HMAC.

## Sessões e encerramento

Uma sessão fica ativa por até 30 minutos sem atividade. O tracker tenta registrar
`session_ended` em `pagehide` usando `sendBeacon`; o timeout de inatividade é a alternativa para
navegações que não entreguem esse sinal. No banco, sessões sem encerramento e sem atividade por
mais de 30 minutos são classificadas como encerradas pela RPC.

## Dashboard, Funil e Sessões

O Dashboard mostra visitantes online, visitantes do período, sessões, tempo médio, conversão,
CTAs, e-mails e etapas futuras. Os filtros cobrem hoje, ontem, 7 e 30 dias, origem e campanha.

O Funil conta visitantes únicos em cada etapa e calcula conversão em relação à etapa anterior.
Para o MVP, os resultados serão calculados sob demanda por RPC. Não existe tabela de agregados
diários para evitar sincronização e custo antes de o volume real justificar esse recurso.

Sessões exibe a linha do tempo de cada visitante e permite exportar CSV ou SpreadsheetML, arquivo
`.xls` compatível com Excel. Valores iniciados por operadores são neutralizados contra injeção de
fórmulas. Paginação real será feita por cursor pela RPC `analytics_sessions_page`.

## PWA e modo offline

`manifest.json` declara identidade, escopo, tema, ícones comuns e maskable. O navegador deriva a
splash screen do ícone e das cores do manifest. `service-worker.js` instala o shell local em cache
versionado pelo build, remove somente versões anteriores do Analytics Admin e verifica atualizações
ao iniciar. Requisições externas e APIs não são armazenadas pelo service worker.

O último conjunto agregado carregado é salvo localmente como snapshot. Quando usado offline, o
painel mostra explicitamente a data e a hora do snapshot; dados offline nunca são apresentados
como tempo real. A primeira utilização offline exige uma abertura online anterior.

## Supabase Analytics futuro

Crie um projeto Supabase exclusivo para Analytics. Não aplique a migration no projeto principal.

Ordem futura:

1. Criar o projeto Supabase Analytics.
2. Aplicar `supabase/migrations/20260730000001_create_analytics_admin.sql`.
3. Criar os usuários administradores pelo Supabase Auth.
4. Inserir os UUIDs autorizados em `analytics_admins` por operação administrativa segura.
5. Publicar `collect-analytics-event`.
6. Configurar os segredos privados da função.
7. Habilitar Realtime para `analytics_events`.
8. Validar RLS e autorização dos canais privados.
9. Configurar as variáveis públicas do painel e da landing.
10. Somente então ativar o tracker.

### Auth e RLS

O painel real usa Supabase Auth com e-mail e senha. O guard consulta a sessão antes de mostrar o
shell. `analytics_events` só permite leitura quando `is_analytics_admin()` encontra o usuário na
allowlist. Inserções públicas diretas não possuem política: a escrita passa exclusivamente pela
Edge Function.

### Realtime e Presence

O painel assina inserts em `analytics_events`, sem polling. Presence usa canal privado.
Visitantes deverão obter uma sessão anônima do projeto Analytics e publicar apenas a própria
presença; somente administradores da allowlist recebem o estado completo. As políticas iniciais
estão no scaffold e precisam ser testadas no projeto real antes da ativação.

### Edge Function, CORS e abuso

Variáveis privadas da função:

- `ANALYTICS_ALLOWED_ORIGINS`: allowlist separada por vírgulas, inicialmente apenas a URL final
  da landing.
- `ANALYTICS_HMAC_SECRET`: segredo longo e aleatório para HMAC de e-mail e IP.
- `SUPABASE_URL`: fornecida pelo ambiente da função.
- `SUPABASE_SERVICE_ROLE_KEY`: fornecida somente ao ambiente da função.

CORS não é a barreira de segurança. A função também valida método, origem, limite de 12 KB,
allowlist de eventos, comprimentos máximos, identidade de sessão, idempotência e rate limit
durável de 60 eventos por minuto para o par IP/sessão. O segredo e a service role nunca podem ir
para `runtime-config.js`, Vercel ou navegador.

## Configuração central

Variáveis públicas do build do painel:

- `ANALYTICS_ADMIN_MODE=supabase`
- `ANALYTICS_ADMIN_PRODUCTION_URL=https://superadmin.barberflow.live`
- `ANALYTICS_SUPABASE_URL`
- `ANALYTICS_SUPABASE_PUBLISHABLE_KEY`
- `ANALYTICS_COLLECTOR_URL`

`npm run build` grava esses valores somente em `config/runtime-config.js`. A publishable key é
pública por definição; permissões reais continuam em Auth e RLS.

Na landing, a ativação futura exige os mesmos valores públicos em
`config/landing-config.js`: `analyticsEnabled`, `analyticsCollectorUrl`,
`analyticsSupabaseUrl` e `analyticsSupabasePublishableKey`. Essa alteração só deve ocorrer após
testes reais de CORS, RLS e coleta.

## Comandos

Na raiz do repositório:

```powershell
node server.js
npm --prefix apps/analytics-admin test
npm --prefix apps/analytics-admin run check
npm --prefix apps/analytics-admin run build
```

Endereço local: `http://localhost:3000/apps/analytics-admin/`.

O projeto é estático e não requer `npm install`.

## Vercel

1. Importe o mesmo repositório como um novo projeto.
2. Defina **Root Directory** como `apps/analytics-admin`.
3. Use **Framework Preset** `Other`.
4. Defina **Build Command** como `npm run build`.
5. Deixe **Output Directory** como `.`.
6. Na primeira publicação visual, mantenha `ANALYTICS_ADMIN_MODE=demo`.
7. Publique e valide login, rotas, responsividade e instalação PWA.
8. Adicione `superadmin.barberflow.live` somente depois de criar o registro DNS.
9. Quando o Supabase Analytics existir, cadastre as variáveis públicas e faça novo deploy.
10. Não cadastre `SUPABASE_SERVICE_ROLE_KEY` nem `ANALYTICS_HMAC_SECRET` na Vercel.

Os headers da Vercel incluem CSP sem `unsafe-inline`/`unsafe-eval`, HSTS, bloqueio de frames e
isolamento de janela. Após receber a URL real do Supabase, restrinja `connect-src` ao host exato do
projeto Analytics.

## Validação de publicação

O build executa `scripts/configure-runtime.mjs` e `scripts/validate-project.mjs`. A validação:

- analisa JSON de manifest, Vercel e package;
- confirma os arquivos referenciados no HTML e no shell offline;
- executa `node --check` nos módulos próprios;
- recusa URLs ou chaves preenchidas enquanto o modo for DEMO;
- falha antes da publicação quando a configuração Supabase estiver incompleta.

## Resolução de problemas

- Login DEMO rejeitado: use `demo@analytics.local` e `analytics-demo`.
- Conteúdo antigo após publicação: feche as abas e reabra; cada build recebe um cache próprio.
- PWA não instalável: confirme HTTPS, manifest, ícones 192/512 e service worker ativo.
- Modo offline vazio: carregue o painel uma vez online e conclua o login.
- Build Supabase bloqueado: confira URL HTTPS, publishable key e URL HTTPS do collector.
- Realtime sem eventos: valide Auth, allowlist `analytics_admins`, publicação da tabela e RLS.

## Pendências

Dependem de informações futuras:

- URL e publishable key do projeto Supabase Analytics.
- URL publicada da Edge Function coletora.
- URL final da landing para a allowlist de origem.
- IDs dos administradores autorizados.
- confirmação do domínio e DNS de `superadmin.barberflow.live`.
- aplicação e validação da migration no projeto separado.
- segredos privados da Edge Function.
- habilitação de Realtime e testes de Presence.
- testes completos em produção e ativação explícita do tracker.
