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
    if (containerEl.querySelector('.fs-picker')) return; // evita duplicar

    // Rastreia a key selecionada (pendente de confirmação)
    let keyPendente = fontAtual ?? null;

    // ── Wrapper principal ─────────────────────────────────
    const wrapper = document.createElement('div');
    wrapper.className = 'fs-picker';

    // ── Botão toggle (abre/fecha painel) ──────────────────
    const btnToggle = document.createElement('button');
    btnToggle.type        = 'button';
    btnToggle.className   = 'fs-picker__toggle';
    btnToggle.textContent = '✏️ Fonte do Nome';

    // ── Painel dropdown ───────────────────────────────────
    const painel = document.createElement('div');
    painel.className = 'fs-picker__painel';
    painel.hidden    = true;

    // ── Lista de opções ───────────────────────────────────
    const lista = document.createElement('ul');
    lista.className = 'fs-picker__lista';

    FonteSalao.FONTES.forEach(def => {
      FonteSalao.carregarFonte(def.key);

      const li = document.createElement('li');
      li.className = 'fs-picker__item';
      if (def.key === keyPendente) li.classList.add('fs-picker__item--ativo');

      const txt = document.createElement('span');
      txt.className = 'fs-picker__txt';

      const nomeTxt = document.createElement('span');
      nomeTxt.className        = 'fs-picker__nome';
      nomeTxt.textContent      = def.nome;
      nomeTxt.style.fontFamily = def.familia;

      const descTxt = document.createElement('span');
      descTxt.className   = 'fs-picker__desc';
      descTxt.textContent = def.desc;

      txt.appendChild(nomeTxt);
      txt.appendChild(descTxt);

      const check = document.createElement('span');
      check.className   = 'fs-picker__check';
      check.textContent = '✓';
      check.setAttribute('aria-hidden', 'true');

      li.appendChild(txt);
      li.appendChild(check);

      // Clicar apenas destaca o item — não persiste ainda
      li.addEventListener('click', () => {
        lista.querySelectorAll('.fs-picker__item--ativo')
             .forEach(el => el.classList.remove('fs-picker__item--ativo'));
        li.classList.add('fs-picker__item--ativo');
        keyPendente = def.key;
      });

      lista.appendChild(li);
    });

    // ── Botão confirmar ───────────────────────────────────
    const btnConfirmar = document.createElement('button');
    btnConfirmar.type      = 'button';
    btnConfirmar.className = 'btn-flow fs-picker__confirmar';
    btnConfirmar.textContent = '✓ Confirmar Fonte';

    btnConfirmar.addEventListener('click', () => {
      // Não faz nada se nenhuma fonte foi escolhida
      if (!keyPendente) return;

      // Fecha o painel imediatamente
      painel.hidden = true;
      btnToggle.classList.remove('fs-picker__toggle--aberto');

      // Notifica o chamador (atualiza DOM, cache local etc.)
      onSelect?.(keyPendente);

      // Persiste no Supabase — só se mudou
      if (barbershopId && keyPendente !== fontAtual) {
        btnConfirmar.disabled = true;
        FonteSalao.salvar(barbershopId, keyPendente)
          .then(() => { fontAtual = keyPendente; })
          .catch(err => {
            console.error('[FonteSalao] Erro ao salvar font_key:', err);
          })
          .finally(() => { btnConfirmar.disabled = false; });
      }
    });

    painel.appendChild(lista);
    painel.appendChild(btnConfirmar);

    // ── Toggle abre / fecha painel ────────────────────────
    btnToggle.addEventListener('click', () => {
      const aberto = !painel.hidden;
      painel.hidden = aberto;
      btnToggle.classList.toggle('fs-picker__toggle--aberto', !aberto);
    });

    wrapper.appendChild(btnToggle);
    wrapper.appendChild(painel);
    containerEl.appendChild(wrapper);
  }

  // ─────────────────────────────────────────────────────────
  // Interno — retorna definição pela key.
  // ─────────────────────────────────────────────────────────
  static #definicaoPor(key) {
    return FonteSalao.FONTES.find(f => f.key === key) ?? null;
  }
}
