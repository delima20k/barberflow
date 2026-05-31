'use strict';
// =============================================================
// ImageDeletionService.js — Exclusão genérica e padronizada de imagens.
//
// Responsabilidade: centralizar confirmação de exclusão (via FluxoDeFila)
// e delegação à BFF. Zero acoplamento direto com Storage ou banco —
// toda persistência ocorre no BFF.
//
// Contexto padrão: 'portfolio'
// Extensível via ImageDeletionService.registrarContexto(nome, handler)
//
// Uso:
//   // Com confirmação (modal padrão FluxoDeFila):
//   const r = await ImageDeletionService.confirmarEExcluir(imageId);
//   if (r.deleted) { /* atualizar UI */ }
//   else if (r.error) { /* mostrar toast */ }
//
//   // Sem confirmação (chamada direta):
//   const r = await ImageDeletionService.excluir(imageId, 'portfolio');
//
//   // Registrar novo contexto (ex: galeria, capa, publicacao):
//   ImageDeletionService.registrarContexto('galeria', handler);
//
// Resposta padronizada:
//   { deleted: true }
//   { deleted: false, cancelado: true }   — usuário cancelou/fechou modal
//   { deleted: false, error: Error }      — falha na BFF ou contexto inválido
//
// Segurança: nenhum dado dinâmico é inserido como innerHTML;
//   FluxoDeFila.escapar() é usado para qualquer conteúdo variável futuro.
//
// Dependências (globais — carregadas pelo browser/sandbox):
//   FluxoDeFila, BffApiService, LoggerService (opcional)
// =============================================================

class ImageDeletionService {

  // ── Registro de handlers por contexto ───────────────────────
  static #CONTEXTOS = new Map([
    ['portfolio', (imageId) => BffApiService.profissionais.removerPortfolioImagem(imageId)],
  ]);

  // ── Config do modal de confirmação ───────────────────────────
  static #MODAL_ID = 'ids-confirmar-exclusao';

  static #configModal() {
    return {
      id: ImageDeletionService.#MODAL_ID,
      icone: '🗑',
      titulo: 'Excluir imagem?',
      corpo: 'Esta ação não pode ser desfeita.',
      acoes: [
        { label: 'Sim, excluir', valor: 'confirmar', variante: 'perigo' },
        { label: 'Não',          valor: 'cancelar',  variante: 'secundario' },
      ],
      fecharBtn: false,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Abre modal de confirmação padrão (FluxoDeFila) e, se confirmado,
   * delega à BFF pelo contexto informado.
   *
   * @param {string} imageId   — UUID da imagem
   * @param {string} [contexto='portfolio']
   * @returns {Promise<{deleted:boolean, cancelado?:boolean, error?:Error}>}
   */
  static async confirmarEExcluir(imageId, contexto = 'portfolio') {
    const resposta = await FluxoDeFila.abrir(ImageDeletionService.#configModal());
    if (resposta !== 'confirmar') {
      return { deleted: false, cancelado: true };
    }
    return ImageDeletionService.excluir(imageId, contexto);
  }

  /**
   * Exclui imagem diretamente via BFF, sem modal de confirmação.
   *
   * @param {string} imageId
   * @param {string} [contexto='portfolio']
   * @returns {Promise<{deleted:boolean, error?:Error}>}
   */
  static async excluir(imageId, contexto = 'portfolio') {
    if (!imageId || typeof imageId !== 'string' || !imageId.trim()) {
      return { deleted: false, error: new Error('imageId inválido.') };
    }

    const handler = ImageDeletionService.#CONTEXTOS.get(contexto);
    if (!handler) {
      return {
        deleted: false,
        error: new Error(`Contexto de exclusão não registrado: "${contexto}".`),
      };
    }

    try {
      const { error } = await handler(imageId);
      if (error) return { deleted: false, error };
      return { deleted: true };
    } catch (err) {
      if (typeof LoggerService !== 'undefined') {
        LoggerService.error('[ImageDeletionService] excluir:', err);
      }
      return { deleted: false, error: err };
    }
  }

  /**
   * Registra um novo contexto de exclusão sem abrir a classe (OCP).
   * Permite extensão futura para galeria, capa, publicacao, etc.
   *
   * @param {string}   nome     — identificador único do contexto
   * @param {Function} handler  — async (imageId) => { error? }
   */
  static registrarContexto(nome, handler) {
    if (!nome || typeof nome !== 'string') throw new Error('Nome do contexto é obrigatório.');
    if (typeof handler !== 'function') throw new Error('Handler deve ser uma função.');
    ImageDeletionService.#CONTEXTOS.set(nome, handler);
  }
}
