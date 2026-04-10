'use strict';

// =============================================================
// NavConfig.js — Fonte única de verdade das opções de navegação
//
// Usada tanto pelo menu lateral quanto pelo footer, garantindo
// que ambos sempre exibam AS MESMAS opções.
//
// Estrutura de cada item:
//   tela  {string}  — ID da tela para nav() (opcional se acao presente)
//   acao  {string}  — ação especial: 'sair' (opcional se tela presente)
//   icone {string}  — nome do arquivo em /shared/img/
//   label {string}  — texto exibido
// =============================================================

class NavConfig {

  // ═══════════════════════════════════════════════════════════
  // CLIENTE
  // ═══════════════════════════════════════════════════════════

  static get #CLIENTE_LOGADO() {
    return [
      { tela: 'inicio',    icone: 'inicio.svg',    label: 'Início'    },
      { tela: 'pesquisa',  icone: 'pesquisa.svg',  label: 'Pesquisar' },
      { tela: 'mensagens', icone: 'mensagen.svg',  label: 'Mensagens' },
      { tela: 'favoritas', icone: 'meu-b.svg',     label: 'Favoritas' },
      { tela: 'perfil',    icone: 'perfil.svg',    label: 'Meu Perfil'},
      { acao: 'sair',      icone: 'sair.svg',      label: 'Sair'      },
    ];
  }

  static get #CLIENTE_DESLOGADO() {
    return [
      { tela: 'login',    icone: 'login.svg',    label: 'Entrar'   },
      { tela: 'cadastro', icone: 'cadastro.svg', label: 'Cadastro' },
      { tela: 'inicio',   icone: 'inicio.svg',   label: 'Início'   },
    ];
  }

  // ═══════════════════════════════════════════════════════════
  // PROFISSIONAL
  // ═══════════════════════════════════════════════════════════

  static get #PROFISSIONAL_LOGADO() {
    return [
      { tela: 'inicio',          icone: 'inicio.svg',   label: 'Início'          },
      { tela: 'agenda',          icone: 'pesquisa.svg', label: 'Agenda'          },
      { tela: 'mensagens',       icone: 'mensagen.svg', label: 'Mensagens'       },
      { tela: 'minha-barbearia', icone: 'meu-b.svg',    label: 'Minha Barbearia' },
      { tela: 'perfil',          icone: 'perfil.svg',   label: 'Meu Perfil'      },
      { acao: 'sair',            icone: 'sair.svg',     label: 'Sair'            },
    ];
  }

  static get #PROFISSIONAL_DESLOGADO() {
    return [
      { tela: 'login',    icone: 'login.svg',    label: 'Entrar'   },
      { tela: 'cadastro', icone: 'cadastro.svg', label: 'Cadastro' },
      { tela: 'inicio',   icone: 'inicio.svg',   label: 'Início'   },
    ];
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO
  // ═══════════════════════════════════════════════════════════

  /**
   * Retorna os itens de navegação corretos para o estado atual.
   * @param {boolean} logado
   * @returns {Array<{tela?: string, acao?: string, icone: string, label: string}>}
   */
  static getItems(logado) {
    const isPro = typeof Pro !== 'undefined';
    if (logado) {
      return isPro ? NavConfig.#PROFISSIONAL_LOGADO : NavConfig.#CLIENTE_LOGADO;
    }
    return isPro ? NavConfig.#PROFISSIONAL_DESLOGADO : NavConfig.#CLIENTE_DESLOGADO;
  }

  /**
   * Gera o HTML de <li> para o menu lateral a partir dos items.
   * @param {boolean} logado
   * @returns {string} HTML
   */
  static renderMenuHtml(logado) {
    const p     = typeof App !== 'undefined' ? 'App' : 'Pro';
    const items = NavConfig.getItems(logado);
    return items.map(item => {
      const onclick = item.acao === 'sair'
        ? `AuthService.logout().then(()=>${p}.fecharMenu())`
        : `${p}.fecharMenu();${p}.nav('${item.tela}')`;
      // data-tela permite ao Router marcar o item ativo com .ativo
      const dataTela = item.tela ? `data-tela="${item.tela}"` : '';
      return `
      <li class="menu-nav-item" ${dataTela} onclick="${onclick}">
        <img src="/shared/img/${item.icone}" alt="">
        <span>${item.label}</span>
      </li>`;
    }).join('');
  }
}
