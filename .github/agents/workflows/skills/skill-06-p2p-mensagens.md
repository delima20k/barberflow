# SKILL 06 — P2P E MENSAGENS: WEBRTC, MEDIAP2P, REALTIME

> Leia este arquivo para tarefas de mensagens, chat, vídeo, mídia P2P e comunicação em tempo real.
> Expandir conforme o fluxo P2P for implementado.

---

## 1. COMPONENTE MEDIAP2P

- **`MediaP2P`** é o componente obrigatório para **toda** operação de mídia P2P
- Centraliza: WebRTC, negociação de peer, ICE candidates, tracks de mídia
- ❌ NUNCA implementar lógica WebRTC fora de `MediaP2P`
- Antes de criar qualquer extensão: verificar `CLASS_REGISTRY.md` para classes existentes

---

## 2. RESTRIÇÃO DE REALTIME (CRÍTICO)

- Realtime do Supabase é restrito a **fila**, **status de agendamento** e **chat textual leve via BFF/outbox em canal privado `chat.{userId}`**
- Chat textual leve deve passar pela BFF canônica, publicar eventos versionados via outbox/filas e entregar em canais privados; não usar canais de conversa públicos.
- ❌ NUNCA usar Realtime para vídeos, feeds de imagens ou operações pesadas
- Para comunicação de mídia: usar WebRTC / P2P

## 2.1 CHAT CANONICO NA BFF

- Mensagens devem ser persistidas antes da entrega: `salvar -> outbox -> fila -> realtime -> push se offline`.
- Idempotencia obrigatoria por `client_message_id`; o cliente pode repetir o envio sem duplicar mensagem.
- Entrega realtime deve usar canal privado por usuario (`chat.{userId}`), autorizado somente ao proprio usuario, para impedir leak por conversa ou canal paralelo.
- Bloqueio bidirecional deve ser verificado no envio e novamente no dispatcher de entrega.
- Anexos do chat devem referenciar `media_files/media_variants`; nunca duplicar upload, storage ou processamento de midia.
- E2E fica como porta/extensao (`IMessageCipher`) ate a criptografia ser habilitada explicitamente.

---

## 3. CRIPTOGRAFIA PONTA A PONTA

- Toda comunicação P2P sensível deve usar criptografia ponta a ponta
- Usar `crypto.subtle` (Web Crypto API) — nunca criar criptografia caseira
- Ver `skill-04-seguranca.md` para regras gerais de criptografia

---

## 4. BOAS PRÁTICAS P2P

- Fechar conexões P2P ao destruir componentes — evitar memory leaks
- Cancelar timers e revogar Blob URLs de streams após uso — ver `skill-08-performance.md`
- Tratar erros de ICE, falhas de conexão e queda de peers explicitamente
- Implementar fallback para ambientes sem suporte a WebRTC

---

## 5. SCAFFOLD — EXPANDIR AQUI

> Esta seção deve ser expandida quando o fluxo P2P completo for implementado.
> Documentar: sinalização, troca de SDP, ICE servers, gerenciamento de estado da chamada, UI de mídia.

## 6. QUEBRA INCREMENTAL DO MEDIAMANAGER

- `MediaManager` deve ser tratado como fachada temporaria; novos fluxos de Story e Portfolio devem consumir adapters (`StoryMediaAdapter`, `PortfolioMediaAdapter`) e services injetados.
- Services de midia nao tocam DOM. Preview visual fica somente em `MediaPreviewRenderer`, recebendo o elemento alvo por parametro.
- Upload, validacao, compressao e processamento de video ficam em classes SRP separadas, com dependencias injetadas, eventos leves (`upload-progress`, `upload-completed`, `validation-failed`) e cancelamento por `AbortController`.
- Compressao de imagem deve usar Strategy pluggable: foto, screenshot/texto e imagem animada. GIF/animacao nunca deve ser achatado silenciosamente.
- Erros de midia devem ser tipados (`UploadError`, `CompressionError`, `ValidationError`, `ProcessingError`) e preservar `cause`.
- Toda etapa deve expor metricas de duracao media, falhas e bytes antes/depois para depuracao e custo.
