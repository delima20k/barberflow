import { ViteEnvValidator } from './ViteEnvValidator.js';

const env = ViteEnvValidator.validate({
  appName: 'profissional',
  env: import.meta.env,
  required: ['VITE_BFF_BASE_URL'],
});

// Base do BFF para MediaP2P / P2P / WebRTC (leem window.BFF_URL no load).
// Deve ser definido ANTES de importar o app.
window.BFF_URL = env.VITE_BFF_BASE_URL;

await import('@profissional/app.js');
