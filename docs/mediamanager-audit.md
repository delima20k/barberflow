# Auditoria estatica do MediaManager

Data: 2026-05-23.

Escopo: analise estatica sem alteracao de codigo. O alvo principal e `src/services/MediaManager.js`, com cruzamento em `src/controllers/MediaController.js`, `src/app.js`, `shared/js/MediaP2P.js`, `shared/js/AvatarService.js`, `apps/profissional/assets/js/pages/MinhaBarbeariaPage/MinhaBarbeariaRuntimeController.js`, testes e historico Git.

## Resumo executivo

`MediaManager` e uma fachada backend de midia, mas ainda concentra validacao de contexto, presigned upload, confirmacao, roteamento Supabase/R2, persistencia de metadados, delecao, listagem, criptografia, chunking, hash, P2P server-side opcional, cache e download seguro. O arquivo atual tem 662 linhas.

O nome "MediaManager" tambem mascara um segundo acoplamento: no frontend, `MediaP2P` faz selecao/preview/upload direto e `MinhaBarbeariaRuntimeController` usa esse objeto para produtos/servicos, enquanto Story e Portfolio ja foram marcados nas sections como dependentes de um corte futuro de midia. Portanto, a decomposicao deve tratar backend e frontend como contratos separados, sem tentar resolver tudo no mesmo commit.

## Arquivos e consumidores

| Arquivo | Papel | Linhas relevantes |
|---|---|---:|
| `src/services/MediaManager.js` | Fachada backend de midia, storage, metadados e pipeline seguro | 43-662 |
| `src/controllers/MediaController.js` | Rotas Express `/api/media`, parser raw, upload image, barbershop image | 61-348 |
| `src/app.js` | Composicao DI: instancia `MediaManager` e injeta no controller | 47-52, 173-178, 194-195 |
| `shared/js/MediaP2P.js` | Cliente browser para preview local, presigned upload e streaming de video | 32-336 |
| `shared/js/AvatarService.js` | Fluxo de avatar via BFF `/api/media/upload-image` e fallback direto | 62-110 |
| `apps/profissional/.../MinhaBarbeariaRuntimeController.js` | Usa `MediaP2P` para preview/upload de imagem de item | 53, 1916-1983 |
| `tests/media-manager.test.js` | Cobertura principal de upload/download/seguranca/roteamento | 140-660 |

## Responsabilidades misturadas

### 1. Upload presigned e confirmacao

| Item | Evidencia |
|---|---|
| Funcoes/metodos | `gerarUrlPresigned()` em `MediaManager.js:178-199`; `confirmarUpload()` em `MediaManager.js:219-293`; rotas `/presigned` e `/confirmar` em `MediaController.js:70-107`; cliente browser em `MediaP2P.js:99-153`. |
| Estado interno compartilhado | `#storage`, `#supabase`, `#signingSecret`; constantes globais `MIME_PARA_EXT`, `CONTEXTOS`, `PRESIGNED_EXPIRES_SECS`. O mesmo estado decide MIME, path, HMAC, provider de storage e insert em `media_files`. |
| Side effects | URL preassinada em storage, HEAD em storage, delete de arquivo acima do limite, insert em Supabase, `fetch()` browser para BFF e PUT direto ao storage. |
| Pontos de falha | Contrato divergente: `MediaController` espera body `{ contexto, contentType }`, mas `MediaP2P` envia `{ context, contentType, sizeBytes }`; confirmacao espera `{ path, contexto, token, expiresAt }`, mas `MediaP2P` envia `{ mediaId, path, context, confirmationToken, expiresAt }`. Isso indica risco de fluxo browser quebrado ou dependente de rota BFF canonica diferente. |
| Historico | `f42cbdc` domina as linhas atuais 178-293; `9161057` introduziu roteamento imagens->Supabase/videos->R2; `dbf8f33` adicionou upload flow/P2P/IndexedDB; `1b03d9d` adicionou pipeline async BFF posterior. |

### 2. Validacao de MIME, tamanho e contexto

