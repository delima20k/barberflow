'use strict';

// =============================================================
// CadastroController.js — Máscara de CPF/CNPJ e toggle de doc
//
// Encapsula alternarDoc() e mascaraDoc() que antes estavam
// acumulados em BarberFlowProfissional.
// Faz binding programático via addEventListener — sem
// onclick="Pro.alternarDoc()" ou oninput="Pro.mascaraDoc()"
// no HTML.
// =============================================================

class CadastroController {

  /**
   * Registra listeners nos botões de toggle CPF/CNPJ e nos inputs.
   * Chame uma vez no constructor do App.
   */
  bind() {
    this.#bindDocToggle();
    this.#bindMascaras();
  }

  // ── Privados ──────────────────────────────────────────────

  #bindDocToggle() {
    ['cpf', 'cnpj', 'ambos'].forEach(tipo => {
      document.getElementById(`cad-doc-btn-${tipo}`)
        ?.addEventListener('click', () => this.#alternarDoc(tipo));
    });
  }

  #bindMascaras() {
    document.getElementById('cad-cpf')
      ?.addEventListener('input', (e) => this.#mascaraDoc(e.target, 'cpf'));
    document.getElementById('cad-cnpj')
      ?.addEventListener('input', (e) => this.#mascaraDoc(e.target, 'cnpj'));
  }

  #alternarDoc(tipo) {
    const cpfWrap  = document.getElementById('cad-doc-cpf');
    const cnpjWrap = document.getElementById('cad-doc-cnpj');
    if (!cpfWrap || !cnpjWrap) return;

    ['cpf', 'cnpj', 'ambos'].forEach(t =>
      document.getElementById(`cad-doc-btn-${t}`)?.classList.remove('cad-doc-btn--ativo')
    );
    document.getElementById(`cad-doc-btn-${tipo}`)?.classList.add('cad-doc-btn--ativo');

    if (tipo === 'cpf')   { cpfWrap.style.display = '';     cnpjWrap.style.display = 'none'; }
    if (tipo === 'cnpj')  { cpfWrap.style.display = 'none'; cnpjWrap.style.display = '';     }
    if (tipo === 'ambos') { cpfWrap.style.display = '';     cnpjWrap.style.display = '';     }
  }

  #mascaraDoc(input, tipo) {
    let v = input.value.replace(/\D/g, '');
    if (tipo === 'cpf') {
      v = v.slice(0, 11);
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
      v = v.slice(0, 14);
      v = v.replace(/(\d{2})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1/$2');
      v = v.replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    }
    input.value = v;
  }
}
