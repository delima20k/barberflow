# Pipeline canonico de midia

## Fluxo

1. `POST /api/v1/media/presigned` reserva metadados e assina upload direto para object storage.
2. O cliente envia bytes ao storage, nunca para a API, exceto story `video/mp4`: nesse caso `POST /api/v1/media/stories/upload-compressed` comprime antes de salvar no R2.
3. `POST /api/v1/media/confirmar` valida token de confirmacao e grava outbox `process_media`.
4. O worker baixa a fonte e executa `VirusScanStep -> MimeValidationStep -> MetadataExtractStep -> ThumbnailStep -> TranscodeStep -> CDNPublishStep`.
5. Conteudo privado usa `GET /api/v1/media/:mediaId/acesso?variant=original` para URL assinada curta.

## Variantes

| Nome | Versao | Origem |
|---|---|---|
| `original` | `v1` | fonte validada |
| `thumb` | `v1` | imagem WebP ate 300px |
| `medium` | `v1` | imagem WebP ate 900px |
| `full` | `v1` | imagem WebP ate 1600px |
| `thumb_sm` | `v1` | variante legada, mantida apenas para compatibilidade |
| `thumb_md` | `v1` | variante legada, mantida apenas para compatibilidade |
| `video_480p` | `v1` | porta de transcode de video |
| `video_720p` | `v1` | porta de transcode de video |

`media_variants` permite publicar novas versoes sem quebrar URLs antigas. Videos novos de stories ja entram no R2 comprimidos pelo BFF. O worker injeta `FfmpegVideoTranscoder` para manter compatibilidade com fontes antigas e publicar a variante `video_480p` de forma assincrona quando necessario. O transcode usa limite de concorrencia por processo (`STORY_VIDEO_TRANSCODE_CONCURRENCY`, padrao `1`) para proteger CPU e memoria do worker.

## Limites e anti-spam

`MediaPolicyCatalog` define limites por contexto: avatar 5MB, service 8MB, portfolio 12MB e stories 64MB. `MimeValidationStep` confere assinatura real do arquivo; `MetadataExtractStep` calcula pHash para detectar reuploads perceptualmente iguais por owner.

## Metricas

`MediaPipelineMetrics` coleta por processo:

- duracao media por step;
- taxa de falha por step;
- tamanho medio de fonte processada.

O snapshot fica disponivel pelo objeto `MediaPipeline.metrics` para exposicao futura em health/telemetria sem acoplar o pipeline ao transporte.

## Custo e retencao

- Storage cresce por fonte + variantes otimizadas; imagens comuns ficam em `thumb`, `medium` e `full` WebP, com metadados de largura, altura, tamanho e MIME no banco.
- CDN deve servir thumbnails em listas e original apenas em detalhe; conteudo privado usa URL assinada com expiracao.
- Reservas `reserved` e `uploaded` com mais de 24h sao candidatas a orphan GC.
- Objetos fonte podem ser removidos depois que `original` e variantes publicadas forem validados.
- Variantes antigas devem ter janela de retencao curta apos novo `version` entrar em uso; manter metadados para auditoria e apagar blobs sem referencia ativa.