| Item | Evidencia |
|---|---|
| Funcoes/metodos | Constantes `MIME_PARA_EXT` e `CONTEXTOS` em `MediaManager.js:52-86`; validacao em `gerarUrlPresigned()` `178-188`, `confirmarUpload()` `219-263`, `uploadMedia()` `397-411`, `registrarImagemProcessada()` `636-638`. |
| Estado interno compartilhado | `CONTEXTOS` contem limites e MIME por dominio (`stories`, `avatars`, `services`, `portfolio`). Alterar um limite afeta presigned, confirmacao, upload criptografado e registro processado. |
| Side effects | Em confirmacao, arquivo acima do limite dispara delecao no storage (`MediaManager.js:256-258`). |
| Pontos de falha | Nao ha validacao de dimensoes, duracao de video/audio, magic bytes no `MediaManager`; parte do magic byte existe no controller para barbershop image (`MediaController.js:254-260`, `_detectarMime()` `339-346`). Payload `metadata` e aceito livremente. |
| Historico | `tests/media-manager.test.js:202-235` cobre tamanho/MIME/buffer/UUID para `uploadMedia`; `tests/media-manager.test.js:515-622` cobre roteamento, mas nao dimensoes/duracao. |

### 3. Roteamento Supabase Storage vs R2

| Item | Evidencia |
|---|---|
| Funcoes/metodos | `gerarUrlPresigned()` chama `#storage.presignedPut()` e `#storage.publicUrl()` em `MediaManager.js:195-196`; `confirmarUpload()` usa `#storage.head()`, `#storage.backendPara()` e `#storage.publicUrl()` em `246-270`; `deletar()` chama `#storage.delete()` em `319`. |
| Estado interno compartilhado | `#storage` encapsula R2 e SupabaseStorage; `metadata.storage_backend` persistido em `confirmarUpload()` influencia delecao futura. |
| Side effects | Chamadas a R2/Supabase Storage, URL publica e delecao fisica. |
| Pontos de falha | A delecao apaga fisicamente storage e registro (`MediaManager.js:319-321`), sem soft delete/retencao. `publicUrl(path)` fixa contexto `stories` (`MediaManager.js:564-565`), risco se usado para `avatars/services/portfolio`. |
| Historico | `tests/media-manager.test.js:513-660` foi criado para proteger roteamento Supabase vs R2. `a9eb28f` registra decomposicao parcial `MediaManager -> StorageService`. |

### 4. Persistencia de metadados e listagem

| Item | Evidencia |
|---|---|
| Funcoes/metodos | Insert em `confirmarUpload()` `MediaManager.js:273-286`; insert em `uploadMedia()` `442-462`; `registrarImagemProcessada()` `636-658`; `listar()` `343-365`; `deletar()` `310-321`. |
| Estado interno compartilhado | `#supabase`; schema implicito de `media_files`; metadados livres misturam `storage_backend`, `cripto`, `integrity_hash`, `peers_used` e metadados de consumidor. |
| Side effects | Insert/select/delete em `media_files`. |
| Pontos de falha | `metadata` nao tem schema por contexto; Story/Portfolio podem salvar chaves diferentes sem contrato. Erros do Supabase sao repassados como `Error(error.message)` com status 500, sem erro tipado de dominio. |
| Historico | `44c8bd6` criou `MediaManager`, `R2Client`, `MediaController` e `media_files`; `1b03d9d` adicionou pipeline async BFF, criando possivel duplicidade conceitual com `barberflow-bff-api/application/media`. |

### 5. Upload criptografado, chunks, hash e P2P server-side

| Item | Evidencia |
|---|---|
| Funcoes/metodos | `uploadMedia()` em `MediaManager.js:397-467`; construtor injeta `#encryption`, `#chunks`, `#hash`, `#peerHealth`, `#p2pUploader` em `141-155`. |
| Estado interno compartilhado | `#encryption`, `#chunks`, `#hash`, `#peerHealth`, `#p2pUploader`, `#storage`, `#supabase`; todos usados em um unico metodo sequencial. |
| Side effects | Criptografia CPU-bound, chunking em memoria, hash SHA, upload opcional para peer, upload backup R2, insert em Supabase. |
| Pontos de falha | `cripto.key` e salva em `media_files.metadata` (`MediaManager.js:454`) com comentario para substituir por KMS. P2P falha silenciosamente (`catch (_)`) e so o `peersUsed` revela queda. `...Object.keys(metadata).length > 0 ? metadata : {}` tem precedencia pouco legivel e deve ser tratado com cuidado em refatoracao. |
| Historico | `9dc3423` adicionou AES/chunks/hash; `4e93f2b` integrou upload/download com criptografia, chunks e fallback; `tests/media-manager.test.js:140-235` cobre happy path e erros de upload. |

### 6. Download seguro, cache e fallback

