import { ViteEnvValidator } from './ViteEnvValidator.js';

const env = ViteEnvValidator.validate({
  appName: 'cliente',
  env: import.meta.env,
  required: ['VITE_BFF_BASE_URL'],
});

// Base do BFF para MediaP2P / P2P / WebRTC (leem window.BFF_URL no load).
window.BFF_URL = env.VITE_BFF_BASE_URL;

// Entrada canario reservada para o app cliente. O boot legado ainda depende de
// globals criados por scripts classicos e permanece fora do bundle ate a
// migracao das pages cliente para ES modules.
export const clienteViteCanaryReady = true;
