'use strict';

/**
 * AppGuards — proteções de UX do app (carregado no cliente e no profissional):
 *
 *   1) Dissuasão de download de mídia: bloqueia o menu de contexto / toque longo
 *      "Salvar imagem" em <img>/<video> (e em qualquer .bf-protegido), impede
 *      arrastar a imagem para fora e marca vídeos como nodownload.
 *   2) Bloqueio de zoom: impede pinch-zoom (incl. iOS, que ignora o viewport).
 *      O duplo-toque é tratado pelo CSS (touch-action: manipulation), preservando
 *      os gestos de duplo-toque do próprio app.
 *
 * IMPORTANTE: isto é DISSUASÃO, não segurança. Print de tela, DevTools e a URL
 * direta do storage continuam acessíveis. Proteção real exige URL assinada que
 * expira no backend (R2). Aqui cobrimos o usuário comum.
 */
(function () {
  if (typeof document === 'undefined') return;

  const ehMidia = (el) =>
    !!el && (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.closest?.('img, video, .bf-protegido'));

  // ── 1. Download: menu de contexto / arrastar / nodownload ────
  document.addEventListener('contextmenu', (e) => {
    if (ehMidia(e.target)) e.preventDefault();
  });
  document.addEventListener('dragstart', (e) => {
    if (e.target && (e.target.tagName === 'IMG' || e.target.closest?.('.bf-protegido'))) e.preventDefault();
  });

  const marcarVideo = (v) => {
    try {
      v.setAttribute('controlsList', 'nodownload');
      v.setAttribute('disablePictureInPicture', '');
    } catch (_) { /* noop */ }
  };
  const marcarVideos = (root) => {
    if (root && root.querySelectorAll) root.querySelectorAll('video').forEach(marcarVideo);
  };
  marcarVideos(document);
  // Vídeos inseridos depois (stories, portfólio, etc.)
  try {
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'VIDEO') marcarVideo(n);
          else marcarVideos(n);
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) { /* MutationObserver indisponível */ }

  // ── 2. Zoom: bloqueia pinch (iOS ignora user-scalable=no) ────
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => {
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  });
})();
