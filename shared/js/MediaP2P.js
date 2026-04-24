'use strict';

// =============================================================
// MediaP2P.js — Preview local P2P de arquivos do dispositivo
//
// Conceito P2P aplicado ao PWA:
//   Em vez de enviar o arquivo ao servidor imediatamente (upload
//   custoso e inútil se o item for descartado), o sistema usa
//   diretamente o arquivo do próprio dispositivo do usuário:
//
//   1. Usuário seleciona imagem  → registrar()
//      - Solicita permissão/confirmação de acesso ao arquivo
//      - Cria Blob URL local (URL.createObjectURL) — ZERO latência
//      - Arquivo fica "pendente" na memória, sem ir ao servidor
//
//   2. Usuário confirma ("Salvar item") → fazerUpload()
//      - Só agora o arquivo vai ao Supabase Storage
//      - Blob URL é revogado (liberação de memória garantida)
//
//   3. Usuário descarta o item → cancelar()
//      - Blob URL é revogado sem nunca ter feito upload
//
// Vantagens:
//   - Preview instantâneo (sem round-trip de rede)
//   - Sem uploads de itens descartados (economia de storage)
//   - Ciclo de vida de Blob URLs gerenciado (sem memory leak)
//   - Confirmação explícita antes de acessar arquivo local (UX segura)
//
// Uso típico (MinhaBarbeariaPage):
//   const p2p = new MediaP2P();
//   const blob = await p2p.registrar(file, uid);   // preview imediato
//   imgEl.src = blob;                               // exibe localmente
//   // ... usuário edita nome/preço ...
//   const path = await p2p.fazerUpload(uid, storagePath); // ao salvar
//
// Dependências: SupabaseService.js
// =============================================================

class MediaP2P {

  /** @type {Map<string, { file: File, blobUrl: string }>} */
  #pendentes = new Map();

  // ══════════════════════════════════════════════════════════
  // PÚBLICA
  // ══════════════════════════════════════════════════════════

  /**
   * Registra um arquivo local para preview imediato (P2P).
   * Exibe confirmação de acesso ao arquivo do dispositivo antes de prosseguir.
   *
   * @param {File}   file - Arquivo selecionado pelo usuário
   * @param {string} uid  - Chave única do item (ex: "prod-img-1714000000-ab3f")
   * @returns {Promise<string|null>} Blob URL para usar em <img src>, ou null se o usuário cancelar
   */
  async registrar(file, uid) {
    if (!(file instanceof File)) return null;

    const aceito = await this.#pedirPermissao(file.name);
    if (!aceito) return null;

    // Revoga blob anterior do mesmo uid (troca de imagem no mesmo item)
    this.#revogar(uid);

    const blobUrl = URL.createObjectURL(file);
    this.#pendentes.set(uid, { file, blobUrl });
    return blobUrl;
  }

  /**
   * Faz upload do arquivo pendente ao Supabase Storage.
   * Deve ser chamado apenas quando o usuário confirmar o salvamento do item.
   * Revoga o Blob URL após upload bem-sucedido (libera memória).
   *
   * @param {string} uid         - Chave do item (a mesma passada em registrar())
   * @param {string} storagePath - Caminho destino no bucket (ex: "shopId/services/uid.webp")
   * @returns {Promise<string>}  - storagePath confirmado (para salvar em image_path)
   * @throws {Error}             - Se não houver pendente ou se o upload falhar
   */
  async fazerUpload(uid, storagePath) {
    const pendente = this.#pendentes.get(uid);
    if (!pendente) throw new Error(`[MediaP2P] Nenhum arquivo pendente para uid "${uid}"`);

    const { file } = pendente;
    const { error } = await SupabaseService.storageBarbershops()
      .upload(storagePath, file, { contentType: file.type, upsert: true });

    if (error) throw error;

    this.#revogar(uid);   // libera memória após upload concluído
    return storagePath;
  }

  /**
   * Verifica se existe arquivo local pendente (não enviado) para o uid.
   * @param {string} uid
   * @returns {boolean}
   */
  temPendente(uid) {
    return this.#pendentes.has(uid);
  }

  /**
   * Retorna a extensão do arquivo pendente (ex: "jpg", "webp").
   * Útil para montar o storagePath antes de chamar fazerUpload().
   * @param {string} uid
   * @returns {string} extensão sem ponto, lowercase; "jpg" como fallback
   */
  extensaoPendente(uid) {
    const p = this.#pendentes.get(uid);
    if (!p) return 'jpg';
    const parts = p.file.name.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : 'jpg';
  }

  /**
   * Cancela um arquivo pendente sem fazer upload.
   * Revogar o Blob URL evita memory leak.
   * Chamar ao remover um item da lista.
   * @param {string} uid
   */
  cancelar(uid) {
    this.#revogar(uid);
  }

  /**
   * Cancela e revoga todos os arquivos pendentes.
   * Chamar ao fechar o painel de configuração ou ao fazer logout.
   */
  cancelarTodos() {
    for (const uid of [...this.#pendentes.keys()]) {
      this.#revogar(uid);
    }
  }

  // ══════════════════════════════════════════════════════════
  // PRIVADO
  // ══════════════════════════════════════════════════════════

  /**
   * Revoga o Blob URL e remove o item do mapa de pendentes.
   * @param {string} uid
   */
  #revogar(uid) {
    const p = this.#pendentes.get(uid);
    if (!p) return;
    URL.revokeObjectURL(p.blobUrl);
    this.#pendentes.delete(uid);
  }

  /**
   * Solicita confirmação do usuário antes de acessar o arquivo local.
   * Retorna true se o usuário aceitar.
   *
   * Substituir por modal customizado se quiser UI mais rica.
   *
   * @param {string} nomeArquivo
   * @returns {Promise<boolean>}
   */
  async #pedirPermissao(nomeArquivo) {
    return new Promise(resolve => {
      // Usa confirm() nativo — leve, sem dependências externas
      // Em PWA no mobile isso dispara o diálogo do sistema
      const aceito = window.confirm(
        `Usar "${nomeArquivo}" do seu dispositivo como imagem do item?`
      );
      resolve(aceito);
    });
  }
}
