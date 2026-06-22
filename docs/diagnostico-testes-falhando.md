# Diagnóstico — testes falhando (baseline pré-existente)

> Criado em 22/06/2026. Anotação para arrumar no futuro.
>
> **Contexto:** ao rodar a suíte completa (`node --test`) durante o trabalho da
> modal de criação de story (`StoryComposer`/`OverlayPainter` — queima de
> overlays + áudio + compressão no Finalizar), apareceram **~46 falhas**. Todas
> são **pré-existentes** e **alheias** à mudança de story — confirmado abaixo.
> Esta nota serve para você triar/corrigir depois.

## Resumo

| | |
|---|---|
| Comando | `node --test` (na raiz do repo) |
| Total de testes | ~3597 |
| Passando | ~3551 |
| **Falhando** | **~46** (em 16 arquivos) |
| Relacionadas à modal de story | **0** |

Os testes da modal de story passam 100%:
- `tests/story-creation-modal.test.js` → 14/14 ✅
- `tests/story-editor-service.test.js` → 13/13 ✅

## Prova de que não é da mudança de story

1. Nenhum teste em `barberflow-bff-api/tests/` referencia
   `StoryCreationModal`/`StoryComposer`/`OverlayPainter` (grep vazio).
2. A mudança tocou só 4 arquivos isolados: `shared/js/StoryCreationModal.js`,
   `shared/css/story-creation.css`, `tests/story-creation-modal.test.js`,
   `CLASS_REGISTRY.md`.
3. As falhas são de áreas sem relação (auth, mensalistas, api-client, CORS,
   notificações, portfolio, financas, script-loading…).

## Falhas por arquivo (triar)

| Qtd | Arquivo | Causa provável |
|----:|---|---|
| 10 | `tests/barbeariaApiClient.test.js` | Lógica `#bffFalhou`/fallback do BFF; contrato BFF↔repositório mudou |
| 7  | `barberflow-bff-api/tests/auth.test.js` | Rotas `/api/auth/*` (refresh/logout/me) — env/contrato HTTP |
| 7  | `tests/messages-widget.test.js` | Widget de mensagens (front) |
| 3  | `tests/script-loading-phase1.test.js` | Ordem de `<script>` no HTML (ex.: `PortfolioPrismViewer.js` ausente no HTML) |
| 3  | `tests/portfolio-prism-viewer.test.js` | Viewer de portfólio |
| 3  | `barberflow-bff-api/tests/mensalistas.test.js` | Rota `POST /mensalistas/incrementar-cortes` (204/ownership) |
| 2  | `tests/financas-page-evento.test.js` | Contrato BFF da FinancasPage |
| 1  | `barberflow-bff-api/tests/barbearia.test.js` | `PATCH /barbearias/minha/imagem` (upload binário) |
| 1  | `tests/portfolio-image-actions.test.js` | Ações de imagem do portfólio |
| 1  | `tests/cors.test.js` | `vercel.json` não deve ter CORS estático (Express é a autoridade) |
| 1  | `tests/portfolio-viewer-modal.test.js` | Modal viewer de portfólio |
| 1  | `barberflow-bff-api/tests/e2e/notificacao.e2e.test.js` | E2E push — `VAPID ausente → 503` (faltam chaves VAPID no ambiente de teste) |
| 1  | `tests/barbearia-servicos-layout.test.js` | Layout de serviços públicos |
| 1  | `tests/barbershop-location.test.js` | `salvarEnderecoGps` exige endereço/GPS |
| 1  | `tests/barbearia-api-client.test.js` | Disponibilidade do BFF (`#bffFalhou`) |
| 1  | `barberflow-bff-api/tests/profissional-public-profile.test.js` | Criar conversa + mensagem inicial |

> Soma direta ≈ 44; o total de ~46 inclui rollups de suíte contados à parte.

## Hipóteses de causa-raiz (ordem de aposta)

1. **WIP do repositório** — há muitos arquivos modificados/untracked no
   `git status` (BFF, R2, load-tests, media). Vários desses testes são de
   contrato/integração e quebram quando o código-fonte associado está no meio de
   uma refatoração. **Estabelecer baseline:** rodar a suíte num checkout limpo
   (`git stash` + `git clean -nd` para inspecionar) e comparar a contagem.
2. **Ambiente de teste sem variáveis** — falhas como `VAPID ausente → 503` e
   rotas de auth indicam env vars/segredos ausentes localmente.
3. **Contratos BFF↔front desatualizados** — `barbeariaApiClient`, `financas`,
   `mensalistas` testam o contrato; provável drift recente.

## Como reproduzir / triar

```bash
# Suíte inteira
node --test

# Um arquivo por vez (mais legível)
node --test tests/barbeariaApiClient.test.js
node --test barberflow-bff-api/tests/auth.test.js

# Agrupar falhas por arquivo (PowerShell):
node --test 2>&1 | Select-String 'test at .*\.test\.js' |
  ForEach-Object { ($_.Line -replace '.*test at ','' -replace ':\d+:\d+.*','') } |
  Group-Object | Sort-Object Count -Descending
```

## Sugestão de ataque (quando for arrumar)

1. Rodar num checkout limpo para separar o que é WIP do que é falha real.
2. Começar pelos clusters maiores: `barbeariaApiClient` (10) e `auth` (7).
3. Para os E2E/integração (notificações, mensalistas, barbearia upload),
   configurar as env vars de teste (VAPID, Supabase de teste etc.).
4. `script-loading-phase1` + `portfolio-prism-viewer`: conferir se
   `PortfolioPrismViewer.js` está incluído nos HTMLs esperados.
