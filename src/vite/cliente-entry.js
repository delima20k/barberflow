import { ViteEnvValidator } from './ViteEnvValidator.js';

ViteEnvValidator.validate({
  appName: 'cliente',
  env: import.meta.env,
  required: [],
});

// Entrada canario reservada para o app cliente. O boot legado ainda depende de
// globals criados por scripts classicos e permanece fora do bundle ate a
// migracao das pages cliente para ES modules.
export const clienteViteCanaryReady = true;