| Item | Evidencia |
|---|---|
| Funcoes/metodos | `downloadMedia()` em `MediaManager.js:494-550`; `#baixarDeP2P()` em `581-589`. |
| Estado interno compartilhado | `#supabase`, `#cache`, `#storage`, `#hash`, `#encryption`, `#peerHealth`, `#p2pDownloader`. |
| Side effects | Select em Supabase, P2P get, cache get/set, R2 getBuffer, decriptografia e validacao de integridade. |
| Pontos de falha | Cache armazena ciphertext sob `fileId`; se metadados de cripto forem corrompidos ou chave vazar, a seguranca cai. Provider closure ignora `_fid`, o que funciona, mas dificulta testes isolados. |
| Historico | `tests/media-manager.test.js:245-435` cobre download, acesso negado, fallback R2, ciphertext corrompido, cache e UUIDs invalidos. |

### 7. Compressao/redimensionamento de imagem

| Item | Evidencia |
|---|---|
| Funcoes/metodos | Nao esta dentro do `MediaManager`; esta em `ImageProcessor.js:55-239` e e chamado pelo `MediaController` em `MediaController.js:165-168`. O registro final volta para `MediaManager.registrarImagemProcessada()` em `MediaController.js:179-187`. |
| Estado interno compartilhado | `ImageProcessor` tem configuracao estatica privada de dimensao/qualidade (`ImageProcessor.js:57-64`). `MediaController` decide se chama `processAvatar()` ou `processIcon()` por contexto. |
| Side effects | CPU/memoria via `sharp`, upload para Supabase Storage, insert de metadata via MediaManager. |
| Pontos de falha | Portfolio usa `processIcon()` por cair no else do controller; nao ha Strategy por foto, screenshot ou GIF animado. Barbershop image pula processamento por design (`MediaController.js:202-294`). |
| Historico | `021c1da` introduziu ImageProcessor e rota upload-image; `bf0ad51` corrigiu dependencia `sharp`. |

### 8. Renderizacao de preview e selecao/leitura browser

| Item | Evidencia |
|---|---|
| Funcoes/metodos | Nao esta no backend `MediaManager`. `MediaP2P.registrar()` cria Blob URL em `MediaP2P.js:72-83`; `cancelar/cancelarTodos/#revogar` em `200-227`; `MinhaBarbeariaRuntimeController.#onUploadImagemItem()` aplica preview no DOM em `1936-1947`; `AvatarService` usa `file.arrayBuffer()` em `AvatarService.js:69-71`. |
| Estado interno compartilhado | `MediaP2P.#pendentes` guarda `{ file, blobUrl }`; `MinhaBarbeariaRuntimeController.#mediaP2P` fica como dependencia privada do god-file em `MinhaBarbeariaRuntimeController.js:53`. |
| Side effects | `window.confirm`, `URL.createObjectURL`, `URL.revokeObjectURL`, `fetch`, `File.arrayBuffer`, mutacao direta de `img.src` e `dataset`. |
| Pontos de falha | Preview e upload real divergem: o runtime faz preview via `MediaP2P`, mas salva produto diretamente no `SupabaseService.storageBarbershops()` em `MinhaBarbeariaRuntimeController.js:1970-1982`, sem passar pelo BFF canonico. |

### 9. Processamento de video

| Item | Evidencia |
|---|---|
| Funcoes/metodos | Backend `MediaManager` aceita videos em `stories` (`MediaManager.js:66-72`) e roteia para R2, mas nao faz trim/thumbnail/transcode. Frontend `MediaP2P.streamVideo()` faz streaming progressivo em `MediaP2P.js:246-308`. Pipeline BFF novo existe em `barberflow-bff-api/application/media`, fora deste MediaManager legado. |
| Estado interno compartilhado | `MediaP2P.streamVideo()` cria `MediaSource`, `SourceBuffer`, reader e Blob URL temporaria. |
| Side effects | Fetch de video, MediaSource API, `videoEl.src`, `videoEl.play()`, Blob URL. |
| Pontos de falha | Sem duracao maxima, sem thumbnail canonico, sem transcode no MediaManager atual. `MediaSource` tem fallback para browsers sem suporte, mas o objeto URL e revogado apenas em caminhos especificos. |

### 10. Integracao com Story e Portfolio

