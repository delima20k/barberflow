import { ViteEnvValidator } from './ViteEnvValidator.js';

ViteEnvValidator.validate({
  appName: 'profissional',
  env: import.meta.env,
  required: [],
});

await import('@profissional/app.js');
