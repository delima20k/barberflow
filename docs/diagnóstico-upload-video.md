# Diagnóstico: upload de vídeo falhando — BarberFlow

**Data:** 2026-06-13
**Escopo:** somente leitura/análise. Nenhuma alteração de código, env var, config ou banco.
**Status:** causa raiz CONFIRMADA com erro real do navegador.

---

## 1. Erro real capturado

```
MediaP2P.js:109  POST https://pro.berberflow.shop/api/v1/media/presigned  404 (Not Found)
```

A requisição de upload vai para o domínio do **próprio app** (`pro.berberflow.shop`)
em vez do BFF (`bff.berberflow.shop`) — por isso o 404. O upload é feito por
profissionais na página "Minha Barbearia" (botão redondo no 1º card de vídeo).
Contexto de mídia = `stories` (mp4, ≤ 64 MB).

## 2. Estratégia de upload (está correta)

Presigned URL (escalável, servidor fora do caminho dos bytes):
1. `POST ${window.BFF_URL}/api/v1/media/presigned` (JWT do usuário) → recebe `uploadUrl`.
2. `PUT uploadUrl` com o binário (direto no storage).
3. `POST ${window.BFF_URL}/api/v1/media/confirmar` → BFF verifica + salva metadata.

Fluxo no frontend: `shared/js/MediaP2P.js`. Backend plugável (`barberflow-bff-api/routes/media.js`):
`STORIES_STORAGE_BACKEND === 'r2'` usa Cloudflare R2; senão Supabase Storage (default).

## 3. Causa raiz (H1) — `window.BFF_URL` nunca é configurado no frontend

Cadeia comprovada:

- `shared/js/MediaP2P.js:39` lê `window.BFF_URL` no carregamento da classe; se vazio,
  `#BFF_URL = ''` → `fetch('/api/v1/media/presigned')` vira **URL relativa** no domínio
  do app → **404**. O `MediaP2P` não tem fallback.
- `window.BFF_URL` **não é atribuído em NENHUM lugar** de `apps/` ou `shared/`
  (busca por `window.BFF_URL = …` sem resultados).
- Os entrypoints Vite apenas validam e **descartam** o resultado, sem setar a global:
  `src/vite/profissional-entry.js` e `src/vite/cliente-entry.js` chamam
  `ViteEnvValidator.validate({ required: [] })` (lista vazia).
- O nome de env esperado pelo validador (`src/vite/ViteEnvValidator.js`) é
  **`VITE_BFF_BASE_URL`** (não `VITE_BFF_URL`, não `NEXT_PUBLIC_*`) — porém nenhum
  código lê `import.meta.env.VITE_BFF_BASE_URL` para popular `window.BFF_URL`.
- Projeto Vercel do front pro — `barberflow-profissional` (root `apps/profissional`,
  id `prj_vWT0B1YPx7zo19Qa1Wg59fk0kcgQ`): possui apenas `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`. **Não há `VITE_BFF_BASE_URL`.**
- O painel admin funciona porque `AdminTabConfiguracoes.js` tem **fallback hardcoded
  próprio** (`hostname === 'localhost' ? local : 'https://bff.berberflow.shop'`),
  contornando `window.BFF_URL`. Por isso o login admin funcionou e o upload não.

**Onde a falha ocorre:** frontend (app pro) — a requisição nem chega ao BFF.

> **Atenção (corrige a suposição inicial):** configurar `VITE_BFF_BASE_URL` na Vercel
> **sozinho NÃO resolve**. Falta o código que liga `VITE_BFF_BASE_URL` → `window.BFF_URL`.
> A correção exige **código + env var + redeploy do front**.

## 4. Env vars esperadas vs presentes (front pro — sem expor valores)

