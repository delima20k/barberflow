/**
 * PerfilEditor — Gerencia a edição inline de dados pessoais na tela de perfil.
 *
 * Responsabilidades:
 *  - Alternar modo de edição (revela lápis em cada item da lista)
 *  - Editar campo individual com input/select inline
 *  - Persistir alterações no Supabase em background (optimistic UI)
 *  - Popular lista com dados vindos do perfil
 *  - Limpar lista ao fazer logout
 *
 * Uso:
 *   <button onclick="PerfilEditor.alternarModo(this)">Editar perfil</button>
 *   <button onclick="PerfilEditor.editarCampo(this,'address')">✏️</button>
 *   PerfilEditor.popular(perfil); // chamado pelo AuthService
 */
class PerfilEditor {
  static #modo      = false;
  static #lista     = null;
  static #btnEditar = null;

  static get #SVG_LAPIS() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — modo de edição
  // ═══════════════════════════════════════════════════════════

  /**
   * Alterna entre visualização e edição.
   * Chamado pelo clique no botão "Editar perfil".
   * @param {HTMLButtonElement} btn
   */
  static alternarModo(btn) {
    PerfilEditor.#modo      = !PerfilEditor.#modo;
    PerfilEditor.#btnEditar = btn;
    PerfilEditor.#lista     = document.getElementById('perfil-lista');
    if (!PerfilEditor.#lista) return;

    PerfilEditor.#lista.classList.toggle('modo-editar', PerfilEditor.#modo);

    // Atualiza texto e ícone do botão
    btn.innerHTML = PerfilEditor.#modo
      ? `${PerfilEditor.#SVG_LAPIS} Concluir`
      : `${PerfilEditor.#SVG_LAPIS} Editar perfil`;

    // Ao sair do modo edição
    if (!PerfilEditor.#modo) {
      // SALVA (não cancela!) campos ainda abertos ao concluir
      PerfilEditor.#lista.querySelectorAll('.perfil-item.editando')
        .forEach(li => {
          const campo = li.querySelector('.pi-editor')?.dataset?.campo;
          if (campo) PerfilEditor._confirmarCampo(li, campo);
          else       PerfilEditor._cancelarCampo(li);
        });
      // Atualiza visibilidade das labels (oculta se tiver valor)
      PerfilEditor.#lista.querySelectorAll('.perfil-item').forEach(li => {
        PerfilEditor._sincronizarLabel(li);
      });
    } else {
      // Ao entrar no modo edição: mostra todas as labels
      PerfilEditor.#lista.querySelectorAll('.perfil-item-label').forEach(el => {
        el.hidden = false;
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — edição de campo
  // ═══════════════════════════════════════════════════════════

  /**
   * Abre editor inline para um campo específico.
   * @param {HTMLButtonElement} btnLapis — botão lápis da LI
   * @param {string} campo — 'address' | 'birth_date' | 'gender' | 'zip_code'
   */
  static editarCampo(btnLapis, campo) {
    const li    = btnLapis.closest('.perfil-item');
    const valEl = li?.querySelector('.pi-val');
    if (!li || !valEl || li.classList.contains('editando')) return;

    li.classList.add('editando');
    valEl.hidden = true;

    const editor = campo === 'gender'
      ? PerfilEditor._criarSelect(li.querySelector('.pi-val')?.dataset.raw || '')
      : PerfilEditor._criarInput(campo, valEl.dataset.raw || '');

    editor.dataset.campo = campo;
    valEl.insertAdjacentElement('afterend', editor);
    editor.focus();

    editor.addEventListener('change',  () => PerfilEditor._confirmarCampo(li, campo));
    editor.addEventListener('blur',    () => setTimeout(() => PerfilEditor._confirmarCampo(li, campo), 150));
    editor.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); editor.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); PerfilEditor._cancelarCampo(li); }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // PÚBLICO — popular / limpar
  // ═══════════════════════════════════════════════════════════

  /**
   * Popula os itens da lista com dados do perfil.
   * Chamado por AuthService._atualizarUI() após carregar o perfil.
   * @param {Object} dados — objeto perfil retornado pelo Supabase
   */
  static popular(dados) {
    PerfilEditor._setVal('pi-address',    dados?.address,    v => v);
    PerfilEditor._setVal('pi-birth_date', dados?.birth_date, v => PerfilEditor._formatarDataLonga(v));
    PerfilEditor._setVal('pi-gender',     dados?.gender,     v => ({
      masculino: 'Masculino', feminino: 'Feminino',
      outro: 'Outro', nao_informar: 'Prefiro não informar',
    })[v] || v);
    PerfilEditor._setVal('pi-zip_code',   dados?.zip_code,   v => v);
  }

  /** Reseta a lista ao fazer logout. */
  static limpar() {
    ['pi-address', 'pi-birth_date', 'pi-gender', 'pi-zip_code'].forEach(id => {
      const valEl = document.getElementById(id);
      if (!valEl) return;
      valEl.textContent = '—';
      delete valEl.dataset.raw;
      valEl.hidden = false;
      // Restaura label
      const li = valEl.closest('.perfil-item');
      if (li) {
        const label = li.querySelector('.perfil-item-label');
        if (label) label.hidden = false;
      }
    });
    // Sai do modo edição se ativo
    if (PerfilEditor.#modo && PerfilEditor.#btnEditar) {
      PerfilEditor.#modo = false;
      PerfilEditor.#lista?.classList.remove('modo-editar');
      PerfilEditor.#btnEditar.innerHTML = `${PerfilEditor.#SVG_LAPIS} Editar perfil`;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS — helpers de DOM
  // ═══════════════════════════════════════════════════════════

  static _criarInput(campo, valorAtual) {
    const inp = document.createElement('input');
    inp.className = 'pi-editor';

    if (campo === 'birth_date') {
      return PerfilEditor._criarInputData(valorAtual);
    }

    if (campo === 'zip_code') {
      inp.type        = 'tel';
      inp.inputMode   = 'numeric';
      inp.maxLength   = 9;
      inp.placeholder = '00000-000';
      inp.value       = valorAtual;
      // Máscara CEP
      inp.addEventListener('input', () => {
        let v = inp.value.replace(/\D/g, '').slice(0, 8);
        if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
        inp.value = v;
      });
    } else {
      inp.type        = 'text';
      inp.placeholder = 'Digite aqui...';
      inp.value       = valorAtual;
    }
    return inp;
  }

  /**
   * Cria input de data com máscara automática DD/MM/AAAA.
   * Sem calendário nativo — digitação livre com barras auto-inseridas.
   * @param {string} valorAtual — formato ISO 'YYYY-MM-DD' ou vazio
   */
  static _criarInputData(valorAtual) {
    const inp = document.createElement('input');
    inp.className   = 'pi-editor';
    inp.type        = 'text';
    inp.inputMode   = 'numeric';
    inp.maxLength   = 10;
    inp.placeholder = 'DD/MM/AAAA';
    inp.dataset.campo = 'birth_date';

    // Converte ISO para exibição DD/MM/AAAA
    if (valorAtual) {
      const [ano, mes, dia] = valorAtual.split('-');
      if (dia && mes && ano) inp.value = `${dia}/${mes}/${ano}`;
    }

    inp.addEventListener('input', e => {
      const sel   = inp.selectionStart;
      let raw     = inp.value.replace(/\D/g, '').slice(0, 8);
      let mascara = '';
      if (raw.length > 4) {
        mascara = raw.slice(0,2) + '/' + raw.slice(2,4) + '/' + raw.slice(4);
      } else if (raw.length > 2) {
        mascara = raw.slice(0,2) + '/' + raw.slice(2);
      } else {
        mascara = raw;
      }
      // Reposiciona cursor considerando barras inseridas
      const barrasAntes = (inp.value.slice(0, sel).match(/\//g) || []).length;
      const barrasDepois = (mascara.slice(0, sel).match(/\//g) || []).length;
      inp.value = mascara;
      inp.selectionStart = inp.selectionEnd = sel + (barrasDepois - barrasAntes);
    });

    return inp;
  }

  static _criarSelect(valorAtual) {
    const sel = document.createElement('select');
    sel.className = 'pi-editor';
    [
      ['',           'Selecionar...'],
      ['masculino',  'Masculino'],
      ['feminino',   'Feminino'],
      ['outro',      'Outro'],
      ['nao_informar', 'Prefiro não informar'],
    ].forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val; opt.textContent = label;
      if (val === valorAtual) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  /** Aplica valor a um elemento pi-val com raw + exibição transformada. */
  static _setVal(id, valor, transformar) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!valor) {
      el.textContent = '—';
      delete el.dataset.raw;
      return;
    }
    el.dataset.raw = valor;
    el.textContent = transformar(valor) || '—';
    // Sincroniza visibilidade da label (ocultada se tiver conteúdo e fora do modo editar)
    const li = el.closest('.perfil-item');
    if (li) PerfilEditor._sincronizarLabel(li);
  }

  /**
   * Oculta a label da LI se: tiver conteúdo E não estiver em modo editar.
   * Mostra a label se: sem conteúdo OU em modo editar.
   * @param {HTMLLIElement} li
   */
  static _sincronizarLabel(li) {
    const valEl = li.querySelector('.pi-val');
    const label = li.querySelector('.perfil-item-label');
    if (!valEl || !label) return;
    const temValor = !!valEl.dataset.raw;
    // Oculta label somente fora do modo editar e com valor preenchido
    label.hidden = temValor && !PerfilEditor.#modo;
  }

  // ═══════════════════════════════════════════════════════════
  // PRIVADOS — confirmação / cancelamento
  // ═══════════════════════════════════════════════════════════

  static async _confirmarCampo(li, campo) {
    if (li.dataset.salvando === '1') return;
    const editor = li.querySelector('.pi-editor');
    const valEl  = li.querySelector('.pi-val');
    if (!editor || !valEl || !li.classList.contains('editando')) return;

    li.dataset.salvando = '1';
    li.classList.remove('editando');

    let novoValor = editor.value.trim();
    editor.remove();
    valEl.hidden = false;
    delete li.dataset.salvando;

    if (!novoValor) return;

    // Converte DD/MM/AAAA para ISO YYYY-MM-DD antes de salvar
    let valorParaSalvar = novoValor;
    if (campo === 'birth_date') {
      const partes = novoValor.split('/');
      if (partes.length === 3) {
        valorParaSalvar = `${partes[2]}-${partes[1]}-${partes[0]}`;
      } else {
        return; // data incompleta — não salva
      }
    }

    // Atualiza exibição imediatamente (optimistic UI)
    PerfilEditor._setVal(valEl.id, valorParaSalvar, v => {
      if (campo === 'birth_date') return PerfilEditor._formatarDataLonga(v);
      if (campo === 'gender') {
        return { masculino: 'Masculino', feminino: 'Feminino',
                 outro: 'Outro', nao_informar: 'Prefiro não informar' }[v] || v;
      }
      return v;
    });

    // Salva localmente (zero custo de banco)
    try {
      const { data: { user } } = await SupabaseService.client.auth.getUser();
      if (user?.id) {
        SessionCache.salvarExtras(user.id, { [campo]: valorParaSalvar });
      }
    } catch (err) {
      console.warn('[PerfilEditor] Falha ao salvar no cache local:', campo, err);
    }
  }

  /**
   * Formata data ISO 'YYYY-MM-DD' como '3 de Setembro de 1988'.
   * @param {string} isoStr
   * @returns {string}
   */
  static _formatarDataLonga(isoStr) {
    if (!isoStr) return '—';
    const d = new Date(isoStr + 'T00:00:00');
    if (isNaN(d.getTime())) return isoStr;
    const dia = d.getDate();
    const mes = d.toLocaleDateString('pt-BR', { month: 'long' }); // 'setembro'
    const ano = d.getFullYear();
    const mesCapital = mes.charAt(0).toUpperCase() + mes.slice(1); // 'Setembro'
    return `${dia} de ${mesCapital} de ${ano}`;
  }

  static _cancelarCampo(li) {
    const editor = li.querySelector('.pi-editor');
    const valEl  = li.querySelector('.pi-val');
    if (editor) editor.remove();
    if (valEl)  valEl.hidden = false;
    li.classList.remove('editando');
    delete li.dataset.salvando;
  }
}
