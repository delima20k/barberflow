'use strict';

class LandingCarousel {
  constructor(root, features = [], analytics = null) {
    this.root = root;
    this.features = features;
    this.analytics = analytics;
    this.document = root?.ownerDocument ?? document;
    this.viewport = root?.querySelector('[data-carousel-viewport]') ?? null;
    this.track = root?.querySelector('[data-carousel-track]') ?? null;
    this.previousButton = root?.querySelector('[data-carousel-prev]') ?? null;
    this.nextButton = root?.querySelector('[data-carousel-next]') ?? null;
    this.dotsRoot = root?.querySelector('[data-carousel-dots]') ?? null;
    this.status = root?.querySelector('[data-carousel-status]') ?? null;
    this.slides = [];
    this.dots = [];
    this.index = 0;
    this.scrollFrame = null;
    this.dragState = null;
    this.handlePrevious = this.handlePrevious.bind(this);
    this.handleNext = this.handleNext.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.handleDotClick = this.handleDotClick.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerEnd = this.handlePointerEnd.bind(this);
  }

  init() {
    if (!this.root || !this.viewport || !this.track || this.features.length === 0) {
      return this;
    }

    this.render();
    this.previousButton?.addEventListener('click', this.handlePrevious);
    this.nextButton?.addEventListener('click', this.handleNext);
    this.dotsRoot?.addEventListener('click', this.handleDotClick);
    this.viewport.addEventListener('keydown', this.handleKeydown);
    this.viewport.addEventListener('scroll', this.handleScroll, { passive: true });
    this.viewport.addEventListener('pointerdown', this.handlePointerDown);
    this.viewport.addEventListener('pointermove', this.handlePointerMove);
    this.viewport.addEventListener('pointerup', this.handlePointerEnd);
    this.viewport.addEventListener('pointercancel', this.handlePointerEnd);
    this.updateState();
    this.root.classList.add('is-ready');
    return this;
  }

  render() {
    this.track.replaceChildren();
    this.dotsRoot?.replaceChildren();
    this.slides = this.features.map((feature, index) => this.createSlide(feature, index));
    this.dots = this.features.map((feature, index) => this.createDot(feature, index));
    this.track.append(...this.slides);
    this.dotsRoot?.append(...this.dots);
  }

  createSlide(feature, index) {
    const slide = this.document.createElement('article');
    slide.className = 'carousel-slide';
    slide.id = `feature-slide-${feature.id}`;
    slide.dataset.carouselSlide = '';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute(
      'aria-label',
      `${index + 1} de ${this.features.length}: ${feature.name}`,
    );

    const mockup = this.createMockup(feature);
    const copy = this.document.createElement('div');
    copy.className = 'carousel-slide__copy';

    const name = this.document.createElement('p');
    name.className = 'carousel-slide__name';
    name.textContent = feature.name;

    const title = this.document.createElement('h3');
    title.textContent = feature.title;

    const description = this.document.createElement('p');
    description.className = 'carousel-slide__description';
    description.textContent = feature.description;

    const benefits = this.document.createElement('ul');
    benefits.className = 'carousel-slide__benefits';
    feature.benefits.forEach((benefit) => {
      const item = this.document.createElement('li');
      item.textContent = benefit;
      benefits.append(item);
    });

    copy.append(name, title, description, benefits);
    slide.append(mockup, copy);
    return slide;
  }

  createMockup(feature) {
    const mockup = this.document.createElement('div');
    mockup.className = 'phone-mockup feature-mockup';

    const speaker = this.document.createElement('div');
    speaker.className = 'phone-mockup__speaker';
    speaker.setAttribute('aria-hidden', 'true');

    const media = this.document.createElement('div');
    if (feature.imageReady) {
      this.renderImage(media, feature);
    } else {
      this.renderPlaceholder(media, feature);
    }

    mockup.append(speaker, media);
    return mockup;
  }

  renderImage(media, feature) {
    media.className = 'feature-media';
    const image = this.document.createElement('img');
    image.src = feature.image;
    image.alt = feature.imageAlt;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = 390;
    image.height = 802;
    image.addEventListener(
      'error',
      () => this.renderPlaceholder(media, feature),
      { once: true },
    );
    media.replaceChildren(image);
  }

  renderPlaceholder(media, feature) {
    media.className = 'media-placeholder';
    media.dataset.expectedImage = feature.image;
    media.setAttribute('role', 'img');
    media.setAttribute('aria-label', feature.imageAlt);

    const label = this.document.createElement('span');
    label.textContent = feature.placeholder;

    const expectedImage = this.document.createElement('code');
    expectedImage.textContent = `Imagem esperada: ${feature.image}`;

    media.replaceChildren(label, expectedImage);
  }

  createDot(feature, index) {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.className = 'carousel-dot';
    button.dataset.carouselIndex = String(index);
    button.setAttribute('aria-label', `Ir para ${feature.name}`);
    button.setAttribute('aria-controls', `feature-slide-${feature.id}`);
    return button;
  }

