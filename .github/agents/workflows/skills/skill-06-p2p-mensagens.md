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

- Realtime do Supabase é restrito a **fila** e **status de agendamento**
- ❌ NUNCA usar Realtime para vídeos, feeds de imagens ou operações pesadas
- Para comunicação de mídia: usar WebRTC / P2P

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
