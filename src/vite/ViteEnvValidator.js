export class ViteEnvValidator {
  static #URL_FIELDS = new Set(['VITE_BFF_BASE_URL', 'VITE_SUPABASE_URL']);

  static validate({ appName, env = {}, required = [] } = {}) {
    const errors = [];
    const normalized = {};

    required.forEach((key) => {
      const value = env[key];
      if (typeof value !== 'string' || value.trim() === '') {
        errors.push(`${key} ausente para ${appName ?? 'app'}.`);
        return;
      }
      normalized[key] = value.trim();
      if (ViteEnvValidator.#URL_FIELDS.has(key) && !ViteEnvValidator.#isUrl(value)) {
        errors.push(`${key} deve ser uma URL valida.`);
      }
    });

    if (errors.length > 0) {
      const error = new Error(`Vite env invalido: ${errors.join(' ')}`);
      error.name = 'ViteEnvValidationError';
      throw error;
    }

    return Object.freeze(normalized);
  }

  static #isUrl(value) {
    try {
      new URL(value);
      return true;
    } catch (_) {
      return false;
    }
  }
}