  handlePrevious() {
    this.goTo(this.index - 1);
  }

  handleNext() {
    this.goTo(this.index + 1);
  }

  handleKeydown(event) {
    const commands = {
      ArrowLeft: this.index - 1,
      ArrowRight: this.index + 1,
      Home: 0,
      End: this.slides.length - 1,
    };
    if (!(event.key in commands)) return;
    event.preventDefault();
    this.goTo(commands[event.key]);
  }

  handleDotClick(event) {
    const dot = event.target.closest('[data-carousel-index]');
    if (!dot || !this.dotsRoot?.contains(dot)) return;
    this.goTo(Number(dot.dataset.carouselIndex));
  }

  handleScroll() {
    if (this.scrollFrame !== null) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null;
      const width = this.viewport.clientWidth;
      if (width <= 0) return;
      this.setIndex(Math.round(this.viewport.scrollLeft / width));
    });
  }

  handlePointerDown(event) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    this.dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: this.viewport.scrollLeft,
      moved: false,
    };
    this.viewport.setPointerCapture?.(event.pointerId);
    this.viewport.classList.add('is-dragging');
  }

  handlePointerMove(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
    const distance = event.clientX - this.dragState.startX;
    this.dragState.moved ||= Math.abs(distance) > 4;
    if (!this.dragState.moved) return;
    event.preventDefault();
    this.viewport.scrollLeft = this.dragState.startScrollLeft - distance;
  }

  handlePointerEnd(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
    this.viewport.releasePointerCapture?.(event.pointerId);
    this.viewport.classList.remove('is-dragging');
    this.dragState = null;
    const width = this.viewport.clientWidth;
    this.goTo(width > 0 ? Math.round(this.viewport.scrollLeft / width) : this.index);
  }

  goTo(nextIndex, behavior = 'smooth') {
    if (this.slides.length === 0) return;
    const previousIndex = this.index;
    const clampedIndex = Math.min(
      this.slides.length - 1,
      Math.max(0, Number(nextIndex) || 0),
    );
    this.index = clampedIndex;
    const reducedMotion = globalThis.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches ?? false;

    this.viewport.scrollTo({
      left: this.slides[clampedIndex].offsetLeft,
      behavior: reducedMotion ? 'auto' : behavior,
    });
    this.updateState();
    if (clampedIndex !== previousIndex) this.trackInteraction();
  }

  setIndex(nextIndex) {
    const clampedIndex = Math.min(
      this.slides.length - 1,
      Math.max(0, nextIndex),
    );
    if (clampedIndex === this.index) return;
    this.index = clampedIndex;
    this.updateState();
    this.trackInteraction();
  }

  trackInteraction() {
    const feature = this.features[this.index];
    if (feature?.id) {
      this.analytics?.track?.('carousel_interaction', { featureId: feature.id });
    }
  }

  updateState() {
    this.slides.forEach((slide, index) => {
      const active = index === this.index;
      slide.classList.toggle('is-active', active);
      slide.setAttribute('aria-hidden', String(!active));
    });

    this.dots.forEach((dot, index) => {
      const active = index === this.index;
      dot.classList.toggle('is-active', active);
      active
        ? dot.setAttribute('aria-current', 'true')
        : dot.removeAttribute('aria-current');
    });

    if (this.previousButton) {
      this.previousButton.disabled = this.index === 0;
      this.previousButton.setAttribute('aria-disabled', String(this.previousButton.disabled));
    }
    if (this.nextButton) {
      this.nextButton.disabled = this.index === this.slides.length - 1;
      this.nextButton.setAttribute('aria-disabled', String(this.nextButton.disabled));
    }
    if (this.status) {
      this.status.textContent = `Slide ${this.index + 1} de ${this.slides.length}: ${this.features[this.index].name}`;
    }

    const activeDot = this.dots[this.index];
    if (activeDot && this.dotsRoot?.scrollTo) {
      this.dotsRoot.scrollTo({
        left: activeDot.offsetLeft
          - (this.dotsRoot.clientWidth - activeDot.offsetWidth) / 2,
        behavior: 'auto',
      });
    }
  }

  destroy() {
    this.previousButton?.removeEventListener('click', this.handlePrevious);
    this.nextButton?.removeEventListener('click', this.handleNext);
    this.dotsRoot?.removeEventListener('click', this.handleDotClick);
    this.viewport?.removeEventListener('keydown', this.handleKeydown);
    this.viewport?.removeEventListener('scroll', this.handleScroll);
    this.viewport?.removeEventListener('pointerdown', this.handlePointerDown);
    this.viewport?.removeEventListener('pointermove', this.handlePointerMove);
    this.viewport?.removeEventListener('pointerup', this.handlePointerEnd);
    this.viewport?.removeEventListener('pointercancel', this.handlePointerEnd);
    if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
    this.viewport?.classList.remove('is-dragging');
    this.scrollFrame = null;
    this.dragState = null;
  }
}

globalThis.LandingCarousel = LandingCarousel;
