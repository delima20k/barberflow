'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { existsSync, readFileSync, statSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const LANDING_ROOT = join(ROOT, 'apps', 'landing-page');

class LandingPageFixture {
  static #REQUIRED_FILES = Object.freeze([
    'index.html',
    'README.md',
    'vercel.json',
    'config/landing-config.js',
    'config/landing-features.js',
    'css/variables.css',
    'css/reset.css',
    'css/global.css',
    'css/animations.css',
    'css/responsive.css',
    'css/sections/header-hero.css',
    'css/sections/problem-solution.css',
    'css/sections/showcase-media.css',
    'css/sections/process-benefits.css',
    'css/sections/voucher-faq.css',
    'css/sections/feedback-cta-footer.css',
    'css/legal.css',
    'js/main.js',
    'js/boot.js',
    'js/carousel.js',
    'js/animations.js',
    'js/mobile-navigation.js',
    'js/faq.js',
    'js/youtube-video.js',
    'js/voucher-service.js',
    'js/voucher-modal.js',
    'js/feedback-service.js',
    'js/feedback.js',
    'js/analytics.js',
    'legal/privacy.html',
    'legal/terms.html',
    'legal/campaign-rules.html',
    'assets/images/logos/Logo01.png',
    'assets/images/logos/LogoNomeBarberFlow.png',
    'assets/icons/whatsapp.svg',
    'assets/images/brand/imgFundoHeader.webp',
    'assets/images/screenshots/hero-abertura-app.webp',
    'assets/videos/hero-barberflow.mp4',
  ]);

  static requiredFiles() {
    return [...LandingPageFixture.#REQUIRED_FILES];
  }

  static path(relativePath) {
    return join(LANDING_ROOT, relativePath);
  }

  static source(relativePath) {
    return readFileSync(LandingPageFixture.path(relativePath), 'utf8');
  }

  static javascriptSource() {
    return LandingPageFixture.#REQUIRED_FILES
      .filter((file) => file.endsWith('.js'))
      .map((file) => LandingPageFixture.source(file))
      .join('\n');
  }
}

