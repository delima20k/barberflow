'use strict';

class EmailTemplateBuilder {
  static #brand = {
    name: 'BarberFlow',
    gold: '#d4af37',
    ink: '#1f2328',
    muted: '#687076',
    bg: '#f6f3ea',
    card: '#ffffff',
  };

  static signupConfirmation({ userName, confirmationLink }) {
    return EmailTemplateBuilder.#layout({
      title: 'Confirme seu cadastro',
      preview: 'Confirme seu email para ativar sua conta BarberFlow.',
      body: `
        <p>Oi, ${EmailTemplateBuilder.#escape(userName || 'tudo bem')}.</p>
        <p>Recebemos seu cadastro no BarberFlow. Confirme seu email para concluir a ativacao da conta.</p>
        ${EmailTemplateBuilder.#button('Confirmar cadastro', confirmationLink)}
        <p class="muted">Se voce nao criou essa conta, ignore este email.</p>
      `,
    });
  }

  static passwordReset({ userName, resetLink, expiresInMinutes }) {
    const minutes = Number.isFinite(Number(expiresInMinutes)) ? Number(expiresInMinutes) : 60;
    return EmailTemplateBuilder.#layout({
      title: 'Recuperar senha',
      preview: 'Use o link para criar uma nova senha no BarberFlow.',
      body: `
        <p>Oi, ${EmailTemplateBuilder.#escape(userName || 'tudo bem')}.</p>
        <p>Recebemos um pedido para redefinir sua senha. O link abaixo expira em ${minutes} minutos.</p>
        ${EmailTemplateBuilder.#button('Criar nova senha', resetLink)}
        <p class="muted">Se voce nao pediu essa alteracao, ignore este email.</p>
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
      .wrap { width:100%; padding:24px 12px; box-sizing:border-box; }
      .card { max-width:560px; margin:0 auto; background:${b.card}; border:1px solid #e7dfc7; border-radius:12px; overflow:hidden; }
      .head { padding:24px 28px; background:${b.ink}; color:#fff; }
      .brand { color:${b.gold}; font-size:20px; font-weight:700; letter-spacing:0; }
      .content { padding:28px; font-size:16px; line-height:1.55; }
      h1 { margin:0 0 14px; font-size:24px; line-height:1.2; }
      p { margin:0 0 16px; }
      .muted { color:${b.muted}; font-size:14px; }
      .action { margin:24px 0; }
      .action a { display:inline-block; padding:13px 18px; border-radius:8px; background:${b.gold}; color:${b.ink}; text-decoration:none; font-weight:700; }
      .link-fallback { color:${b.muted}; font-size:12px; overflow-wrap:anywhere; }
      .footer { padding:18px 28px; color:${b.muted}; font-size:12px; border-top:1px solid #efe7cf; }
      .preview { display:none; max-height:0; overflow:hidden; opacity:0; }
    </style>
  </head>
  <body>
    <span class="preview">${EmailTemplateBuilder.#escape(preview)}</span>
    <div class="wrap">
      <div class="card">
        <div class="head"><div class="brand">${b.name}</div></div>
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
