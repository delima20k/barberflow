'use strict';

/**
 * MediaPolicyCatalog - limites e variantes permitidas por contexto de midia.
 */
class MediaPolicyCatalog {
  static #POLICIES = Object.freeze({
    avatars:   Object.freeze({ privacy: 'public', maxBytes: 5 * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp'] }),
    portfolio: Object.freeze({ privacy: 'public', maxBytes: 12 * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp'] }),
    services:  Object.freeze({ privacy: 'public', maxBytes: 8 * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp'] }),
    stories:   Object.freeze({ privacy: 'private', maxBytes: 64 * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'] }),
  });

  static #VARIANTS = Object.freeze({
    original:   Object.freeze({ version: 1 }),
    thumb_sm:   Object.freeze({ version: 1, width: 240 }),
    thumb_md:   Object.freeze({ version: 1, width: 720 }),
    video_480p: Object.freeze({ version: 1, height: 480 }),
    video_720p: Object.freeze({ version: 1, height: 720 }),
  });

  static context(name) {
    return MediaPolicyCatalog.#POLICIES[String(name ?? '').toLowerCase()] ?? null;
  }

  static variant(name) {
    return MediaPolicyCatalog.#VARIANTS[name] ?? null;
  }

  static get contexts() {
    return Object.keys(MediaPolicyCatalog.#POLICIES);
  }
}

module.exports = { MediaPolicyCatalog };
