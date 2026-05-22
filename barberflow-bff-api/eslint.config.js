'use strict';

const js       = require('@eslint/js');
const n        = require('eslint-plugin-n');
const security = require('eslint-plugin-security');
const globals  = require('globals');

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
      'no-eval':         'error',
      'no-implied-eval': 'error',
    },
  },

  // eslint-plugin-security — detecta padrões OWASP comuns
  {
    plugins: { security },
    rules: {
      'security/detect-object-injection':         'warn',
      'security/detect-non-literal-regexp':       'warn',
      'security/detect-unsafe-regex':             'error',
      'security/detect-buffer-noassert':          'error',
      'security/detect-child-process':            'warn',
      'security/detect-disable-mustache-escape':  'error',
      'security/detect-eval-with-expression':     'error',
      'security/detect-new-buffer':               'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-non-literal-fs-filename':  'warn',
      'security/detect-pseudoRandomBytes':        'warn',
      'security/detect-possible-timing-attacks':  'warn',
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
