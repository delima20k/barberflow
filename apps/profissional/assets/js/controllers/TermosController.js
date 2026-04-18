'use strict';

// =============================================================
// TermosController.js — Aceite legal profissional
//
// Encapsula aceitarTermos() e _sincronizarBotaoTermos() que
// antes estavam em BarberFlowProfissional.
//
// Faz binding programático via addEventListener — sem
// onchange="Pro._sincronizarBotaoTermos()" ou
// onclick="Pro.aceitarTermos()" no HTML.
//
// Dependências: LegalConsentService.js, SupabaseService.js,
//               MonetizationGuard (app.js)
// =============================================================

class TermosController {

  #pushFn;  // (tela: string) => void — Pro.push()

  /**
   * @param {function(string): void} pushFn — ex: (t) => Pro.push(t)
   */
  constructor(pushFn) {
    this.#pushFn = pushFn;
  }

  /**
   * Registra listeners no checkbox e no botão de aceite.
   * Chame uma vez no constructor do App.
   */
  bind() {
    document.getElementById('tl-cb-termos')
      ?.addEventListener('change', () => this.#sincronizarBotao());
    document.getElementById('tl-btn-continuar')
      ?.addEventListener('click', () => this.#aceitarTermos());
  }

  // ── Privados ──────────────────────────────────────────────

  #sincronizarBotao() {
    const aceite = !!document.getElementById('tl-cb-termos')?.checked;
    const btn    = document.getElementById('tl-btn-continuar');
    if (btn) btn.disabled = !aceite;
  }

  async #aceitarTermos() {
    const btn    = document.getElementById('tl-btn-continuar');
    const erroEl = document.getElementById('tl-erro');

    // Valida checkbox novamente por segurança (defesa em profundidade)
    const aceiteConfirmado = !!document.getElementById('tl-cb-termos')?.checked;
    if (!aceiteConfirmado) return;

    if (btn) btn.classList.add('tl-btn--carregando');
    if (erroEl) erroEl.style.display = 'none';

    try {
      const destino  = sessionStorage.getItem('bf_termo_destino') || 'cadastro';
      const planType = MonetizationGuard.planoSelecionado || 'trial';
      const flags    = {
        direitos_autorais:   true,
        uso_arquivos:        true,
        uso_midias_internas: true,
        uso_gps:             true,
      };

      const { data: { user } } = await SupabaseService.client.auth.getUser();

      if (!user) {
        // Fluxo pré-cadastro: salva aceite pendente, segue para cadastro
        LegalConsentService.marcarAceitePendente(planType, flags);
        sessionStorage.removeItem('bf_termo_destino');
        this.#pushFn(destino);
        return;
      }

      // Fluxo pós-login: registra aceite direto no banco
      const { ok, error: erroResp } = await LegalConsentService.registrarAceite(
        user.id, planType, flags
      );
      if (!ok) throw new Error(erroResp || 'Erro ao registrar aceite.');

      sessionStorage.removeItem('bf_termo_destino');
      this.#pushFn(destino);

    } catch (e) {
      if (erroEl) {
        erroEl.textContent = e?.message || 'Erro ao salvar aceite. Tente novamente.';
        erroEl.style.display = 'block';
      }
    } finally {
      if (btn) btn.classList.remove('tl-btn--carregando');
    }
  }
}
