'use strict';

class EmailTemplateBuilder {
  static #brand = {
    name: 'BarberFlow',
    gold: '#d4af37',
    ink: '#f9fafb',
    muted: '#9ca3af',
    bg: '#111827',
    card: '#1f2937',
    line: '#374151',
    logo: 'https://app.barberflow.live/shared/img/Logo01.png',
  };

  static signupConfirmation({ userName, confirmationLink }) {
    const appLabel = EmailTemplateBuilder.appLabelFromUrl(confirmationLink);
    return EmailTemplateBuilder.#layout({
      title: 'Confirme seu cadastro',
      preview: `Confirme seu email para ativar sua conta ${appLabel}.`,
      body: `
        <p>Oi, ${EmailTemplateBuilder.#escape(userName || 'tudo bem')}.</p>
        <p>Recebemos seu cadastro no ${EmailTemplateBuilder.#escape(appLabel)}. Confirme seu email para concluir a ativacao da conta.</p>
        ${EmailTemplateBuilder.#button('Confirmar cadastro', confirmationLink)}
        <p class="muted">Se voce nao criou essa conta, ignore este email.</p>
      `,
    });
  }

  static passwordReset({ userName, resetLink, expiresInMinutes }) {
    const minutes = Number.isFinite(Number(expiresInMinutes)) ? Number(expiresInMinutes) : 60;
    const appLabel = EmailTemplateBuilder.appLabelFromUrl(resetLink);
    return EmailTemplateBuilder.#layout({
      title: 'Recupere sua senha',
      preview: `Crie uma nova senha segura para acessar sua conta ${appLabel}.`,
      body: `
        <p>Oi, ${EmailTemplateBuilder.#escape(userName || 'tudo bem')}.</p>
        <p>Recebemos uma solicitacao para redefinir a senha da sua conta ${EmailTemplateBuilder.#escape(appLabel)}.</p>
        <p>Para criar uma nova senha, clique no botao abaixo. Este link expira em ${minutes} minutos.</p>
        ${EmailTemplateBuilder.#button('Criar nova senha', resetLink)}
        <p class="muted">Se voce nao pediu essa alteracao, ignore este email. Sua senha atual continuara protegida.</p>
      `,
    });
  }

  static passwordChanged({ userName }) {
    return EmailTemplateBuilder.#layout({
      title: 'Senha alterada',
      preview: 'Sua senha do BarberFlow foi alterada.',
      body: `
        <p>Oi, ${EmailTemplateBuilder.#escape(userName || 'tudo bem')}.</p>
        <p>Sua senha do BarberFlow foi alterada com sucesso.</p>
        <p class="muted">Se essa alteracao nao foi feita por voce, entre em contato com o suporte imediatamente.</p>
      `,
    });
  }

  static landingFeedback({
    name,
    email,
    type,
    subject,
    message,
    privacyConsent,
    submittedAt,
    origin,
  }) {
    return EmailTemplateBuilder.#layout({
      title: 'Nova mensagem da landing',
      preview: 'Uma nova sugestão foi enviada pela Landing Page BarberFlow.',
      body: `
        <p><strong>Nome:</strong> ${EmailTemplateBuilder.#escape(name)}</p>
        <p><strong>E-mail:</strong> ${EmailTemplateBuilder.#escape(email)}</p>
        <p><strong>Tipo:</strong> ${EmailTemplateBuilder.#escape(type)}</p>
        <p><strong>Assunto:</strong> ${EmailTemplateBuilder.#escape(subject)}</p>
        <p><strong>Mensagem:</strong><br>${EmailTemplateBuilder.#escape(message).replaceAll('\n', '<br>')}</p>
        <p><strong>Enviado em:</strong> ${EmailTemplateBuilder.#escape(submittedAt)}</p>
        <p><strong>Origem:</strong> ${EmailTemplateBuilder.#escape(origin)}</p>
        <p class="muted">Aceite da política de privacidade: ${privacyConsent === true ? 'sim' : 'não'}.</p>
      `,
    });
  }

  static appLabelFromUrl(value) {
    try {
      const hostname = new URL(String(value || '')).hostname.toLowerCase();
      if (hostname === 'app.barberflow.live' || hostname.includes('cliente')) {
        return 'BarberFlow Cliente';
      }
      if (hostname === 'pro.barberflow.live' || hostname.includes('profissional')) {
        return 'BarberFlow Profissional';
      }
    } catch {
      // Mantem fallback generico para templates e testes sem URL real.
    }
    return 'BarberFlow';
  }

  static #button(label, href) {
    const safeHref = EmailTemplateBuilder.#escapeAttr(href);
    return `
      <p class="action">
        <a href="${safeHref}" target="_blank" rel="noopener noreferrer">${EmailTemplateBuilder.#escape(label)}</a>
      </p>
      <p class="link-fallback">${safeHref}</p>
    `;
  }

  static #layout({ title, preview, body }) {
    const b = EmailTemplateBuilder.#brand;
    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${EmailTemplateBuilder.#escape(title)}</title>
    <style>
      body { margin:0; padding:0; background:${b.bg}; color:${b.ink}; font-family:Arial,Helvetica,sans-serif; }
      .wrap { width:100%; padding:28px 12px; box-sizing:border-box; background:${b.bg}; }
      .card { max-width:560px; margin:0 auto; background:${b.card}; border:1px solid ${b.line}; border-radius:16px; overflow:hidden; box-shadow:0 18px 44px rgba(0,0,0,.24); }
      .head { padding:28px 28px 18px; text-align:center; background:${b.bg}; color:#fff; }
      .logo-glow { display:inline-block; padding:8px; border-radius:20px; background:radial-gradient(ellipse at 50% 50%, rgba(255,251,230,1) 0%, rgba(245,217,122,.82) 28%, rgba(212,175,55,.42) 52%, rgba(212,175,55,.16) 70%, rgba(17,24,39,0) 86%); box-shadow:0 0 18px rgba(255,251,230,.40), 0 0 34px rgba(212,175,55,.24); }
      .logo { display:block; width:110px; height:110px; object-fit:contain; border-radius:18px; }
      .brand { color:${b.gold}; font-size:26px; font-weight:700; letter-spacing:0; margin-top:8px; }
      .content { padding:28px; font-size:16px; line-height:1.55; color:#e5e7eb; }
      h1 { margin:0 0 14px; font-size:24px; line-height:1.2; color:#ffffff; }
      p { margin:0 0 16px; color:#e5e7eb; }
      .muted { color:${b.muted}; font-size:14px; }
      .action { margin:24px 0; }
      .action a { display:inline-block; padding:14px 20px; border-radius:10px; background:${b.gold}; color:#111827; text-decoration:none; font-weight:700; }
      .link-fallback { color:${b.muted}; font-size:12px; overflow-wrap:anywhere; }
      .footer { padding:18px 28px; color:${b.muted}; font-size:12px; border-top:1px solid ${b.line}; }
      .preview { display:none; max-height:0; overflow:hidden; opacity:0; }
    </style>
  </head>
  <body>
    <span class="preview">${EmailTemplateBuilder.#escape(preview)}</span>
    <div class="wrap">
      <div class="card">
        <div class="head">
          <div class="logo-glow"><img class="logo" src="${b.logo}" alt="${b.name}" width="110" height="110"></div>
          <div class="brand">${b.name}</div>
        </div>
        <div class="content">
          <h1>${EmailTemplateBuilder.#escape(title)}</h1>
          ${body}
        </div>
        <div class="footer">Email automatico do BarberFlow. Nao responda esta mensagem.</div>
      </div>
    </div>
  </body>
</html>`;
  }

  static #escape(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  static #escapeAttr(value) {
    return EmailTemplateBuilder.#escape(String(value ?? '').trim());
  }
}

module.exports = { EmailTemplateBuilder };
