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
    'config/analytics-events.js',
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
    'js/plan-deck.js',
    'js/animations.js',
    'js/mobile-navigation.js',
    'js/faq.js',
    'js/youtube-video.js',
    'js/voucher-service.js',
    'js/voucher-modal.js',
    'js/feedback-service.js',
    'js/feedback.js',
    'js/analytics.js',
    'js/analytics-tracker.js',
    'js/analytics-presence.js',
    'js/meta-pixel.js',
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

  it('deve apresentar somente os planos informativos mensais apos o teste gratuito', () => {
    const html = LandingPageFixture.source('index.html');
    const css = LandingPageFixture.source('css/sections/voucher-faq.css');
    const planDeck = LandingPageFixture.source('js/plan-deck.js');
    const plans = html.match(/<section[^>]*id="planos"[\s\S]*?<\/section>/)?.[0] ?? '';

    assert.match(plans, /<h2 id="plans-title">Conheça os planos após seus 30 dias grátis<\/h2>/);
    assert.equal((plans.match(/data-plan-card/g) ?? []).length, 2);
    assert.match(plans, /Plano para Barbeiro/);
    assert.match(plans, /R\$<\/span>\s*24,90/);
    assert.match(plans, /Plano para Barbearia/);
    assert.match(plans, /R\$<\/span>\s*59,90/);
    assert.match(plans, /Os valores abaixo são informativos e não iniciam cobrança nesta página\./);
    assert.doesNotMatch(plans, /renovar plano|checkout|pagamento|data-open-voucher/i);
    assert.match(css, /\.plan-deck\s*\{/);
    assert.match(css, /@media\s*\(min-width:\s*768px\)[\s\S]*?\.plan-card\.is-front/);
    assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.plan-card\.is-front/);
    assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.plan-deck\.is-switching/);
    assert.match(planDeck, /class PlanDeck\b/);
    assert.ok(
      html.indexOf('./js/plan-deck.js') < html.indexOf('./js/main.js'),
      'PlanDeck deve carregar antes da inicialização da landing.',
    );
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
      'depoimentos',
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
    assert.match(
      html,
      /data-open-voucher[^>]*data-hero-voucher-cta[^>]*>Quero testar grátis por 30 dias<\/button>/,
    );
  });

  it('deve contar a narrativa principal sem promessas absolutas ou dados ficticios', () => {
    const html = LandingPageFixture.source('index.html');
    const problemScenarios = [
      'Tem muita gente esperando?',
      'Quem está atendendo hoje?',
      'Quem é o próximo?',
      'Se eu sair de casa agora, vou esperar muito?',
    ];

    assert.match(html, /BARBEIROS E DONOS DE BARBEARIA QUE ATENDEM POR ORDEM DE CHEGADA/);
    assert.match(html, /<h1[^>]*>Pare de interromper seus cortes para responder quem é o próximo da fila<\/h1>/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.match(html, /Com o BarberFlow, seus clientes acompanham a fila em tempo real antes mesmo de sair de casa/);
    assert.match(html, /Não precisa instalar nenhum programa\. Funciona para barbearias e barbeiros autônomos\./);
    assert.match(html, /Imagine sua barbearia funcionando assim…/);
    assert.match(html, /O BarberFlow não muda a forma como você gosta de atender\. Ele organiza o que acontece entre um atendimento e outro\./);
    assert.match(html, /hero-abertura-app\.webp/);
    assert.match(
      html,
      /Quantas vezes você já precisou parar um corte para responder isso\?/,
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

  it('deve apresentar dez funcionalidades e cinco passos da nova narrativa', () => {
    const html = LandingPageFixture.source('index.html');
    const features = [
      'Fila em tempo real',
      'Controle de cadeiras e profissionais',
      'Página pública da barbearia',
      'Card para WhatsApp',
      'Portfólio de cortes',
      'Stories da barbearia',
      'ChatFlow',
      'Localização no mapa',
      'Gestão da equipe',
      'Controle financeiro',
    ];

    assert.equal((html.match(/data-feature-card/g) ?? []).length, 10);
    assert.equal((html.match(/data-process-step/g) ?? []).length, 5);

    for (const feature of features) {
      assert.match(html, new RegExp(feature));
    }

    assert.match(html, /Enquanto o BarberFlow organiza a fila, você mantém a atenção no cliente que está na cadeira\./);
  });

  it('deve rotear os CTAs de teste e abrir o mesmo modal de voucher', () => {
    const html = LandingPageFixture.source('index.html');

    assert.match(
      html,
      /data-open-voucher[^>]*data-hero-voucher-cta[^>]*>Quero testar grátis por 30 dias<\/button>/,
    );
    assert.match(html, /href="#video"[^>]*>Assistir à demonstração<\/a>/);
    assert.match(html, /data-mobile-cta[^>]*data-open-voucher[^>]*>Testar grátis<\/a>/);
    assert.match(html, /data-open-voucher[^>]*>Quero organizar minha fila\s*<span aria-hidden="true">→<\/span>\s*<\/button>/);
    assert.match(html, /data-open-voucher[^>]*>Quero meus 30 dias grátis<\/button>/);
    assert.match(html, /data-open-voucher[^>]*>Testar o BarberFlow<\/button>/);
    assert.match(
      html,
      /href="https:\/\/pro\.barberflow\.live\/"[^>]*>Acessar a aplicação profissional<\/a>/,
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
    assert.match(html, /<h2 id="video-title">Veja como o BarberFlow funciona na prática<\/h2>/);
    assert.match(
      html,
      /Em poucos minutos, você configura sua barbearia, adiciona seus profissionais e cria uma página pública para seus clientes acompanharem a fila\./,
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
    assert.match(
      videoCss,
      /\.video-player\.is-visible\s*\{[^}]*margin-top:\s*1px;[^}]*padding-top:\s*1px;[^}]*padding-bottom:\s*1px;/,
    );
    assert.match(videoCss, /\.video-player\s*>\s*:first-child\s*\{[^}]*padding-top:\s*0;/);
    assert.match(
      videoCss,
      /\.video-section\s+\.section-heading\s*\{[^}]*margin-top:\s*5px;[^}]*margin-bottom:\s*5px;/,
    );
    assert.match(videoCss, /\.video-player\s*\{[\s\S]*margin-inline:\s*calc\(50%\s*-\s*49vw\);/);
    assert.match(videoCss, /\.video-section__action\s*\{[^}]*margin-top:\s*0;/);
    assert.doesNotMatch(responsiveCss, /\.video-player\s*\{[\s\S]*max-width:\s*1000px;/);
  });

  it('deve preparar formulario e estados completos sem voucher ou contagem ficticia', () => {
    const html = LandingPageFixture.source('index.html');
    const modal = html.match(/<div class="modal"[\s\S]*?<\/body>/)?.[0] ?? '';
    const voucherSource = [
      'js/voucher-service.js',
      'js/voucher-modal.js',
    ].map((file) => LandingPageFixture.source(file)).join('\n');
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
    assert.doesNotMatch(voucherSource, /localStorage|Math\.random|crypto\.randomUUID/);
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

  it('deve manter os componentes de interface sem chamadas de dados diretas', () => {
    const source = [
      'js/carousel.js',
      'js/mobile-navigation.js',
      'js/faq.js',
      'js/youtube-video.js',
      'js/voucher-modal.js',
      'js/feedback.js',
      'js/animations.js',
    ].map((file) => LandingPageFixture.source(file)).join('\n');
    const classes = [
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

    const analytics = LandingPageFixture.source('js/analytics.js');
    assert.doesNotMatch(analytics, /\bfetch\s*\(|XMLHttpRequest|supabase/i);
    assert.doesNotMatch(source, /XMLHttpRequest|supabase/i);
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
    const source = [
      LandingPageFixture.javascriptSource(),
      LandingPageFixture.source('config/analytics-events.js'),
    ].join('\n');
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

  it('deve responder as nove dúvidas da nova copy sem inventar preço ou depoimento', () => {
    const html = LandingPageFixture.source('index.html');
    const faq = html.match(/<section[^>]*id="faq"[\s\S]*?<\/section>/)?.[0] ?? '';
    const questions = [
      'O BarberFlow é um sistema de agendamento?',
      'O cliente precisa instalar o aplicativo?',
      'Funciona para barbeiro autônomo?',
      'O cliente consegue ver quantas pessoas estão na fila?',
      'Posso cadastrar minha equipe?',
      'Posso compartilhar a fila pelo WhatsApp?',
      'O BarberFlow possui controle financeiro?',
      'Preciso entender de tecnologia?',
      'O que acontece depois dos 30 dias gratuitos?',
    ];

    assert.equal((faq.match(/data-faq-question/g) ?? []).length, 9);
    for (const question of questions) {
      assert.match(faq, new RegExp(question.replace(/[?]/g, '\\?')));
    }

    assert.match(faq, /ordem de chegada/i);
    assert.match(faq, /pelo navegador/i);
    assert.match(faq, /TODO: confirmar valores, condições e cancelamento antes da publicação\./);
    assert.doesNotMatch(faq, /R\$\s*\d/);
  });

  it('deve reservar depoimentos para clientes reais autorizados', () => {
    const html = LandingPageFixture.source('index.html');
    const section = html.match(/<section[^>]*id="depoimentos"[\s\S]*?<\/section>/)?.[0] ?? '';

    assert.equal((section.match(/class="testimonial-card/g) ?? []).length, 3);
    assert.equal((section.match(/Depoimento real será inserido aqui\./g) ?? []).length, 3);
    assert.equal((section.match(/Nome do cliente/g) ?? []).length, 3);
    assert.equal((section.match(/Nome da barbearia — Cidade/g) ?? []).length, 3);
    assert.equal((section.match(/TODO: substituir por depoimento real autorizado pelo cliente\./g) ?? []).length, 3);
    assert.doesNotMatch(section, /Antes do BarberFlow|Facilitou muito nossa rotina|O que mais gostei/i);
  });

  it('deve finalizar a conversao e o rodape com links auditaveis', () => {
    const html = LandingPageFixture.source('index.html');

    assert.match(html, /<h2 id="final-cta-title">Sua fila pode ficar mais organizada a partir de hoje<\/h2>/);
    assert.match(
      html,
      /Enquanto você atende, seus clientes podem acompanhar a fila, verificar os profissionais disponíveis e planejar melhor a chegada\./,
    );
    assert.match(html, /data-open-voucher[^>]*>Começar agora<\/button>/);
    assert.match(html, />Acessar a aplicação profissional<\/a>/);
    assert.match(html, /href="mailto:contato@barberflow\.live"/);
    assert.match(html, /href="\.\/legal\/privacy\.html"/);
    assert.match(html, /href="\.\/legal\/terms\.html"/);
    assert.match(html, /href="\.\/legal\/campaign-rules\.html"/);
    // Redes sociais configuradas de verdade (antes eram placeholders "nao configurado").
    // href real + data-config-link, que faz LandingConfig sobrescrever pelo config central.
    assert.match(html, /href="https:\/\/www\.instagram\.com\/barberflow\.contato\/"/);
    assert.match(html, /data-config-link="instagramUrl"/);
    assert.match(html, /href="https:\/\/web\.facebook\.com\/profile\.php\?id=61591764367834"/);
    assert.match(html, /data-config-link="facebookUrl"/);
    assert.doesNotMatch(html, /data-social-placeholder/, 'placeholders de rede social nao devem sobrar');
    assert.match(html, /data-current-year/);
  });

  it('deve aplicar SEO completo e dados estruturados sem URLs de desenvolvimento', () => {
    const html = LandingPageFixture.source('index.html');
    const description = 'Organize a fila, as cadeiras, os profissionais e os atendimentos da sua barbearia com o BarberFlow. Teste gratuitamente por 30 dias.';
    const structuredDataMatch = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );

    assert.match(html, /<title>BarberFlow \| Organize a fila da sua barbearia em tempo real<\/title>/);
    assert.match(html, new RegExp(`<meta name="description" content="${description}">`));
    assert.match(html, /<meta property="og:title" content="BarberFlow \| Organize a fila da sua barbearia em tempo real">/);
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

  it('deve manter analytics interno desativado e Meta Pixel isolado', () => {
    const source = LandingPageFixture.javascriptSource();
    const html = LandingPageFixture.source('index.html');
    const config = LandingPageFixture.source('config/landing-config.js');
    const events = [
      'landing_view',
      'session_start',
      'session_end',
      'cta_click',
      'voucher_open',
      'email_input_start',
      'email_submit',
      'voucher_generated',
      'scroll_25',
      'scroll_50',
      'scroll_75',
      'scroll_100',
      'video_view',
      'carousel_interaction',
      'faq_open',
      'feedback_submit',
    ];

    assert.match(source, /class LandingAnalytics\b/);
    assert.match(source, /class LandingAnalyticsTracker\b/);
    assert.match(source, /class MetaPixelTracker\b/);
    for (const event of events) {
      assert.match(source, new RegExp(`['"]${event}['"]`), `Evento ausente: ${event}`);
    }

    assert.match(config, /analyticsEnabled:\s*false/);
    assert.match(config, /analyticsPresenceEnabled:\s*false/);
    assert.match(config, /analyticsCollectorUrl:\s*''/);
    assert.match(html, /data-analytics-event="cta_click"/);
    assert.match(html, /data-analytics-start="email_input_start"/);
    assert.match(html, /<script src="\.\/js\/meta-pixel\.js" defer><\/script>/);
    assert.doesNotMatch(html, /googletagmanager|google-analytics|fbq\(/i);
    assert.doesNotMatch(source, /service[_-]?role/i);
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
    assert.match(vercel, /script-src[^;]*https:\/\/connect\.facebook\.net/);
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
