'use strict';

const js      = require('@eslint/js');
const n       = require('eslint-plugin-n');
const globals = require('globals');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  // Ignorados
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      '.vercel/**',
    ],
  },

  // Base recomendada
  js.configs.recommended,

  // Node.js
  {
    plugins: { n },
    rules: {
      ...n.configs['flat/recommended'].rules,
      'n/no-missing-require': 'error',
      'n/no-unpublished-require': 'off', // devDeps usados em tests
    },
  },

  // Projeto
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType:  'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Estilo
      'semi':                    ['error', 'always'],
      'quotes':                  ['error', 'single', { avoidEscape: true }],
      'no-trailing-spaces':      'error',
      'eol-last':                ['error', 'always'],
      'no-multiple-empty-lines': ['error', { max: 1 }],
      'comma-dangle':            ['error', 'always-multiline'],

      // Qualidade
      'no-unused-vars':  ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console':      'warn',
      'prefer-const':    'error',
      'no-var':          'error',
      'eqeqeq':          ['error', 'always'],
      'no-throw-literal': 'error',

      // Segurança
      'no-eval':     'error',
      'no-implied-eval': 'error',
    },
  },

  // Testes — afrouxar console e no-unused-vars
  {
    files: ['tests/**/*.js'],
    rules: {
      'no-console': 'off',
    },
  },
];
