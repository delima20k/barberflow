# Diagnóstico: upload de vídeo falhando — BarberFlow

**Data:** 2026-06-13
**Escopo:** somente leitura/análise. Nenhuma alteração de código, env var, config ou banco.
**Status:** causa raiz CONFIRMADA com erro real do navegador.

---

## 1. Erro real capturado

```
MediaP2P.js:109  POST https://pro.barberflow.live/api/v1/media/presigned  404 (Not Found)
```

A requisição de upload vai para o domínio do **próprio app** (`pro.barberflow.live`)
em vez do BFF (`bff.barberflow.live`) — por isso o 404. O upload é feito por
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
  próprio** (`hostname === 'localhost' ? local : 'https://bff.barberflow.live'`),
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
(`hostname === 'localhost' ? local : 'https://bff.barberflow.live'`).
Recomendação: via env var (configurável por ambiente).

**(c) Env var na Vercel (projeto FRONT, não o BFF):** em `barberflow-profissional`,
`VITE_BFF_BASE_URL = https://bff.barberflow.live` (Production). Vite injeta `VITE_*`
em build → exige redeploy.

**(d) Redeploy SÓ do front pro** (`barberflow-profissional`). **Não** redeployar o BFF.

**(e) Verificação fim-a-fim:** F12 → Network:
`POST bff.barberflow.live/api/v1/media/presigned` 200 → `PUT uploadUrl` 200 →
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
<script>window.BFF_URL = 'https://bff.barberflow.live';</script>
```
**(efetivo, preventivo) `apps/cliente/index.html`** — mesmo bloco, mesma posição.

**(future-proofing) `src/vite/profissional-entry.js`** e **`src/vite/cliente-entry.js`**:
```js
const env = ViteEnvValidator.validate({ appName, env: import.meta.env, required: ['VITE_BFF_BASE_URL'] });
window.BFF_URL = env.VITE_BFF_BASE_URL;
```
(Mantido a pedido do usuário; só passa a valer se/quando o build Vite for adotado.)

### Env vars configuradas (Vercel — projetos FRONT, não o BFF)
- `barberflow-profissional`: `VITE_BFF_BASE_URL = https://bff.barberflow.live` (Production, Development).
- `barberflow-cliente`: idem (Production, Development).
- Preview: não setado — a CLI v50 instalada não grava env de Preview sem branch; ambiente
  de Preview não afeta os domínios de produção. Adicionar pelo dashboard se necessário.

### Deploys (somente front; BFF intocado)
- Pro: `barberflow-profissional-8oz2utnth` (`dpl_AwAZrBy5jNqgiEmFDHAvCY9CBvEg`),
  target production → aliased `pro.barberflow.live`.
- Cliente: `barberflow-cliente-2ukhdv6ta` → aliased `app.barberflow.live`.
- BFF `barberflow-q5c4`: **não redeployado** (último deploy ~52 min antes); `GET /api/v1/health` = 200.

### Validação (passos a–h)
Verificado server-side por mim:
- ✅ HTML servido em `pro.barberflow.live` e `app.barberflow.live` agora contém
  `window.BFF_URL = 'https://bff.barberflow.live'`.
- ✅ `POST https://bff.barberflow.live/api/v1/media/presigned` (sem token) → **401**
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

---

## 10. SEGUNDO BLOQUEIO — 400 em /api/v1/media/presigned (2026-06-14)

Após o fix do `window.BFF_URL`, a requisição passou a chegar ao BFF, que respondeu **400**.

### Corpo real do 400 (capturado em Network → Response)
```json
{ "ok": false, "error": "The related resource does not exist" }
```
Payload enviado: `{ "context": "stories", "contentType": "video/mp4", "sizeBytes": 4126544 }`
(logado como barbeiro dono de barbearia; MP4 ~4 MB).

