'use strict';

// =============================================================
// FonteSalao.js — Gerenciador de fontes personalizadas para
//                 o nome das barbearias
//
// Responsabilidades:
//  • Definir as 5 fontes disponíveis (estilo barbearia/faroeste).
//  • Carregar as fontes do Google Fonts sob demanda (lazy).
//  • Aplicar a fonte em qualquer elemento DOM que exiba o nome.
//  • Criar o picker (seletor) de fontes para o painel de config.
//  • Salvar / recuperar a escolha no Supabase (barbershops.font_key).
//
// Uso básico:
//   FonteSalao.aplicarFonte(elemento, 'rye');
//   FonteSalao.criarPicker(container, barbershopId, fontAtual);
//
// Dependências: SupabaseService.js
// =============================================================

class FonteSalao {

  // ── Catálogo de fontes disponíveis ───────────────────────
  static FONTES = [
    {
      key:     'rye',
      nome:    'Rye',
      desc:    'Faroeste clássico',
      familia: "'Rye', cursive",
      gfonts:  'Rye',
    },
    {
      key:     'cinzel',
      nome:    'Cinzel Decorative',
      desc:    'Romano ornamental',
      familia: "'Cinzel Decorative', serif",
      gfonts:  'Cinzel+Decorative:wght@400;700',
    },
    {
      key:     'abril',
      nome:    'Abril Fatface',
      desc:    'Poster vintage',
      familia: "'Abril Fatface', cursive",
      gfonts:  'Abril+Fatface',
    },
    {
      key:     'oswald',
      nome:    'Oswald Bold',
      desc:    'Moderno masculino',
      familia: "'Oswald', sans-serif",
      gfonts:  'Oswald:wght@500;700',
    },
    {
      key:     'teko',
      nome:    'Teko',
      desc:    'Urbano condensado',
      familia: "'Teko', sans-serif",
      gfonts:  'Teko:wght@500;700',
    },
  ];

  // ── Estado privado ───────────────────────────────────────
  static #fontesCargadas = new Set();

  // ─────────────────────────────────────────────────────────
  // Carrega a fonte no <head> via Google Fonts (uma vez só).
  // ─────────────────────────────────────────────────────────
  static carregarFonte(key) {
    if (!key || FonteSalao.#fontesCargadas.has(key)) return;
    const def = FonteSalao.#definicaoPor(key);
    if (!def) return;

    const link  = document.createElement('link');
    link.rel    = 'stylesheet';
    link.href   = `https://fonts.googleapis.com/css2?family=${def.gfonts}&display=swap`;
    document.head.appendChild(link);
    FonteSalao.#fontesCargadas.add(key);
  }

  // ─────────────────────────────────────────────────────────
  // Aplica a fonte a um elemento DOM. Passa key = null / '' para
  // remover qualquer fonte customizada.
  // ─────────────────────────────────────────────────────────
  static aplicarFonte(el, key) {
    if (!el) return;
    if (!key) { el.style.fontFamily = ''; delete el.dataset.fontKey; return; }
    const def = FonteSalao.#definicaoPor(key);
    if (!def) return;
    FonteSalao.carregarFonte(key);
    el.style.fontFamily = def.familia;
    el.dataset.fontKey  = key;
  }

  // ─────────────────────────────────────────────────────────
  // Salva a escolha de fonte no Supabase.
  // ─────────────────────────────────────────────────────────
  static async salvar(barbershopId, key) {
    if (!barbershopId) return;
    const { error } = await SupabaseService.barbershops()
      .update({ font_key: key ?? null })
      .eq('id', barbershopId);
    if (error) throw error;
  }

  // ─────────────────────────────────────────────────────────
  // Cria o seletor de fontes dentro de containerEl.
  //
  // @param {HTMLElement} containerEl  — onde o picker é injetado
  // @param {string}      barbershopId — id da barbearia (para salvar)
  // @param {string}      fontAtual    — key da fonte atual (pode ser null)
  // @param {Function}    onSelect     — cb(key) chamado ao selecionar
  // ─────────────────────────────────────────────────────────
  static criarPicker(containerEl, barbershopId, fontAtual, onSelect) {
    if (!containerEl) return;

    // Evita duplicar
    if (containerEl.querySelector('.fs-picker')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'fs-picker';

    // Botão toggle para abrir/fechar a lista
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'fs-picker__toggle';
    btn.textContent = '✏️ Fonte do Nome';

    // Lista de fontes (inicialmente oculta)
    const lista = document.createElement('ul');
    lista.className = 'fs-picker__lista';
    lista.hidden    = true;

    FonteSalao.FONTES.forEach(def => {
      FonteSalao.carregarFonte(def.key);

      const li = document.createElement('li');
      li.className = 'fs-picker__item';
      if (def.key === fontAtual) li.classList.add('fs-picker__item--ativo');

      const nomeTxt = document.createElement('span');
      nomeTxt.className          = 'fs-picker__nome';
      nomeTxt.textContent        = def.nome;
      nomeTxt.style.fontFamily   = def.familia;

      const descTxt = document.createElement('span');
      descTxt.className   = 'fs-picker__desc';
      descTxt.textContent = def.desc;

      li.appendChild(nomeTxt);
      li.appendChild(descTxt);

      li.addEventListener('click', () => {
        // Marcar ativo
        lista.querySelectorAll('.fs-picker__item--ativo')
             .forEach(el => el.classList.remove('fs-picker__item--ativo'));
        li.classList.add('fs-picker__item--ativo');

        // Fechar lista
        lista.hidden = true;
        btn.classList.remove('fs-picker__toggle--aberto');

        // Callback e salvar
        onSelect?.(def.key);
        if (barbershopId) FonteSalao.salvar(barbershopId, def.key);
      });

      lista.appendChild(li);
    });

    btn.addEventListener('click', () => {
      const aberto = !lista.hidden;
      lista.hidden = aberto;
      btn.classList.toggle('fs-picker__toggle--aberto', !aberto);
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(lista);
    containerEl.appendChild(wrapper);
  }

  // ─────────────────────────────────────────────────────────
  // Interno — retorna definição pela key.
  // ─────────────────────────────────────────────────────────
  static #definicaoPor(key) {
    return FonteSalao.FONTES.find(f => f.key === key) ?? null;
  }
}
