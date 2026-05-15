'use strict';

const ENV = (process.env.APP_ENV
  ?? process.env.NODE_ENV
  ?? (process.env.VERCEL ? 'production' : 'development')).trim();

const AMBIENTES = {
  development: () => require('./environments/development'),
  staging:     () => require('./environments/staging'),
  production:  () => require('./environments/production'),
};

const resolver = AMBIENTES[ENV] ?? AMBIENTES.development;
const config   = resolver();

config.env = ENV;

module.exports = Object.freeze(config);