| Esperada p/ o frontend | Presente em `barberflow-profissional` (Production)? |
|---|---|
| `VITE_BFF_BASE_URL` | ❌ ausente |
| `VITE_SUPABASE_URL` | (não usada hoje; `SUPABASE_URL` presente) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` | ✅ presentes |

> As credenciais de R2 NÃO são env var da Vercel: ficam cifradas no `system_config`
> (Supabase), injetadas em runtime via `R2ConfigService.patchProcessEnv()`, configuradas
> pelo painel admin. Irrelevante para o 404 atual (que é no front), mas será necessário
> quando/se o backend for trocado para R2 (`STORIES_STORAGE_BACKEND='r2'`).

## 5. App cliente (verificação preventiva)

`apps/cliente` não referencia `MediaP2P` nem `window.BFF_URL`, e `cliente-entry.js`
também não seta a global. Vídeo é recurso `stories` do profissional; o cliente não faz
upload de vídeo hoje, logo não está quebrado pelo mesmo motivo agora. Porém, qualquer
fluxo futuro do cliente que use `MediaP2P`/P2P/WebRTC (todos leem `window.BFF_URL`)
terá o mesmo defeito. Recomenda-se aplicar a mesma correção preventivamente no projeto
`barberflow-cliente`.

## 6. Regra de negócio do parceiro (associação à barbearia)

`StorySection/StoryBrowserMediaAdapter.js`:
`upload({ file, uid, barbershopId })` → `mediaP2P.fazerUpload(uid, 'stories', { barbershopId })`.

- O `/presigned` recebe apenas `{ context: 'stories', contentType, sizeBytes }` — o
  `context` é o **tipo de mídia**, não a barbearia.
- A barbearia-alvo viaja em **`metadata.barbershopId`** no `/confirmar` (etapa 3 do
  `MediaP2P`; `MediaUploadService.confirmUpload` repassa `metadata` ao
  `mediaRepository.confirmUploaded`).
- Portanto, para o parceiro postar na barbearia onde tem parceria, quem chama o adapter
  precisa passar o `barbershopId` **da barbearia parceira** (não a do próprio barbeiro).
  Validar isso — e os limites dono = 3 / parceiro = 1 — só é possível **depois** que o
  upload voltar a funcionar. Não é a causa do 404 atual.

## 7. Plano de correção (passo a passo — NÃO implementado)

**(a)** Env var correta: **`VITE_BFF_BASE_URL`** (padrão do `ViteEnvValidator`).

**(b) Código — ligar a env var a `window.BFF_URL`** (peça que falta), em
`src/vite/profissional-entry.js` (e `cliente-entry.js`), antes de importar o app:
```js
const env = ViteEnvValidator.validate({
  appName: 'profissional',
  env: import.meta.env,
  required: ['VITE_BFF_BASE_URL'],
});
window.BFF_URL = env.VITE_BFF_BASE_URL;
await import('@profissional/app.js');
```
*Alternativa sem env var* (mais simples, segue padrão já existente no repo): dar ao
`MediaP2P` o mesmo fallback hardcoded do `AdminTabConfiguracoes`
(`hostname === 'localhost' ? local : 'https://bff.berberflow.shop'`).
Recomendação: via env var (configurável por ambiente).

**(c) Env var na Vercel (projeto FRONT, não o BFF):** em `barberflow-profissional`,
`VITE_BFF_BASE_URL = https://bff.berberflow.shop` (Production). Vite injeta `VITE_*`
em build → exige redeploy.

**(d) Redeploy SÓ do front pro** (`barberflow-profissional`). **Não** redeployar o BFF.

**(e) Verificação fim-a-fim:** F12 → Network:
`POST bff.berberflow.shop/api/v1/media/presigned` 200 → `PUT uploadUrl` 200 →
`POST .../media/confirmar` 200; vídeo aparece na barbearia correta; limites
dono = 3 / parceiro = 1 respeitados; `barbershopId` = barbearia parceira.

## 8. Arquivos relevantes

- `shared/js/MediaP2P.js` — lê `window.BFF_URL`, sem fallback (linha 39, 109, 137).
- `src/vite/profissional-entry.js`, `src/vite/cliente-entry.js` — não setam a global.
- `src/vite/ViteEnvValidator.js` — define o campo `VITE_BFF_BASE_URL`.
- `apps/profissional/assets/js/pages/MinhaBarbeariaPage/StorySection/StoryBrowserMediaAdapter.js`
  — passa `barbershopId` no metadata.
- `barberflow-bff-api/routes/media.js`, `application/media/MediaUploadService.js`,
  `config/media.js` — endpoint, orquestração e policy (`stories`: mp4, 64 MB).

---

## 9. EXECUÇÃO DA CORREÇÃO (2026-06-13)