| Item | Evidencia |
|---|---|
| Story | `CONTEXTOS.stories` permite video, imagem e audio (`MediaManager.js:66-72`). `docs/sections/StorySection.md` registra que upload visual continua no runtime legado ate corte do MediaManager. |
| Portfolio | `CONTEXTOS.portfolio` permite imagens ate 10 MB (`MediaManager.js:82-85`). `docs/sections/PortfolioSection.md` marca Portfolio como placeholder e dependencia futura de MediaManager. |
| Contrato atual | Nao ha `StoryMediaAdapter` nem `PortfolioMediaAdapter`. O contrato e string `contexto` + `metadata` livre. |
| Risco | Story e Portfolio compartilham conceitos de midia sem contrato de dominio: path, publicUrl, contentType, tamanho, metadata e ownership sao definidos por conveniencia tecnica, nao pelo consumidor. |

## Acoplamento externo

| Quem chama | Como chama | Observacao |
|---|---|---|
| `src/app.js` | `new MediaManager(r2Client, supabase, { supabaseStorage, peerHealth })` e injeta em `criarMediaController()` | DI existe, mas o construtor ainda cria `StorageService`, `EncryptionService`, `ChunkService` e `HashService` internamente. |
| `MediaController` | `gerarUrlPresigned`, `confirmarUpload`, `registrarImagemProcessada`, `deletar`, `listar` | Controller contem parser raw, validacao especifica e upload barbershop; parte da regra de midia esta fora do service. |
| `SecureMediaAccessService` | Rota separada `/api/media/secure`, sem passar pelo `MediaManager` | Acesso assinado privado ja esta em outro service, possivel convergencia futura. |
| `MediaP2P` | Chama endpoints BFF e PUT direto ao storage | Usa globals `window.BFF_URL` e `SupabaseService`; contrato de body difere do controller legado. |
| `MinhaBarbeariaRuntimeController` | Usa `MediaP2P` para preview e depois Supabase Storage direto para produtos | Acoplamento direto a DOM, dataset, SupabaseService e ApiService. |
| `AvatarService` | BFF `/api/media/upload-image?contexto=avatars`, fallback direto | IIFE com funcoes internas, nao classe; toca DOM e storage indiretamente. |

## Estado interno compartilhado que gera medo de mexer

| Estado | Onde | Por que e sensivel |
|---|---|---|
| `#storage` | `MediaManager.js:93-95` | Decide provider, URL, HEAD, delete e public URL; qualquer mudanca impacta stories, avatar, services e portfolio. |
| `#supabase` | `96-97` | Usado para insert/select/delete em `media_files`; erros vazam como 500 generico. |
| `#signingSecret` | `99-100`, `145-148`, `600-604` | HMAC de confirmacao; mudar formato invalida URLs emitidas. |
| `#encryption/#chunks/#hash` | `102-109`, `149-151` | Upload/download seguro dependem de compatibilidade de metadata ja persistida. |
| `#peerHealth/#p2pUploader/#p2pDownloader` | `111-129`, `152-155` | P2P opcional e silencioso; dificil observar falhas sem metricas. |
| `#cache` | `114-115`, `526-538` | Pode servir ciphertext antigo; precisa invalidacao se metadata/arquivo for removido. |
| `CONTEXTOS` | `65-86` | Fonte unica de limites, mas mistura regras de Story, avatar, services e portfolio. |
| `MediaP2P.#pendentes` | `MediaP2P.js:43-44` | Mantem `File` e Blob URL em memoria; se consumidor nao chama cancelar, ha leak. |

## Hotspots e bugs historicos

Evidencias principais:

| Evidencia | Impacto |
|---|---|
| `git log --follow --numstat src/services/MediaManager.js` mostra criacao grande em `44c8bd6` (+346), seguida por `9dc3423` (+101), `4e93f2b` (+247), `9161057` (+131/-36), `a9eb28f` (+35/-118) e `f42cbdc` reintroduzindo 662 linhas no arquivo atual. | O arquivo mudou por varias ondas arquiteturais de storage, cripto, P2P e roteamento. |
| `palta.md` ja classifica `MediaManager` como violacao SRP e recomenda fachada fina. | Existe diagnostico previo convergente com esta auditoria. |
| Commits recentes relacionados: `71a1274 fix: corrigir uploads de capa/logo e imagem de serviço`, `32d2840 fix(avatar,busca): corrige upload de avatar via BFF`, `bf0ad51 fix(bff): adiciona sharp...`, `1e42904 feat(barbearia): centralizar upload de logo/capa na BFF`. | Upload e midia ja tiveram correcoes recorrentes. |
| `af0dac8` removeu `fetchPortfolio` morto; `c4c38c8` removeu KPIs/portfolio da MinhaBarbearia. | Portfolio atual e legado/placeholder, nao deve ser tratado como fluxo ativo sem decisao humana. |

