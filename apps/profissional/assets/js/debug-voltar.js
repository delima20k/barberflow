// DEBUG TEMPORÁRIO - remover após encontrar bug do botão Voltar
'use strict';

/**
 * Captura o estado do btn-voltar visível em QUALQUER tela ativa e loga.
 * Emite erros quando detecta estado quebrado.
 * @param {string} contexto  label do ponto de observação
 */
function debugBotaoVoltar(contexto) {
  // Encontra a tela que está visível no momento (qualquer página)
  const telaAtiva = Array.from(document.querySelectorAll('.tela'))
    .find(t => getComputedStyle(t).display !== 'none');

  const btn = telaAtiva?.querySelector('.btn-voltar')
           ?? document.querySelector('.btn-voltar');

  if (!btn) {
    console.warn('[DEBUG VOLTAR] Botão não encontrado —', contexto);
    return;
  }

  const rect    = btn.getBoundingClientRect();
  const texto   = btn.textContent?.trim();
  const html    = btn.innerHTML;
  const onclick = btn.getAttribute('onclick');
  const pe      = getComputedStyle(btn).pointerEvents;
  const display = getComputedStyle(btn).display;

  console.log('[DEBUG VOLTAR]', contexto, {
    tela:          telaAtiva?.id ?? '?',
    texto,
    width:         Math.round(rect.width),
    height:        Math.round(rect.height),
    display,
    pointerEvents: pe,
    onclick,
    html:          html.substring(0, 100),
    classes:       btn.className,
  });

  if (!texto || !texto.includes('Voltar')) {
    console.error('[DEBUG VOLTAR] ❌ Texto "Voltar" sumiu —', contexto, { tela: telaAtiva?.id, html });
  }
  if (rect.width < 70) {
    console.error('[DEBUG VOLTAR] ❌ Botão encolheu (<70px) —', contexto, { tela: telaAtiva?.id, width: Math.round(rect.width) });
  }
  if (onclick?.includes('Pro')) {
    console.error('[DEBUG VOLTAR] ❌ onclick usa "Pro" (ReferenceError provável) —', contexto, { onclick });
  }
  if (pe === 'none') {
    console.error('[DEBUG VOLTAR] ❌ pointer-events: none no botão —', contexto, { tela: telaAtiva?.id });
  }
}

// ── Global error listener — captura "Pro is not defined" ──────────────────────
window.addEventListener('error', (e) => {
  if (e?.message?.includes('Pro is not defined') || e?.message?.includes('Pro')) {
    console.error('[DEBUG VOLTAR] 🚨 ERRO GLOBAL capturado:', e.message, {
      source:  e.filename,
      linha:   e.lineno,
      coluna:  e.colno,
    });
    debugBotaoVoltar('após erro global: ' + e.message);
  }
}, { capture: true });

// ── MutationObserver — observa TODAS as .tela-topo do app ────────────────────
(function instalarObservers() {
  function _observar() {
    // Observa o container pai de todas as telas
    const appEl = document.getElementById('app') ?? document.body;

    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Ignora mutations que não são em ou perto de um btn-voltar
        const alvo = m.target;
        const emBtnVoltar = alvo.classList?.contains('btn-voltar')
          || alvo.closest?.('.btn-voltar')
          || alvo.querySelector?.('.btn-voltar');
        if (!emBtnVoltar) continue;

        debugBotaoVoltar('MutationObserver — alteração em btn-voltar (alvo=' + (alvo.id || alvo.className || alvo.tagName) + ')');
        break; // um log por batch é suficiente
      }
    });

    // Observa atributos e filhos em toda a árvore do app
    obs.observe(appEl, {
      attributes:    true,
      attributeFilter: ['class', 'style'],
      childList:     true,
      subtree:       true,
    });

    console.log('[DEBUG VOLTAR] MutationObserver global instalado em:', appEl.id || 'body');

    // ResizeObserver — detecta quando qualquer btn-voltar encolhe
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.round(entry.contentRect.width);
          if (w < 70) {
            const telaEl = entry.target.closest('.tela');
            console.error('[DEBUG VOLTAR] ❌ ResizeObserver: btn-voltar encolheu —', {
              tela:  telaEl?.id ?? '?',
              width: w,
              classes: entry.target.className,
            });
          }
        }
      });

      document.querySelectorAll('.btn-voltar').forEach(btn => ro.observe(btn));
      console.log('[DEBUG VOLTAR] ResizeObserver instalado em', document.querySelectorAll('.btn-voltar').length, 'botões');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _observar);
  } else {
    _observar();
  }
})();

window.__debugBotaoVoltar = debugBotaoVoltar;
// DEBUG TEMPORÁRIO — fim