describe('Landing page BarberFlow', () => {
  it('deve possuir a estrutura modular e os ativos oficiais', () => {
    const missing = LandingPageFixture.requiredFiles()
      .filter((file) => !existsSync(LandingPageFixture.path(file)));

    assert.deepEqual(missing, []);
  });

  it('deve declarar barberflow.live como origem canonica e Open Graph', () => {
    const html = LandingPageFixture.source('index.html');
    const config = LandingPageFixture.source('config/landing-config.js');

    assert.match(html, /<link rel="canonical" href="https:\/\/barberflow\.live\/">/);
    assert.match(html, /<meta property="og:url" content="https:\/\/barberflow\.live\/">/);
    assert.match(config, /canonicalUrl:\s*'https:\/\/barberflow\.live'/);
  });

  it('deve manter os dominios oficiais separados por finalidade', () => {
    const config = LandingPageFixture.source('config/landing-config.js');

    assert.match(config, /clientAppUrl:\s*'https:\/\/app\.barberflow\.live'/);
    assert.match(config, /professionalAppUrl:\s*'https:\/\/pro\.barberflow\.live'/);
    assert.match(config, /bffUrl:\s*'https:\/\/bff\.barberflow\.live'/);
  });

  it('deve oferecer contato flutuante e acessivel pelo WhatsApp', () => {
    const html = LandingPageFixture.source('index.html');
    const config = LandingPageFixture.source('config/landing-config.js');
    const css = LandingPageFixture.source('css/global.css');
    const animations = LandingPageFixture.source('css/animations.css');

    assert.match(config, /whatsappUrl:\s*'https:\/\/wa\.me\/5511911082804\?text=/);
    assert.match(
      html,
      /<a class="whatsapp-floating-button"[^>]*data-config-link="whatsappUrl"[^>]*target="_blank"[^>]*rel="noopener noreferrer"[^>]*aria-label="Conversar com o BarberFlow pelo WhatsApp"/,
    );
    assert.match(html, /src="\.\/assets\/icons\/whatsapp\.svg"[^>]*alt=""/);
    assert.match(html, /<span class="whatsapp-floating-button__label">Clique no WhatsApp e saiba mais<\/span>/);
    assert.match(css, /\.whatsapp-floating-button\s*\{[\s\S]*?position:\s*fixed/);
    assert.match(css, /\.whatsapp-floating-button:focus-visible/);
    assert.match(animations, /\.whatsapp-floating-button__label\s*\{\s*animation:\s*whatsapp-callout-cycle\s+8s[^;]*infinite;/);
    assert.match(animations, /@keyframes\s+whatsapp-callout-cycle/);
    assert.match(
      animations,
      /prefers-reduced-motion:\s*reduce[\s\S]*?\.whatsapp-floating-button__label\s*\{[\s\S]*?animation:\s*none\s*!important;[\s\S]*?opacity:\s*1;/,
    );
  });

  it('deve renderizar todas as secoes previstas no esqueleto', () => {
    const html = LandingPageFixture.source('index.html');
    const sections = [
      'hero',
      'problema',
      'solucao',
      'funcionalidades',
      'conheca',
      'video',
      'como-funciona',
      'aplicativos',
      'beneficios',
      'voucher',
      'faq',
      'sugestoes',
      'cta-final',
      'rodape',
    ];

    for (const id of sections) {
      assert.match(html, new RegExp(`id="${id}"`), `Secao ausente: ${id}`);
    }
  });

  it('deve apresentar video e carrossel imediatamente abaixo do hero', () => {
    const html = LandingPageFixture.source('index.html');
    const topbarIndex = html.indexOf('<div class="landing-topbar">');
    const heroIndex = html.indexOf('<section id="hero"');
    const problemIndex = html.indexOf('<section id="problema"');
    const solutionIndex = html.indexOf('<section id="solucao"');
    const featuresIndex = html.indexOf('<section id="funcionalidades"');
    const showcaseIndex = html.indexOf('<section id="conheca"');
    const videoIndex = html.indexOf('<section id="video"');
    const benefitsIndex = html.indexOf('<section id="beneficios"');

    assert.ok(topbarIndex >= 0);
    assert.ok(heroIndex > topbarIndex);
    assert.ok(videoIndex > heroIndex);
    assert.ok(showcaseIndex > videoIndex);
    assert.ok(problemIndex > showcaseIndex);
    assert.ok(solutionIndex > problemIndex);
    assert.ok(featuresIndex > solutionIndex);
    assert.ok(benefitsIndex > featuresIndex);
  });

  it('deve manter marca e menu no topo do conteudo sem elemento header', () => {
    const html = LandingPageFixture.source('index.html');
    const css = LandingPageFixture.source('css/sections/header-hero.css');
    const responsiveCss = LandingPageFixture.source('css/responsive.css');
    const mainStart = html.match(/<main id="conteudo">[\s\S]*?<section id="hero"/)?.[0] ?? '';

    assert.doesNotMatch(html, /<\/?header\b/i);
    assert.doesNotMatch(html, /id="cabecalho"|data-header/);
    assert.match(mainStart, /<div class="landing-topbar">/);
    assert.match(mainStart, /<img class="brand__name"/);
    assert.match(mainStart, /<button class="menu-toggle"[^>]*data-menu-toggle/);
    assert.match(css, /\.landing-topbar\s*\{[^}]*background:\s*transparent;/);
    assert.match(
      css,
      /\.brand\s*\{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*transform:\s*translateX\(-50%\);/,
    );
    assert.match(
      css,
      /\.brand__name\s*\{[^}]*width:\s*246px;[^}]*height:\s*63px;[^}]*transform:\s*translateY\(15px\);/,
    );
    assert.match(responsiveCss, /@media \(max-width:\s*374px\)[\s\S]*?\.brand__name\s*\{[^}]*width:\s*168px;/);
    assert.doesNotMatch(responsiveCss, /\.menu-toggle\s*\{[^}]*display:\s*none;/);
    assert.doesNotMatch(css, /\.site-header(?:__inner)?\b/);
  });

  it('deve usar video decorativo otimizado no hero com imagem de fallback', () => {
    const html = LandingPageFixture.source('index.html');
    const css = LandingPageFixture.source('css/sections/header-hero.css');
    const server = readFileSync(join(ROOT, 'server.js'), 'utf8');
    const videoPath = LandingPageFixture.path('assets/videos/hero-barberflow.mp4');
    const video = html.match(/<video class="hero__background-video"[\s\S]*?<\/video>/)?.[0] ?? '';

    assert.match(video, /\sautoplay(?:\s|>)/);
    assert.match(video, /\smuted(?:\s|>)/);
    assert.match(video, /\sloop(?:\s|>)/);
    assert.match(video, /\splaysinline(?:\s|>)/);
    assert.match(video, /preload="metadata"/);
    assert.match(video, /poster="\.\/assets\/images\/brand\/imgFundoHeader\.webp"/);
    assert.match(video, /aria-hidden="true"/);
    assert.match(video, /tabindex="-1"/);
    assert.match(video, /src="\.\/assets\/videos\/hero-barberflow\.mp4" type="video\/mp4"/);
    assert.match(css, /\.hero__background-video\s*\{[\s\S]*?object-fit:\s*cover;/);
    assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*?\.hero__background-video\s*\{[\s\S]*?display:\s*none;/);
    assert.match(css, /background-image:\s*url\("\.\.\/\.\.\/assets\/images\/brand\/imgFundoHeader\.webp"\)/);
    assert.match(server, /'\.mp4'\s*:\s*'video\/mp4'/);
    assert.ok(statSync(videoPath).size > 0, 'O arquivo de video do hero nao pode estar vazio');
    assert.ok(statSync(videoPath).size <= 5 * 1024 * 1024, 'O video do hero deve ter no maximo 5 MB');
    assert.doesNotMatch(html, /rel="preload"[^>]+hero-barberflow\.mp4/);
  });

  it('deve apresentar o print real do aplicativo dentro do celular do hero', () => {
    const html = LandingPageFixture.source('index.html');
    const css = LandingPageFixture.source('css/sections/header-hero.css');
    const imagePath = LandingPageFixture.path('assets/images/screenshots/hero-abertura-app.webp');
    const image = html.match(/<img class="hero-phone__image"[^>]+>/)?.[0] ?? '';

    assert.match(image, /src="\.\/assets\/images\/screenshots\/hero-abertura-app\.webp"/);
    assert.match(image, /width="540"/);
    assert.match(image, /height="1230"/);
    assert.match(image, /loading="eager"/);
    assert.match(image, /decoding="async"/);
    assert.match(image, /alt="[^"]+"/);
    assert.match(css, /\.hero-phone__screen--image\s*\{[\s\S]*?padding:\s*0;/);
    assert.match(css, /\.hero-phone__image\s*\{[\s\S]*?object-fit:\s*contain;/);
    assert.doesNotMatch(html, /\[PLACEHOLDER - FILA EM TEMPO REAL NO CELULAR\]/);

    const signature = readFileSync(imagePath).subarray(0, 12);
    assert.equal(signature.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(signature.subarray(8, 12).toString('ascii'), 'WEBP');
    assert.ok(statSync(imagePath).size <= 100 * 1024, 'O print do hero deve ter no maximo 100 KB');
  });

  it('deve abrir o modal de voucher pelos CTAs principais', () => {
    const html = LandingPageFixture.source('index.html');

    assert.match(html, /<a href="#como-funciona">Como funciona<\/a>/);
    assert.match(html, /<a href="#funcionalidades">Funcionalidades<\/a>/);
    assert.match(html, /<a href="#beneficios">Benefícios<\/a>/);
    assert.match(html, /<a href="#faq">Dúvidas<\/a>/);
    assert.match(html, /data-open-voucher[^>]*>Testar grátis<\/a>/);
    assert.match(html, /data-open-voucher[^>]*>Quero testar grátis<\/a>/);
  });

  it('deve contar a narrativa principal sem promessas absolutas ou dados ficticios', () => {
    const html = LandingPageFixture.source('index.html');
    const problemScenarios = [
      'quantas pessoas estão esperando',
      'responder todos ao mesmo tempo',
      'sem saber o tamanho da fila',
      'aguardando sem previsão',
      'organização da ordem de atendimento',
    ];

    assert.match(html, /Sua barbearia trabalha com ordem de chegada\?/);
    assert.match(html, /<h1[^>]*>[\s\S]*Organize sua fila com o[\s\S]*BarberFlow[\s\S]*<\/h1>/);
    assert.match(html, /antes mesmo de sair de casa/);
    assert.match(html, /hero-abertura-app\.webp/);
    assert.match(
      html,
      /Responder a mesma pergunta no WhatsApp várias vezes não precisa fazer parte da rotina da sua barbearia\./,
    );

    for (const scenario of problemScenarios) {
      assert.match(html, new RegExp(scenario));
    }

    assert.doesNotMatch(html, /perdendo clientes/i);

    const solutionSection = html.match(
      /<section[^>]*id="solucao"[\s\S]*?<\/section>/,
    )?.[0] ?? '';

    assert.doesNotMatch(
      solutionSection,
      /Marcos|Rafael|Andr[eé]|20 min|35 min|3 clientes/i,
    );
  });

  it('deve apresentar oito funcionalidades e cinco passos da campanha', () => {
    const html = LandingPageFixture.source('index.html');
    const features = [
      'Mais organização',
      'Mais praticidade para o cliente',
      'Visibilidade da fila em tempo real',
      'Presença online dos profissionais',
      'Comunicação centralizada',
      'Controle financeiro',
      'Divulgação dos trabalhos',
      'Localização da barbearia no mapa',
    ];

    assert.equal((html.match(/data-feature-card/g) ?? []).length, 8);
    assert.equal((html.match(/data-process-step/g) ?? []).length, 5);

    for (const feature of features) {
      assert.match(html, new RegExp(feature));
    }

    assert.match(html, /utiliza o voucher promocional durante o cadastro/i);
    assert.match(html, /quando a campanha estiver disponível/i);
  });

  it('deve rotear os CTAs de teste e abrir o mesmo modal de voucher', () => {
    const html = LandingPageFixture.source('index.html');

    assert.match(html, /data-open-voucher[^>]*>Quero testar grátis<\/a>/);
    assert.match(html, /href="#como-funciona"[^>]*>Ver como funciona<\/a>/);
    assert.match(html, /data-mobile-cta[^>]*data-open-voucher[^>]*>Testar grátis<\/a>/);
    assert.match(html, /data-open-voucher[^>]*>Gerar meu voucher<\/button>/);
    assert.match(html, /data-open-voucher[^>]*>Quero um mês grátis<\/button>/);
    assert.match(html, /data-open-voucher[^>]*>Testar o BarberFlow<\/button>/);
    assert.match(
      html,
      /href="https:\/\/pro\.barberflow\.live\/"[^>]*>Acessar a aplicação<\/a>/,
    );
  });

  it('deve manter mockups dinamicos e preparar o video sem iframe vazio', () => {
    const html = LandingPageFixture.source('index.html');
    const features = LandingPageFixture.source('config/landing-features.js');
    const config = LandingPageFixture.source('config/landing-config.js');

    assert.equal((features.match(/placeholder:\s*'\[PRINT REAL/g) ?? []).length, 12);
    assert.match(features, /\[PRINT REAL — HOME DO BARBERFLOW\]/);
    assert.match(features, /\[PRINT REAL — BARBEARIA PÚBLICA\]/);
    assert.match(features, /\[PRINT REAL — MINHA BARBEARIA\]/);
    assert.match(html, /<h2 id="video-title">Veja como o BarberFlow funciona<\/h2>/);
    assert.match(
      html,
      /Conheça o sistema por dentro e veja como ele pode ajudar a organizar a rotina da sua barbearia\./,
    );
    assert.match(html, /data-video-player/);
    assert.match(html, /Vídeo de apresentação em breve/);
    assert.match(config, /youtubeVideoId:\s*'DdNwn7O6zL4'/);
    assert.doesNotMatch(html, /<iframe\b/i);
    const videoCss = LandingPageFixture.source('css/sections/showcase-media.css');
    const responsiveCss = LandingPageFixture.source('css/responsive.css');
    assert.match(videoCss, /\.video-player\[data-video-state="loaded"\]\s*\{[\s\S]*padding:\s*0;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/);
    assert.match(videoCss, /\.video-player\s*\{[^}]*width:\s*98vw;[^}]*padding:\s*0;/);
    assert.match(videoCss, /\.video-player\s*\{[^}]*aspect-ratio:\s*640\s*\/\s*819;/);
    assert.match(videoCss, /\.video-player\.is-visible\s*\{[^}]*padding-top:\s*0;/);
    assert.match(videoCss, /\.video-player\s*\{[\s\S]*margin-inline:\s*calc\(50%\s*-\s*49vw\);/);
    assert.match(videoCss, /\.video-section__action\s*\{[^}]*margin-top:\s*0;/);
    assert.doesNotMatch(responsiveCss, /\.video-player\s*\{[\s\S]*max-width:\s*1000px;/);
  });

  it('deve preparar formulario e estados completos sem voucher ou contagem ficticia', () => {
    const html = LandingPageFixture.source('index.html');
    const modal = html.match(/<div class="modal"[\s\S]*?<\/body>/)?.[0] ?? '';
    const source = LandingPageFixture.javascriptSource();
    const config = LandingPageFixture.source('config/landing-config.js');
    const main = LandingPageFixture.source('js/main.js');

    assert.match(html, /data-voucher-availability[^>]*aria-live="polite"/);
    assert.match(modal, /name="email"[^>]*autocomplete="email"/);
    assert.doesNotMatch(modal, /name="name"|name="phone"|name="campaignConsent"/);
    assert.match(modal, /Ao gerar o voucher,[\s\S]*regras da campanha[\s\S]*política de privacidade/i);
    assert.match(html, /data-voucher-loading/);
    assert.match(html, /data-voucher-error/);
    assert.match(html, /data-voucher-success/);
    assert.match(modal, /<input(?=[^>]*data-voucher-code)(?=[^>]*readonly)[^>]*>/);
    assert.match(modal, /data-copy-voucher[^>]*>Copiar código<\/button>/);
    assert.match(modal, /data-voucher-signup-link[^>]*>Ir para o cadastro<\/a>/);
    assert.match(modal, /data-voucher-app-link[^>]*>Entrar no app profissional<\/a>/);
    assert.match(html, /Seu voucher foi gerado com sucesso!/);
    assert.equal((html.match(/data-voucher-success-step/g) ?? []).length, 5);
    assert.doesNotMatch(source, /localStorage|Math\.random|crypto\.randomUUID/);
    assert.doesNotMatch(html, />\s*\d+\s+vouchers? restantes/i);
    assert.match(config, /voucherCampaignEnabled:\s*true/);
    assert.match(config, /voucherApiUrl:\s*'\/api\/v1\/professional-vouchers'/);
    assert.match(config, /professionalSignupUrl:\s*'https:\/\/pro\.barberflow\.live\/\?start=signup'/);
    assert.match(main, /new VoucherApiAdapter\(/);
  });

  it('deve preparar o carrossel dinamico com fallback sem JavaScript', () => {
    const html = LandingPageFixture.source('index.html');
    const featureScriptIndex = html.indexOf('./config/landing-features.js');
    const carouselScriptIndex = html.indexOf('./js/carousel.js');

    assert.match(html, /<h2 id="showcase-title">Conheça o BarberFlow em ação<\/h2>/);
    assert.match(
      html,
      /Arraste para o lado e veja como cada parte do sistema ajuda na rotina da sua barbearia\./,
    );
    assert.match(html, /<noscript>[\s\S]*https:\/\/pro\.barberflow\.live\/[\s\S]*<\/noscript>/);
    assert.match(html, /data-carousel-status[^>]*aria-live="polite"/);
    assert.equal((html.match(/data-carousel-slide/g) ?? []).length, 0);
    assert.ok(featureScriptIndex >= 0 && featureScriptIndex < carouselScriptIndex);
  });

  it('deve usar classes de interface sem chamadas de dados', () => {
    const source = [
      'config/landing-config.js',
      'js/main.js',
      'js/carousel.js',
      'js/mobile-navigation.js',
      'js/faq.js',
      'js/youtube-video.js',
      'js/voucher-modal.js',
      'js/feedback.js',
      'js/animations.js',
    ].map((file) => LandingPageFixture.source(file)).join('\n');
    const classes = [
      'LandingConfig',
      'LandingApp',
      'LandingCarousel',
      'MobileNavigation',
      'FaqAccordion',
      'YouTubeVideoController',
      'VoucherModal',
      'FeedbackFormController',
      'ScrollAnimationController',
    ];

    for (const className of classes) {
      assert.match(source, new RegExp(`class ${className}\\b`), `Classe ausente: ${className}`);
    }

    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|supabase/i);
    assert.doesNotMatch(source, /\binnerHTML\b|setInterval\s*\(/);

    const voucherService = LandingPageFixture.source('js/voucher-service.js');
    assert.match(voucherService, /class VoucherService\b/);
    assert.match(voucherService, /class VoucherApiAdapter\b/);
    assert.doesNotMatch(voucherService, /supabase|service[_-]?role/i);
  });

  it('deve oferecer responsividade e respeitar movimento reduzido', () => {
    const responsive = LandingPageFixture.source('css/responsive.css');
    const animations = LandingPageFixture.source('css/animations.css');

    assert.match(responsive, /@media\s*\(min-width:\s*768px\)/);
    assert.match(responsive, /@media\s*\(min-width:\s*1100px\)/);
    assert.match(animations, /prefers-reduced-motion:\s*reduce/);
  });

  it('deve oferecer acesso instalavel aos aplicativos oficiais', () => {
    const html = LandingPageFixture.source('index.html');
    const animations = LandingPageFixture.source('js/animations.js');
    const section = html.match(
      /<section[^>]*id="aplicativos"[\s\S]*?<\/section>/,
    )?.[0] ?? '';

    assert.match(section, /data-floating-cta-hide/);
    assert.match(section, /Baixar app do cliente/);
    assert.match(section, /Baixar app profissional/);
    assert.match(section, /data-config-link="clientAppUrl"/);
    assert.match(section, /data-config-link="professionalAppUrl"/);
    assert.match(section, /href="https:\/\/app\.barberflow\.live\/"/);
    assert.match(section, /href="https:\/\/pro\.barberflow\.live\/"/);
    assert.equal((section.match(/target="_blank"/g) ?? []).length, 2);
    assert.equal((section.match(/rel="noopener noreferrer"/g) ?? []).length, 2);
    assert.match(section, /podem ser instalados como PWA/i);
    assert.doesNotMatch(section, /\sdownload(?:=|\s|>)/i);
    assert.match(animations, /ctaBlockerObserver/);
    assert.match(animations, /activeCtaBlockers/);
  });

  it('deve usar animacoes leves e variadas sem esconder conteudo essencial', () => {
    const html = LandingPageFixture.source('index.html');
    const animations = LandingPageFixture.source('css/animations.css');

    assert.match(html, /reveal--left/);
    assert.match(html, /reveal--right/);
    assert.match(html, /reveal--scale/);
    assert.match(animations, /@keyframes\s+hero-content-enter/);
    assert.match(animations, /@keyframes\s+hero-phone-float/);
    assert.match(animations, /@keyframes\s+live-status-pulse/);
    assert.match(animations, /\.js \.reveal--left/);
    assert.match(animations, /\.js \.reveal--right/);
    assert.match(animations, /\.js \.reveal--scale/);
    assert.match(
      animations,
      /prefers-reduced-motion:\s*reduce[\s\S]*?animation-duration:\s*0\.01ms\s*!important/,
    );
  });

  it('nao deve anunciar atendimento movel ou em domicilio', () => {
    const html = LandingPageFixture.source('index.html');

    assert.doesNotMatch(html, /atendimentos?\s+m[oó]ve(?:l|is)|domic[ií]lio/i);
  });

  it('deve manter o conteudo visivel quando JavaScript estiver desativado', () => {
    const html = LandingPageFixture.source('index.html');
    const animations = LandingPageFixture.source('css/animations.css');
    const boot = LandingPageFixture.source('js/boot.js');

    assert.match(html, /<script src="\.\/js\/boot\.js"><\/script>/);
    assert.match(boot, /document\.documentElement\.classList\.add\('js'\)/);
    assert.match(animations, /\.js \.reveal\s*\{/);
    assert.doesNotMatch(animations, /^\.reveal\s*\{\s*opacity:\s*0/m);
  });

  it('deve oferecer o formulario completo com envio seguro pelo BFF', () => {
    const html = LandingPageFixture.source('index.html');
    const source = LandingPageFixture.javascriptSource();
    const config = LandingPageFixture.source('config/landing-config.js');
    const main = LandingPageFixture.source('js/main.js');
    const privacy = LandingPageFixture.source('legal/privacy.html');
    const section = html.match(
      /<section[^>]*id="sugestoes"[\s\S]*?<\/section>/,
    )?.[0] ?? '';
    const messageTypes = [
      'Sugestão',
      'Melhoria',
      'Dúvida',
      'Problema',
      'Parceria',
      'Outro',
    ];

    assert.match(section, /<h2 id="feedback-title">Ajude o BarberFlow a evoluir<\/h2>/);
    assert.match(
      section,
      /Tem alguma sugestão ou encontrou algo que poderia melhorar\? Envie sua ideia para nossa equipe\./,
    );
    assert.match(section, /name="name"[^>]*maxlength="80"[^>]*required/);
    assert.match(section, /name="email"[^>]*type="email"[^>]*maxlength="160"[^>]*required/);
    assert.match(section, /name="type"[^>]*required/);
    assert.match(section, /name="subject"[^>]*maxlength="120"[^>]*required/);
    assert.match(section, /name="message"[^>]*maxlength="1000"[^>]*required/);
    assert.match(section, /name="privacyConsent"[^>]*type="checkbox"[^>]*required/);
    assert.match(section, /name="company"[^>]*data-feedback-honeypot/);
    assert.match(section, />Enviar sugestão<\/button>/);
    assert.match(section, /data-feedback-loading/);
    assert.match(section, /aria-live="polite"[^>]*data-feedback-status/);

    for (const type of messageTypes) {
      assert.match(section, new RegExp(`<option value="${type}">${type}</option>`));
    }

    assert.match(source, /class FeedbackService\b/);
    assert.match(source, /class FeedbackApiAdapter\b/);
    assert.match(source, /feedbackSubmissionEnabled/);
    assert.match(config, /feedbackSubmissionEnabled:\s*true/);
    assert.match(config, /feedbackApiUrl:\s*'\/api\/v1\/landing\/feedback'/);
    assert.match(main, /new FeedbackApiAdapter\(\s*LandingConfig\.get\('feedbackApiUrl'\)/);
    assert.match(privacy, /contato@barberflow\.live/);
    assert.match(privacy, /Resend/);
    assert.doesNotMatch(section, /envio está em preparação|nenhum dado será transmitido/i);
    assert.doesNotMatch(source, /RESEND_API_KEY|SUPABASE_SERVICE_ROLE|service_role/i);
  });

  it('deve responder as nove duvidas com informacoes reais do produto', () => {
    const html = LandingPageFixture.source('index.html');
    const faq = html.match(/<section[^>]*id="faq"[\s\S]*?<\/section>/)?.[0] ?? '';
    const questions = [
      'O BarberFlow é um sistema de agendamento?',
      'O cliente precisa instalar o aplicativo?',
      'Funciona para barbeiro autônomo?',
      'O cliente consegue ver quantas pessoas estão na fila?',
      'Posso convidar barbeiros parceiros?',
      'O BarberFlow possui controle financeiro?',
      'Como funciona o voucher?',
      'O voucher garante um mês grátis?',
      'Como entrar em contato?',
    ];

    assert.equal((faq.match(/data-faq-question/g) ?? []).length, 9);
    for (const question of questions) {
      assert.match(faq, new RegExp(question.replace(/[?]/g, '\\?')));
    }

    assert.match(faq, /ordem de chegada/i);
    assert.match(faq, /pelo navegador/i);
    assert.match(faq, /PWA/i);
    assert.match(faq, /contato@barberflow\.live/);
  });

  it('deve finalizar a conversao e o rodape com links auditaveis', () => {
    const html = LandingPageFixture.source('index.html');

    assert.match(html, /<h2 id="final-cta-title">Sua fila pode ser mais organizada a partir de hoje<\/h2>/);
    assert.match(
      html,
      /Apresente uma experiência mais prática aos seus clientes e tenha mais controle sobre a rotina da sua barbearia\./,
    );
    assert.match(html, /data-open-voucher[^>]*>Gerar meu voucher<\/button>/);
    assert.match(html, />Conhecer o BarberFlow<\/a>/);
    assert.match(html, /href="mailto:contato@barberflow\.live"/);
    assert.match(html, /href="\.\/legal\/privacy\.html"/);
    assert.match(html, /href="\.\/legal\/terms\.html"/);
    assert.match(html, /href="\.\/legal\/campaign-rules\.html"/);
    assert.match(html, /data-social-placeholder="instagram"/);
    assert.match(html, /data-social-placeholder="facebook"/);
    assert.match(html, /data-current-year/);
  });

  it('deve aplicar SEO completo e dados estruturados sem URLs de desenvolvimento', () => {
    const html = LandingPageFixture.source('index.html');
    const description = 'Organize a fila da sua barbearia, mostre os profissionais disponíveis e permita que seus clientes acompanhem a ordem de atendimento em tempo real.';
    const structuredDataMatch = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );

    assert.match(html, /<title>BarberFlow — Fila em tempo real para barbearias<\/title>/);
    assert.match(html, new RegExp(`<meta name="description" content="${description}">`));
    assert.match(html, /<meta property="og:title" content="BarberFlow — Fila em tempo real para barbearias">/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<link rel="icon"[^>]*Logo01\.png/);
    assert.match(html, /<link rel="apple-touch-icon"[^>]*Logo01\.png/);
    assert.ok(structuredDataMatch, 'Dados estruturados ausentes');

    const structuredData = JSON.parse(structuredDataMatch[1]);
    assert.equal(structuredData['@context'], 'https://schema.org');
    assert.equal(structuredData.url, 'https://barberflow.live/');
    assert.equal(structuredData.name, 'BarberFlow');
    assert.doesNotMatch(html, /localhost|127\.0\.0\.1|vercel\.app/i);

    const hash = createHash('sha256')
      .update(structuredDataMatch[1])
      .digest('base64');
    const vercel = LandingPageFixture.source('vercel.json');
    assert.match(vercel, new RegExp(`sha256-${hash.replace(/[+/.]/g, '\\$&')}`));
  });

  it('deve preparar os eventos de analytics sem instalar rastreadores', () => {
    const source = LandingPageFixture.javascriptSource();
    const html = LandingPageFixture.source('index.html');
    const events = [
      'landing_view',
      'hero_cta_click',
      'feature_carousel_interaction',
      'youtube_video_play',
      'voucher_modal_open',
      'voucher_form_start',
      'voucher_generated',
      'app_access_click',
      'feedback_submitted',
      'faq_open',
    ];

    assert.match(source, /class LandingAnalytics\b/);
    for (const event of events) {
      assert.match(source, new RegExp(`['"]${event}['"]`), `Evento ausente: ${event}`);
    }

    assert.match(html, /data-analytics-event="hero_cta_click"/);
    assert.match(html, /data-analytics-event="youtube_video_play"/);
    assert.match(html, /data-analytics-start="voucher_form_start"/);
    assert.doesNotMatch(html, /googletagmanager|google-analytics|connect\.facebook\.net|fbq\(/i);
  });

  it('deve aplicar headers de seguranca no deploy independente', () => {
    const vercel = LandingPageFixture.source('vercel.json');

    assert.match(vercel, /Content-Security-Policy/);
    assert.match(vercel, /X-Content-Type-Options/);
    assert.match(vercel, /frame-ancestors 'none'/);
    assert.match(vercel, /frame-src 'self' https:\/\/www\.youtube-nocookie\.com/);
    assert.match(
      vercel,
      /script-src 'self'[^;]*https:\/\/static\.cloudflareinsights\.com/,
    );
    assert.doesNotMatch(vercel, /script-src[^;]*'unsafe-inline'/);
    assert.match(
      vercel,
      /"source": "\/api\/v1\/professional-vouchers\/:path\*"[\s\S]*?"destination": "https:\/\/bff\.barberflow\.live\/api\/v1\/professional-vouchers\/:path\*"/,
    );
    assert.match(
      vercel,
      /"source": "\/api\/v1\/landing\/feedback"[\s\S]*?"destination": "https:\/\/bff\.barberflow\.live\/api\/v1\/landing\/feedback"/,
    );
  });
});