## Codigo morto ou suspeito

| Item | Evidencia | Classificacao |
|---|---|---|
| `MediaManager.publicUrl(path)` | `MediaManager.js:564-565`; `rg` nao encontrou chamada direta alem do registro em classe. | Suspeito de nao uso; alem disso fixa contexto `stories`. |
| `MediaManager.uploadMedia/downloadMedia` | Testados extensivamente, mas nao chamados por controller HTTP atual. | Nao morto: parecem ser pipeline seguro interno/legado, mas expostos apenas por testes ou futuros controllers. |
| `MediaP2P.fazerUpload()` | Contrato de payload nao bate com `MediaController` legado e `MinhaBarbeariaRuntimeController` usa upload direto em produto. | Suspeito de quebrado ou apontado para BFF canonica diferente. Confirmar antes de remover. |
| `Portfolio` como contexto | `CONTEXTOS.portfolio` ativo no backend, mas `PortfolioSection` e placeholder. | Dominio incompleto; nao remover sem decisao de produto. |
| Barbershop image metadata | `registrarImagemProcessada()` valida enum de `CONTEXTOS`, mas `MediaController` chama com `contexto: tipo` (`logo`, `cover`, `banner`) em `MediaController.js:280-287`. | Possivel bug: `logo/cover/banner` nao existem em `CONTEXTOS`. Confirmar com testes `barbershop-upload.test.js`. |

## Proposta de separacao SRP

### MediaUploadService

Responsabilidade: escolha de rota de upload, presigned URL, confirmacao, retries, progresso e cleanup de uploads falhos.

Primeira fronteira: encapsular `gerarUrlPresigned()` `178-199`, `confirmarUpload()` `219-293`, parte do `MediaController` `70-107` e cliente browser `MediaP2P.fazerUpload()` `99-153`.

### ImageCompressionService

Responsabilidade: pipeline de imagem por Strategy.

Primeira fronteira: mover a regra atual de `ImageProcessor.js:55-239` para strategies:

| Strategy | Regra inicial |
|---|---|
| `PhotoCompressionStrategy` | Fotos normais: orientar, strip EXIF, resize, WebP/JPG. |
| `ScreenshotCompressionStrategy` | Preservar legibilidade; qualidade/dimensoes diferentes. |
| `AnimatedGifStrategy` | Decidir: rejeitar, preservar animacao ou transcodificar; hoje nao existe. |

### VideoProcessor

Responsabilidade: validar duracao, gerar thumbnail, trim/transcode quando aplicavel.

Primeira fronteira: hoje nao ha logica equivalente no `MediaManager`; deve integrar com `barberflow-bff-api/application/media/steps/ThumbnailStep.js` e `TranscodeStep.js` ou virar adapter para esse pipeline.

### MediaPreviewRenderer

Responsabilidade: preview consistente para qualquer consumidor.

Primeira fronteira: `MediaP2P.registrar()` cria Blob URL (`72-83`), mas quem renderiza e o consumidor (`MinhaBarbeariaRuntimeController.js:1941-1947`). Extrair para renderer que recebe elemento/adapter ou retorna view-model, sem regra de upload.

### MediaValidator

Responsabilidade: MIME, tamanho, dimensoes, duracao, magic bytes e schema de metadata.

Primeira fronteira: consolidar `CONTEXTOS` `MediaManager.js:65-86`, `_detectarMime()` `MediaController.js:339-346`, validacoes de tamanho em `confirmarUpload()` e `uploadMedia()`. Deve ter config por dominio e erro tipado.

### StoryMediaAdapter

Responsabilidade: adaptar arquivo bruto + contexto de Story para objeto pronto do dominio Story.

Contrato proposto:

```js
{
  input: { file, ownerId, barbershopId, caption, expiresAtPolicy },
  output: {
    mediaId,
    storyId,
    kind: 'image' | 'video' | 'audio',
    variants,
    publicUrl,
    privateAccessPolicy,
    metadata
  }
}
```

Nao toca DOM. Nao chama Section diretamente. Emite ou retorna dados para StorySection/servico de dominio.

### PortfolioMediaAdapter

Responsabilidade: adaptar arquivo bruto + contexto de Portfolio para objeto pronto do dominio Portfolio.

Contrato proposto:

```js
{
  input: { file, ownerId, barbershopId, title, tags, sortOrder },
  output: {
    mediaId,
    portfolioItemId,
    kind: 'image',
    variants,
    publicUrl,
    metadata
  }
}
```

