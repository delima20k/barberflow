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

    // Ao sair do modo edição, cancela campos ainda abertos
    if (!PerfilEditor.#modo) {
      PerfilEditor.#lista.querySelectorAll('.perfil-item.editando')
        .forEach(li => PerfilEditor._cancelarCampo(li));
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
    PerfilEditor._setVal('pi-birth_date', dados?.birth_date, v => {
      const d = new Date(v + 'T00:00:00');
      return d.toLocaleDateString('pt-BR');
    });
    PerfilEditor._setVal('pi-gender',     dados?.gender,     v => ({
      masculino: 'Masculino', feminino: 'Feminino',
      outro: 'Outro', nao_informar: 'Prefiro não informar',
    })[v] || v);
    PerfilEditor._setVal('pi-zip_code',   dados?.zip_code,   v => v);
  }

  /** Reseta a lista ao fazer logout. */
  static limpar() {
    ['pi-address', 'pi-birth_date', 'pi-gender', 'pi-zip_code'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = '—'; delete el.dataset.raw; el.hidden = false; }
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
    inp.value     = valorAtual;
    if (campo === 'birth_date') {
      inp.type = 'date';
    } else if (campo === 'zip_code') {
      inp.type        = 'tel';
      inp.inputMode   = 'numeric';
      inp.maxLength   = 9;
      inp.placeholder = '00000-000';
    } else {
      inp.type        = 'text';
      inp.placeholder = 'Digite aqui...';
    }
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
    if (!valor) { el.textContent = '—'; delete el.dataset.raw; return; }
    el.dataset.raw  = valor;
    el.textContent  = transformar(valor) || '—';
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

    const novoValor = editor.value.trim();
    editor.remove();
    valEl.hidden = false;
    delete li.dataset.salvando;

    if (!novoValor) return;

    // Atualiza exibição imediatamente (optimistic UI)
    PerfilEditor._setVal(valEl.id, novoValor, v => {
      if (campo === 'birth_date') {
        const d = new Date(v + 'T00:00:00');
        return d.toLocaleDateString('pt-BR');
      }
      if (campo === 'gender') {
        return { masculino: 'Masculino', feminino: 'Feminino',
                 outro: 'Outro', nao_informar: 'Prefiro não informar' }[v] || v;
      }
      return v;
    });

    // Persiste no Supabase em background
    try {
      const { data: { user } } = await SupabaseService.client.auth.getUser();
      if (user) {
        await SupabaseService.client.from('profiles')
          .update({ [campo]: novoValor, updated_at: new Date().toISOString() })
          .eq('id', user.id);
      }
    } catch (err) {
      console.warn('[PerfilEditor] Falha ao salvar campo:', campo, err);
    }
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