### Descoberta durante a execução (corrige o plano original)
A produção do app pro/cliente **NÃO usa Vite**. O `vercel.json` de cada front tem
`buildCommand: "cp -r ../../shared ."` e `outputDirectory: "."` — serve os arquivos
**crus** de `apps/<app>/` com `<script defer>` clássicos. Logo, a edição no
`src/vite/*-entry.js` e a env var `VITE_BFF_BASE_URL` **não têm efeito no site ao vivo**
(o bundle Vite não é carregado). O fix efetivo é setar `window.BFF_URL` via `<script>`
inline no `index.html`, antes dos scripts clássicos. Autorizado pelo usuário.

### Diff aplicado

**(efetivo) `apps/profissional/index.html`** — antes de `<!-- Supabase SDK (CDN) -->`:
```html
<!-- Base do BFF — define window.BFF_URL antes de MediaP2P/P2P/WebRTC (scripts defer leem no load) -->
<script>window.BFF_URL = 'https://bff.berberflow.shop';</script>
```
**(efetivo, preventivo) `apps/cliente/index.html`** — mesmo bloco, mesma posição.

**(future-proofing) `src/vite/profissional-entry.js`** e **`src/vite/cliente-entry.js`**:
```js
const env = ViteEnvValidator.validate({ appName, env: import.meta.env, required: ['VITE_BFF_BASE_URL'] });
window.BFF_URL = env.VITE_BFF_BASE_URL;
```
(Mantido a pedido do usuário; só passa a valer se/quando o build Vite for adotado.)

### Env vars configuradas (Vercel — projetos FRONT, não o BFF)
- `barberflow-profissional`: `VITE_BFF_BASE_URL = https://bff.berberflow.shop` (Production, Development).
- `barberflow-cliente`: idem (Production, Development).
- Preview: não setado — a CLI v50 instalada não grava env de Preview sem branch; ambiente
  de Preview não afeta os domínios de produção. Adicionar pelo dashboard se necessário.

### Deploys (somente front; BFF intocado)
- Pro: `barberflow-profissional-8oz2utnth` (`dpl_AwAZrBy5jNqgiEmFDHAvCY9CBvEg`),
  target production → aliased `pro.berberflow.shop`.
- Cliente: `barberflow-cliente-2ukhdv6ta` → aliased `app.berberflow.shop`.
- BFF `barberflow-q5c4`: **não redeployado** (último deploy ~52 min antes); `GET /api/v1/health` = 200.

### Validação (passos a–h)
Verificado server-side por mim:
- ✅ HTML servido em `pro.berberflow.shop` e `app.berberflow.shop` agora contém
  `window.BFF_URL = 'https://bff.berberflow.shop'`.
- ✅ `POST https://bff.berberflow.shop/api/v1/media/presigned` (sem token) → **401**
  "Token de autenticação ausente." (não mais 404) → endpoint existe no domínio correto.
- ✅ BFF saudável e intocado.

Pendente (requer sessão de barbeiro real no navegador — **a fazer pelo usuário**):
- (a–g) Logar como dono de barbearia → Minha Barbearia → upload de vídeo curto → F12/Network:
  `presigned` 200 → `PUT` 200 → `confirmar` 200 → vídeo aparece no card.
- (h) Conferir no Supabase o registro criado (tabela `media_files`).

### TODO — barbeiro parceiro (item 6, só após o upload funcionar)
Verificar se a UI do parceiro envia `metadata.barbershopId` apontando para a barbearia
**parceira** (não a própria) no passo `/confirmar`, e se os limites dono=3 / parceiro=1
são respeitados. Não é causa do 404; validação posterior.

### Arquivos tocados
- Código (4): `apps/profissional/index.html`, `apps/cliente/index.html` (fix efetivo),
  `src/vite/profissional-entry.js`, `src/vite/cliente-entry.js` (future-proofing, a pedido).
- Env var (2 projetos): `VITE_BFF_BASE_URL` em `barberflow-profissional` e `barberflow-cliente`.
- Justificativa do nº de arquivos: o plano previa 1 arquivo de código, mas a produção usa
  scripts clássicos (não Vite) — descoberta na execução — exigindo o `index.html` como fix
  real; os `*-entry.js` foram mantidos como future-proofing por decisão explícita do usuário.