Nao toca DOM. Nao usa `document`, `dataset`, `window.confirm` ou Supabase global.

## Contrato geral dos adapters

Entrada comum:

```js
{
  file,
  contexto,
  ownerId,
  consumerId,
  metadata,
  constraints
}
```

Saida comum:

```js
{
  mediaId,
  ownerId,
  contexto,
  original: { path, contentType, sizeBytes },
  variants: [],
  access: { publicUrl, signedUrlExpiresAt },
  metadata
}
```

Regras:

- Adapters nunca tocam DOM.
- Adapters nunca chamam diretamente outra section.
- Validacao e upload sao services injetados.
- Metadata deve ser validada por schema por consumidor.
- Fallback deve ser configurado, nao hardcoded dentro do adapter.

## Plano de extracao incremental

### Passo 1: wrappers novos chamando MediaManager antigo

Criar services finos que mantem a interface publica atual:

- `MediaUploadService` delega para `MediaManager.gerarUrlPresigned()` e `confirmarUpload()`.
- `MediaRegistryService` delega para `registrarImagemProcessada()`, `listar()` e `deletar()`.
- `SecureMediaTransferService` delega para `uploadMedia()` e `downloadMedia()`.

Objetivo: estabilizar contratos e testes sem mexer em Story/Portfolio.

### Passo 2: migrar logica real para services

Mover, uma responsabilidade por vez:

1. `MediaValidator`: contexto, MIME, tamanho, magic bytes, schema de metadata.
2. `MediaStorageRouter`: Supabase/R2/backendPara/publicUrl/head/delete.
3. `MediaUploadService`: presigned/confirmacao.
4. `SecureMediaTransferService`: encrypt/chunk/hash/P2P/cache/download.
5. `ImageCompressionService`: substituir acoplamento direto `ImageProcessor` no controller.

`MediaManager` vira fachada fina e mantem metodos publicos para compatibilidade.

### Passo 3: consumidores usam adapters/services direto

- StorySection usa `StoryMediaAdapter`.
- PortfolioSection usa `PortfolioMediaAdapter` quando o produto decidir reativar Portfolio.
- MinhaBarbeariaRuntimeController para de chamar `MediaP2P` e `SupabaseService.storageBarbershops()` diretamente.
- AvatarService deve migrar de IIFE com funcoes internas para classe ou adapter compartilhado, em tarefa separada.

### Passo 4: remover MediaManager original

Remover apenas quando:

- Nenhum controller/servico chama `MediaManager` diretamente.
- Testes cobrirem adapters e services especializados.
- Migração de metadata antiga estiver documentada.
- Rollback estiver claro, porque storage/metadata sao dados persistidos.

## Decisoes humanas antes de mexer

1. Quais formatos ficam oficialmente suportados por Story: video, imagem e audio ou apenas video/imagem?
2. Portfolio volta como funcionalidade ativa ou continua placeholder legado?
3. GIF animado: rejeitar, preservar ou transcodificar?
4. Limites por contexto devem ficar como estao: stories 50 MB, avatars 2 MB, services 5 MB, portfolio 10 MB?
5. Midia privada deve usar URL assinada sempre ou alguns contextos continuam publicos?
6. Chaves de criptografia continuam em metadata temporariamente ou a proxima fase exige KMS?
7. Fallback direto ao Supabase no frontend continua permitido ou todo upload deve passar pela BFF canonica?
8. Politica de delecao: apagar fisicamente agora ou migrar para soft delete + garbage collection?

## Revisao final

- Segurança: existe HMAC timing-safe em confirmacao e ownership check no download, mas ha metadata livre, chave de criptografia em metadata e possivel rota frontend divergente.
- Performance/custo: upload direto evita trafego pela API; imagem processada server-side reduz bytes; ainda ha processamento CPU-bound e chunking em memoria no backend legado.
- OOP/SOLID: classe atual melhorou por usar `StorageService`, `EncryptionService`, `ChunkService` e `HashService`, mas `MediaManager` ainda viola SRP por orquestrar dominios demais.
- DRY: validacoes de MIME/tamanho/magic bytes estao duplicadas entre `MediaManager`, `MediaController` e frontend.
- Testes: `tests/media-manager.test.js` cobre bem `uploadMedia`, `downloadMedia`, seguranca e roteamento. Falta cobertura de contrato browser `MediaP2P` vs controller, metadata schema, dimensoes/duracao e adapters Story/Portfolio.

Nenhum codigo de aplicacao foi alterado nesta auditoria.