### "Campos faltando" — REFUTADO (no nível de código)
- `MediaController.presigned` ([controllers/MediaController.js:16](../barberflow-bff-api/controllers/MediaController.js#L16))
  só lê `context`, `contentType`, `sizeBytes`, `privacy`. Não exige `filename`/`barbershopId`/`mediaId`.
- O validador `MediaUploadService.#policy` ([application/media/MediaUploadService.js:101](../barberflow-bff-api/application/media/MediaUploadService.js#L101))
  valida só context/contentType/sizeBytes. Para o payload (stories, video/mp4, 4 MB) → **PASSA**.
- `barbershopId` só é usado no `/confirmar` (via `metadata`), **nunca** no `/presigned`.
  O frontend omitir `barbershopId` no presigned **está correto**.

### Onde o 400 nasce (eliminação por código)
- `#policy` passa; `reserve` (DB) → `_throwDbError` lança **500** (não 400);
  `MediaConfirmationSigner` usa `SUPABASE_JWT_SECRET` (presente) → não lança;
  `AbuseMiddleware` só dá 403/429; `express.json` ok.
- `ApiResponse.fail` ([utils/ApiResponse.js:53](../barberflow-bff-api/utils/ApiResponse.js#L53))
  usa `status = err.status ?? 500` e expõe a mensagem em 4xx.
- → Sobra **`storage.createSignedUpload`** (Supabase). Backend é Supabase Storage (default,
  pois R2 nunca foi configurado → `STORIES_STORAGE_BACKEND !== 'r2'`), que chama
  `db.storage.from('media-private').createSignedUploadUrl(path)`
  ([SupabaseMediaStorageGateway.js:17](../barberflow-bff-api/infrastructure/media/SupabaseMediaStorageGateway.js#L17)).

### Causa raiz CONFIRMADA — bucket `media-private` não existe
- A string `"The related resource does not exist"` **não está** no código da BFF, no SDK
  `@supabase`, nem em nenhum `node_modules` (grep vazio) → é mensagem **do servidor de
  Storage do Supabase**, repassada crua. Veio crua num **400** → saiu do `throw error` de
  `storage.createSignedUpload` (não do `reserve`, que viraria 500 genérico).
- O BFF usa **service role** (`SUPABASE_SERVICE_ROLE_KEY`,
  [utils/SupabaseClient.js:27](../barberflow-bff-api/utils/SupabaseClient.js#L27)) → **ignora RLS**.
  (Sondas com anon key davam "new row violates RLS" porque o RLS é avaliado antes; isso
  não se aplica ao BFF.) Com service role, a falha restante é a **referência ao bucket inexistente**.
- O gateway usa por default `MEDIA_SOURCE_BUCKET ?? 'media-private'` e `MEDIA_CDN_BUCKET ?? 'media-cdn'`;
  nenhuma dessas envs está setada em produção.
- As migrations de storage criam `avatars`, `portfolio`, `media-images`, `media-barbershop`
  (migrations 20260406000004 / 20260428121847 / 20260428130605). **Nenhuma cria
  `media-private` nem `media-cdn`.**

→ O módulo canônico de mídia espera os buckets `media-private`/`media-cdn`, que **nunca
foram provisionados** (nem por migration, nem por env). `createSignedUploadUrl` referencia
um bucket inexistente → "The related resource does not exist" → 400.

**Camada da falha:** Supabase Storage (banco/infra), **não** frontend nem validação de payload.

### Confirmação opcional
Supabase → Storage: verificar que não existe bucket `media-private` (nem `media-cdn`).
A anon key não confirma isso (info de bucket exige service role); o corpo do 400 já é prova.

### Plano de correção (NÃO implementado — escolher caminho)

**Caminho A (rápido, destrava já) — provisionar os buckets Supabase:**
Migration nova criando `media-private` (private) e `media-cdn` (público, para variantes
servidas), com `file_size_limit` ≥ 64 MB e `allowed_mime_types` incluindo `video/mp4` +
imagens, espelhando as migrations de bucket existentes. Aplicar no Supabase de produção
(o banco está atrás nas migrations — mesmo gap visto no `subscriptions.price`). Service
role já acessa; políticas de storage conforme o fluxo de leitura. Toca: 1 migration + aplicar.

**Caminho B (arquitetura pretendida) — ativar R2:**
Configurar credenciais R2 no painel admin (login já funciona) + `STORIES_STORAGE_BACKEND=r2`
+ criar bucket/CORS no R2. Exige também resolver o gap de deploy do R2 (seção H3 deste doc:
`@aws-sdk/client-s3` ausente no `package.json` da BFF; `src/infra/R2Client.js` fora do
`includeFiles` do `vercel.json`). Mais trabalho; melhor para escala/custo de egress.

**Recomendação:** Caminho A para destravar agora; Caminho B como evolução.

### Arquivos/itens relevantes
- `barberflow-bff-api/infrastructure/media/SupabaseMediaStorageGateway.js` (buckets default)
- `barberflow-bff-api/routes/media.js` (seleção de backend)
- `db/snapshots/schema-current.sql` (migrations de bucket — nenhuma cria media-private)
- Pendente p/ depois: limites dono=3 / parceiro=1 e `metadata.barbershopId` (barbearia parceira).

### 10.1 Re-verificação dos cenários "barbershopId/relação" (2026-06-14)

Pergunta re-investigada: o 400 seria uma **relação de barbearia/profissional/parceria**
faltando (cenário a: backend exige `barbershopId`; cenário b: backend descobre pelo
JWT mas a query volta vazia)? **Resposta: NÃO — nenhum dos dois.** Evidência:

1. **A string não está no código.** `grep -r "related resource does not exist"` em todo o
   repo + node_modules retorna **só este próprio doc**. Não há `throw` dessa mensagem na
   BFF → é mensagem **remota do Storage do Supabase**, repassada crua pelo `ApiResponse.fail`.
2. **O presigned não consulta barbearia/parceria.** `grep -niE
   "barbershop|barbearia|professional|partner|parceria"` em `MediaController.js`,
   `MediaUploadService.js`, `SupabaseMediaRepository.js`, `SupabaseMediaStorageGateway.js`
   → **vazio**. O único dado de identidade usado é `req.user.id` como `ownerId` (path e
   `media_files.owner_id`). Não há lookup de barbearia/profissional/parceria.
3. **`media_files` EXISTE em produção** (`GET /rest/v1/media_files` → 200 `[]`;
   `media_variants` → 200). Como `createSignedUpload` faz `reserve` (insert em `media_files`)
   **antes** do storage, e a tabela existe, o `reserve` passa. Um erro de DB viraria **500**
   (via `_throwDbError`). O observado é **400** → prova que o `reserve` passou e a falha é o
   **passo seguinte, o storage** (`createSignedUploadUrl('media-private', …)`).

→ **Cenário correto = (c): bucket de Storage `media-private` inexistente.** O "related
resource" é o **bucket**, não uma FK/linha de barbearia. O frontend omitir `barbershopId`
no presigned está **correto** (só é usado no `/confirmar`, via `metadata`). **Não é preciso
o user.id do barbeiro de teste** — o status de barbearia/parceria dele é irrelevante para
este 400, pois o fluxo nunca consulta essas tabelas.

**Correção (inalterada):** Caminho A — criar os buckets `media-private`/`media-cdn` no
Supabase (seção 10). Não há nada a corrigir em frontend nem em query de barbearia.

### 10.2 PROVA DEFINITIVA — bucket `media-private` não existe (2026-06-14)

Teste auth-free no endpoint público de objeto do Storage, que distingue bucket
inexistente ("Bucket not found") de objeto inexistente em bucket existente ("Object not found"):
```
GET /storage/v1/object/public/<bucket>/probe.txt   (anon)
  media-private     → "Bucket not found"   ← NÃO existe
  media-cdn         → "Bucket not found"   ← NÃO existe
  media-public      → "Bucket not found"   ← NÃO existe
  avatars           → "Object not found"   ← bucket existe
  portfolio         → "Object not found"   ← bucket existe
  media-images      → "Object not found"   ← bucket existe
  media-barbershop  → "Object not found"   ← bucket existe
  bucket-fake-zzz   → "Bucket not found"   ← controle (inexistente)
```
→ Os buckets criados pelas migrations existem; **`media-private` e `media-cdn` (usados pelo
módulo de mídia) NÃO existem**. (As sondas anteriores via info-de-bucket / sign-upload eram
inconclusivas porque a anon key bate em RLS antes da checagem; o endpoint público acima
não tem essa limitação.)

### Trecho de código EXATO que propaga a mensagem
A string `"The related resource does not exist"` é gerada pelo **servidor de Storage do
Supabase** (não há `throw` dela na BFF — grep vazio). O ponto que a **re-lança crua** é
`infrastructure/media/SupabaseMediaStorageGateway.js:17-26`:
```js
async createSignedUpload({ path }) {
  this.#assertStorage();
  const { data, error } = await this.#db.storage
    .from(this.#sourceBucket)                       // this.#sourceBucket = 'media-private'
    .createSignedUploadUrl(path, { upsert: false }); // bucket inexistente → error
  if (error) throw error;                            // ← re-lança o StorageApiError cru
  return { uploadUrl: data.signedUrl, token: data.token, expiresAt: ... };
}
```
`this.#sourceBucket = process.env.MEDIA_SOURCE_BUCKET ?? 'media-private'` (env não setada →
default `media-private`). O `StorageApiError` tem `.status = 400` e `.message =
"The related resource does not exist"`; `ApiResponse.fail` usa `status = err.status` e expõe
a mensagem (4xx) → **400** com esse corpo.

### Causa raiz confirmada (mapa das hipóteses a–f)
- (a) frontend omite `barbershopId` obrigatório → **NÃO** (endpoint não exige/usa barbershopId no presigned).
- (b) backend descobre por query errada → **NÃO** (presigned não faz query de barbearia/parceria).
- (c) usuário de teste sem barbearia → **NÃO** (fluxo não consulta dados do usuário; irrelevante).
- **(d) bucket de storage não existe → SIM, CONFIRMADO** (`media-private`/`media-cdn` ausentes).
- (e) migration faltante → **SIM, contribui**: nenhuma migration cria `media-private`/`media-cdn`
  (as existentes criam avatars/portfolio/media-images/media-barbershop). Logo o fix é uma
  migration NOVA (ou criação via dashboard), não "reaplicar" algo existente.
- (f) outra → não.

### Plano de correção (NÃO implementar)
- **Camada:** banco/storage do Supabase apenas. **Zero linha de código de app** (frontend e
  BFF já corretos).
- **O que fazer:** criar os buckets `media-private` (privado) e `media-cdn` (público, para
  variantes servidas), com `file_size_limit` ≥ 64 MB e `allowed_mime_types` incluindo
  `video/mp4` + `image/jpeg,png,webp`. Via:
  - **Migration nova** `*_create_media_pipeline_buckets.sql` (~20–40 linhas SQL, espelhando
    `20260428121847_create_storage_buckets.sql`) + aplicar no Supabase; **ou**
  - **Dashboard** Supabase → Storage → New bucket (0 linhas, mais rápido para destravar).
- **Estimativa de mudança:** 1 arquivo de migration (~30 linhas SQL) **ou** ação no dashboard;
  **nenhum** arquivo de código JS alterado.
- **Risco:** baixo. Criação de bucket é aditiva e idempotente (`on conflict do nothing`).
  O bucket `media-private` é privado (RLS); o BFF usa service role (bypassa RLS) para
  presign/confirm. Validar depois a cadeia presigned 200 → PUT 200 → confirmar 200.

---

## 11. TERCEIRO BLOQUEIO — PUT para `/undefined` (404) após presigned 200 (2026-06-14)

Buckets criados → presigned subiu de 400 para **200**. Novo erro:
```
PUT https://pro.barberflow.live/undefined  → 404 Not Found
```

### Causa raiz: descasamento de contrato (envelope `dados`)
- **Backend** envelopa a resposta. `MediaController.presigned` →
  `this.created(res, signed)` → `ApiResponse.created` (`utils/ApiResponse.js`):
  ```js
  static created(res, dados) { res.status(201).json({ ok: true, dados }); }
  ```
  → corpo real: `{ "ok": true, "dados": { mediaId, path, uploadUrl, token, expiresAt, publicUrl } }`.
- **Frontend** lê do **topo** (`shared/js/MediaP2P.js:123`):
  ```js
  const { uploadUrl, path, publicUrl, token: hmac, expiresAt, mediaId } = await presResp.json();
  // ...
  const uploadResp = await fetch(uploadUrl, { method: 'PUT', ... });  // uploadUrl === undefined
  ```
  Como os campos estão em `.dados.*`, o destructure do topo retorna **`undefined`** para
  TODOS (`uploadUrl`, `path`, `publicUrl`, `hmac`, `mediaId`). `fetch(undefined)` vira a
  string `"undefined"` → URL relativa no domínio do app → **404**.
- **Convenção do projeto:** os consumidores padrão do BFF no frontend desempacotam `.dados`:
  `BffApiService.js` e `BackendApiService.js` fazem `json?.dados ?? json`. **`MediaP2P` é o
  único outlier** que lê do topo → é o lado com o bug. Mapeia para a hipótese **(b)** da
  sua lista (envelope: backend manda `{ dados: { url } }`, frontend lê `.url` direto).

### Plano de correção (NÃO implementar) — ajustar o FRONTEND
Em `shared/js/MediaP2P.js:123`, desempacotar `.dados` (alinhando ao resto do app):
```js
// antes:
const { uploadUrl, path, publicUrl, token: hmac, expiresAt, mediaId } = await presResp.json();
// depois:
const { dados } = await presResp.json();
const { uploadUrl, path, publicUrl, token: hmac, expiresAt, mediaId } = dados ?? {};
```
Isso conserta a cadeia inteira de uma vez (PUT **e** confirmar), pois `mediaId`/`path`/
`hmac`/`expiresAt` — enviados no `/confirmar` — também vêm desse mesmo destructure.

**Por que frontend e não backend:** o envelope `{ ok, dados }` é o **padrão de toda a BFF**
(`ApiResponse.success/created`), já consumido por `BffApiService`/`BackendApiService` e
coberto por testes de contrato (`tests/contract`, `tests/e2e/upload.e2e.test.js`). Mudar o
backend para resposta "flat" quebraria a consistência e esses testes. O fix correto é
alinhar o `MediaP2P` à convenção.

**Estimativa:** 1 arquivo (`shared/js/MediaP2P.js`), ~2 linhas. + bump de versão do SW
(mudança em `shared/`) + redeploy do front (scripts clássicos, como no fix do `window.BFF_URL`).
Nenhuma mudança no BFF, banco ou storage.

### Próximo passo após o fix (a observar no teste)
Com a URL correta, o **PUT** vai direto ao Supabase Storage (signed upload URL). Se o PUT
falhar com **CORS/403**, será o próximo item (configurar CORS do bucket / verificar o token
da signed URL) — mas só investigar se aparecer.

---

## 12. QUARTO ESTADO — vídeo aparece no card mas sem thumbnail e sem reprodução (2026-06-14)

Upload completo (presigned 201 → PUT 200 → confirmar 2xx). Story aparece no card.
Dois problemas persistem:
- Card mostra `▶` placeholder em vez de thumbnail (primeira frame do vídeo).
- Clicar no card abre o `PortfolioPrismViewer` mas o `<video>` não tem `src` → nada reproduz.

---

### 12.1 Thumbnail nunca é gerado para vídeos

#### Cadeia de pipeline

**`barberflow-bff-api/application/media/steps/ThumbnailStep.js:14`**
```js
async handle(input) {
  if (input.metadata.mediaKind !== 'image') return input;  // ← pula vídeos inteiramente
```
`ThumbnailStep` retorna `input` sem modificação para qualquer tipo que não seja imagem.

**`src/media/VideoProcessor.js`** — `extractThumbnail()`
```js
return { data: Buffer.alloc(0), contentType: 'image/jpeg', bytes: 0, pending: true,
  todo: 'TODO: delegar thumbnail/transcode para worker/fila de media quando disponivel.' };
```
Método placeholder; `thumbnailExtractor` é `null` por padrão. Nunca extrai frames reais.

**`barberflow-bff-api/infrastructure/media/NoopVideoTranscoder.js`** — `transcode()`
```js
// retorna [] → nenhuma variante derivada produzida para vídeos
```
`TranscodeStep` chama `this.#transcoder.transcode(input)` para `mediaKind === 'video'`
e obtém `[]`.

#### Campos no schema: existem mas nunca preenchidos

- `stories.thumbnail_path` (TEXT nullable) — existe; nunca é escrito para o novo pipeline.
- `media_variants` — tabela para variantes (`name='thumb'` seria o thumbnail); vazia para vídeos.

#### Comportamento no frontend

`MinhaBarbeariaRuntimeController.js:2046`:
```js
const thumbUrl = story.thumbnail_path
  ? SupabaseService.getLogoUrl(story.thumbnail_path)
  : null;
// null → <div class="mb-slot-vazio">▶</div>   (fallback correto, mas thumbnail nunca chega)
```

---

### 12.2 URL do vídeo é null → `<video src>` vazio → sem reprodução

#### Passo 1 — Query de stories retorna `public_url = null`

`BarbeariaRepository.listarStoriesAtivos` (linha 1081):
```js
.select('..., media_files!stories_media_id_fkey(path, public_url)')
```
`media_files.public_url` é **sempre null** neste ponto: só é preenchido após `PROCESS_MEDIA`
publicar a variante no CDN — o que nunca acontece (ver 12.3).

#### Passo 2 — BarbeariaService tenta R2, falha silenciosamente, retorna undefined

`BarbeariaService.listarStoriesAtivos` (linhas 525–539):
```js
try {
  const r2 = R2Client.getInstance();       // LANÇA — R2 não configurado em produção
  return await Promise.all(stories.map(story => {
    ...
    try {
      const mediaUrl = await r2.presignedGet(r2Path, 3600);
      return { ...story, media_url: mediaUrl };
    } catch {
      const fallback = story.media_files?.public_url || null;  // null
      return { ...story, media_url: fallback };
    }
  }));
} catch {
  return stories;  // ← outer catch: retorna stories SEM o campo media_url (undefined)
}
```
R2 não está configurado em produção → `R2Client.getInstance()` lança → outer `catch` →
stories retornam **sem o campo `media_url`** (campo ausente, não null).

#### Passo 3 — Frontend avalia `fullUrl` como null porque `media_id` está setado

`MinhaBarbeariaRuntimeController.js:2044-2045`:
```js
const items = this.#storiesData.map(s => ({
  fullUrl: s.media_url ?? (s.media_id ? null : SupabaseService.getLogoUrl(s.storage_path)),
```
- `s.media_url` é `undefined` (campo ausente) → nullish → avalia a direita
- `s.media_id` **está setado** (novo pipeline) → `media_id ? null : ...` → **`fullUrl = null`**

Esta lógica é **intencional e correta**: `storage_path` aponta para `media-private`
(bucket privado) e não pode ser servido como URL pública. O problema é que `media_url`
também é null/undefined.

`PortfolioPrismViewer` recebe `{ fullUrl: null, ... }` → `<video>` criado com
`el.src = null` → vídeo não carrega → sem reprodução.

---

### 12.3 Por que PROCESS_MEDIA não roda em produção

`MediaUploadService.confirmUpload` (linha 77) enfileira o job:
```js
const outboxId = await this.#outboxRepository.save({
  eventName: JOB_TYPES.PROCESS_MEDIA,
  queue: QUEUES.MEDIA,
  payload: { mediaId, ownerId, context, path, contentType },
});
```
Para o job rodar seria necessário:
1. Outbox table existir em produção (migration `20260531000002` — aplicação pendente).
2. `OutboxRelay` em execução — é processo de longa duração (`workers/worker.js`);
   **não sobrevive no Vercel serverless** entre requests.
3. `MediaProcessingHandler` com `NoopVideoTranscoder` substituído por transcode real.

Mesmo que o relay rodasse, `NoopVideoTranscoder.transcode()` retorna `[]` →
`CDNPublishStep` não tem variantes para publicar → `media-cdn` permanece vazio →
`media_files.public_url` nunca é preenchido.

---

### 12.4 O vídeo existe e pode ser servido via signed URL de `media-private`

O arquivo está **fisicamente presente** em `media-private` no caminho:
`stories/{ownerId}/incoming/{mediaId}.mp4`

O bucket `media-private` existe (criado pela migration 20260614000001).
Supabase Storage aceita `createSignedUrl` de buckets privados independentemente de RLS:
```js
await db.storage.from('media-private').createSignedUrl(path, 3600)
// → { signedUrl: 'https://...supabase.co/storage/v1/object/sign/media-private/...?token=...' }
```
Essa URL de 1h funcionaria no `<video src>` sem nenhuma mudança de banco ou pipeline.

---

### 12.5 Resumo de causas

| Sintoma | Causa raiz | Arquivo / linha |
|---------|-----------|-----------------|
| Thumbnail = placeholder `▶` | `ThumbnailStep` pula vídeos | `steps/ThumbnailStep.js:14` |
| `thumbnail_path` sempre null | Nenhum step escreve `stories.thumbnail_path` | — |
| `<video>` sem `src` | `fullUrl = null` quando `media_id` setado e `media_url` ausente | `MinhaBarbeariaRuntimeController.js:2045` |
| `media_url` ausente | R2 não configurado → outer catch → campo não adicionado | `BarbeariaService.js:538` |
| `public_url` = null | `PROCESS_MEDIA` nunca rodou → sem variante no CDN | `MediaUploadService.js:77` + `NoopVideoTranscoder` |

---

### 12.6 Plano de correção (NÃO implementado)

#### Fix A — Imediato: signed URL direto de `media-private` no BFF (1 arquivo, ~3 linhas)

Em `BarbeariaService.listarStoriesAtivos`, substituir o inner `catch` para, quando
`public_url` é null, gerar signed URL do bucket de origem:
```js
// inner catch (linha ~533), em vez de retornar public_url null:
try {
  const { data } = await this._db.storage
    .from('media-private')
    .createSignedUrl(story.media_files.path, 3600);
  return { ...story, media_url: data?.signedUrl ?? null };
} catch {
  return { ...story, media_url: null };
}
```
O vídeo é servido com URL de 1h, sem pipeline de processamento.
**Ponto de atenção arquitetural:** o endpoint `/stories` é público (sem auth).
Expor signed URLs de `media-private` para consumers anônimos está alinhado com a
proposta do produto (stories públicos de barbearia)?

Arquivo: `barberflow-bff-api/services/BarbeariaService.js`.

#### Fix B — Thumbnail client-side (frontend, sem backend)

Após obter `fullUrl` válido (Fix A), gerar thumbnail via `<video>` + `<canvas>` ao
carregar o vídeo, sem persistir:
```js
video.addEventListener('seeked', () => {
  const canvas = document.createElement('canvas');
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  thumbImg.src = canvas.toDataURL('image/jpeg');
});
video.currentTime = 1;
```
Gera na hora; não persiste em banco. Adequado como solução transitória.

#### Fix C — Pipeline real (longo prazo)

1. Substituir `NoopVideoTranscoder` por extração de thumbnail via FFmpeg.
2. Ativar `OutboxRelayTask` em produção (scheduler Vercel cron ou worker separado).
3. `CDNPublishStep` publica variante em `media-cdn`, preenche `media_files.public_url`.
4. `confirmUpload` ou o handler grava `stories.thumbnail_path` após geração.
5. Frontend passa a servir thumbnail do campo já existente `stories.thumbnail_path`.

**Recomendação de sequência:** Fix A (produção imediata) → Fix B (UX) → Fix C (arquitetura).
